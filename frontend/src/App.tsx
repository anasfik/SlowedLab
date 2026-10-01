/**
 * SlowedLab - Professional Audio Editor
 * Expert-level UX with Web Audio API integration
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  FiPlay, FiPause, FiSkipBack, FiSkipForward, FiMusic,
  FiActivity, FiVolume2, FiCpu,
  FiHeadphones, FiStar, FiZap as FiBolt, FiDroplet as FiDiamond, FiSliders,
  FiSettings, FiX, FiList, FiTrash2, FiUploadCloud, FiFolder, FiLink,
  FiVolumeX
} from 'react-icons/fi';
import Topbar from './components/Topbar.tsx';
import Sidebar from './components/Sidebar.tsx';
import Waveform from './components/Waveform.tsx';
import LinkImport from './components/LinkImport.tsx';
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
    settings: { playbackRate: 1.0, reverbAmount: 15, bassBoost: 40, trebleBoost: -10, compression: 50, distortion: 5 }
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

// Peak amplitude of channel 0 (strided scan, cheap even for long tracks).
// Used by the [SlowedLab][decode] diagnostics: a peak near 0 means the
// browser decoded silence.
function bufferPeak(buffer: AudioBuffer): number {
  if (buffer.numberOfChannels < 1) return -1;
  const ch = buffer.getChannelData(0);
  const stride = Math.max(1, Math.floor(ch.length / 20000));
  let peak = 0;
  for (let s = 0; s < ch.length; s += stride) {
    const v = Math.abs(ch[s]);
    if (v > peak) peak = v;
  }
  return peak;
}

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
  const [importSource, setImportSource] = useState<'device' | 'cloud'>('device');

  const [playHistory, setPlayHistory] = useState<PlayHistoryItem[]>([]);
  const [userPresets, setUserPresets] = useState<UserPreset[]>([]);
  const [abBaseline, setAbBaseline] = useState<EffectSettings | null>(null);
  const [abSnapshot, setAbSnapshot] = useState<EffectSettings | null>(null);
  const [abActive, setAbActive] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState('My Preset');
  const [isRestoring, setIsRestoring] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState<{ fileName: string, progress: number } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showBugModal, setShowBugModal] = useState(false);
  const [bugTitle, setBugTitle] = useState('');
  const [bugDescription, setBugDescription] = useState('');
  const [bugEmail, setBugEmail] = useState('');
  const [bugSubmitting, setBugSubmitting] = useState(false);
  const [bugMessage, setBugMessage] = useState<string | null>(null);
  // True while the browser refuses to run the AudioContext (site muted,
  // sound blocked, strict autoplay/fingerprinting). Shown as a notice with
  // recovery steps instead of failing silently.
  const [audioBlocked, setAudioBlocked] = useState(false);

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

  // ?audio-debug=1 signal probe: side-branch analyser + sample timers.
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const probeTimersRef = useRef<number[]>([]);

  // Tear down the signal probe (timers + analyser tap).
  const clearAudioProbe = useCallback(() => {
    probeTimersRef.current.forEach(t => window.clearTimeout(t));
    probeTimersRef.current = [];
    if (analyserNodeRef.current) {
      try {
        analyserNodeRef.current.disconnect();
      } catch {
        // Already disconnected
      }
      analyserNodeRef.current = null;
    }
  }, []);

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
    const extension = file.name.split('.').pop()?.toLowerCase();
    const audioExtensions = ['mp3', 'wav', 'flac', 'ogg', 'aac', 'm4a', 'webm', 'opus'];
    if (!file.type.startsWith('audio/') && !audioExtensions.includes(extension || '')) {
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
      // Read the file BEFORE opening the transaction: IndexedDB auto-commits
      // a transaction as soon as the event loop yields with no pending
      // request, so awaiting file.arrayBuffer() after tx creation leaves the
      // transaction inactive and put() throws TransactionInactiveError.
      const arrayBuffer = await file.arrayBuffer();
      const db = await openDB();
      const tx = db.transaction(DB_CONFIG.store, 'readwrite');
      tx.objectStore(DB_CONFIG.store).put({
        id: trackId,
        name: file.name,
        type: file.type,
        data: arrayBuffer,
      });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
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

  const deleteTrackFromDB = useCallback(async (trackId: string) => {
    try {
      const db = await openDB();
      const tx = db.transaction(DB_CONFIG.store, 'readwrite');
      tx.objectStore(DB_CONFIG.store).delete(trackId);
    } catch (err) {
      console.warn('Failed to remove cached track', err);
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
        const cachePeak = bufferPeak(buffer);
        console.log(
          `[SlowedLab][decode:cache] name="${cached.name}" duration=${buffer.duration.toFixed(2)}s ` +
          `channels=${buffer.numberOfChannels} peak=${cachePeak < 0 ? 'n/a' : cachePeak.toFixed(4)}`
        );
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

  // Shared import core: validate -> decode -> persist -> playlist.
  // Upload, drop, and link-import all route through here.
  const addAudioFiles = async (files: File[], emptyMessage: string) => {
    if (files.length === 0) return;

    // Validate all files first
    const validationErrors: string[] = [];
    const validFiles: File[] = [];

    files.forEach(file => {
      const error = validateAudioFile(file);
      if (error) {
        validationErrors.push(error);
      } else {
        validFiles.push(file);
      }
    });

    if (validationErrors.length > 0) {
      setAudio(prev => ({ ...prev, error: validationErrors.join(' ') }));
      setTimeout(() => setAudio(prev => ({ ...prev, error: null })), 5000);
    }

    if (validFiles.length === 0) {
      if (validationErrors.length === 0) {
        setAudio(prev => ({ ...prev, error: emptyMessage }));
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

        const importPeak = bufferPeak(buffer);
        console.log(
          `[SlowedLab][decode] name="${audioFiles[i].name}" duration=${buffer.duration.toFixed(2)}s ` +
          `sampleRate=${buffer.sampleRate} channels=${buffer.numberOfChannels} peak=${importPeak < 0 ? 'n/a' : importPeak.toFixed(4)}`
        );

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
  };

  // Handle file upload (multiple files)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    // Reset file input
    e.target.value = '';
    await addAudioFiles(files, 'Please upload audio files (MP3, WAV, FLAC, OGG, etc.)');
  };

  // Handle audio fetched from a link (already a decoded-ready File)
  const handleRemoteFile = async (file: File) => {
    await addAudioFiles([file], 'Could not use that audio.');
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
    await addAudioFiles(files, 'Please drop audio files (MP3, WAV, FLAC, OGG, etc.)');
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
          sourceNodeRef.current.onended = null;
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
    clearAudioProbe();
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

    // Ensure context is ready. resume() can resolve while the browser still
    // refuses audio (site muted, sound blocked, strict autoplay policy), so
    // verify the state instead of pretending playback started. Chrome and
    // Brave stay 'suspended' here while Firefox is more lenient, which is why
    // the same build can play in one browser and stay silent in another.
    if (audioContextRef.current.state !== 'running') {
      try {
        await audioContextRef.current.resume();
      } catch (resumeErr) {
        console.warn('AudioContext.resume() rejected', resumeErr);
      }
    }
    if (audioContextRef.current.state !== 'running') {
      const ctx = audioContextRef.current;
      console.warn(
        'Audio output blocked by the browser:',
        `state=${ctx.state} sampleRate=${ctx.sampleRate} ` +
        `baseLatency=${ctx.baseLatency ?? 'n/a'} outputLatency=${ctx.outputLatency ?? 'n/a'} ` +
        `ua=${navigator.userAgent.slice(0, 80)}`
      );
      playingRef.current = false;
      setAudioBlocked(true);
      return;
    }
    setAudioBlocked(false);

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
    const reverbMix = effects.reverbAmount / 100 * Math.PI / 2;
    reverbGain.gain.value = Math.sin(reverbMix);
    dryGain.gain.value = Math.cos(reverbMix);

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

    // Start playback. Clamp the offset into the buffer: Chrome/Brave throw
    // InvalidStateError for out-of-range offsets where Firefox is lenient.
    startTimeRef.current = audioContextRef.current.currentTime;
    lastPlaybackRateRef.current = effects.playbackRate;
    playbackRateRef.current = effects.playbackRate;
    const safeOffset = Math.min(
      Math.max(pauseTimeRef.current || 0, 0),
      Math.max(track.buffer.duration - 0.05, 0)
    );
    pauseTimeRef.current = safeOffset;
    source.start(0, safeOffset);

    // One-line graph snapshot: every knob that can zero the output.
    {
      const ctx = audioContextRef.current!;
      console.log(
        `[SlowedLab][play] state=${ctx.state} ctxRate=${ctx.sampleRate} ctxTime=${ctx.currentTime.toFixed(2)} ` +
        `offset=${safeOffset.toFixed(2)} bufDur=${track.buffer.duration.toFixed(2)} bufCh=${track.buffer.numberOfChannels} ` +
        `rate=${effects.playbackRate} vol=${volume} dry=${dryGain.gain.value.toFixed(3)} wet=${reverbGain.gain.value.toFixed(3)} ` +
        `bass=${bassEQ.gain.value} treb=${trebleEQ.gain.value} compRatio=${compressor.ratio.value.toFixed(1)} ` +
        `dist=${(effects.distortion / 100).toFixed(3)}`
      );
    }

    // Signal probe (?audio-debug=1): side-branch analyser fed from the master
    // gain node. It analyses without altering the sound. RMS near 0 while the
    // clock advances means the graph itself is silent; RMS above 0 with no
    // audible output means the blockage is downstream of the page.
    if (new URLSearchParams(window.location.search).get('audio-debug') === '1' && audioContextRef.current) {
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 2048;
      gainNode.connect(analyser);
      analyserNodeRef.current = analyser;
      const samples = new Float32Array(analyser.fftSize);
      [500, 1500, 3000].forEach(delay => {
        const timer = window.setTimeout(() => {
          const ctx = audioContextRef.current;
          const tap = analyserNodeRef.current;
          if (!ctx || !tap) return;
          tap.getFloatTimeDomainData(samples);
          const stride = 4;
          let sum = 0;
          let n = 0;
          for (let s = 0; s < samples.length; s += stride) {
            sum += samples[s] * samples[s];
            n++;
          }
          const rms = Math.sqrt(sum / Math.max(1, n));
          console.log(
            `[SlowedLab][probe] t=${(delay / 1000).toFixed(1)}s rms=${rms.toFixed(4)} ` +
            `ctxTime=${ctx.currentTime.toFixed(2)} ctxState=${ctx.state}` +
            (rms > 0.0005 ? ' (signal flowing)' : ' (graph silent or stalled)')
          );
        }, delay);
        probeTimersRef.current.push(timer);
      });
    }

    source.onended = () => {
      if (!playingRef.current) return;
      playingRef.current = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      const state = audioStateRef.current;
      const nextIndex = state ? state.currentTrackIndex + 1 : -1;
      const nextTrack = state?.playlist[nextIndex];
      if (nextTrack?.buffer) {
        pauseTimeRef.current = 0;
        pauseTimelineRef.current = 0;
        setBufferPosition(0);
        setAudio(prev => ({ ...prev, currentTrackIndex: nextIndex, currentTime: 0, isPlaying: false }));
        setTimeout(() => playAudioRef.current?.(), 80);
      } else {
        setAudio(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
        pauseTimeRef.current = 0;
        pauseTimelineRef.current = 0;
        setBufferPosition(0);
      }
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
      const mix = effects.reverbAmount / 100 * Math.PI / 2;
      const dryAmount = Math.cos(mix);
      const wetAmount = Math.sin(mix);
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
    clearAudioProbe();
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
    clearAudioProbe();
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
  const togglePlayback = useCallback(() => {
    if (audio.isPlaying) {
      pauseAudio();
    } else {
      playAudio();
    }
  }, [audio.isPlaying, pauseAudio, playAudio]);

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
      setTimeout(() => setAudio(prev => ({ ...prev, error: null })), 3000);
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
  const playTrack = useCallback((index: number) => {
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
  }, [audio.isPlaying, audio.playlist, stopAudio]);

  const playNextTrack = useCallback(() => {
    if (audio.currentTrackIndex < audio.playlist.length - 1) {
      playTrack(audio.currentTrackIndex + 1);
    }
  }, [audio.currentTrackIndex, audio.playlist.length, playTrack]);

  const playPreviousTrack = useCallback(() => {
    if (audio.currentTrackIndex > 0) {
      playTrack(audio.currentTrackIndex - 1);
    }
  }, [audio.currentTrackIndex, playTrack]);

  const removeTrack = (id: string) => {
    const removingCurrent = currentTrack?.id === id;
    if (removingCurrent) {
      stopAudio();
      pauseTimeRef.current = 0;
      pauseTimelineRef.current = 0;
      setBufferPosition(0);
    }
    deleteTrackFromDB(id);
    setAudio(prev => {
      const removeIndex = prev.playlist.findIndex(t => t.id === id);
      if (removeIndex === -1) return prev;

      const newPlaylist = prev.playlist.filter(t => t.id !== id);
      const wasCurrent = prev.currentTrackIndex === removeIndex;

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

  const clearPlaylist = (confirmClear = true) => {
    if (confirmClear && audio.playlist.length && !window.confirm('Clear every track from this browser session?')) return;
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
    if ((audio.playlist.length || userPresets.length) && !window.confirm('Reset this session? This removes all tracks and saved presets from this browser.')) return;
    clearPlaylist(false);
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
    setIsExporting(true);
    try {
      const input = currentTrack.buffer;
      const sampleRate = input.sampleRate;
      const renderedDuration = input.duration / effects.playbackRate + 2;
      const offline = new OfflineAudioContext(input.numberOfChannels, Math.ceil(renderedDuration * sampleRate), sampleRate);
      const source = offline.createBufferSource();
      const distortion = offline.createWaveShaper();
      const bass = offline.createBiquadFilter();
      const treble = offline.createBiquadFilter();
      const compressor = offline.createDynamicsCompressor();
      const gain = offline.createGain();
      const dry = offline.createGain();
      const convolver = offline.createConvolver();
      const wet = offline.createGain();

      source.buffer = input;
      source.playbackRate.value = effects.playbackRate;
      gain.gain.value = volume;
      bass.type = 'lowshelf';
      bass.frequency.value = 200;
      bass.gain.value = effects.bassBoost / 2;
      treble.type = 'highshelf';
      treble.frequency.value = 3000;
      treble.gain.value = effects.trebleBoost / 2;
      const compression = effects.compression / 100;
      compressor.threshold.value = -compression * 40;
      compressor.knee.value = compression * 30;
      compressor.ratio.value = 1 + compression * 19;
      compressor.attack.value = 0.005 + compression * 0.045;
      compressor.release.value = 0.05 + compression * 0.35;

      const curve = new Float32Array(44100);
      const amount = effects.distortion / 100;
      const k = amount * 50;
      for (let i = 0; i < curve.length; i++) {
        const x = (i * 2) / curve.length - 1;
        curve[i] = amount <= 0.0001 ? x : ((3 + k) * x * 20 * Math.PI / 180) / (Math.PI + k * Math.abs(x));
      }
      distortion.curve = curve;
      distortion.oversample = '4x';
      convolver.buffer = convolverNodeRef.current?.buffer || null;
      const mix = effects.reverbAmount / 100 * Math.PI / 2;
      dry.gain.value = Math.cos(mix);
      wet.gain.value = Math.sin(mix);

      source.connect(distortion);
      distortion.connect(bass);
      bass.connect(treble);
      treble.connect(compressor);
      compressor.connect(gain);
      gain.connect(dry).connect(offline.destination);
      gain.connect(convolver).connect(wet).connect(offline.destination);
      source.start();

      const rendered = await offline.startRendering();
      const blob = audioBufferToWav(rendered);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${currentTrack.file.name.replace(/\.[^/.]+$/, '')}-slowedlab.wav`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error('Export failed', err);
      setAudio(prev => ({ ...prev, error: 'Could not render this mix. Try a shorter file or close other tabs.' }));
    } finally {
      setIsExporting(false);
    }
  };


  const activePresetLabel = selectedPreset === 'Custom' ? 'Custom Blend' : selectedPreset;

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">Skip to studio</a>
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
        isExporting={isExporting}
        setShowBugModal={setShowBugModal}
        setBugMessage={setBugMessage}
        currentTrack={currentTrack}
      />

      <main
        id="main-content"
        className={`studio ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {currentTrack ? (
          <section className="track-workspace" aria-label="Audio workspace">
            <header className="track-heading">
              <div className="track-title-group">
                <p className="overline">Now editing</p>
                <h1 title={currentTrack.file.name}>{currentTrack.file.name.replace(/\.[^/.]+$/, '')}</h1>
              </div>
              <div className="track-meta">
                <span>{activePresetLabel}</span>
                <span>{effects.playbackRate.toFixed(2)}× speed</span>
                <span>{formatTime((currentTrack.duration || 0) / effects.playbackRate)}</span>
              </div>
            </header>

            <div className="waveform-shell">
              <div className="waveform-toolbar"><span>Waveform</span><span>Drag or use arrow keys to seek</span></div>
              <Waveform
                buffer={currentTrack.buffer}
                currentTime={audio.currentTime}
                playbackRate={effects.playbackRate}
                bufferPosition={bufferPosition}
                onSeek={seekTo}
                height={220}
              />
              <div className="time-ruler" aria-hidden="true">
                <span>{formatTime(audio.currentTime)}</span>
                <span>{formatTime((currentTrack.duration || 0) / effects.playbackRate)}</span>
              </div>
            </div>

            <footer className="workspace-footer">
              <div><span className="privacy-mark">Local</span><p><strong>Your audio stays here.</strong><small>Processing happens in this browser.</small></p></div>
              <label className="text-upload-button"><FiUploadCloud /> Add another track<input type="file" accept="audio/*" onChange={handleFileUpload} multiple /></label>
            </footer>
          </section>
        ) : (
          <section className="empty-workspace">
            <div className="empty-visual" aria-hidden="true">
              <img src="/logo-mark.svg" alt="" />
            </div>
            <div className="empty-copy">
              <p className="overline">Private browser studio</p>
              <h1>Hear your track<br /><em>another way.</em></h1>
              <p>Choose where your audio comes from. Shape it here, then export a finished WAV.</p>

              <div className="source-picker">
                <div className="source-tabs" role="tablist" aria-label="Audio source">
                  <button
                    id="device-source-tab"
                    className={importSource === 'device' ? 'active' : ''}
                    role="tab"
                    aria-selected={importSource === 'device'}
                    aria-controls="device-source-panel"
                    onClick={() => setImportSource('device')}
                  >
                    <FiFolder aria-hidden="true" />
                    <span><strong>Your files</strong><small>Private and local</small></span>
                  </button>
                  <button
                    id="cloud-source-tab"
                    className={importSource === 'cloud' ? 'active' : ''}
                    role="tab"
                    aria-selected={importSource === 'cloud'}
                    aria-controls="cloud-source-panel"
                    onClick={() => setImportSource('cloud')}
                  >
                    <FiLink aria-hidden="true" />
                    <span><strong>Cloud link</strong><small>YouTube or SoundCloud</small></span>
                  </button>
                </div>

                {importSource === 'device' ? (
                  <div className="source-panel device-source" id="device-source-panel" role="tabpanel" aria-labelledby="device-source-tab">
                    <label className="device-dropzone">
                      <span className="device-upload-icon"><FiUploadCloud aria-hidden="true" /></span>
                      <span><strong>{isRestoring ? 'Restoring your session…' : 'Choose audio files'}</strong><small>or drop them anywhere on this screen</small></span>
                      <input type="file" accept="audio/*" onChange={handleFileUpload} multiple disabled={isRestoring} />
                    </label>
                    <p><span>MP3, WAV, FLAC, OGG, AAC</span><span>Up to 200 MB each</span></p>
                  </div>
                ) : (
                  <div className="source-panel cloud-source" id="cloud-source-panel" role="tabpanel" aria-labelledby="cloud-source-tab">
                    <LinkImport onFile={handleRemoteFile} />
                    <p className="cloud-note">Public links only. Audio is fetched through our server.</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
        {isDragging && <div className="drop-overlay"><FiUploadCloud /><strong>Drop to add audio</strong><span>We’ll add it to your queue</span></div>}
      </main>

      <footer className="transport-dock" aria-label="Playback controls">
        <div className="dock-track">
          <span className="dock-art"><img src="/logo-mark.svg" alt="" /></span>
          <p><strong>{currentTrack ? currentTrack.file.name.replace(/\.[^/.]+$/, '') : 'No track selected'}</strong><small>{currentTrack ? activePresetLabel : 'Add audio to begin'}</small></p>
        </div>
        <div className="transport-controls">
          <button className="transport-button" onClick={playPreviousTrack} disabled={!currentTrack || audio.currentTrackIndex === 0} aria-label="Previous track">
            <FiSkipBack />
          </button>
          <button className="play-button" onClick={togglePlayback} disabled={!currentTrack?.buffer || currentTrack.isLoading} aria-label={audio.isPlaying ? 'Pause' : 'Play'}>
            {audio.isPlaying ? <FiPause /> : <FiPlay className="play-glyph" />}
          </button>
          <button className="transport-button" onClick={playNextTrack} disabled={!currentTrack || audio.currentTrackIndex >= audio.playlist.length - 1} aria-label="Next track">
            <FiSkipForward />
          </button>
          <span className="dock-time">{formatTime(audio.currentTime)}</span>
        </div>
        <div className="dock-tools">
          <label className="volume-control">
            <FiVolume2 aria-hidden="true" /><span className="sr-only">Volume</span>
            <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => setVolume(Number(e.target.value))} aria-label="Volume" />
          </label>
          <button className={isSidebarOpen ? 'active' : ''} onClick={() => setIsSidebarOpen(true)} aria-label="Open sound controls" aria-expanded={isSidebarOpen}>
            <FiSettings /><span>Sound</span>
          </button>
          <button className={isPlaylistOpen ? 'active' : ''} onClick={() => setIsPlaylistOpen(true)} aria-label="Open queue" aria-expanded={isPlaylistOpen}>
            <FiList /><span>Queue</span>{audio.playlist.length > 0 && <b>{audio.playlist.length}</b>}
          </button>
        </div>
      </footer>

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

      {isPlaylistOpen && (
        <aside className="studio-drawer queue-drawer" role="dialog" aria-modal="true" aria-labelledby="queue-title">
          <header className="drawer-heading">
            <div><p className="overline">Session</p><h2 id="queue-title">Track queue <span>{audio.playlist.length}</span></h2></div>
            <button className="icon-button" onClick={() => setIsPlaylistOpen(false)} aria-label="Close queue"><FiX /></button>
          </header>
          <div className="queue-actions">
            <label className="secondary-button"><FiUploadCloud /> Add tracks<input type="file" accept="audio/*" onChange={handleFileUpload} multiple /></label>
            <button className="text-button danger" onClick={() => clearPlaylist()} disabled={!audio.playlist.length}><FiTrash2 /> Clear</button>
          </div>
          <div className="queue-link">
            <LinkImport compact onFile={handleRemoteFile} />
          </div>
          <div className="queue-list">
            {audio.playlist.map((track, index) => (
              <article className={`queue-item ${index === audio.currentTrackIndex ? 'active' : ''}`} key={track.id}>
                <button className="queue-select" onClick={() => playTrack(index)}>
                  <span className="queue-index">{index === audio.currentTrackIndex && audio.isPlaying ? <FiActivity /> : String(index + 1).padStart(2, '0')}</span>
                  <span><strong>{track.file.name.replace(/\.[^/.]+$/, '')}</strong><small>{track.isLoading ? 'Preparing audio…' : formatTime(track.duration)}</small></span>
                </button>
                <button className="queue-remove" onClick={() => removeTrack(track.id)} aria-label={`Remove ${track.file.name}`}><FiX /></button>
              </article>
            ))}
            {!audio.playlist.length && <div className="queue-empty"><FiMusic /><strong>Queue is empty</strong><span>Add tracks to keep listening.</span></div>}
          </div>
        </aside>
      )}

      {(isSidebarOpen || isPlaylistOpen) && (
        <button className="drawer-backdrop" onClick={() => { setIsSidebarOpen(false); setIsPlaylistOpen(false); }} aria-label="Close panel" />
      )}

      {currentTrack?.isLoading && (
        <div className="processing-state" role="status">
          <img className="loading-logo" src="/logo-mark.svg" alt="" />
          <p><strong>Preparing your track</strong><small>Reading audio data in this browser…</small></p>
        </div>
      )}

      {loadingProgress && (
        <div className="progress-toast" role="status">
          <div><strong>Adding {loadingProgress.fileName}</strong><span>{loadingProgress.progress}%</span></div>
          <progress max="100" value={loadingProgress.progress}>{loadingProgress.progress}%</progress>
        </div>
      )}

      {audioBlocked && (
        <div className="status-toast audio-blocked-toast" role="alert">
          <FiVolumeX aria-hidden="true" />
          <span>
            <strong>No audio output.</strong> Your browser is blocking sound for this
            site. Unmute the tab, allow sound for slowedlab.app in site settings
            (Brave: lion icon → Shields → allow sound/fingerprinting), then press
            play again.
          </span>
          <span className="toast-actions">
            <button onClick={() => { setAudioBlocked(false); togglePlayback(); }} aria-label="Try playing again">Retry</button>
            <button onClick={() => setAudioBlocked(false)} aria-label="Dismiss message"><FiX /></button>
          </span>
        </div>
      )}

      {audio.error && (
        <div className="status-toast" role="alert">
          <FiActivity aria-hidden="true" />
          <span>{audio.error}</span>
          <button onClick={() => setAudio(prev => ({ ...prev, error: null }))} aria-label="Dismiss message"><FiX /></button>
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

    </div>
  );
}
