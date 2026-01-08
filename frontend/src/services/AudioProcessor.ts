/**
 * Audio Processor Service
 * Main service for audio loading, processing, and export
 */

import {
  AudioBuffer as AudioBufferType,
  AudioFormat,
  EffectsConfig,
  ExportOptions,
  ProcessingProgress,
} from '../audio-engine/src/types';
import {
  processEffects,
  analyzeAudio,
} from '../audio-engine/src/dsp';

export default class AudioProcessor {
  private audioContext: AudioContext | null = null;
  private workerPool: Worker[] = [];
  private currentWorkerIndex = 0;

  constructor(workerCount = 4) {
    try {
      this.audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
    } catch (e) {
      console.error('WebAudio API not supported', e);
    }

    // Initialize worker pool for heavy processing
    for (let i = 0; i < workerCount; i++) {
      try {
        const worker = new Worker('/workers/audio-processor.worker.js');
        this.workerPool.push(worker);
      } catch (e) {
        console.warn('Could not initialize worker', e);
      }
    }
  }

  /**
   * Load and decode audio file
   */
  async loadAudio(file: File): Promise<AudioBufferType> {
    if (!this.audioContext) {
      throw new Error('WebAudio API not available');
    }

    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

    const channels: Float32Array[] = [];
    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
      channels.push(audioBuffer.getChannelData(i));
    }

    const format: AudioFormat = {
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
      duration: audioBuffer.duration,
      bitDepth: 32,
    };

    return {
      data: channels,
      format,
      metadata: {
        title: file.name,
        uploadedAt: new Date(),
      },
    };
  }

  /**
   * Process audio with effects chain
   */
  async processEffects(
    buffer: AudioBufferType,
    config: EffectsConfig,
    progressCallback?: (progress: ProcessingProgress) => void
  ): Promise<AudioBufferType> {
    return processEffects(buffer, config, progressCallback);
  }

  /**
   * Export audio to various formats
   */
  async exportAudio(
    buffer: AudioBufferType,
    options: ExportOptions
  ): Promise<Blob> {
    switch (options.format) {
      case 'wav':
        return this.encodeWAV(buffer, options);
      case 'mp3':
        return this.encodeMP3(buffer, options);
      case 'aac':
      case 'ogg':
        return this.encodeViaMediaElement(buffer, options);
      default:
        throw new Error(`Unsupported format: ${options.format}`);
    }
  }

  /**
   * Encode audio as WAV
   */
  private encodeWAV(
    buffer: AudioBufferType,
    options: ExportOptions
  ): Blob {
    const numberOfChannels = buffer.data.length;
    const sampleRate = options.sampleRate || buffer.format.sampleRate;
    const totalLength = buffer.data[0].length;

    // Create WAV file
    const wavSize = 36 + totalLength * numberOfChannels * 2;
    const arrayBuffer = new ArrayBuffer(44 + totalLength * numberOfChannels * 2);
    const dataView = new DataView(arrayBuffer);

    // WAV file header
    const write = (offset: number, value: number, size: number) => {
      for (let i = 0; i < size; i++) {
        dataView.setUint8(offset + i, value & 0xff);
        value >>= 8;
      }
    };

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        dataView.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    write(4, wavSize, 4);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    write(16, 16, 4); // fmt chunk size
    write(20, 1, 2); // audio format (PCM)
    write(22, numberOfChannels, 2);
    write(24, sampleRate, 4);
    write(28, sampleRate * numberOfChannels * 2, 4); // byte rate
    write(32, numberOfChannels * 2, 2); // block align
    write(34, 16, 2); // bits per sample
    writeString(36, 'data');
    write(40, totalLength * numberOfChannels * 2, 4);

    // Write audio data
    let index = 44;
    for (let i = 0; i < totalLength; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.data[channel][i]));
        dataView.setInt16(
          index,
          sample < 0 ? sample * 0x8000 : sample * 0x7fff,
          true
        );
        index += 2;
      }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  /**
   * Encode audio as MP3 using lamejs
   */
  private async encodeMP3(
    buffer: AudioBufferType,
    options: ExportOptions
  ): Promise<Blob> {
    // This would require lamejs library
    // For production, use server-side encoding via FFmpeg
    console.warn('MP3 encoding not available client-side, using WAV fallback');
    return this.encodeWAV(buffer, { ...options, format: 'wav' });
  }

  /**
   * Encode via MediaElement (requires server-side processing)
   */
  private async encodeViaMediaElement(
    buffer: AudioBufferType,
    options: ExportOptions
  ): Promise<Blob> {
    // This requires server-side processing
    // Send to backend for encoding
    console.warn(`${options.format} encoding requires server-side processing`);
    return this.encodeWAV(buffer, { ...options, format: 'wav' });
  }

  /**
   * Analyze audio quality metrics
   */
  async analyzeAudio(buffer: AudioBufferType) {
    return analyzeAudio(buffer);
  }

  /**
   * Get next available worker from pool
   */
  private getWorker(): Worker | null {
    if (this.workerPool.length === 0) return null;
    const worker = this.workerPool[this.currentWorkerIndex];
    this.currentWorkerIndex = (this.currentWorkerIndex + 1) % this.workerPool.length;
    return worker;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.workerPool.forEach((worker) => worker.terminate());
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}
