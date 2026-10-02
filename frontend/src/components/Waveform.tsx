import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';

interface Props {
  buffer: AudioBuffer | null;
  currentTime: number; // playback timeline seconds
  playbackRate: number;
  onSeek: (time: number) => void;
  height?: number;
  // Live position source. Kept as a getter (not a value) so the playhead can
  // run at full frame rate from App's rAF loop without re-rendering React.
  getPosition: () => { position: number; time: number };
}

// Compute peaks once per buffer+width for performant drawing
function computePeaks(buffer: AudioBuffer, targetBars: number): number[] {
  const ch0 = buffer.getChannelData(0);
  const len = ch0.length;
  const block = Math.max(1, Math.floor(len / targetBars));
  const peaks: number[] = new Array(targetBars).fill(0);

  for (let i = 0; i < targetBars; i++) {
    const start = i * block;
    let max = 0;
    for (let j = 0; j < block && start + j < len; j++) {
      const v = Math.abs(ch0[start + j]);
      if (v > max) max = v;
    }
    peaks[i] = max;
  }

  const mx = Math.max(0.00001, ...peaks);
  for (let i = 0; i < peaks.length; i++) peaks[i] /= mx;
  return peaks;
}

// Panel the playhead sits at before the view starts scrolling.
const TARGET_PLAYHEAD = 0.65;

