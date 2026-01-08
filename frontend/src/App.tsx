/**
 * SlowedLab - Professional Audio Editor
 * Expert-level UX with Web Audio API integration
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FiPlay, FiPause, FiSkipBack, FiSkipForward, FiSquare, FiDownload, FiBookmark, FiGithub } from 'react-icons/fi';
import './App.css';
import Waveform from './components/Waveform.tsx';
import BugReportPanel from './components/BugReportPanel.tsx';

// Extend window interface for bookmark functionality
declare global {
  interface Window {
    sidebar?: {
      addPanel: (title: string, url: string, icon: string) => void;
    };
  }
}

interface AudioFile {
  id: string;
  file: File;
  buffer: AudioBuffer | null;
  duration: number;
  isLoading: boolean;
}

interface AudioState {
  playlist: AudioFile[];
  currentTrackIndex: number;
  currentTime: number;
  isPlaying: boolean;
  error: string | null;
}

interface EffectSettings {
  playbackRate: number;
  reverbAmount: number;
  bassBoost: number;
  trebleBoost: number;
  compression: number;
  distortion: number;
}

interface Preset {
  name: string;
  description: string;
  icon: string;
  settings: EffectSettings;
}

interface UserPreset extends Preset {
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
    icon: '🌊',
    settings: { playbackRate: 0.75, reverbAmount: 60, bassBoost: 20, trebleBoost: 0, compression: 30, distortion: 0 }
  },
  {
    name: 'Nightcore',
    description: 'Fast pitch with energy',
    icon: '⚡',
    settings: { playbackRate: 1.35, reverbAmount: 20, bassBoost: 0, trebleBoost: 30, compression: 40, distortion: 0 }
  },
  {
    name: 'Bass Boosted',
    description: 'Deep bass enhancement',
    icon: '🔊',
    settings: { playbackRate: 1.0, reverbAmount: 15, bassBoost: 60, trebleBoost: -10, compression: 50, distortion: 5 }
  },
  {
    name: 'Lo-Fi Chill',
    description: 'Warm and relaxed vibe',
    icon: '🎧',
    settings: { playbackRate: 0.95, reverbAmount: 40, bassBoost: 25, trebleBoost: -15, compression: 35, distortion: 10 }
  },
  {
    name: 'Ethereal Dream',
    description: 'Maximum reverb and space',
    icon: '✨',
    settings: { playbackRate: 0.85, reverbAmount: 85, bassBoost: 10, trebleBoost: 20, compression: 25, distortion: 0 }
  },
  {
    name: 'Crystal Clear',
    description: 'Enhanced clarity and brightness',
    icon: '💎',
    settings: { playbackRate: 1.0, reverbAmount: 10, bassBoost: 0, trebleBoost: 40, compression: 30, distortion: 0 }
  },
  {
    name: 'Distorted',
    description: 'Gritty and raw sound',
    icon: '🎸',
    settings: { playbackRate: 1.0, reverbAmount: 30, bassBoost: 30, trebleBoost: 20, compression: 60, distortion: 50 }
  },
  {
    name: 'Custom',
    description: 'Your own settings',
    icon: '🎚️',
    settings: { playbackRate: 1.0, reverbAmount: 0, bassBoost: 0, trebleBoost: 0, compression: 0, distortion: 0 }
  }
];

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
  const [activeTab, setActiveTab] = useState<'console' | 'playlist'>('console');
  const [isDragging, setIsDragging] = useState(false);
  
  const [playHistory, setPlayHistory] = useState<PlayHistoryItem[]>([]);
  const [userPresets, setUserPresets] = useState<UserPreset[]>([]);
  const [abBaseline, setAbBaseline] = useState<EffectSettings | null>(null);
  const [abSnapshot, setAbSnapshot] = useState<EffectSettings | null>(null);
  const [abActive, setAbActive] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState('My Preset');
  const [isRestoring, setIsRestoring] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState<{fileName: string, progress: number} | null>(null);
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
  const playAudioRef = useRef<() => void>(() => {});
  const stopAudioRef = useRef<() => void>(() => {});
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
        setTimeout(() => playAudioRef.current?.(), 80);
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
  const playAudio = useCallback(() => {
    const track = currentTrackRef.current;
    if (!track?.buffer || !audioContextRef.current) return;

    // Stop any existing audio source to prevent concurrent playback
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch (e) {
        // Already stopped
      }
      sourceNodeRef.current = null;
    }

    // Ensure context is ready
    void audioContextRef.current.resume();

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
    
    pauseTimeRef.current = 0;
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

  const moveTrack = (from: number, to: number) => {
    setAudio(prev => {
      if (to < 0 || to >= prev.playlist.length) return prev;
      const updated = [...prev.playlist];
      const [item] = updated.splice(from, 1);
      updated.splice(to, 0, item);
      return {
        ...prev,
        playlist: updated,
        currentTrackIndex: prev.currentTrackIndex === from ? to : prev.currentTrackIndex,
      };
    });
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

  const handleProgressDrag = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    seekTo(value);
  };

  // Handle canvas click for seeking
  // Seeking handled by Waveform component via onSeek

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

  const hasTracks = audio.playlist.length > 0;
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
    <div className="app dashboard">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">SL</div>
          <div>
            <div className="brand-title">SlowedLab</div>
            <div className="brand-subtitle">Audio Control Center</div>
          </div>
        </div>

        <div className="sidebar-block">
          <div className="sidebar-label">Session Info</div>
          <div className="session-info">
            <div className="session-line">
              <span className="pill">Track</span>
              <span className="session-value">{currentTrack?.file.name || 'None loaded'}</span>
            </div>
            <div className="session-line">
              <span className="pill">Status</span>
              <span className={`pill ${audio.isPlaying ? 'pill-live' : ''}`}>{audio.isPlaying ? 'Playing' : 'Stopped'}</span>
            </div>
            <div className="session-line">
              <span className="pill">Preset</span>
              <span className="session-value">{activePresetLabel}</span>
            </div>
            <button className="chip-button ghost" onClick={resetSession}>Reset Session</button>
          </div>
        </div>

        <div className="sidebar-block effects-panel">
          <div className="effects-header">
            <h3>🎛️ Effects</h3>
            <button className="chip-button ghost" onClick={resetPresets}>Reset</button>
          </div>
          <div className="mini-sliders effects-scroll">
            <label>Playback Rate <span>{effects.playbackRate.toFixed(2)}x</span></label>
            <input type="range" min="0.5" max="1.5" step="0.01" value={effects.playbackRate} onChange={(e) => { setEffects(prev => ({ ...prev, playbackRate: parseFloat(e.target.value) })); setSelectedPreset('Custom'); }} />
            <label>Reverb <span>{effects.reverbAmount}%</span></label>
            <input type="range" min="0" max="100" step="1" value={effects.reverbAmount} onChange={(e) => { setEffects(prev => ({ ...prev, reverbAmount: parseInt(e.target.value) })); setSelectedPreset('Custom'); }} />
            <label>Bass <span>{effects.bassBoost} dB</span></label>
            <input type="range" min="-40" max="40" step="1" value={effects.bassBoost} onChange={(e) => { setEffects(prev => ({ ...prev, bassBoost: parseInt(e.target.value) })); setSelectedPreset('Custom'); }} />
            <label>Treble <span>{effects.trebleBoost} dB</span></label>
            <input type="range" min="-40" max="40" step="1" value={effects.trebleBoost} onChange={(e) => { setEffects(prev => ({ ...prev, trebleBoost: parseInt(e.target.value) })); setSelectedPreset('Custom'); }} />
            <label>Compression <span>{effects.compression}%</span></label>
            <input type="range" min="0" max="100" step="1" value={effects.compression} onChange={(e) => { setEffects(prev => ({ ...prev, compression: parseInt(e.target.value) })); setSelectedPreset('Custom'); }} />
            <label>Distortion <span>{effects.distortion}%</span></label>
            <input type="range" min="0" max="100" step="1" value={effects.distortion} onChange={(e) => { setEffects(prev => ({ ...prev, distortion: parseInt(e.target.value) })); setSelectedPreset('Custom'); }} />
          </div>
          <div className="preset-tools">
            <div className="preset-row">
              <button className={`chip-button ab-compare ${abActive ? 'pill-live' : ''}`} onClick={toggleAB} title="Toggle A/B comparison">
                {abActive ? '🎚️ A/B ON' : '🎚️ A/B OFF'}
              </button>
            </div>
            {userPresets.length > 0 && (
              <div className="user-preset-list">
                {userPresets.map(preset => (
                  <div className="user-preset-row" key={preset.id}>
                    <button className="chip-button ghost" onClick={() => applyPreset(preset.name)}>{preset.name}</button>
                    <button className="chip-button ghost" onClick={() => renameUserPreset(preset.id, prompt('Rename preset', preset.name) || preset.name)}>Rename</button>
                    <button className="chip-button ghost" onClick={() => shareUserPreset(preset)}>Share</button>
                    <button className="chip-button ghost" onClick={() => deleteUserPreset(preset.id)}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="content-shell">
        <header className="topbar">
          <div className="topbar-left">
            <div className="topbar-branding">
              <h1 className="page-title">Audio Processing Console</h1>
              <p className="eyebrow">{currentTrack?.file.name || 'No track loaded'}</p>
            </div>
          </div>

          <div className="topbar-actions">
            {/* Bookmark Button */}
            <button
              className="topbar-icon-button"
              onClick={bookmarkWebsite}
              title="Bookmark this website"
              aria-label="Bookmark website"
            >
              <FiBookmark size={20} />
            </button>
            {/* GitHub Button */}
            <button
              className="topbar-icon-button"
              onClick={() => window.open('https://github.com/anasfik/SlowedLab', '_blank')}
              title="View source on GitHub"
              aria-label="Open GitHub repository"
            >
              <FiGithub size={20} />
            </button>
            {/* Status Indicators */}
            {/* Status Indicators */}
            <div className="topbar-section topbar-status">
              <div className="status-chip status-track">
                <span className="status-icon">🎵</span>
                <span>{audio.playlist.length} {audio.playlist.length === 1 ? 'Track' : 'Tracks'}</span>
              </div>
              {audio.isPlaying && (
                <div className="status-chip status-live">
                  <span className="status-pulse"></span>
                  <span>Live</span>
                </div>
              )}
            </div>

            {/* Preset Management */}
            <div className="topbar-section topbar-presets">
              <select
                className="preset-select"
                value={selectedPreset}
                onChange={(e) => applyPreset(e.target.value)}
                title="Select preset"
              >
                <optgroup label="Factory Presets">
                  {PRESETS.map((preset) => (
                    <option key={preset.name} value={preset.name}>{preset.icon} {preset.name}</option>
                  ))}
                </optgroup>
                {userPresets.length > 0 && (
                  <optgroup label="Your Presets">
                    {userPresets.map((preset) => (
                      <option key={preset.id} value={preset.name}>{preset.icon} {preset.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
              <div className="preset-actions">
                {/* <button 
                  className="icon-btn" 
                  onClick={analyzeAndRecommend} 
                  disabled={!currentTrack?.buffer || isAnalyzing}
                  title="AI preset suggestions"
                >
                  {isAnalyzing ? '⏳' : '✨'}
                </button> */}
                <div className="preset-save-group">
                  <input
                    type="text"
                    value={presetNameInput}
                    onChange={(e) => setPresetNameInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveUserPreset()}
                    placeholder="New preset..."
                    className="preset-input-inline"
                    maxLength={32}
                  />
                  <button 
                    className="icon-btn icon-btn-primary" 
                    onClick={saveUserPreset} 
                    title="Save current settings as preset (Enter)"
                  >
                    💾
                  </button>
                </div>
              </div>
            </div>

            <div className="topbar-divider"></div>

            {/* File Actions */}
            <div className="topbar-section topbar-file-actions">
              <label className="icon-btn icon-btn-secondary" title="Upload audio files">
                <FiPlay style={{ transform: 'rotate(180deg)' }} />
                <input
                  type="file"
                  accept="audio/*"
                  multiple
                  onChange={handleFileUpload}
                  className="file-input"
                />
              </label>
              <button 
                className="icon-btn icon-btn-secondary" 
                onClick={exportSelection} 
                disabled={!currentTrack?.buffer}
                title="Export audio"
              >
                <FiDownload />
              </button>
              <button 
                className="icon-btn" 
                onClick={() => { setShowBugModal(true); setBugMessage(null); }}
                title="Report a bug"
              >
                🐞
              </button>
            </div>

            {/* Playback Controls */}
            <div className="topbar-section topbar-playback">
              <button 
                className="btn-playback" 
                onClick={togglePlayback} 
                disabled={!currentTrack?.buffer || currentTrack?.isLoading}
                title={audio.isPlaying ? 'Pause' : 'Play'}
              >
                {audio.isPlaying ? (
                  <><FiPause /><span>Pause</span></>
                ) : (
                  <><FiPlay /><span>Play</span></>
                )}
              </button>
            </div>
          </div>

          {/* AI Recommendations Dropdown
          {showRecommendations && recommendations.length > 0 && (
            <div className="ai-recommendations-dropdown">
              <div className="ai-rec-header">
                <span className="ai-rec-title">✨ AI Suggestions</span>
                <button className="ai-rec-close" onClick={() => setShowRecommendations(false)}>✕</button>
              </div>
              <div className="ai-rec-list">
                {recommendations.map((rec, idx) => (
                  <div key={idx} className="ai-rec-item" onClick={() => { applyPreset(rec.name); setShowRecommendations(false); }}>
                    <div className="ai-rec-content">
                      <span className="ai-rec-icon">{rec.icon}</span>
                      <div className="ai-rec-info">
                        <div className="ai-rec-name">{rec.name}</div>
                        <div className="ai-rec-reason">{rec.reason}</div>
                      </div>
                    </div>
                    <div className="ai-rec-score">{rec.matchScore}%</div>
                  </div>
                ))}
              </div>
            </div>
          )} */}
        </header>

        <div className="tab-bar">
          <button className={`tab-button ${activeTab === 'console' ? 'active' : ''}`} onClick={() => setActiveTab('console')}>Console</button>
          <button className={`tab-button ${activeTab === 'playlist' ? 'active' : ''}`} onClick={() => setActiveTab('playlist')}>Playlist</button>
        </div>

        {!hasTracks && activeTab === 'console' ? (
          <section className="empty-state" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
            <div className={`empty-drop ${isDragging ? 'dragging' : ''}`}>
              <input
                type="file"
                accept="audio/*"
                onChange={handleFileUpload}
                id="audio-upload"
                className="file-input"
                multiple
              />
              <label htmlFor="audio-upload" className="empty-cta">
                <div className="big-upload-icon">⬆</div>
                <div>
                  <h2>Drop audio to start</h2>
                  <p>Fast ingest with multi-file support and automatic waveform prep.</p>
                  <div className="pill-row">
                    <span className="pill">MP3</span>
                    <span className="pill">WAV</span>
                    <span className="pill">FLAC</span>
                  </div>
                </div>
              </label>
            </div>
            <div className="feature-board">
              <div className="feature-card">
                <div className="feature-icon">🎚️</div>
                <h3>Time Stretch</h3>
                <p>Slow down or speed up without artifacts.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">🌊</div>
                <h3>Reverb Lab</h3>
                <p>Studio-grade ambience with dry/wet control.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">📊</div>
                <h3>Live Preview</h3>
                <p>Adjust and hear instantly with history tracking.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">💾</div>
                <h3>Clean Exports</h3>
                <p>Download lossless or high-bitrate formats.</p>
              </div>
            </div>
          </section>
        ) : activeTab === 'console' ? (
          <div className="board-grid">
            <div className="card waveform-card compact full-span">
              <div className="waveform-top">
                <div className="track-summary">
                  <p className="eyebrow">Now Playing</p>
                  <h3 className="card-title">{currentTrack?.file.name || 'Select a track'}</h3>
                  <div className="pill-row">
                    <span className="pill">Preset • {activePresetLabel}</span>
                    <span className={`pill ${audio.isPlaying ? 'pill-live' : ''}`}>{audio.isPlaying ? 'Live' : 'Paused'}</span>
                  </div>
                </div>
                <div className="waveform-actions">
                  <div className="time-display">
                    <span className="time-current">{formatTime(audio.currentTime)}</span>
                    <span className="time-separator">/</span>
                    <span className="time-total">{formatTime((currentTrack?.duration || 0) / effects.playbackRate)}</span>
                  </div>
                  <div className="transport-group">
                    <button className="control-button" onClick={playPreviousTrack} disabled={audio.currentTrackIndex === 0}><FiSkipBack /></button>
                    <button className="control-button" onClick={stopAudio} disabled={!currentTrack?.buffer}><FiSquare /></button>
                    <button className="play-button-main" onClick={togglePlayback} disabled={!currentTrack?.buffer || currentTrack?.isLoading}>
                      {audio.isPlaying ? <><FiPause /><span>Pause</span></> : <><FiPlay /><span>Play</span></>}
                    </button>
                    <button className="control-button" onClick={playNextTrack} disabled={audio.currentTrackIndex === audio.playlist.length - 1}><FiSkipForward /></button>
                  </div>
                </div>
              </div>
              <div className="progress-slider-container">
                <div className="progress-slider-header">
                  <span className="progress-label">Timeline</span>
                  <span className="progress-time">
                    <span className="time-current">{formatTime(audio.currentTime)}</span>
                    <span className="time-sep">•</span>
                    <span className="time-total">{formatTime((currentTrack?.duration || 0) / effects.playbackRate)}</span>
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={(currentTrack?.duration || 0) / effects.playbackRate}
                  step={0.01}
                  value={currentTrack ? Math.min(audio.currentTime, (currentTrack.duration / effects.playbackRate)) : 0}
                  onChange={handleProgressDrag}
                  className="progress-slider slider"
                  title="Seek timeline"
                />
              </div>
              <div className="volume-inline">
                <div className="volume-header">
                  <span className="volume-icon">🔊</span>
                  <span className="volume-label">Volume</span>
                </div>
                <div className="volume-control">
                  <input
                    type="range"
                    min="0"
                    max="1.2"
                    step="0.01"
                    value={volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    className="slider volume-slider"
                    title="Adjust volume"
                  />
                  <span className="volume-value">{Math.round(volume * 100)}%</span>
                </div>
              </div>
              <Waveform
                buffer={currentTrack?.buffer || null}
                currentTime={audio.currentTime}
                playbackRate={effects.playbackRate}
                bufferPosition={bufferPosition}
                onSeek={seekTo}
              />
            </div>
          </div>
        ) : (
          <div className="playlist-tab">
            <div className="card playlist-card compact">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Playlist Manager</p>
                  <h3>{audio.playlist.length} Tracks</h3>
                </div>
                <div className="panel-actions">
                  <label htmlFor="add-more" className="button-secondary">
                    + Add
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={handleFileUpload}
                      id="add-more"
                      className="file-input"
                      multiple
                    />
                  </label>
                  <button className="button-secondary" onClick={clearPlaylist}>Clear</button>
                </div>
              </div>
              <div className="playlist-items board-scroll">
                {audio.playlist.map((track, index) => (
                  <div
                    key={track.id}
                    className={`playlist-item ${index === audio.currentTrackIndex ? 'active' : ''}`}
                    onClick={() => playTrack(index)}
                  >
                    <div className="playlist-item-icon">
                      {index === audio.currentTrackIndex && audio.isPlaying ? '▶' : '🎵'}
                    </div>
                    <div className="playlist-item-info">
                      <div className="playlist-item-name">{track.file.name}</div>
                      <div className="playlist-item-meta">
                        {track.isLoading ? 'Loading…' : `${formatTime(track.duration)} • ${(track.file.size / 1024 / 1024).toFixed(1)} MB`}
                      </div>
                    </div>
                    <div className="playlist-item-actions">
                      <button className="chip-button ghost" onClick={(e) => { e.stopPropagation(); moveTrack(index, index - 1); }}>↑</button>
                      <button className="chip-button ghost" onClick={(e) => { e.stopPropagation(); moveTrack(index, index + 1); }}>↓</button>
                      <button
                        className="playlist-item-remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeTrack(track.id);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {currentTrack?.isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <p>Processing audio...</p>
        </div>
      )}

      {loadingProgress && (
        <div className="loading-toast">
          <div className="loading-spinner"></div>
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
          <svg viewBox="0 0 24 24" fill="currentColor">
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
    </div>
  );
}
