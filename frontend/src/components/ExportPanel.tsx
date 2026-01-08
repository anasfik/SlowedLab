/**
 * ExportPanel Component
 * Audio export and download interface
 */

import React, { useState } from 'react';
import '../styles/ExportPanel.css';

interface ExportPanelProps {
  onExport: (format: string, bitrate: number) => void;
  disabled?: boolean;
}

export default function ExportPanel({ onExport, disabled }: ExportPanelProps) {
  const [format, setFormat] = useState<'wav' | 'mp3' | 'aac'>('mp3');
  const [bitrate, setBitrate] = useState(192);

  const handleExport = () => {
    onExport(format, bitrate);
  };

  return (
    <div className="export-panel">
      <h3>Export Audio</h3>

      <div className="export-options">
        <div className="option-group">
          <label>Format</label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as any)}
            disabled={disabled}
          >
            <option value="wav">WAV (Lossless)</option>
            <option value="mp3">MP3 (Lossy)</option>
            <option value="aac">AAC (Lossy)</option>
          </select>
        </div>

        {format !== 'wav' && (
          <div className="option-group">
            <label>Bitrate (kbps)</label>
            <select
              value={bitrate}
              onChange={(e) => setBitrate(parseInt(e.target.value))}
              disabled={disabled}
            >
              <option value="128">128 kbps</option>
              <option value="192">192 kbps</option>
              <option value="256">256 kbps</option>
              <option value="320">320 kbps</option>
            </select>
          </div>
        )}
      </div>

      <button
        className="export-button"
        onClick={handleExport}
        disabled={disabled}
      >
        ⬇ Download {format.toUpperCase()}
      </button>
    </div>
  );
}