export default function Waveform({ buffer, currentTime, playbackRate, onSeek, height = 180, getPosition }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(1200);

  // Bars never change between frames, so they are rendered once per geometry
  // into two offscreen layers (played / unplayed) and blitted each frame.
  const playedLayerRef = useRef<HTMLCanvasElement | null>(null);
  const plainLayerRef = useRef<HTMLCanvasElement | null>(null);
  const geometryRef = useRef({ w: 0, h: 0, scaledW: 0, dpr: 1, hasBuffer: false });
  const lastDrawnRef = useRef(-1);

  // Resize observer for responsiveness
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setWidth(el.clientWidth || 1200));
    obs.observe(el);
    setWidth(el.clientWidth || 1200);
    return () => obs.disconnect();
  }, []);

  // Peaks memoized per buffer+width
  const peaks = useMemo(() => {
    if (!buffer || width <= 0) return [] as number[];
    const targetBars = Math.max(200, Math.min(2000, Math.floor(width / 2)));
    return computePeaks(buffer, targetBars);
  }, [buffer, width]);

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  const theme = useMemo(() => {
    const styles = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
    return {
      waveform: read('--waveform', '#ffb45b'),
      played: read('--waveform-played', '#ff8d3a'),
      muted: read('--waveform-muted', '#4b4d48'),
      playhead: read('--playhead', '#fff7ec'),
      bg: read('--waveform-bg', '#171915'),
      dim: 'rgba(13, 15, 12, 0.36)',
    };
  }, []);

  // Static layer: one-time bar render, rebuilt only when geometry changes.
  useEffect(() => {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const rate = Math.max(0.0001, playbackRate);
    const scaledW = Math.max(w, Math.floor(w * (1 / rate)));

    geometryRef.current = { w, h, scaledW, dpr, hasBuffer: !!buffer && peaks.length > 0 };

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, w, h);

    if (!buffer || peaks.length === 0) {
      playedLayerRef.current = null;
      plainLayerRef.current = null;
      ctx.strokeStyle = theme.muted;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      lastDrawnRef.current = -1;
      return;
    }

    const makeLayer = (color: string) => {
      const layer = document.createElement('canvas');
      layer.width = Math.floor(scaledW * dpr);
      layer.height = Math.floor(h * dpr);
      const lctx = layer.getContext('2d');
      if (!lctx) return null;
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lctx.fillStyle = color;
      const barW = scaledW / peaks.length;
      for (let i = 0; i < peaks.length; i++) {
        const barH = Math.max(2, peaks[i] * (h * 0.8));
        lctx.fillRect(Math.floor(i * barW), Math.floor((h - barH) / 2), Math.max(1, barW - 0.5), barH);
      }
      return layer;
    };

    plainLayerRef.current = makeLayer(theme.waveform);
    playedLayerRef.current = makeLayer(theme.played);
    lastDrawnRef.current = -1;
  }, [buffer, peaks, width, height, playbackRate, dpr, theme]);

  // Per-frame composite. Cheap: two blits + one rect + one line, and skipped
  // entirely when the playhead has not crossed a pixel boundary.
  const draw = useCallback(
    (progress: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const { w, h, scaledW } = geometryRef.current;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = theme.bg;
      ctx.fillRect(0, 0, w, h);

      if (!geometryRef.current.hasBuffer) return;

      const playheadPixel = progress * scaledW;
      const panOffset =
        scaledW > w
          ? Math.max(0, Math.min(playheadPixel - w * TARGET_PLAYHEAD, scaledW - w))
          : 0;

      const plain = plainLayerRef.current;
      if (!plain) return;
      ctx.drawImage(plain, panOffset * dpr, 0, w * dpr, h * dpr, 0, 0, w, h);

      // Repaint the played portion in the accent colour.
      const playedX = playheadPixel - panOffset;
      if (playedX > 0) {
        const played = playedLayerRef.current;
        if (played) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, Math.min(w, playedX), h);
          ctx.clip();
          ctx.drawImage(played, panOffset * dpr, 0, w * dpr, h * dpr, 0, 0, w, h);
          ctx.restore();
        }
      }

      // Dim everything after the playhead.
      if (playedX < w) {
        ctx.fillStyle = theme.dim;
        ctx.fillRect(Math.max(0, Math.floor(playedX)), 0, w, h);
      }

      ctx.strokeStyle = theme.playhead;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(Math.floor(Math.max(0, Math.min(w, playedX))) + 0.5, 0);
      ctx.lineTo(Math.floor(Math.max(0, Math.min(w, playedX))) + 0.5, h);
      ctx.stroke();
    },
    [dpr, theme]
  );

  // Single long-lived rAF. Idle frames cost one integer compare.
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const { position, time } = getPosition();
      const geo = geometryRef.current;
      const duration = buffer?.duration || 0;
      const progress = duration > 0 ? Math.max(0, Math.min(1, position / duration)) : 0;
      const marker = Math.round(progress * (geo.scaledW || 1));
      if (marker !== lastDrawnRef.current) {
        lastDrawnRef.current = marker;
        draw(progress);
      }
      void time;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [draw, getPosition, buffer]);

  // Seeking by click/drag
  const handlePointer = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!buffer) return;
      const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const rate = Math.max(0.0001, playbackRate);
      const total = buffer.duration / rate;
      const { w, scaledW } = geometryRef.current;

      const { position } = getPosition();
      const progress = buffer.duration > 0 ? Math.max(0, Math.min(1, position / buffer.duration)) : 0;
      const playheadPixel = progress * scaledW;
      const panOffset =
        scaledW > w ? Math.max(0, Math.min(playheadPixel - w * TARGET_PLAYHEAD, scaledW - w)) : 0;

      const pct = Math.max(0, Math.min(1, (x + panOffset) / scaledW));
      onSeek(pct * total);
    },
    [buffer, playbackRate, getPosition, onSeek]
  );

  const totalDuration = buffer ? buffer.duration / Math.max(0.0001, playbackRate) : 0;
  const ariaTime = currentTime;

  return (
    <div ref={containerRef} className="waveform-canvas full-width" style={{ height }}>
      <canvas
        ref={canvasRef}
        role="slider"
        tabIndex={buffer ? 0 : -1}
        aria-label="Track position"
        aria-valuemin={0}
        aria-valuemax={Math.round(totalDuration)}
        aria-valuenow={Math.round(ariaTime)}
        aria-valuetext={`${Math.floor(ariaTime / 60)} minutes ${Math.floor(ariaTime % 60)} seconds`}
        onKeyDown={(event) => {
          if (!buffer) return;
          const current = getPosition().time;
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            onSeek(Math.max(0, Math.min(totalDuration, current + (event.key === 'ArrowLeft' ? -5 : 5))));
          }
          if (event.key === 'Home') { event.preventDefault(); onSeek(0); }
          if (event.key === 'End') { event.preventDefault(); onSeek(totalDuration); }
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          handlePointer(event);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) handlePointer(e);
        }}
        onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
        style={{ display: 'block' }}
      />
    </div>
  );
}