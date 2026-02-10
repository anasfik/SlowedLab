/**
 * SlowedLab - Professional Audio Editor
 * Expert-level UX with Web Audio API integration
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  FiPlay, FiPause, FiSkipBack, FiSkipForward, FiBookmark, FiMusic,
  FiActivity, FiVolume2, FiCpu,
  FiHeadphones, FiStar, FiZap as FiBolt, FiDroplet as FiDiamond, FiSliders,
  FiSettings, FiX
} from 'react-icons/fi';
import Topbar from './components/Topbar.tsx';
import Sidebar from './components/Sidebar.tsx';
import './App.css';
import Waveform from './components/Waveform.tsx';
import BugReportPanel from './components/BugReportPanel.tsx';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.ts';

// Extend window interface for bookmark functionality
declare global {
  interface Window {
    sidebar?: {
      addPanel: (title: string, url: string, icon: string) => void;
    };
  }
}

export interface AudioFile {
  id: string;
  file: File;
  buffer: AudioBuffer | null;
  duration: number;
  isLoading: boolean;
}

export interface AudioState {
  playlist: AudioFile[];
  currentTrackIndex: number;
  currentTime: number;
  isPlaying: boolean;
  error: string | null;
}

export interface EffectSettings {
  playbackRate: number;
  reverbAmount: number;
  bassBoost: number;
  trebleBoost: number;
  compression: number;
  distortion: number;
}

export interface Preset {
  name: string;
  description: string;
  icon: string;
  settings: EffectSettings;
}

export interface UserPreset extends Preset {
  id: string;
}

const STORAGE_KEYS = {
  effects: 'sr_effects_v1',
  preset: 'sr_selected_preset_v1',
  userPresets: 'sr_user_presets_v1',
  playHistory: 'sr_play_history_v1',
};

const DB_CONFIG = {
  name: 'slowedlab-cache',
  version: 1,
  store: 'tracks',
};

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB limit
const SUPPORTED_FORMATS = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/mp4', 'audio/aac', 'audio/webm'];

interface PlayHistoryItem {
  id: string;
  trackName: string;
  startedAt: number;
  preset: string;
  duration: number;
}

const DEFAULT_EFFECTS: EffectSettings = {
  playbackRate: 1.0,
  reverbAmount: 0,
  bassBoost: 0,
  trebleBoost: 0,
  compression: 0,
  distortion: 0,
};

const PRESETS: Preset[] = [
  {
    name: 'Slowed + Reverb',
    description: 'Classic slowed and reverb effect',
    icon: 'waves',
    settings: { playbackRate: 0.75, reverbAmount: 60, bassBoost: 20, trebleBoost: 0, compression: 30, distortion: 0 }
  },
  {
    name: 'Nightcore',
    description: 'Fast pitch with energy',
    icon: 'bolt',
    settings: { playbackRate: 1.35, reverbAmount: 20, bassBoost: 0, trebleBoost: 30, compression: 40, distortion: 0 }
  },
  {
    name: 'Bass Boosted',
    description: 'Deep bass enhancement',
    icon: 'volumeHigh',
    settings: { playbackRate: 1.0, reverbAmount: 15, bassBoost: 60, trebleBoost: -10, compression: 50, distortion: 5 }
  },
  {
    name: 'Lo-Fi Chill',
    description: 'Warm and relaxed vibe',
    icon: 'headphones',
    settings: { playbackRate: 0.95, reverbAmount: 40, bassBoost: 25, trebleBoost: -15, compression: 35, distortion: 10 }
  },
  {
    name: 'Ethereal Dream',
    description: 'Maximum reverb and space',
    icon: 'sparkles',
    settings: { playbackRate: 0.85, reverbAmount: 85, bassBoost: 10, trebleBoost: 20, compression: 25, distortion: 0 }
  },
  {
    name: 'Crystal Clear',
    description: 'Enhanced clarity and brightness',
    icon: 'diamond',
    settings: { playbackRate: 1.0, reverbAmount: 10, bassBoost: 0, trebleBoost: 40, compression: 30, distortion: 0 }
  },
  {
    name: 'Distorted',
    description: 'Gritty and raw sound',
    icon: 'flame',
    settings: { playbackRate: 1.0, reverbAmount: 30, bassBoost: 30, trebleBoost: 20, compression: 60, distortion: 50 }
  },
  {
    name: 'Custom',
    description: 'Fine-tune every parameter',
    icon: 'sliders',
    settings: { playbackRate: 1.0, reverbAmount: 0, bassBoost: 0, trebleBoost: 0, compression: 0, distortion: 0 }
  }
];

export const IconRenderer = ({ icon, size = 18 }: { icon: string; size?: number }) => {
  switch (icon) {
    case 'waves': return <FiActivity size={size} />;
    case 'bolt': return <FiBolt size={size} />;
    case 'volumeHigh': return <FiVolume2 size={size} />;
    case 'headphones': return <FiHeadphones size={size} />;
    case 'sparkles': return <FiStar size={size} />;
    case 'diamond': return <FiDiamond size={size} />;
    case 'flame': return <FiCpu size={size} />;
    case 'sliders': return <FiSliders size={size} />;
    default: return <FiMusic size={size} />;
  }
};

export default function App() {
  const [audio, setAudio] = useState<AudioState>({
    playlist: [],
    currentTrackIndex: 0,
    currentTime: 0,
    isPlaying: false,
    error: null,
  });

  const [volume, setVolume] = useState(1.0);
  const [effects, setEffects] = useState<EffectSettings>({ ...DEFAULT_EFFECTS });
  const [selectedPreset, setSelectedPreset] = useState('Custom');

  const [isDragging, setIsDragging] = useState(false);

  const [playHistory, setPlayHistory] = useState<PlayHistoryItem[]>([]);
  const [userPresets, setUserPresets] = useState<UserPreset[]>([]);
  const [abBaseline, setAbBaseline] = useState<EffectSettings | null>(null);
  const [abSnapshot, setAbSnapshot] = useState<EffectSettings | null>(null);
  const [abActive, setAbActive] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState('My Preset');
  const [isRestoring, setIsRestoring] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState<{ fileName: string, progress: number } | null>(null);
  const [showBugModal, setShowBugModal] = useState(false);
  const [bugTitle, setBugTitle] = useState('');
  const [bugDescription, setBugDescription] = useState('');
  const [bugEmail, setBugEmail] = useState('');
  const [bugSubmitting, setBugSubmitting] = useState(false);
  const [bugMessage, setBugMessage] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const convolverNodeRef = useRef<ConvolverNode | null>(null);
  const dryGainRef = useRef<GainNode | null>(null);
  const wetGainRef = useRef<GainNode | null>(null);
  const bassEQRef = useRef<BiquadFilterNode | null>(null);
  const trebleEQRef = useRef<BiquadFilterNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const distortionRef = useRef<WaveShaperNode | null>(null);

  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const pauseTimeRef = useRef<number>(0); // buffer position (seconds)
  const pauseTimelineRef = useRef<number>(0); // playback timeline (seconds)
  const playbackRateRef = useRef<number>(1);
  const lastPlaybackRateRef = useRef<number>(1);
  const audioStateRef = useRef<AudioState | null>(null);
  const playingRef = useRef(false);
  const currentTrackRef = useRef<AudioFile | null>(null);
  const playAudioRef = useRef<() => void>(() => { });
  const stopAudioRef = useRef<() => void>(() => { });
  const [bufferPosition, setBufferPosition] = useState(0);

  // Validate audio file
  const validateAudioFile = useCallback((file: File): string | null => {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return `File "${file.name}" is too large. Maximum size is 200MB.`;
    }

    if (file.size === 0) {
      return `File "${file.name}" is empty.`;
    }

    // Check file format
    if (!file.type.startsWith('audio/')) {
      return `"${file.name}" is not an audio file.`;
    }

    // Warn about unsupported formats
    if (!SUPPORTED_FORMATS.includes(file.type)) {
      console.warn(`Format ${file.type} might not be supported`);
    }

    return null;
  }, []);

  // Waveform drawing moved to dedicated component for performance and UX

  // IndexedDB helpers for caching audio between reloads
  const openDB = useCallback((): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_CONFIG.name, DB_CONFIG.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DB_CONFIG.store)) {
          db.createObjectStore(DB_CONFIG.store, { keyPath: 'id' });
        }
      };
    });
  }, []);

  const persistTrackToDB = useCallback(async (trackId: string, file: File) => {
    try {
      const db = await openDB();
      const tx = db.transaction(DB_CONFIG.store, 'readwrite');
      const store = tx.objectStore(DB_CONFIG.store);
      const arrayBuffer = await file.arrayBuffer();
      store.put({ id: trackId, name: file.name, type: file.type, data: arrayBuffer });
    } catch (err) {
      console.warn('Failed to persist track', err);
    }
  }, [openDB]);

  const clearTrackCache = useCallback(async () => {
    try {
      const db = await openDB();
      const tx = db.transaction(DB_CONFIG.store, 'readwrite');
      tx.objectStore(DB_CONFIG.store).clear();
    } catch (err) {
      console.warn('Failed to clear cache', err);
    }
  }, [openDB]);

  const restoreTracksFromDB = useCallback(async () => {
    if (!audioContextRef.current) return;
    try {
      const db = await openDB();
      const tx = db.transaction(DB_CONFIG.store, 'readonly');
      const store = tx.objectStore(DB_CONFIG.store);
      const request = store.getAll();
      const cachedTracks: any[] = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result as any[]);
        request.onerror = () => reject(request.error);
      });

      if (!cachedTracks.length) return;

      const restored: AudioFile[] = [];
      for (const cached of cachedTracks) {
        const blob = new Blob([cached.data], { type: cached.type });
        const restoredFile = new File([blob], cached.name, { type: cached.type });
        const arrayBuffer: ArrayBuffer = cached.data instanceof ArrayBuffer ? cached.data : await cached.data.arrayBuffer();
        const buffer = await audioContextRef.current.decodeAudioData(arrayBuffer.slice(0));
        restored.push({
          id: cached.id,
          file: restoredFile,
          buffer,
          duration: buffer.duration,
          isLoading: false,
        });
      }

      setAudio(prev => ({
        ...prev,
        playlist: restored,
        currentTrackIndex: 0,
        currentTime: 0,
      }));

      // Waveform is handled by the Waveform component
    } catch (err) {
      console.warn('Failed to restore tracks', err);
    }
  }, [openDB]);

  const autoPlayFirst = useCallback(() => {
    pauseTimeRef.current = 0;
    pauseTimelineRef.current = 0;
    startTimeRef.current = audioContextRef.current?.currentTime || 0;
    setBufferPosition(0);
    setAudio(prev => ({ ...prev, currentTrackIndex: 0, currentTime: 0 }));
    setTimeout(() => {
      playAudioRef.current?.();
    }, 80);
  }, []);

  const currentTrack = audio.playlist[audio.currentTrackIndex] || null;

  // Keep refs in sync for animation loop
  useEffect(() => {
    audioStateRef.current = audio;
    playingRef.current = audio.isPlaying;
    currentTrackRef.current = currentTrack;
  }, [audio, currentTrack]);

  // Initialize Audio Context
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();

    // Create reverb impulse response
    const createReverb = () => {
      const convolver = audioContextRef.current!.createConvolver();
      const rate = audioContextRef.current!.sampleRate;
      const length = rate * 2; // 2 second reverb
      const impulse = audioContextRef.current!.createBuffer(2, length, rate);

      for (let channel = 0; channel < 2; channel++) {
        const impulseData = impulse.getChannelData(channel);
        for (let i = 0; i < length; i++) {
          impulseData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
        }
      }

      convolver.buffer = impulse;
      convolverNodeRef.current = convolver;
    };

    createReverb();

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Restore cached session (presets, loop, history, tracks)
  useEffect(() => {
    const cachedEffects = localStorage.getItem(STORAGE_KEYS.effects);
    const cachedPreset = localStorage.getItem(STORAGE_KEYS.preset);
    const cachedUserPresets = localStorage.getItem(STORAGE_KEYS.userPresets);
    const cachedHistory = localStorage.getItem(STORAGE_KEYS.playHistory);

    if (cachedEffects) {
      try {
        const parsed = JSON.parse(cachedEffects) as EffectSettings;
        setEffects(parsed);
        setAbBaseline(parsed);
      } catch (err) {
        console.warn('Failed to parse cached effects', err);
      }
    }
    if (cachedPreset) {
      setSelectedPreset(cachedPreset);
    }
    if (cachedUserPresets) {
      try {
        setUserPresets(JSON.parse(cachedUserPresets));
      } catch (err) {
        console.warn('Failed to parse cached user presets', err);
      }
    }
    if (cachedHistory) {
      try {
        setPlayHistory(JSON.parse(cachedHistory));
      } catch (err) {
        console.warn('Failed to parse play history', err);
      }
    }

    restoreTracksFromDB().finally(() => setIsRestoring(false));
  }, [restoreTracksFromDB]);

  // Persist session changes
  useEffect(() => {
    if (isRestoring) return;
    localStorage.setItem(STORAGE_KEYS.effects, JSON.stringify(effects));
    localStorage.setItem(STORAGE_KEYS.preset, selectedPreset);
    localStorage.setItem(STORAGE_KEYS.userPresets, JSON.stringify(userPresets));
    localStorage.setItem(STORAGE_KEYS.playHistory, JSON.stringify(playHistory.slice(0, 50)));
  }, [effects, selectedPreset, userPresets, playHistory, isRestoring]);

  // Old canvas waveform removed; new component handles rendering and interactions

  // Handle file upload (multiple files)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validate all files first
    const validationErrors: string[] = [];
    const validFiles: File[] = [];

    files.forEach(file => {
      const error = validateAudioFile(file);
      if (error) {
        validationErrors.push(error);
      } else if (file.type.startsWith('audio/')) {
        validFiles.push(file);
      }
    });

    if (validationErrors.length > 0) {
      setAudio(prev => ({ ...prev, error: validationErrors.join(' ') }));
      setTimeout(() => setAudio(prev => ({ ...prev, error: null })), 5000);
    }

    if (validFiles.length === 0) {
      if (validationErrors.length === 0) {
        setAudio(prev => ({ ...prev, error: 'Please upload audio files (MP3, WAV, FLAC, OGG, etc.)' }));
        setTimeout(() => setAudio(prev => ({ ...prev, error: null })), 3000);
      }
      return;
    }

    const audioFiles = validFiles;

    const shouldAutoplay = audio.playlist.length === 0;

    const newTracks: AudioFile[] = audioFiles.map(file => ({
      id: Date.now().toString() + Math.random(),
      file,
      buffer: null,
      duration: 0,
      isLoading: true,
    }));

    setAudio(prev => ({
      ...prev,
      playlist: [...prev.playlist, ...newTracks],
      currentTrackIndex: prev.playlist.length === 0 ? 0 : prev.currentTrackIndex,
    }));

    // Load each file
    for (let i = 0; i < newTracks.length; i++) {
      try {
        setLoadingProgress({ fileName: audioFiles[i].name, progress: 0 });

        const arrayBuffer = await audioFiles[i].arrayBuffer();
        setLoadingProgress({ fileName: audioFiles[i].name, progress: 50 });

        const buffer = await audioContextRef.current!.decodeAudioData(arrayBuffer);
        setLoadingProgress({ fileName: audioFiles[i].name, progress: 100 });

        // Waveform handled by component

        await persistTrackToDB(newTracks[i].id, audioFiles[i]);

        setAudio(prev => ({
          ...prev,
          playlist: prev.playlist.map(track =>
            track.id === newTracks[i].id
              ? { ...track, buffer, duration: buffer.duration, isLoading: false }
              : track
          ),
        }));

        if (shouldAutoplay && i === 0) {
          autoPlayFirst();
        }
      } catch (err) {
        console.error('Failed to load audio:', err);
        const errorMsg = err instanceof Error
          ? `Failed to load "${audioFiles[i].name}": ${err.message.includes('Unable to decode') ? 'Unsupported or corrupted audio format' : err.message}`
          : `Failed to load "${audioFiles[i].name}": Unknown error`;

        setAudio(prev => ({
          ...prev,
          playlist: prev.playlist.filter(track => track.id !== newTracks[i].id),
          error: errorMsg,
        }));
        setTimeout(() => setAudio(prev => ({ ...prev, error: null })), 6000);
      } finally {
        setLoadingProgress(null);
      }
    }

    // Reset file input
    e.target.value = '';
  };

  // Handle drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);

    // Validate all files
    const validationErrors: string[] = [];
    const validFiles: File[] = [];

    files.forEach(file => {
      const error = validateAudioFile(file);
      if (error) {
        validationErrors.push(error);
      } else if (file.type.startsWith('audio/')) {
        validFiles.push(file);
      }
    });

    if (validationErrors.length > 0) {
      setAudio(prev => ({ ...prev, error: validationErrors.join(' ') }));
      setTimeout(() => setAudio(prev => ({ ...prev, error: null })), 5000);
    }

    if (validFiles.length === 0) {
      if (validationErrors.length === 0) {
        setAudio(prev => ({ ...prev, error: 'Please drop audio files (MP3, WAV, FLAC, OGG, etc.)' }));
        setTimeout(() => setAudio(prev => ({ ...prev, error: null })), 3000);
      }
      return;
    }

    const audioFiles = validFiles;

    const shouldAutoplay = audio.playlist.length === 0;

    const newTracks: AudioFile[] = audioFiles.map(file => ({
      id: Date.now().toString() + Math.random(),
      file,
      buffer: null,
      duration: 0,
      isLoading: true,
    }));

    setAudio(prev => ({
      ...prev,
      playlist: [...prev.playlist, ...newTracks],
      currentTrackIndex: prev.playlist.length === 0 ? 0 : prev.currentTrackIndex,
    }));

    // Load each file
    for (let i = 0; i < newTracks.length; i++) {
      try {
        setLoadingProgress({ fileName: audioFiles[i].name, progress: 0 });

        const arrayBuffer = await audioFiles[i].arrayBuffer();
        setLoadingProgress({ fileName: audioFiles[i].name, progress: 50 });

        const buffer = await audioContextRef.current!.decodeAudioData(arrayBuffer);
        setLoadingProgress({ fileName: audioFiles[i].name, progress: 100 });

        // Waveform handled by component

        // Persist dropped track to cache for session restore
        await persistTrackToDB(newTracks[i].id, audioFiles[i]);

        setAudio(prev => ({
          ...prev,
          playlist: prev.playlist.map(track =>
            track.id === newTracks[i].id
              ? { ...track, buffer, duration: buffer.duration, isLoading: false }
              : track
          ),
        }));

        if (shouldAutoplay && i === 0) {
          autoPlayFirst();
        }
      } catch (err) {
        console.error('Failed to load audio:', err);
        const errorMsg = err instanceof Error
          ? `Failed to load "${audioFiles[i].name}": ${err.message.includes('Unable to decode') ? 'Unsupported or corrupted audio format' : err.message}`
          : `Failed to load "${audioFiles[i].name}": Unknown error`;

        setAudio(prev => ({
          ...prev,
          playlist: prev.playlist.filter(track => track.id !== newTracks[i].id),
          error: errorMsg,
        }));
        setTimeout(() => setAudio(prev => ({ ...prev, error: null })), 6000);
      } finally {
        setLoadingProgress(null);
      }
    }
  };

  // Update current time animation using freshest state refs to avoid stale closures
  const updateTime = useCallback(() => {
    const state = audioStateRef.current;
    const track = currentTrackRef.current;
    if (!state || !track || !audioContextRef.current || !playingRef.current) return;

    const ctxNow = audioContextRef.current.currentTime;
    const elapsedCtx = ctxNow - startTimeRef.current;

    // playback timeline (seconds regardless of rate)
    const timelineNow = pauseTimelineRef.current + elapsedCtx;
    setAudio(prev => ({ ...prev, currentTime: timelineNow }));

    // buffer position in seconds (accounts for playback rate)
    const rate = playbackRateRef.current || 1;
    const bufPos = pauseTimeRef.current + elapsedCtx * rate;
    setBufferPosition(Math.min(bufPos, track.duration));

    if (bufPos >= track.duration - 1e-3) {
      // Stop current source to prevent concurrent playback
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.stop();
          sourceNodeRef.current.disconnect();
        } catch (e) {
          // Already stopped
        }
        sourceNodeRef.current = null;
      }

      const nextIndex = state.currentTrackIndex + 1;
      const nextTrack = state.playlist[nextIndex];
      if (nextTrack?.buffer) {
        // Auto-play next track in playlist
        pauseTimeRef.current = 0;
        pauseTimelineRef.current = 0;
        setBufferPosition(0);
        setAudio(prev => ({ ...prev, currentTrackIndex: nextIndex, currentTime: 0, isPlaying: false }));
        // Stop current source correctly before auto-play
        if (sourceNodeRef.current) {
          (sourceNodeRef.current as any).onended = null;
          (sourceNodeRef.current as any).stop();
          sourceNodeRef.current = null;
        }
        setTimeout(() => playAudioRef.current?.(), 100);
      } else {
        stopAudioRef.current?.();
      }
      return;
    }

    animationFrameRef.current = requestAnimationFrame(updateTime);
  }, []);

  const logPlayHistory = useCallback((track: AudioFile) => {
    setPlayHistory(prev => {
      const entry: PlayHistoryItem = {
        id: `${track.id}-${Date.now()}`,
        trackName: track.file.name,
        startedAt: Date.now(),
        preset: selectedPreset,
        duration: track.duration,
      };
      return [entry, ...prev].slice(0, 25);
    });
  }, [selectedPreset]);

  // Play audio with all effects
  const playAudio = useCallback(async () => {
    const track = currentTrackRef.current;
    if (!track?.buffer || !audioContextRef.current) return;

    // Stop any existing audio source to prevent concurrent playback
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.onended = null; // Prevent race conditions
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch (e) {
        // Already stopped
      }
      sourceNodeRef.current = null;
    }

    // Ensure context is ready
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    // Create audio nodes
    const source = audioContextRef.current.createBufferSource();
    const gainNode = audioContextRef.current.createGain();
    const convolver = audioContextRef.current.createConvolver();
    const bassEQ = audioContextRef.current.createBiquadFilter();
    const trebleEQ = audioContextRef.current.createBiquadFilter();
    const compressor = audioContextRef.current.createDynamicsCompressor();
    const distortion = audioContextRef.current.createWaveShaper();

    source.buffer = track.buffer;
    source.playbackRate.value = effects.playbackRate;
    gainNode.gain.value = volume;


    // Configure reverb
    convolver.buffer = convolverNodeRef.current!.buffer;
    const reverbGain = audioContextRef.current.createGain();
    const dryGain = audioContextRef.current.createGain();
    reverbGain.gain.value = effects.reverbAmount / 100;
    dryGain.gain.value = 1 - (effects.reverbAmount / 200); // Keep some dry signal

    // Configure EQ
    bassEQ.type = 'lowshelf';
    bassEQ.frequency.value = 200;
    bassEQ.gain.value = effects.bassBoost / 2;

    trebleEQ.type = 'highshelf';
    trebleEQ.frequency.value = 3000;
    trebleEQ.gain.value = effects.trebleBoost / 2;

    // Configure compressor (0% = bypass)
    const compressionAmount = effects.compression / 100;
    const compressionRatio = 1 + compressionAmount * 19; // 1x..20x
    const compressionThreshold = 0 - compressionAmount * 40; // 0..-40 dB
    compressor.threshold.value = compressionThreshold;
    compressor.knee.value = compressionAmount * 30;
    compressor.ratio.value = compressionRatio;
    compressor.attack.value = 0.005 + compressionAmount * 0.045;
    compressor.release.value = 0.05 + compressionAmount * 0.35;

    // Configure distortion (0% = passthrough)
    const makeDistortionCurve = (amount: number) => {
      const samples = 44100;
      const curve = new Float32Array(samples);
      if (amount <= 0.0001) {
        for (let i = 0; i < samples; i++) {
          const x = (i * 2) / samples - 1;
          curve[i] = x;
        }
        return curve;
      }
      const deg = Math.PI / 180;
      const k = amount * 50;

      for (let i = 0; i < samples; i++) {
        const x = (i * 2) / samples - 1;
        curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
      }
      return curve;
    };
    distortion.curve = makeDistortionCurve(effects.distortion / 100);
    distortion.oversample = '4x';

    // Connect nodes: source -> distortion -> EQ -> compressor -> gain -> [dry + wet] -> destination
    source.connect(distortion);
    distortion.connect(bassEQ);
    bassEQ.connect(trebleEQ);
    trebleEQ.connect(compressor);
    compressor.connect(gainNode);

    // Dry signal
    gainNode.connect(dryGain);
    dryGain.connect(audioContextRef.current.destination);

    // Wet signal (with reverb)
    gainNode.connect(convolver);
    convolver.connect(reverbGain);
    reverbGain.connect(audioContextRef.current.destination);

    // Store references
    sourceNodeRef.current = source;
    gainNodeRef.current = gainNode;
    dryGainRef.current = dryGain;
    wetGainRef.current = reverbGain;
    bassEQRef.current = bassEQ;
    trebleEQRef.current = trebleEQ;
    compressorRef.current = compressor;
    distortionRef.current = distortion;

    // Start playback
    startTimeRef.current = audioContextRef.current.currentTime;
    lastPlaybackRateRef.current = effects.playbackRate;
    playbackRateRef.current = effects.playbackRate;
    source.start(0, pauseTimeRef.current);

    source.onended = () => {
      playingRef.current = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      setAudio(prev => ({ ...prev, isPlaying: false }));
    };

    setAudio(prev => ({ ...prev, isPlaying: true }));
    playingRef.current = true;
    animationFrameRef.current = requestAnimationFrame(updateTime);
    logPlayHistory(track);
  }, [volume, effects, updateTime, logPlayHistory]);

  playAudioRef.current = playAudio;

  // Update effects in real-time during playback
  useEffect(() => {
    if (!audio.isPlaying) return;

    // Update playback rate with time-base rebasing to keep sync
    if (sourceNodeRef.current && audioContextRef.current) {
      const newRate = effects.playbackRate;
      if (newRate !== lastPlaybackRateRef.current) {
        const ctxNow = audioContextRef.current.currentTime;
        const elapsedCtx = ctxNow - startTimeRef.current;
        const currentBufPos = pauseTimeRef.current + elapsedCtx * (lastPlaybackRateRef.current || 1);
        pauseTimeRef.current = currentBufPos;
        startTimeRef.current = ctxNow;
        lastPlaybackRateRef.current = newRate;
        playbackRateRef.current = newRate;
      }
      sourceNodeRef.current.playbackRate.value = newRate;
    }

    // Update bass EQ
    if (bassEQRef.current) {
      bassEQRef.current.gain.value = effects.bassBoost / 2;
    }

    // Update treble EQ
    if (trebleEQRef.current) {
      trebleEQRef.current.gain.value = effects.trebleBoost / 2;
    }

    // Update compressor
    if (compressorRef.current) {
      const compressionAmount = effects.compression / 100;
      const compressionRatio = 1 + compressionAmount * 19;
      const compressionThreshold = 0 - compressionAmount * 40;
      compressorRef.current.threshold.value = compressionThreshold;
      compressorRef.current.knee.value = compressionAmount * 30;
      compressorRef.current.ratio.value = compressionRatio;
      compressorRef.current.attack.value = 0.005 + compressionAmount * 0.045;
      compressorRef.current.release.value = 0.05 + compressionAmount * 0.35;
    }

    // Update distortion
    if (distortionRef.current) {
      const makeDistortionCurve = (amount: number) => {
        const samples = 44100;
        const curve = new Float32Array(samples);
        if (amount <= 0.0001) {
          for (let i = 0; i < samples; i++) {
            const x = (i * 2) / samples - 1;
            curve[i] = x;
          }
          return curve;
        }
        const deg = Math.PI / 180;
        const k = amount * 50;

        for (let i = 0; i < samples; i++) {
          const x = (i * 2) / samples - 1;
          curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
        }
        return curve;
      };
      distortionRef.current.curve = makeDistortionCurve(effects.distortion / 100);
    }

    // Update reverb dry/wet mix
    if (dryGainRef.current && wetGainRef.current) {
      const dryAmount = 1 - (effects.reverbAmount / 200);
      const wetAmount = effects.reverbAmount / 100;
      dryGainRef.current.gain.value = dryAmount;
      wetGainRef.current.gain.value = wetAmount;
    }

    // Update volume
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume;
    }
  }, [effects, volume, audio.isPlaying]);


  // Pause audio
  const pauseAudio = useCallback(() => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.onended = null; // Avoid state reset on manual pause
      sourceNodeRef.current.stop();
      sourceNodeRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Capture buffer and timeline positions precisely on pause
    if (audioContextRef.current) {
      const ctxNow = audioContextRef.current.currentTime;
      const elapsedCtx = ctxNow - startTimeRef.current;
      const rate = playbackRateRef.current || effects.playbackRate || 1;
      const bufPos = pauseTimeRef.current + elapsedCtx * rate;
      pauseTimeRef.current = bufPos;
      setBufferPosition(bufPos);
      const timelineNow = pauseTimelineRef.current + elapsedCtx;
      pauseTimelineRef.current = timelineNow;
    } else {
      pauseTimelineRef.current = audio.currentTime;
    }
    playingRef.current = false;
    setAudio(prev => ({ ...prev, isPlaying: false }));
  }, [audio.currentTime, effects.playbackRate]);

  // Stop audio
  const stopAudio = useCallback(() => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.onended = null;
      sourceNodeRef.current.stop();
      sourceNodeRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    pauseTimeRef.current = 0;
    pauseTimelineRef.current = 0;
    setBufferPosition(0);
    playingRef.current = false;
    setAudio(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
  }, []);

  stopAudioRef.current = stopAudio;

  // Report Bug
  const submitBugReport = async () => {
    if (!bugTitle.trim() || !bugDescription.trim()) {
      setBugMessage('Please fill in title and description.');
      return;
    }
    setBugSubmitting(true);
    setBugMessage(null);
    try {
      // CRA injects REACT_APP_API_URL at build time
      const apiBase = process.env.REACT_APP_API_URL || '';
      const base = apiBase.replace(/\/$/, '');
      const url = base ? `${base}/api/report-bug` : '/api/report-bug';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: bugTitle,
          description: bugDescription,
          email: bugEmail,
          meta: {
            preset: selectedPreset,
            effects,
            playlistCount: audio.playlist.length,
          },
        }),
      });
      if (!res.ok) throw new Error('Failed to submit');
      await res.json();
      setBugMessage('Thanks! Your report was submitted.');
      setBugTitle('');
      setBugDescription('');
      setBugEmail('');
      setTimeout(() => setShowBugModal(false), 1200);
    } catch (e) {
      setBugMessage('Could not submit report. Please try again.');
      console.error('Bug report submission failed', e);
    } finally {
      setBugSubmitting(false);
    }
  };

  // Toggle play/pause
  const togglePlayback = () => {
    if (audio.isPlaying) {
      pauseAudio();
    } else {
      playAudio();
    }
  };

  // Update volume
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume;
    }
  }, [volume]);

  // Update playback rate in real-time
  useEffect(() => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.playbackRate.value = effects.playbackRate;
    }
  }, [effects.playbackRate]);

  // Apply preset
  const applyPreset = (presetName: string) => {
    const preset = [...PRESETS, ...userPresets].find(p => p.name === presetName);
    if (preset) {
      setEffects(preset.settings);
      setSelectedPreset(presetName);
      setAbBaseline(preset.settings);

      // If playing, restart with new effects
      if (audio.isPlaying) {
        pauseAudio();
        setTimeout(() => playAudio(), 100);
      }
    }
  };

  const resetPresets = () => {
    setEffects({ ...DEFAULT_EFFECTS });
    setSelectedPreset('Custom');
    setAbBaseline(DEFAULT_EFFECTS);
    if (audio.isPlaying) {
      pauseAudio();
      setTimeout(() => playAudio(), 100);
    }
  };

  const saveUserPreset = () => {
    const name = presetNameInput.trim() || `Preset ${userPresets.length + 1}`;
    const newPreset: UserPreset = {
      id: `${Date.now()}`,
      name,
      description: 'Custom saved preset',
      icon: '⭐',
      settings: { ...effects },
    };
    setUserPresets(prev => [newPreset, ...prev].slice(0, 50));
    setSelectedPreset(name);
    setAbBaseline(newPreset.settings);
  };

  const renameUserPreset = (id: string, name: string) => {
    setUserPresets(prev => prev.map(p => p.id === id ? { ...p, name: name.trim() || p.name } : p));
  };

  const deleteUserPreset = (id: string) => {
    setUserPresets(prev => prev.filter(p => p.id !== id));
  };

  const shareUserPreset = async (preset: UserPreset) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ name: preset.name, settings: preset.settings }, null, 2));
      setAudio(prev => ({ ...prev, error: 'Preset JSON copied to clipboard' }));
    } catch (err) {
      setAudio(prev => ({ ...prev, error: 'Clipboard unavailable' }));
    }
  };

  const toggleAB = () => {
    if (!abBaseline) {
      setAbBaseline(effects);
      return;
    }

    if (!abActive) {
      setAbSnapshot(effects);
      setEffects(abBaseline);
      setAbActive(true);
    } else {
      if (abSnapshot) {
        setEffects(abSnapshot);
      }
      setAbActive(false);
    }
  };

  // Track management
  const playTrack = (index: number) => {
    if (index < 0 || index >= audio.playlist.length) return;

    if (audio.isPlaying) {
      stopAudio();
    }

    // STRICT RESET of all timekeeping refs to ensure clean state
    pauseTimeRef.current = 0;
    pauseTimelineRef.current = 0;
    startTimeRef.current = audioContextRef.current?.currentTime || 0;
    setBufferPosition(0);

    setAudio(prev => ({ ...prev, currentTrackIndex: index, currentTime: 0 }));

    const track = audio.playlist[index];
    if (track.buffer) {
      setTimeout(() => playAudioRef.current?.(), 100);
    }
  };

  const playNextTrack = () => {
    if (audio.currentTrackIndex < audio.playlist.length - 1) {
      playTrack(audio.currentTrackIndex + 1);
    }
  };

  const playPreviousTrack = () => {
    if (audio.currentTrackIndex > 0) {
      playTrack(audio.currentTrackIndex - 1);
    }
  };

  const removeTrack = (id: string) => {
    setAudio(prev => {
      const removeIndex = prev.playlist.findIndex(t => t.id === id);
      if (removeIndex === -1) return prev;

      const newPlaylist = prev.playlist.filter(t => t.id !== id);
      const wasCurrent = prev.currentTrackIndex === removeIndex;

      if (wasCurrent && prev.isPlaying) {
        stopAudio();
      }

      let nextIndex = prev.currentTrackIndex;
      if (newPlaylist.length === 0) {
        nextIndex = 0;
      } else if (wasCurrent) {
        nextIndex = Math.min(prev.currentTrackIndex, newPlaylist.length - 1);
      } else if (removeIndex < prev.currentTrackIndex) {
        nextIndex = prev.currentTrackIndex - 1;
      }

      return {
        ...prev,
        playlist: newPlaylist,
        currentTrackIndex: nextIndex,
        currentTime: wasCurrent ? 0 : prev.currentTime,
      };
    });
  };

  const clearPlaylist = () => {
    if (audio.isPlaying) {
      stopAudio();
    }
    setAudio(prev => ({
      ...prev,
      playlist: [],
      currentTrackIndex: 0,
      currentTime: 0,
    }));
    clearTrackCache();
    // Waveform component clears visually when buffer is null
  };

  const resetSession = () => {
    clearPlaylist();
    setEffects({ ...DEFAULT_EFFECTS });
    setSelectedPreset('Custom');
    setUserPresets([]);
    setPlayHistory([]);
    localStorage.removeItem(STORAGE_KEYS.effects);
    localStorage.removeItem(STORAGE_KEYS.preset);
    localStorage.removeItem(STORAGE_KEYS.userPresets);
    localStorage.removeItem(STORAGE_KEYS.playHistory);
  };



  const seekTo = useCallback((newTime: number) => {
    if (!currentTrack?.buffer) return;
    const actualDuration = currentTrack.duration / effects.playbackRate;
    const clamped = Math.max(0, Math.min(newTime, actualDuration));

    if (audio.isPlaying) {
      pauseAudio();
      // Convert timeline seconds to buffer seconds for start offset
      pauseTimeRef.current = clamped * (effects.playbackRate || 1);
      pauseTimelineRef.current = clamped;
      setAudio(prev => ({ ...prev, currentTime: clamped }));
      setTimeout(() => playAudio(), 50);
    } else {
      pauseTimeRef.current = clamped * (effects.playbackRate || 1);
      pauseTimelineRef.current = clamped;
      setAudio(prev => ({ ...prev, currentTime: clamped }));
      setBufferPosition(Math.min(pauseTimeRef.current, currentTrack.duration));
    }
  }, [audio.isPlaying, currentTrack, pauseAudio, playAudio, effects.playbackRate]);



  // Handle canvas click for seeking
  // Seeking handled by Waveform component via onSeek

  // Keyboard Shortcuts
  // UI States for Glass & Void Design
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Settings/Effects
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false); // Playlist

  useKeyboardShortcuts({
    onPlayPause: () => {
      if (currentTrack?.buffer && !currentTrack.isLoading) {
        togglePlayback();
      }
    },
    onNext: playNextTrack,
    onPrevious: playPreviousTrack,
    onSeek: (delta) => {
      // Current time + delta, clamped
      if (!currentTrack?.buffer) return;
      const actualDuration = currentTrack.duration / effects.playbackRate;
      const newTime = Math.max(0, Math.min(audio.currentTime + delta, actualDuration));
      seekTo(newTime);
    }
  });

  // MediaSession API for global controls
  useEffect(() => {
    if ('mediaSession' in navigator && currentTrack) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.file.name.replace(/\.[^/.]+$/, ""),
        artist: 'SlowedLab',
        album: 'SlowedLab Session',
        artwork: [
          { src: 'https://img.icons8.com/fluency/96/000000/music.png', sizes: '96x96', type: 'image/png' },
          { src: 'https://img.icons8.com/fluency/512/000000/music.png', sizes: '512x512', type: 'image/png' },
        ]
      });

      navigator.mediaSession.setActionHandler('play', () => togglePlayback());
      navigator.mediaSession.setActionHandler('pause', () => togglePlayback());
      navigator.mediaSession.setActionHandler('previoustrack', () => playPreviousTrack());
      navigator.mediaSession.setActionHandler('nexttrack', () => playNextTrack());

      // Update playback state
      navigator.mediaSession.playbackState = audio.isPlaying ? 'playing' : 'paused';
    }
  }, [currentTrack, audio.isPlaying, togglePlayback, playNextTrack, playPreviousTrack]);


  // Format time display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const audioBufferToWav = (buffer: AudioBuffer) => {
    const numOfChannels = buffer.numberOfChannels;
    const dataSize = buffer.length * numOfChannels * 2;
    const length = dataSize + 44;
    const arrayBuffer = new ArrayBuffer(length);
    const view = new DataView(arrayBuffer);
    let offset = 0;

    const writeString = (str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
      offset += str.length;
    };

    const sampleRate = buffer.sampleRate;
    const bytesPerSample = 2;

    writeString('RIFF');
    view.setUint32(offset, length - 8, true); offset += 4;
    writeString('WAVE');
    writeString('fmt ');
    view.setUint32(offset, 16, true); offset += 4;
    view.setUint16(offset, 1, true); offset += 2; // PCM
    view.setUint16(offset, numOfChannels, true); offset += 2;
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, sampleRate * numOfChannels * bytesPerSample, true); offset += 4;
    view.setUint16(offset, numOfChannels * bytesPerSample, true); offset += 2;
    view.setUint16(offset, bytesPerSample * 8, true); offset += 2;
    writeString('data');
    view.setUint32(offset, dataSize, true); offset += 4;

    const channels = [] as Float32Array[];
    for (let i = 0; i < numOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    let idx = 0;
    while (idx < buffer.length) {
      for (let i = 0; i < numOfChannels; i++) {
        let sample = channels[i][idx];
        sample = Math.max(-1, Math.min(1, sample));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
      idx++;
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  };

  const exportSelection = async () => {
    if (!currentTrack?.buffer) return;

    const channels = currentTrack.buffer.numberOfChannels;
    const sampleRate = currentTrack.buffer.sampleRate;
    const length = currentTrack.buffer.length;
    const out = audioContextRef.current!.createBuffer(channels, length, sampleRate);

    for (let ch = 0; ch < channels; ch++) {
      const slice = currentTrack.buffer.getChannelData(ch);
      out.copyToChannel(slice, ch, 0);
    }

    const blob = audioBufferToWav(out);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentTrack.file.name}-full.wav`;
    a.click();
    URL.revokeObjectURL(url);
  };


  const activePresetLabel = selectedPreset === 'Custom' ? 'Custom Blend' : selectedPreset;

  const bookmarkWebsite = () => {
    if (window.sidebar && window.sidebar.addPanel) {
      window.sidebar.addPanel('SlowedLab', window.location.href, '');
    } else if ((window as any).external && (window as any).external.AddFavorite) {
      (window as any).external.AddFavorite(window.location.href, 'SlowedLab');
    } else {
      alert('Press Ctrl+D (Windows/Linux) or Cmd+D (Mac) to bookmark this page');
    }
  };

  return (
    <div className="app">
      {/* Top Bar - Floating */}
      <div className="top-bar-container">
        <Topbar
          currentTrackName={currentTrack?.file.name || 'No track loaded'}
          audio={audio}
          selectedPreset={selectedPreset}
          applyPreset={applyPreset}
          PRESETS={PRESETS}
          userPresets={userPresets}
          presetNameInput={presetNameInput}
          setPresetNameInput={setPresetNameInput}
          saveUserPreset={saveUserPreset}
          handleFileUpload={handleFileUpload}
          exportSelection={exportSelection}
          setShowBugModal={setShowBugModal}
          setBugMessage={setBugMessage}
          togglePlayback={togglePlayback}
          currentTrack={currentTrack}
        />
      </div>

      {/* Main Stage - Waveform & Visualizer */}
      <div
        className={`stage-center ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {currentTrack ? (
          <div className="glass-panel" style={{ width: '100%', maxWidth: '1200px', padding: '2rem', borderRadius: '20px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 className="text-gradient" style={{ margin: 0, fontSize: '2rem' }}>{currentTrack.file.name}</h2>
              <span className="pill pill-live">{activePresetLabel}</span>
            </div>

            <Waveform
              buffer={currentTrack.buffer}
              currentTime={audio.currentTime}
              playbackRate={effects.playbackRate}
              bufferPosition={bufferPosition}
              onSeek={seekTo}
            />

            {/* Time Display */}
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
              <span>{formatTime(audio.currentTime)}</span>
              <span>{formatTime((currentTrack.duration || 0) / effects.playbackRate)}</span>
            </div>
          </div>
        ) : (
          <label className="glass-panel empty-state clickable-dropzone" style={{ padding: '4rem', textAlign: 'center', borderRadius: '24px', display: 'block', cursor: 'pointer' }}>
            <input type="file" accept="audio/*" onChange={handleFileUpload} multiple style={{ display: 'none' }} />
            <h1 className="text-gradient" style={{ fontSize: '3rem', marginBottom: '1rem' }}>SlowedLab</h1>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '2rem' }}>Drop audio files or click anywhere to begin your sonic journey.</p>
            <div className="upload-hint">
              <span className="primary-action" style={{ fontSize: '1.2rem', padding: '1rem 2rem', display: 'inline-block' }}>
                Browse Files
              </span>
            </div>
          </label>
        )}
      </div>

      {/* Dock - Controls */}
      <div className="dock-container glass-panel">
        {/* Left: Settings */}
        <button className="dock-icon-btn" onClick={() => setIsSidebarOpen(true)} title="Settings">
          <FiSettings />
        </button>

        {/* Center: Transport */}
        <div className="transport-controls">
          <button className="dock-icon-btn" onClick={playPreviousTrack} disabled={audio.currentTrackIndex === 0} title="Previous">
            <FiSkipBack />
          </button>
          <button className="play-btn" onClick={togglePlayback} disabled={!currentTrack?.buffer || currentTrack?.isLoading} title={audio.isPlaying ? 'Pause' : 'Play'}>
            {audio.isPlaying ? <FiPause /> : <FiPlay />}
          </button>
          <button className="dock-icon-btn" onClick={playNextTrack} disabled={audio.currentTrackIndex === audio.playlist.length - 1} title="Next">
            <FiSkipForward />
          </button>
        </div>

        {/* Right: Volume & Playlist */}
        <div className="dock-right">
          <div className="volume-control">
            <span className="volume-icon"><FiVolume2 /></span>
            <input
              type="range"
              min="0" max="1.2" step="0.01"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="volume-slider"
            />
          </div>
          <button className={`dock-icon-btn ${isPlaylistOpen ? 'active' : ''}`} onClick={() => setIsPlaylistOpen(true)} title="Playlist">
            <FiMusic />
          </button>
        </div>
      </div>

      {/* Drawers */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        currentTrackName={currentTrack?.file.name || 'None loaded'}
        isPlaying={audio.isPlaying}
        activePresetLabel={activePresetLabel}
        effects={effects}
        setEffects={setEffects}
        setSelectedPreset={setSelectedPreset}
        abActive={abActive}
        toggleAB={toggleAB}
        userPresets={userPresets}
        applyPreset={applyPreset}
        renameUserPreset={renameUserPreset}
        shareUserPreset={shareUserPreset}
        deleteUserPreset={deleteUserPreset}
        resetSession={resetSession}
        resetPresets={resetPresets}
      />

      {/* Playlist Drawer */}
      <div className={`sidebar-drawer drawer-right glass-panel ${isPlaylistOpen ? 'open' : ''}`}>
        <button className="drawer-close-btn" onClick={() => setIsPlaylistOpen(false)}>×</button>
        <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Playlist ({audio.playlist.length})</h3>

        <div className="panel-actions" style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
          <label htmlFor="add-more-playlist" className="glass-button" style={{ padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
            + Add Tracks
            <input
              type="file"
              accept="audio/*"
              onChange={handleFileUpload}
              id="add-more-playlist"
              style={{ display: 'none' }}
              multiple
            />
          </label>
          <button className="glass-button" onClick={clearPlaylist} style={{ padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.9rem' }}>Clear All</button>
        </div>

        <div className="playlist-items board-scroll" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {audio.playlist.map((track, index) => (
            <div
              key={track.id}
              className={`playlist-item ${index === audio.currentTrackIndex ? 'active' : ''}`}
              onClick={() => playTrack(index)}
              style={{
                padding: '0.75rem',
                borderRadius: '12px',
                background: index === audio.currentTrackIndex ? 'rgba(var(--color-primary-rgb), 0.15)' : 'rgba(255,255,255,0.03)',
                border: index === audio.currentTrackIndex ? '1px solid var(--color-primary)' : '1px solid transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem'
              }}
            >
              <div className="playlist-item-icon">
                {index === audio.currentTrackIndex && audio.isPlaying ? <FiPlay size={14} /> : <FiMusic size={14} />}
              </div>
              <div className="playlist-item-info" style={{ flex: 1, overflow: 'hidden' }}>
                <div className="playlist-item-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 }}>{track.file.name}</div>
                <div className="playlist-item-meta" style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
                  {track.isLoading ? 'Loading…' : `${formatTime(track.duration)}`}
                </div>
              </div>
              <button
                className="playlist-item-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTrack(track.id);
                }}
                style={{ background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}
              >
                <FiX />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Overlays */}
      <div className={`drawer-overlay ${isSidebarOpen || isPlaylistOpen ? 'open' : ''}`} onClick={() => { setIsSidebarOpen(false); setIsPlaylistOpen(false); }} />

      {currentTrack?.isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <p>Processing audio...</p>
        </div>
      )}

      {loadingProgress && (
        <div className="loading-toast">
          <div className="loading-spinner-mini"></div>
          <div className="loading-content">
            <span>Loading {loadingProgress.fileName}...</span>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${loadingProgress.progress}%` }}></div>
            </div>
          </div>
        </div>
      )}

      {audio.error && (
        <div className="error-toast">
          <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
          </svg>
          {audio.error}
          <button onClick={() => setAudio(prev => ({ ...prev, error: null }))}>×</button>
        </div>
      )}

      <BugReportPanel
        open={showBugModal}
        title={bugTitle}
        description={bugDescription}
        email={bugEmail}
        submitting={bugSubmitting}
        message={bugMessage}
        onClose={() => setShowBugModal(false)}
        onChangeTitle={setBugTitle}
        onChangeDescription={setBugDescription}
        onChangeEmail={setBugEmail}
        onSubmit={submitBugReport}
      />

      {/* Floating Bookmark Button */}
      <button
        className="floating-bookmark-button"
        onClick={bookmarkWebsite}
        aria-label="Bookmark for later"
      >
        <FiBookmark size={20} />
        <span className="bookmark-text">Bookmark for later</span>
      </button>
    </div>
  );
}
