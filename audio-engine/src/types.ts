/**
 * Audio Processing Types and Interfaces
 * Defines all types used throughout the application
 */

// ============= AUDIO BUFFER & FORMAT TYPES =============

export interface AudioFormat {
  sampleRate: number;
  channels: number;
  duration: number;
  bitDepth: 16 | 24 | 32;
}

export interface AudioBuffer {
  data: Float32Array[];
  format: AudioFormat;
  metadata?: {
    title?: string;
    artist?: string;
    genre?: string;
    uploadedAt?: Date;
  };
}

export enum ExportFormat {
  WAV = 'wav',
  MP3 = 'mp3',
  AAC = 'aac',
  OGG = 'ogg',
}

export interface ExportOptions {
  format: ExportFormat;
  bitrate?: 128 | 192 | 256 | 320; // kbps
  sampleRate?: 44100 | 48000 | 96000;
  channels?: 1 | 2; // mono or stereo
  quality?: number; // 0-9 for lossy formats
}

// ============= TIME-STRETCH TYPES =============

export interface TimeStretchSettings {
  rate: number; // 0.5 - 2.0 (0.5 = half speed, 2.0 = double speed)
  preservePitch: boolean; // If true, pitch remains unchanged
  windowSize: 256 | 512 | 1024 | 2048 | 4096; // FFT window size
  overlapFactor: number; // 0.5 - 0.99
  qualityMode: 'draft' | 'normal' | 'high'; // Affects processing
}

export const DEFAULT_TIME_STRETCH: TimeStretchSettings = {
  rate: 1.0,
  preservePitch: true,
  windowSize: 2048,
  overlapFactor: 0.75,
  qualityMode: 'normal',
};

// ============= REVERB TYPES =============

export interface ReverbSettings {
  // Algorithmic Reverb (Schroeder)
  roomSize: number; // 0.0 - 1.0 (larger = longer tail)
  damping: number; // 0.0 - 1.0 (higher = more absorption)
  wetLevel: number; // 0.0 - 1.0 (reverb amount)
  dryLevel: number; // 0.0 - 1.0 (original signal amount)
  preDelay: number; // 0 - 200 ms
  width: number; // 0.0 - 1.0 (stereo spread)

  // Early Reflections (optional convolution)
  useConvolution: boolean; // Mix algorithmic with convolution
  irFile?: string; // Impulse response filename
}

export const DEFAULT_REVERB: ReverbSettings = {
  roomSize: 0.5,
  damping: 0.5,
  wetLevel: 0.33,
  dryLevel: 1.0,
  preDelay: 0,
  width: 1.0,
  useConvolution: false,
};

// ============= EQUALIZER TYPES =============

export interface EQBand {
  id: string;
  frequency: number; // Hz
  gain: number; // dB (-12 to +12)
  Q: number; // Quality factor (0.1 to 10)
  type: 'peaking' | 'lowpass' | 'highpass' | 'lowshelf' | 'highshelf';
}

export interface EqualizerSettings {
  enabled: boolean;
  bands: EQBand[];
  presets?: Record<string, EQBand[]>; // e.g., 'vocal', 'bass_boost'
}

export const DEFAULT_EQUALIZER: EqualizerSettings = {
  enabled: false,
  bands: [
    { id: 'low', frequency: 100, gain: 0, Q: 0.707, type: 'lowshelf' },
    { id: 'mid', frequency: 1000, gain: 0, Q: 0.707, type: 'peaking' },
    { id: 'high', frequency: 10000, gain: 0, Q: 0.707, type: 'highshelf' },
  ],
};

// ============= COMPRESSOR TYPES =============

export interface CompressorSettings {
  enabled: boolean;
  threshold: number; // dB (-100 to 0)
  ratio: number; // 1:1 - 16:1
  attack: number; // ms (0 to 1000)
  release: number; // ms (0 to 5000)
  makeup: number; // dB (0 to 40)
  knee: number; // dB (0 to 40, smoothness)
}

