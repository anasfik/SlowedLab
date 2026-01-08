/**
 * AudioUpload Component
 * Handles file upload with drag-and-drop support
 */

import React, { useRef } from 'react';
import '../styles/AudioUpload.css';

interface AudioUploadProps {
  onUpload: (file: File) => void;
  isLoading?: boolean;
}

export default function AudioUpload({ onUpload, isLoading }: AudioUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = React.useState(false);

  const supportedFormats = [
    'audio/mpeg',
    'audio/wav',
    'audio/aac',
    'audio/ogg',
    'audio/flac',
  ];

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (supportedFormats.includes(file.type)) {
        onUpload(file);
      } else {
        alert(`Unsupported format: ${file.type}`);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUpload(e.target.files[0]);
    }
  };

  return (
    <div className="audio-upload-container">
      <div
        className={`upload-area ${isDragActive ? 'active' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDragLeave}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          onChange={handleFileSelect}
          disabled={isLoading}
          style={{ display: 'none' }}
        />

        {isLoading ? (
          <div className="loading">
            <div className="spinner"></div>
            <p>Loading audio...</p>
          </div>
        ) : (
          <>
            <svg
              className="upload-icon"
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            <h2>Upload Audio File</h2>
            <p>Drag and drop your audio file here, or click to browse</p>
            <p className="formats">Supported: MP3, WAV, AAC, OGG, FLAC</p>
            <p className="file-size">Max size: 1 hour (≈500 MB)</p>
          </>
        )}
      </div>
    </div>
  );
}
