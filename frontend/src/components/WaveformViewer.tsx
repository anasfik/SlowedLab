/**
 * WaveformViewer Component
 * Real-time waveform visualization with canvas
 */

import React, { useEffect, useRef } from 'react';
import { AudioBuffer as AudioBufferType } from '../audio-engine/src/types';
import '../styles/WaveformViewer.css';

interface WaveformViewerProps {
  audioBuffer: AudioBufferType;
  playbackPosition: number;
}

export default function WaveformViewer({
  audioBuffer,
  playbackPosition,
}: WaveformViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;

    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    const width = canvas.width;
    const height = canvas.height;

    // Background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    // Draw waveform
    const data = audioBuffer.data[0]; // Use first channel
    const samples = Math.floor(data.length / (width / 4)); // Downsample for display

    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let i = 0; i < width; i++) {
      const sampleIndex = Math.floor((i / width) * data.length);
      const sample = data[sampleIndex] || 0;

      const y = height / 2 - (sample * height) / 2;

      if (i === 0) {
        ctx.moveTo(i, y);
      } else {
        ctx.lineTo(i, y);
      }
    }

    ctx.stroke();

    // Draw center line
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Draw playback position indicator
    const playbackX = (playbackPosition / audioBuffer.format.duration) * width;
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playbackX, 0);
    ctx.lineTo(playbackX, height);
    ctx.stroke();

    // Draw time ruler
    ctx.fillStyle = '#999';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    const timeInterval = audioBuffer.format.duration / 10;

    for (let i = 0; i <= 10; i++) {
      const x = (i / 10) * width;
      const time = i * timeInterval;
      const minutes = Math.floor(time / 60);
      const seconds = Math.floor(time % 60);
      const label = `${minutes}:${seconds.toString().padStart(2, '0')}`;

      ctx.fillText(label, x, height - 10);
    }
  }, [audioBuffer, playbackPosition]);

  return (
    <div className="waveform-container">
      <div className="waveform-label">Waveform</div>
      <div className="waveform-viewer" ref={containerRef}>
        <canvas ref={canvasRef}></canvas>
      </div>
    </div>
  );
}