export const DEFAULT_COMPRESSOR: CompressorSettings = {
  enabled: false,
  threshold: -20,
  ratio: 4,
  attack: 5,
  release: 50,
  makeup: 0,
  knee: 6,
};

// ============= DELAY/ECHO TYPES =============

export interface DelayTap {
  id: string;
  delayTime: number; // ms
  feedback: number; // 0 - 0.9
  level: number; // 0 - 1.0
  pan: number; // -1 (left) to 1 (right)
}

export interface DelaySettings {
  enabled: boolean;
  taps: DelayTap[];
  maxDelayTime: number; // ms (default 2000)
  wetDryMix: number; // 0 (dry) to 1 (wet)
}

export const DEFAULT_DELAY: DelaySettings = {
  enabled: false,
  taps: [
    { id: 'tap1', delayTime: 250, feedback: 0.5, level: 0.5, pan: -0.3 },
    { id: 'tap2', delayTime: 500, feedback: 0.3, level: 0.3, pan: 0.3 },
  ],
  maxDelayTime: 2000,
  wetDryMix: 0.3,
};

// ============= MASTER EFFECTS CONFIG =============

export interface EffectsConfig {
  timeStretch: TimeStretchSettings;
  reverb: ReverbSettings;
  equalizer: EqualizerSettings;
  compressor: CompressorSettings;
  delay: DelaySettings;
  limiterThreshold: number; // dB (-20 to 0) - always active
}

export const DEFAULT_EFFECTS_CONFIG: EffectsConfig = {
  timeStretch: DEFAULT_TIME_STRETCH,
  reverb: DEFAULT_REVERB,
  equalizer: DEFAULT_EQUALIZER,
  compressor: DEFAULT_COMPRESSOR,
  delay: DEFAULT_DELAY,
  limiterThreshold: -0.1,
};

// ============= APPLICATION STATE TYPES =============

export interface AudioSession {
  id: string;
  uploadedFile: File;
  audioBuffer: AudioBuffer;
  effectsConfig: EffectsConfig;
  playbackPosition: number; // seconds
  isPlaying: boolean;
  processedBuffer?: AudioBuffer; // cached processed result
  createdAt: Date;
}

