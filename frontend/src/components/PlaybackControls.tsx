/**
 * PlaybackControls Component
 * Audio playback management interface
 */

import React, { useState, useEffect, useRef } from 'react';
import '../styles/PlaybackControls.css';

interface PlaybackControlsProps {
  isPlaying: boolean;
  position: number;
  duration: number;
  disabled?: boolean;
}

export default function PlaybackControls({
  isPlaying,
  position,
  duration,
  disabled,
}: PlaybackControlsProps) {
  const [localPosition, setLocalPosition] = useState(position);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    if (!isDraggingRef.current) {
      setLocalPosition(position);
    }
  }, [position]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs
        .toString()
        .padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="playback-controls">
      <button
        className="playback-button"
        disabled={disabled}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      <div className="timeline">
        <span className="time-display">{formatTime(localPosition)}</span>
        <input
          type="range"
          min="0"
          max={Math.ceil(duration)}
          value={localPosition}
          onChange={(e) => setLocalPosition(parseFloat(e.target.value))}
          onMouseDown={() => (isDraggingRef.current = true)}
          onMouseUp={() => (isDraggingRef.current = false)}
          onTouchStart={() => (isDraggingRef.current = true)}
          onTouchEnd={() => (isDraggingRef.current = false)}
          disabled={disabled}
          className="timeline-slider"
        />
        <span className="time-display">{formatTime(duration)}</span>
      </div>

      <div className="playback-info">
        <span className="label">Volume</span>
        <input
          type="range"
          min="0"
          max="100"
          defaultValue="80"
          disabled={disabled}
          className="volume-slider"
        />
      </div>
    </div>
  );
}
