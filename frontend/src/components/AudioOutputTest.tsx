import React, { useEffect, useRef, useState } from 'react';

// Only mounted with ?audio-debug=1. Compare the app's AudioContext output
// against HTML media playback without touching the user's audio or settings.
export default function AudioOutputTest({ getContext, stopPlayback }: {
  getContext: () => AudioContext | null;
  stopPlayback: () => void;
}) {
  const [status, setStatus] = useState('Each test plays a quiet, one-second tone.');
  const cleanupRef = useRef<() => void>(() => {});
  useEffect(() => () => cleanupRef.current(), []);

  const test = async (mode: 'web-audio' | 'media') => {
    stopPlayback();
    cleanupRef.current();
    setStatus(`Testing ${mode} output…`);
    try {
      if (mode === 'web-audio') {
        const ctx = getContext();
        if (!ctx) throw new Error('AudioContext is unavailable');
        console.log('[SlowedLab][output-test]', JSON.stringify({
          mode, state: ctx.state, sampleRate: ctx.sampleRate,
          baseLatency: ctx.baseLatency,
          destinationChannels: ctx.destination.channelCount,
          maxChannelCount: ctx.destination.maxChannelCount,
          sinkId: (ctx as AudioContext & { sinkId?: unknown }).sinkId ?? 'default/unsupported',
        }));
        // Called from a real button click to preserve user activation.
        const resumed = ctx.resume();
        await resumed;
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.frequency.value = 440;
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.02);
        gain.gain.setValueAtTime(0.05, ctx.currentTime + 0.98);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        cleanupRef.current = () => {
          oscillator.onended = null;
          try { oscillator.stop(); } catch {}
          oscillator.disconnect();
          gain.disconnect();
        };
        oscillator.onended = () => {
          cleanupRef.current();
          setStatus('Web Audio test finished. Did you hear the tone?');
          console.log('[SlowedLab][output-test] Web Audio tone ended; audibility must be confirmed by listener.');
        };
        oscillator.start();
        oscillator.stop(ctx.currentTime + 1);
      } else {
        // PCM WAV generated locally; no network request or codec dependency.
        const rate = 44100;
        const buffer = new ArrayBuffer(44 + rate * 2);
        const view = new DataView(buffer);
        const text = (offset: number, value: string) => {
          for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
        };
        text(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true);
        text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); view.setUint16(22, 1, true);
        view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true);
        view.setUint16(32, 2, true); view.setUint16(34, 16, true);
        text(36, 'data'); view.setUint32(40, rate * 2, true);
        for (let i = 0; i < rate; i++) {
          const envelope = Math.min(1, i / (rate * 0.02), (rate - 1 - i) / (rate * 0.02));
          view.setInt16(44 + i * 2, Math.round(32767 * 0.05 * envelope * Math.sin(2 * Math.PI * 440 * i / rate)), true);
        }
        const url = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
        const element = new Audio(url);
        cleanupRef.current = () => {
          element.onended = null;
          element.pause();
          element.removeAttribute('src');
          element.load();
          URL.revokeObjectURL(url);
        };
        element.onended = () => {
          cleanupRef.current();
          setStatus('Media test finished. Did you hear the tone?');
        };
        await element.play();
        console.log('[SlowedLab][output-test] HTML media playback started; muted=' + element.muted + ' volume=' + element.volume);
      }
    } catch (error) {
      cleanupRef.current();
      console.error('[SlowedLab][output-test]', mode, error);
      setStatus(`${mode} test failed: ${String(error)}`);
    }
  };

  return <section aria-label="Audio output diagnostics" style={{ position: 'fixed', top: 80, right: 16, zIndex: 100, background: '#1a1c17', color: '#fff', padding: 16, maxWidth: 340, border: '1px solid #666' }}>
    <strong>Audio output diagnostics</strong>
    <p role="status">{status}</p>
    <button onClick={() => void test('web-audio')}>Test Web Audio tone</button>{' '}
    <button onClick={() => void test('media')}>Test media tone</button>
  </section>;
}