export interface ProcessingJob {
  id: string;
  sessionId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  exportOptions: ExportOptions;
  resultUrl?: string; // Download URL
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

// ============= API REQUEST/RESPONSE TYPES =============

export interface ProcessAudioRequest {
  sessionId: string;
  config: EffectsConfig;
  isRealtime?: boolean; // true for preview, false for export
}

export interface ProcessAudioResponse {
  success: boolean;
  jobId?: string; // For async processing
  buffer?: Float32Array; // For sync processing
  estimatedTime?: number; // seconds
  error?: string;
}

export interface ExportRequest {
  sessionId: string;
  config: EffectsConfig;
  options: ExportOptions;
}

export interface ExportResponse {
  success: boolean;
  downloadUrl?: string;
  jobId?: string;
  error?: string;
}

// ============= ANALYSIS TYPES =============

export interface AudioAnalysis {
  peakLevel: number; // dB
  rmsLevel: number; // dB
  dynamicRange: number; // dB
  crestFactor: number;
  frequency: {
    spectrum: Float32Array; // FFT data
    fundamental?: number; // Hz
    centroid: number; // Hz
  };
  perceptual: {
    loudness: number; // LUFS
    loudnessRange: number; // LU
  };
}

export interface AnalysisOptions {
  includeSpectrum?: boolean;
  includePerceptual?: boolean;
  windowSize?: number;
}

// ============= UTILITY TYPES =============

export interface ProcessingProgress {
  percentage: number; // 0-100
  stage: string; // e.g., 'decoding', 'processing', 'encoding'
  elapsedTime: number; // seconds
  estimatedRemaining: number; // seconds
}

export interface AudioError {
  code: 'DECODE_ERROR' | 'PROCESSING_ERROR' | 'EXPORT_ERROR' | 'MEMORY_ERROR';
  message: string;
  details?: Record<string, unknown>;
  recoverable: boolean;
}

// ============= FUNCTION SIGNATURES =============

/**
 * Load and decode audio file to AudioBuffer
 * @param file - Audio file (MP3, WAV, AAC, OGG, FLAC)
 * @returns Promise resolving to decoded AudioBuffer
 */
export async function loadAudio(file: File): Promise<AudioBuffer>;

/**
 * Apply time-stretching effect to audio buffer
 * @param buffer - Input audio buffer
 * @param settings - Time-stretch parameters
 * @param progressCallback - Optional callback for progress updates
 * @returns Promise resolving to processed AudioBuffer
 */
export async function applyTimeStretch(
  buffer: AudioBuffer,
  settings: TimeStretchSettings,
  progressCallback?: (progress: ProcessingProgress) => void
): Promise<AudioBuffer>;

/**
 * Apply reverb effect to audio buffer
 * @param buffer - Input audio buffer
 * @param settings - Reverb parameters
 * @param irBuffer - Optional impulse response buffer for convolution
 * @returns Promise resolving to processed AudioBuffer
 */
export async function applyReverb(
  buffer: AudioBuffer,
  settings: ReverbSettings,
  irBuffer?: AudioBuffer
): Promise<AudioBuffer>;

/**
 * Apply equalization effect to audio buffer
 * @param buffer - Input audio buffer
 * @param settings - Equalizer parameters
 * @returns Promise resolving to processed AudioBuffer
 */
export async function applyEqualizer(
  buffer: AudioBuffer,
  settings: EqualizerSettings
): Promise<AudioBuffer>;

/**
 * Apply compressor effect to audio buffer
 * @param buffer - Input audio buffer
 * @param settings - Compressor parameters
 * @returns Promise resolving to processed AudioBuffer
 */
export async function applyCompressor(
  buffer: AudioBuffer,
  settings: CompressorSettings
): Promise<AudioBuffer>;

/**
 * Apply delay/echo effect to audio buffer
 * @param buffer - Input audio buffer
 * @param settings - Delay parameters
 * @returns Promise resolving to processed AudioBuffer
 */
export async function applyDelay(
  buffer: AudioBuffer,
  settings: DelaySettings
): Promise<AudioBuffer>;

/**
 * Process audio through complete effects chain
 * @param buffer - Input audio buffer
 * @param config - Complete effects configuration
 * @param progressCallback - Optional callback for progress updates
 * @returns Promise resolving to fully processed AudioBuffer
 */
export async function processEffects(
  buffer: AudioBuffer,
  config: EffectsConfig,
  progressCallback?: (progress: ProcessingProgress) => void
): Promise<AudioBuffer>;

/**
 * Export audio buffer to specified format
 * @param buffer - Processed audio buffer
 * @param options - Export format and quality options
 * @param progressCallback - Optional callback for encoding progress
 * @returns Promise resolving to Blob (downloadable file)
 */
export async function exportAudio(
  buffer: AudioBuffer,
  options: ExportOptions,
  progressCallback?: (progress: ProcessingProgress) => void
): Promise<Blob>;

/**
 * Analyze audio for quality metrics
 * @param buffer - Audio buffer to analyze
 * @param options - Analysis options
 * @returns Promise resolving to AudioAnalysis results
 */
export async function analyzeAudio(
  buffer: AudioBuffer,
  options?: AnalysisOptions
): Promise<AudioAnalysis>;

/**
 * Create offline audio context for processing large files
 * @param buffer - Audio buffer
 * @param offlineLength - Total number of samples
 * @param sampleRate - Sample rate
 * @returns OfflineAudioContext instance
 */
export function createOfflineContext(
  buffer: AudioBuffer
): OfflineAudioContext;
