import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';

interface Props {
  buffer: AudioBuffer | null;
  currentTime: number; // playback timeline seconds
  playbackRate: number;
  onSeek: (time: number) => void;
  height?: number;
  bufferPosition?: number; // optional: exact buffer position (seconds) for precise progress
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

export default function Waveform({ buffer, currentTime, playbackRate, onSeek, height = 180, bufferPosition }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(1200);

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

  // Draw waveform and playhead/progress, adapting to playback rate
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, w, h);

    // Background
    const bg = ctx.createLinearGradient(0, 0, w, 0);
    bg.addColorStop(0, 'rgba(255,255,255,0.02)');
    bg.addColorStop(1, 'rgba(255,255,255,0.02)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    if (!buffer || peaks.length === 0) {
      // Placeholder center line
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      return;
    }

    // Time scaling with playback rate
    const rate = Math.max(0.0001, playbackRate);
    const total = buffer.duration / rate; // actual playback duration (timeline seconds)
    const progress = bufferPosition != null
      ? Math.max(0, Math.min(1, bufferPosition / buffer.duration))
      : Math.max(0, Math.min(1, currentTime / total));

    // Scale the content width to reflect playback rate
    const speedScale = 1 / rate; // slower => wider, faster => narrower
    const scaledW = Math.max(w, Math.floor(w * speedScale));
    const playheadPixel = progress * scaledW;
    const targetPlayheadX = w * 0.65; // playhead moves across viewport, pans when reaching 65% from left
    let panOffset = 0;
    let playheadX = playheadPixel;

    if (scaledW > w) {
      // Pan content to keep playhead at targetPlayheadX position in viewport
      panOffset = Math.max(0, Math.min(playheadPixel - targetPlayheadX, scaledW - w));
      playheadX = playheadPixel - panOffset; // playhead position in viewport
    } else {
      playheadX = playheadPixel; // waveform fits viewport, no panning
      panOffset = 0;
    }

    // Draw bars with scaling and panning
    const barW = Math.max(1, scaledW / peaks.length);
    for (let i = 0; i < peaks.length; i++) {
      const v = peaks[i];
      const barH = Math.max(2, v * (h * 0.8));
      const rawX = i * barW;
      const x = Math.floor(rawX - panOffset);
      const y = Math.floor((h - barH) / 2);

      if (x + barW < 0 || x > w) continue; // clip to viewport

      const grad = ctx.createLinearGradient(0, y, 0, y + barH);
      grad.addColorStop(0, '#5ce1e6');
      grad.addColorStop(1, '#7a5af5');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, Math.max(1, barW - 0.5), barH);
    }

    // Dim the unplayed portion for visual feedback relative to playhead
    // The dimming should cover everything after the actual playhead position in the scaled content
    const dimStartX = Math.floor(playheadPixel - panOffset);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(dimStartX, 0, scaledW - playheadPixel, h);

    // Playhead line
    ctx.strokeStyle = 'rgba(92,225,230,0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(Math.floor(playheadX) + 0.5, 0);
    ctx.lineTo(Math.floor(playheadX) + 0.5, h);
    ctx.stroke();
  }, [buffer, peaks, width, height, currentTime, playbackRate, bufferPosition]);

  // Seeking by click/drag
  const handlePointer = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!buffer) return;
      const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const rate = Math.max(0.0001, playbackRate);
      const total = buffer.duration / rate;
      
      // Calculate current pan state to account for waveform scrolling
      const speedScale = 1 / rate;
      const scaledW = Math.max(rect.width, Math.floor(rect.width * speedScale));
      const progress = bufferPosition != null
        ? Math.max(0, Math.min(1, bufferPosition / buffer.duration))
        : Math.max(0, Math.min(1, currentTime / total));
      const playheadPixel = progress * scaledW;
      const targetPlayheadX = rect.width * 0.65;
      const panOffset = scaledW > rect.width ? Math.max(0, Math.min(playheadPixel - targetPlayheadX, scaledW - rect.width)) : 0;
      
      // Map viewport X to scaled waveform position, accounting for pan
      const scaledX = x + panOffset;
      const pct = Math.max(0, Math.min(1, scaledX / scaledW));
      onSeek(pct * total);
    },
    [buffer, playbackRate, currentTime, bufferPosition, onSeek]
  );

  return (
    <div ref={containerRef} className="waveform-canvas full-width" style={{ height }}>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointer}
        onPointerMove={(e) => {
          if (e.buttons === 1) handlePointer(e);
        }}
        style={{ display: 'block' }}
      />
    </div>
  );
}
