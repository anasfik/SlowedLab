/**
 * SlowedLab - Professional Audio Editor
 * Expert-level UX with Web Audio API integration
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import AudioOutputTest from './components/AudioOutputTest';
import {
  FiPlay, FiPause, FiSkipBack, FiSkipForward, FiMusic,
  FiActivity, FiVolume2, FiCpu,
  FiHeadphones, FiStar, FiZap as FiBolt, FiDroplet as FiDiamond, FiSliders,
  FiX, FiList, FiTrash2, FiUploadCloud, FiFolder, FiLink,
  FiVolumeX, FiInfo, FiDownload, FiRepeat, FiRotateCcw
} from 'react-icons/fi';
import Topbar from './components/Topbar.tsx';
import Sidebar from './components/Sidebar.tsx';
import Waveform from './components/Waveform.tsx';
import LinkImport from './components/LinkImport.tsx';
import BugReportPanel from './components/BugReportPanel.tsx';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.ts';
import { useDialogFocus } from './hooks/useDialogFocus.ts';
import { buildChain, updateChain, type ChainNodes, type EffectSettings } from './audioGraph';

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

export type { EffectSettings };

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
  version: 2,
  store: 'tracks',
};

// Cache ceiling. Browsers cap origin storage (often a few hundred MB), and a
// QuotaExceededError is silent unless handled: the user reloads, the track is
// gone with no explanation. Evict oldest-first instead, and report failures.
const MAX_CACHED_BYTES = 400 * 1024 * 1024;
const MAX_CACHED_TRACKS = 12;

interface CachedTrack {
  id: string;
  name: string;
  type: string;
  data: ArrayBuffer;
  savedAt: number;
  bytes: number;
}

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB limit
// Verbose audio diagnostics only with ?audio-debug=1; shipping them on every
// import/play spams the console of every real user.
const DEBUG_AUDIO = new URLSearchParams(window.location.search).get('audio-debug') === '1';
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
  const [cacheNotice, setCacheNotice] = useState<string | null>(null);
  const [dropNotice, setDropNotice] = useState<string | null>(null);
  const [pendingClear, setPendingClear] = useState(false);
  const [muted, setMuted] = useState(false);
  // Playback repeat behaviour for the transport dock.
  // 'once' stops at the end of the current track, 'all' continues through the
  // queue (previous behaviour), 'one' replays the current track.
  const [loopMode, setLoopMode] = useState<'once' | 'all' | 'one'>('all');
  const [hoveredNav, setHoveredNav] = useState<'prev' | 'next' | null>(null);
  // Top-edge seek bar: hover preview (x px + time) and in-drag position.
  // Dragging only previews; the seek commits once on release so playback
  // restarts a single time instead of once per pointermove.
  const [edgeHover, setEdgeHover] = useState<{ x: number; time: number } | null>(null);
  const [edgeDragPct, setEdgeDragPct] = useState<number | null>(null);
  const edgeBarRef = useRef<HTMLDivElement>(null);
  // Previous session found in IndexedDB. We only list it — decoding happens
  // when the user clicks Restore, never automatically on reopen.
  const [sessionCache, setSessionCache] = useState<{ id: string; name: string; type: string }[]>([]);
  const [isSessionRestoring, setIsSessionRestoring] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const convolverNodeRef = useRef<ConvolverNode | null>(null);
  // Live chain nodes, rebuilt per playback. Single ref instead of one per node.
  const chainNodesRef = useRef<ChainNodes | null>(null);

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
  const loopModeRef = useRef<'once' | 'all' | 'one'>('all');
  const playAudioRef = useRef<() => void>(() => { });
  const stopAudioRef = useRef<() => void>(() => { });

  // Playback position lives in refs, not state: it changes every frame and
  // rendering the whole tree at 60Hz is unaffordable. Waveform reads it via
  // getPosition() on its own rAF; React state is synced at 10Hz purely so the
  // text readouts and aria-valuenow stay current.
  const currentTimeRef = useRef(0);
  const bufferPositionRef = useRef(0);
  const lastUiSyncRef = useRef(0);
  const getPosition = useCallback(() => ({
    position: bufferPositionRef.current,
    time: currentTimeRef.current,
  }), []);

  // Directory drops and stray text report as items with no type; treat any
  // typeInfo as a potential file and let validation decide.
  const hasFiles = (dt: DataTransfer | null): boolean => {
    if (!dt) return false;
    if (dt.types && dt.types.includes('Files')) return true;
    return dt.items.length > 0 && Array.from(dt.items).some(item => item.kind === 'file');
  };

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

  const readAllCached = useCallback((db: IDBDatabase): Promise<CachedTrack[]> => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_CONFIG.store, 'readonly');
      const req = tx.objectStore(DB_CONFIG.store).getAll();
      req.onsuccess = () => resolve((req.result || []) as CachedTrack[]);
      req.onerror = () => reject(req.error);
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

      // Evict oldest-first so a big import cannot blow the origin quota.
      const all = await readAllCached(db);
      let total = all.reduce((n, t) => n + (t.bytes || t.data?.byteLength || 0), 0);
      const incoming = arrayBuffer.byteLength;
      const doomed = [...all]
        .sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0))
        .filter(t => t.id !== trackId);
      const pruneTx = db.transaction(DB_CONFIG.store, 'readwrite');
      const pruneStore = pruneTx.objectStore(DB_CONFIG.store);
      let dropped = 0;
      for (const old of doomed) {
        const size = old.bytes || old.data?.byteLength || 0;
        const overBytes = total + incoming > MAX_CACHED_BYTES;
        const overCount = all.length - dropped + 1 > MAX_CACHED_TRACKS;
        if (!overBytes && !overCount) break;
        pruneStore.delete(old.id);
        total -= size;
        dropped++;
      }
      pruneStore.put({
        id: trackId,
        name: file.name,
        type: file.type,
        data: arrayBuffer,
        savedAt: Date.now(),
        bytes: incoming,
      } as CachedTrack);
      await new Promise<void>((resolve, reject) => {
        pruneTx.oncomplete = () => resolve();
        pruneTx.onerror = () => reject(pruneTx.error);
        pruneTx.onabort = () => reject(pruneTx.error);
      });
    } catch (err) {
      // Caching is a convenience. Never fail the import because of it, but do
      // not pretend it worked either.
      console.warn('Track cache write failed', err);
      setCacheNotice(
        err instanceof Error && /quota/i.test(err.name + err.message)
          ? 'Browser storage is full, so this track will not survive a reload.'
          : 'This track could not be cached for the next reload.'
      );
    }
  }, [openDB, readAllCached]);

  const clearTrackCache = useCallback(async () => {
    try {
      const db = await openDB();
      const tx = db.transaction(DB_CONFIG.store, 'readwrite');
      tx.objectStore(DB_CONFIG.store).clear();
      setSessionCache([]);
    } catch (err) {
      console.warn('Failed to clear cache', err);
    }
  }, [openDB]);

  const deleteTrackFromDB = useCallback(async (trackId: string) => {
    try {
      const db = await openDB();
      const tx = db.transaction(DB_CONFIG.store, 'readwrite');
      tx.objectStore(DB_CONFIG.store).delete(trackId);
      // Await completion: an un-awaited delete can commit before an in-flight
      // put from the same import, leaving an orphaned cached track forever.
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch (err) {
      console.warn('Failed to remove cached track', err);
    }
  }, [openDB]);

  // Session audio is never decoded automatically on reopen. We only list what
  // is cached; the user clicks Restore to decode (which can take seconds for
  // large files and used to freeze the first paint).
  const checkSessionCache = useCallback(async () => {
    try {
      const db = await openDB();
      const cachedTracks = await readAllCached(db);
      if (!cachedTracks.length) return;
      const usable = [...cachedTracks]
        .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
        .slice(0, MAX_CACHED_TRACKS);
      setSessionCache(usable.map(t => ({ id: t.id, name: t.name, type: t.type })));
    } catch (err) {
      console.warn('Failed to list cached tracks', err);
    }
  }, [openDB, readAllCached]);

  const restoreSessionOnDemand = useCallback(async () => {
    if (!audioContextRef.current || isSessionRestoring) return;
    setIsSessionRestoring(true);
    try {
      const db = await openDB();
      const cachedTracks = await readAllCached(db);
      if (!cachedTracks.length) {
        setSessionCache([]);
        return;
      }
      const usable = [...cachedTracks]
        .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
        .slice(0, MAX_CACHED_TRACKS);

      const restored: AudioFile[] = [];
      for (const cached of usable) {
        setLoadingProgress({ fileName: cached.name, progress: 0 });
        const blob = new Blob([cached.data], { type: cached.type });
        const restoredFile = new File([blob], cached.name, { type: cached.type });
        const arrayBuffer: ArrayBuffer = cached.data instanceof ArrayBuffer ? cached.data : await cached.data.arrayBuffer();
        setLoadingProgress({ fileName: cached.name, progress: 50 });
        const buffer = await audioContextRef.current.decodeAudioData(arrayBuffer.slice(0));
        setLoadingProgress({ fileName: cached.name, progress: 100 });
        if (DEBUG_AUDIO) {
          console.log(
            `[SlowedLab][decode:cache] name="${cached.name}" duration=${buffer.duration.toFixed(2)}s ` +
            `channels=${buffer.numberOfChannels} peak=${bufferPeak(buffer).toFixed(4)}`
          );
        }
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
      setSessionCache([]);
    } catch (err) {
      console.warn('Failed to restore tracks', err);
      setCacheNotice('Could not restore your last session. Try adding the files again.');
    } finally {
      setLoadingProgress(null);
      setIsSessionRestoring(false);
    }
  }, [openDB, readAllCached, isSessionRestoring]);

  const autoPlayFirst = useCallback(() => {
    pauseTimeRef.current = 0;
    pauseTimelineRef.current = 0;
    startTimeRef.current = audioContextRef.current?.currentTime || 0;
    currentTimeRef.current = 0;
    bufferPositionRef.current = 0;
    lastUiSyncRef.current = 0;
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

  useEffect(() => {
    loopModeRef.current = loopMode;
  }, [loopMode]);

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

  // Restore cached session (presets, history). Track audio stays in IndexedDB
  // until the user clicks Restore — see checkSessionCache above.
  useEffect(() => {
    const cachedEffects = readStored(STORAGE_KEYS.effects);
    const cachedPreset = readStored(STORAGE_KEYS.preset);
    const cachedUserPresets = readStored(STORAGE_KEYS.userPresets);
    const cachedHistory = readStored(STORAGE_KEYS.playHistory);

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

    checkSessionCache().finally(() => setIsRestoring(false));
  }, [checkSessionCache]);

  // localStorage throws in Safari private mode and when storage is disabled.
  // Reads must degrade to defaults instead of aborting session restore.
  const readStored = (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const writeStored = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      setCacheNotice('Browser storage is unavailable, so this session will not be remembered.');
    }
  };

  // Persist session changes
  useEffect(() => {
    if (isRestoring) return;
    writeStored(STORAGE_KEYS.effects, JSON.stringify(effects));
    writeStored(STORAGE_KEYS.preset, selectedPreset);
    writeStored(STORAGE_KEYS.userPresets, JSON.stringify(userPresets));
    writeStored(STORAGE_KEYS.playHistory, JSON.stringify(playHistory.slice(0, 50)));
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

        if (DEBUG_AUDIO) {
          console.log(
            `[SlowedLab][decode] name="${audioFiles[i].name}" duration=${buffer.duration.toFixed(2)}s ` +
            `sampleRate=${buffer.sampleRate} channels=${buffer.numberOfChannels} peak=${bufferPeak(buffer).toFixed(4)}`
          );
        }

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

  // Handle drag and drop. dragleave also fires when the pointer crosses a
  // child element's boundary, so a naive setState(false) makes the overlay
  // strobe on every internal move. Counting enter/leave pairs fixes it.
  const dragDepthRef = useRef(0);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current += 1;
    if (!hasFiles(e.dataTransfer)) {
      setDropNotice('That does not look like audio. Drop an MP3, WAV, FLAC, OGG or AAC file.');
    } else {
      setDropNotice(null);
    }
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    // Required, or the browser refuses the drop entirely.
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = hasFiles(e.dataTransfer) ? 'copy' : 'none';
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragging(false);
      setDropNotice(null);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDragging(false);
    setDropNotice(null);

    const files = Array.from(e.dataTransfer.files || []);
    const audioFiles = files.filter(file => !validateAudioFile(file));
    const rejected = files.length - audioFiles.length;

    if (audioFiles.length) {
      await addAudioFiles(audioFiles, 'Please drop audio files (MP3, WAV, FLAC, OGG, etc.)');
    }
    if (rejected > 0) {
      setCacheNotice(
        `${rejected} of ${files.length} dropped file${files.length > 1 ? 's were' : ' was'} skipped — not supported audio.`
      );
    } else if (!files.length) {
      setCacheNotice('Nothing was dropped. Try dragging an audio file onto the window.');
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

    // buffer position in seconds (accounts for playback rate)
    const rate = playbackRateRef.current || 1;
    const bufPos = pauseTimeRef.current + elapsedCtx * rate;

    currentTimeRef.current = timelineNow;
    bufferPositionRef.current = Math.min(bufPos, track.duration);

    // Text/aria readouts do not need 60Hz. 10Hz is smooth to read and cuts
    // App re-renders (Topbar + Sidebar + tabs + drawers) by ~6x.
    if (ctxNow - lastUiSyncRef.current >= 0.1) {
      lastUiSyncRef.current = ctxNow;
      setAudio(prev => (Math.abs(prev.currentTime - timelineNow) < 0.05 ? prev : { ...prev, currentTime: timelineNow }));
    }

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

      const mode = loopModeRef.current;
      if (mode === 'one') {
        // Replay the same track.
        pauseTimeRef.current = 0;
        pauseTimelineRef.current = 0;
        bufferPositionRef.current = 0;
        setAudio(prev => ({ ...prev, currentTime: 0, isPlaying: false }));
        setTimeout(() => playAudioRef.current?.(), 100);
        return;
      }
      if (mode === 'once') {
        stopAudioRef.current?.();
        return;
      }
      const nextIndex = state.currentTrackIndex + 1;
      const nextTrack = state.playlist[nextIndex];
      if (nextTrack?.buffer) {
        // Auto-play next track in playlist
        pauseTimeRef.current = 0;
        pauseTimelineRef.current = 0;
        bufferPositionRef.current = 0;
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
      const blocked = audioContextRef.current;
      console.warn(
        'Audio output blocked by the browser:',
        `state=${blocked.state} sampleRate=${blocked.sampleRate} ` +
        `baseLatency=${blocked.baseLatency ?? 'n/a'} outputLatency=${blocked.outputLatency ?? 'n/a'} ` +
        `ua=${navigator.userAgent.slice(0, 80)}`
      );
      playingRef.current = false;
      setAudioBlocked(true);
      return;
    }
    setAudioBlocked(false);

    // One shared DSP definition for playback and export (see audioGraph.ts).
    const ctx = audioContextRef.current;
    const source = ctx.createBufferSource();
    source.buffer = track.buffer;
    source.playbackRate.value = effects.playbackRate;

    const chain = buildChain(
      ctx,
      source,
      ctx.destination,
      effects,
      muted ? 0 : volume,
      convolverNodeRef.current!.buffer
    );

    chainNodesRef.current = chain.nodes;
    sourceNodeRef.current = source;

    // Start playback. Clamp the offset into the buffer: Chrome/Brave throw
    // InvalidStateError for out-of-range offsets where Firefox is lenient.
    startTimeRef.current = ctx.currentTime;
    lastPlaybackRateRef.current = effects.playbackRate;
    playbackRateRef.current = effects.playbackRate;
    const safeOffset = Math.min(
      Math.max(pauseTimeRef.current || 0, 0),
      Math.max(track.buffer.duration - 0.05, 0)
    );
    pauseTimeRef.current = safeOffset;
    source.start(0, safeOffset);

    // One-line graph snapshot: every knob that can zero the output. Debug-only;
    // this used to log on every single play.
    if (DEBUG_AUDIO) {
      const n = chain.nodes;
      console.log(
        `[SlowedLab][play] state=${ctx.state} ctxRate=${ctx.sampleRate} ctxTime=${ctx.currentTime.toFixed(2)} ` +
        `offset=${safeOffset.toFixed(2)} bufDur=${track.buffer.duration.toFixed(2)} bufCh=${track.buffer.numberOfChannels} ` +
        `rate=${effects.playbackRate} vol=${volume} dry=${n.dry.gain.value.toFixed(3)} wet=${n.wet.gain.value.toFixed(3)} ` +
        `bass=${n.bass.gain.value} treb=${n.treble.gain.value} compRatio=${n.compressor.ratio.value.toFixed(1)} ` +
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
      const mode = loopModeRef.current;
      const state = audioStateRef.current;
      if (mode === 'one' && state) {
        pauseTimeRef.current = 0;
        pauseTimelineRef.current = 0;
        bufferPositionRef.current = 0;
        setAudio(prev => ({ ...prev, currentTime: 0, isPlaying: false }));
        setTimeout(() => playAudioRef.current?.(), 80);
        return;
      }
      if (mode === 'once') {
        setAudio(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
        pauseTimeRef.current = 0;
        pauseTimelineRef.current = 0;
        bufferPositionRef.current = 0;
        return;
      }
      const nextIndex = state ? state.currentTrackIndex + 1 : -1;
      const nextTrack = state?.playlist[nextIndex];
      if (nextTrack?.buffer) {
        pauseTimeRef.current = 0;
        pauseTimelineRef.current = 0;
        bufferPositionRef.current = 0;
        setAudio(prev => ({ ...prev, currentTrackIndex: nextIndex, currentTime: 0, isPlaying: false }));
        setTimeout(() => playAudioRef.current?.(), 80);
      } else {
        setAudio(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
        pauseTimeRef.current = 0;
        pauseTimelineRef.current = 0;
        bufferPositionRef.current = 0;
      }
    };

    setAudio(prev => ({ ...prev, isPlaying: true }));
    playingRef.current = true;
    animationFrameRef.current = requestAnimationFrame(updateTime);
    logPlayHistory(track);
  }, [volume, muted, effects, updateTime, logPlayHistory, clearAudioProbe]);

  playAudioRef.current = playAudio;

  // Update effects in real-time during playback. Rate changes need a time-base
  // rebase to stay in sync; everything else is a parameter write on the live
  // nodes (no rebuild, so no click and no dropped samples).
  useEffect(() => {
    if (audio.isPlaying && chainNodesRef.current) {
      updateChain(chainNodesRef.current, effects, muted ? 0 : volume);
    }

    if (sourceNodeRef.current && audioContextRef.current) {
      const newRate = effects.playbackRate;
      if (newRate !== lastPlaybackRateRef.current) {
        const ctxNow = audioContextRef.current.currentTime;
        const elapsedCtx = ctxNow - startTimeRef.current;
        pauseTimeRef.current =
          pauseTimeRef.current + elapsedCtx * (lastPlaybackRateRef.current || 1);
        startTimeRef.current = ctxNow;
        lastPlaybackRateRef.current = newRate;
        playbackRateRef.current = newRate;
      }
      sourceNodeRef.current.playbackRate.value = newRate;
    }
  }, [effects, volume, muted, audio.isPlaying]);

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
      bufferPositionRef.current = bufPos;
      const timelineNow = pauseTimelineRef.current + elapsedCtx;
      pauseTimelineRef.current = timelineNow;
      currentTimeRef.current = timelineNow;
    } else {
      pauseTimelineRef.current = audio.currentTime;
      currentTimeRef.current = audio.currentTime;
    }
    playingRef.current = false;
    setAudio(prev => ({ ...prev, isPlaying: false }));
  }, [audio.currentTime, effects.playbackRate, clearAudioProbe]);

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
    bufferPositionRef.current = 0;
    currentTimeRef.current = 0;
    playingRef.current = false;
    setAudio(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
  }, [clearAudioProbe]);

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
      // Same-origin: the dev server and nginx both proxy /api to the backend.
      const res = await fetch('/api/report-bug', {
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

  // Apply preset. The live chain is updated in place by the effects effect, so
  // there is no pause/restart here: switching sounds mid-playback used to drop
  // ~100ms of audio for no reason.
  const applyPreset = (presetName: string) => {
    const preset = [...PRESETS, ...userPresets].find(p => p.name === presetName);
    if (preset) {
      setEffects(preset.settings);
      setSelectedPreset(presetName);
      setAbBaseline(preset.settings);
    }
  };

  const resetPresets = () => {
    setEffects({ ...DEFAULT_EFFECTS });
    setSelectedPreset('Custom');
    setAbBaseline({ ...DEFAULT_EFFECTS });
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
    bufferPositionRef.current = 0;
    currentTimeRef.current = 0;

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
      bufferPositionRef.current = 0;
      currentTimeRef.current = 0;
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
    try {
      Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
    } catch {
      // storage unavailable; nothing to clear
    }
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
      currentTimeRef.current = clamped;
      bufferPositionRef.current = pauseTimeRef.current;
      setAudio(prev => ({ ...prev, currentTime: clamped }));
      setTimeout(() => playAudio(), 50);
    } else {
      pauseTimeRef.current = clamped * (effects.playbackRate || 1);
      pauseTimelineRef.current = clamped;
      currentTimeRef.current = clamped;
      bufferPositionRef.current = pauseTimeRef.current;
      setAudio(prev => ({ ...prev, currentTime: clamped }));
      bufferPositionRef.current = Math.min(pauseTimeRef.current, currentTrack.duration);
    }
  }, [audio.isPlaying, currentTrack, pauseAudio, playAudio, effects.playbackRate]);



  // Handle canvas click for seeking
  // Seeking handled by Waveform component via onSeek

  // Keyboard Shortcuts
  // UI States for Glass & Void Design
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Settings/Effects
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false); // Playlist
  const closeQueue = useCallback(() => setIsPlaylistOpen(false), []);
  const queuePanelRef = useDialogFocus<HTMLElement>(isPlaylistOpen, closeQueue);

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
      // Monitoring volume is deliberately NOT applied: the file should match
      // the mix, not your speaker level.
      const tail = effects.reverbAmount > 0 ? 2 : 0.1;
      const renderedDuration = input.duration / effects.playbackRate + tail;
      const offline = new OfflineAudioContext(
        input.numberOfChannels,
        Math.ceil(renderedDuration * sampleRate),
        sampleRate
      );

      const source = offline.createBufferSource();
      source.buffer = input;
      source.playbackRate.value = effects.playbackRate;

      buildChain(
        offline,
        source,
        offline.destination,
        effects,
        1,
        convolverNodeRef.current?.buffer || null
      );
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
  const prevTrack = audio.currentTrackIndex > 0 ? audio.playlist[audio.currentTrackIndex - 1] : null;
  const nextTrack = audio.currentTrackIndex < audio.playlist.length - 1 ? audio.playlist[audio.currentTrackIndex + 1] : null;
  const shortName = (name: string) => name.replace(/\.[^/.]+$/, '').slice(0, 32);

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">Skip to studio</a>
      <Topbar
        selectedPreset={selectedPreset}
        applyPreset={applyPreset}
        PRESETS={PRESETS}
        userPresets={userPresets}
        presetNameInput={presetNameInput}
        setPresetNameInput={setPresetNameInput}
        saveUserPreset={saveUserPreset}
        handleFileUpload={handleFileUpload}
        setShowBugModal={setShowBugModal}
        setBugMessage={setBugMessage}
        isStudioOpen={isSidebarOpen}
        onOpenStudio={() => setIsSidebarOpen(true)}
      />

      <main
        id="main-content"
        className={`studio ${isDragging ? 'dragging' : ''}`}
        onDragEnter={handleDragEnter}
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
                getPosition={getPosition}
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
              <p>Upload your audio — or paste a SoundCloud link to play it here. Slow it down, add reverb, shape tone, then download a finished WAV.</p>

              {sessionCache.length > 0 && audio.playlist.length === 0 && (
                <div className="session-restore" role="status">
                  <div>
                    <strong>Last session found — {sessionCache.length} track{sessionCache.length === 1 ? '' : 's'}</strong>
                    <small>{sessionCache.slice(0, 2).map(t => t.name.replace(/\.[^/.]+$/, '')).join(' · ')}{sessionCache.length > 2 ? ` · +${sessionCache.length - 2} more` : ''}</small>
                  </div>
                  <button
                    className="restore-button hoverable"
                    onClick={() => void restoreSessionOnDemand()}
                    disabled={isSessionRestoring}
                    title="Load your saved tracks into the queue"
                  >
                    {isSessionRestoring ? 'Loading…' : `Restore ${sessionCache.length === 1 ? 'track' : 'tracks'}`}
                  </button>
                </div>
              )}

              <div className="source-picker">
                <div
                  className="source-tabs"
                  role="tablist"
                  aria-label="Audio source"
                  onKeyDown={(e) => {
                    // Arrow keys move between tabs, as the tablist role implies.
                    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                    e.preventDefault();
                    setImportSource(importSource === 'device' ? 'cloud' : 'device');
                    const next = e.key === 'ArrowRight' ? 'cloud-source-tab' : 'device-source-tab';
                    requestAnimationFrame(() => document.getElementById(next)?.focus());
                  }}
                >
                  <button
                    id="device-source-tab"
                    className={importSource === 'device' ? 'active' : ''}
                    role="tab"
                    aria-selected={importSource === 'device'}
                    aria-controls="device-source-panel"
                    tabIndex={importSource === 'device' ? 0 : -1}
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
                    tabIndex={importSource === 'cloud' ? 0 : -1}
                    onClick={() => setImportSource('cloud')}
                  >
                    <FiLink aria-hidden="true" />
                    <span><strong>Cloud link</strong><small>SoundCloud</small></span>
                  </button>
                </div>

                {importSource === 'device' ? (
                  <div className="source-panel device-source" id="device-source-panel" role="tabpanel" aria-labelledby="device-source-tab">
                    <label className="device-dropzone hoverable">
                      <span className="device-upload-icon"><FiUploadCloud aria-hidden="true" /></span>
                      <span><strong>{isRestoring ? 'Checking last session…' : 'Choose audio files'}</strong><small>or drop them anywhere on this screen</small></span>
                      <input type="file" accept="audio/*" onChange={handleFileUpload} multiple disabled={isRestoring} />
                    </label>
                    <p><span>MP3, WAV, FLAC, OGG, AAC</span><span>Up to 200 MB each</span></p>
                  </div>
                ) : (
                  <div className="source-panel cloud-source" id="cloud-source-panel" role="tabpanel" aria-labelledby="cloud-source-tab">
                    <LinkImport onFile={handleRemoteFile} />
                    <p className="cloud-note">Paste a public SoundCloud link — audio streams straight into your browser.</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
        {isDragging && (
          <div className="drop-overlay" aria-hidden="true">
            <FiUploadCloud />
            <strong>Drop to add audio</strong>
            <span>{dropNotice || 'We’ll add it to your queue'}</span>
          </div>
        )}
      </main>

      <footer className="transport-dock" aria-label="Playback controls">
        {new URLSearchParams(window.location.search).get('audio-debug') === '1' && (
          <AudioOutputTest getContext={() => audioContextRef.current} stopPlayback={stopAudio} />
        )}
        {(() => {
          const total = (currentTrack?.duration || 0) / effects.playbackRate;
          const pct = total > 0 ? Math.max(0, Math.min(1, audio.currentTime / total)) : 0;
          const shown = edgeDragPct ?? pct;
          const tip = edgeDragPct != null
            ? { x: (edgeHover?.x ?? shown * (edgeBarRef.current?.clientWidth || 0)), time: edgeDragPct * total }
            : edgeHover;
          const pctFromClientX = (clientX: number) => {
            const el = edgeBarRef.current;
            if (!el) return 0;
            const r = el.getBoundingClientRect();
            return r.width > 0 ? Math.max(0, Math.min(1, (clientX - r.left) / r.width)) : 0;
          };
          const xFromClientX = (clientX: number) => {
            const el = edgeBarRef.current;
            if (!el) return 0;
            return clientX - el.getBoundingClientRect().left;
          };
          return (
            <div
              ref={edgeBarRef}
              className={`dock-edge-progress ${edgeDragPct != null ? 'dragging' : ''} ${currentTrack?.buffer ? '' : 'empty'}`}
              role="slider"
              tabIndex={currentTrack?.buffer ? 0 : -1}
              aria-label="Seek through track"
              aria-valuemin={0}
              aria-valuemax={Math.round(total)}
              aria-valuenow={Math.round(audio.currentTime)}
              aria-valuetext={`${formatTime(audio.currentTime)} of ${formatTime(total)}`}
              title={currentTrack?.buffer ? 'Click or drag to seek' : 'Load a track to seek'}
              onPointerDown={(e) => {
                if (!currentTrack?.buffer) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                setEdgeDragPct(pctFromClientX(e.clientX));
                setEdgeHover({ x: xFromClientX(e.clientX), time: pctFromClientX(e.clientX) * total });
              }}
              onPointerMove={(e) => {
                if (!currentTrack?.buffer) return;
                const p = pctFromClientX(e.clientX);
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                  setEdgeDragPct(p);
                  setEdgeHover({ x: xFromClientX(e.clientX), time: p * total });
                } else {
                  setEdgeHover({ x: xFromClientX(e.clientX), time: p * total });
                }
              }}
              onPointerUp={(e) => {
                if (edgeDragPct == null) return;
                const p = pctFromClientX(e.clientX);
                setEdgeDragPct(null);
                setEdgeHover(null);
                seekTo(p * total);
              }}
              onPointerLeave={() => { if (edgeDragPct == null) setEdgeHover(null); }}
              onKeyDown={(e) => {
                if (!currentTrack?.buffer) return;
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                  e.preventDefault();
                  seekTo(Math.max(0, Math.min(total, audio.currentTime + (e.key === 'ArrowLeft' ? -5 : 5))));
                }
                if (e.key === 'Home') { e.preventDefault(); seekTo(0); }
                if (e.key === 'End') { e.preventDefault(); seekTo(total); }
              }}
            >
              <div className="dock-edge-fill" style={{ width: `${shown * 100}%` }} />
              <div className="dock-edge-knob" style={{ left: `${shown * 100}%` }} />
              {tip && currentTrack?.buffer && (
                <span
                  className="dock-edge-tip"
                  style={{ left: Math.max(30, Math.min(tip.x, (edgeBarRef.current?.clientWidth || 0) - 30)) }}
                  aria-hidden="true"
                >
                  {formatTime(tip.time)}
                </span>
              )}
            </div>
          );
        })()}
        <div className="transport-controls">
          <div
            className="transport-nav"
            onMouseEnter={() => setHoveredNav('prev')}
            onMouseLeave={() => setHoveredNav(null)}
            onFocus={() => setHoveredNav('prev')}
            onBlur={() => setHoveredNav(null)}
          >
            <button className="transport-button hoverable" onClick={playPreviousTrack} disabled={!currentTrack || audio.currentTrackIndex === 0} aria-label={prevTrack ? `Previous track: ${shortName(prevTrack.file.name)}` : 'Previous track'} title={prevTrack ? `Previous: ${shortName(prevTrack.file.name)}` : 'No previous track'}>
              <FiSkipBack />
            </button>
            {hoveredNav === 'prev' && (
              <span className="nav-preview" role="status">{prevTrack ? `◀ ${shortName(prevTrack.file.name)}` : 'No previous track'}</span>
            )}
          </div>
          <button className="play-button hoverable" onClick={togglePlayback} disabled={!currentTrack?.buffer || currentTrack.isLoading} aria-label={audio.isPlaying ? 'Pause' : 'Play'} title={audio.isPlaying ? 'Pause (Space)' : 'Play (Space)'}>
            {audio.isPlaying ? <FiPause /> : <FiPlay className="play-glyph" />}
          </button>
          <div
            className="transport-nav"
            onMouseEnter={() => setHoveredNav('next')}
            onMouseLeave={() => setHoveredNav(null)}
            onFocus={() => setHoveredNav('next')}
            onBlur={() => setHoveredNav(null)}
          >
            <button className="transport-button hoverable" onClick={playNextTrack} disabled={!currentTrack || audio.currentTrackIndex >= audio.playlist.length - 1} aria-label={nextTrack ? `Next track: ${shortName(nextTrack.file.name)}` : 'Next track'} title={nextTrack ? `Next: ${shortName(nextTrack.file.name)}` : 'No next track'}>
              <FiSkipForward />
            </button>
            {hoveredNav === 'next' && (
              <span className="nav-preview" role="status">{nextTrack ? `${shortName(nextTrack.file.name)} ▶` : 'No next track'}</span>
            )}
          </div>
          <span className="dock-time">{formatTime(audio.currentTime)} / {formatTime((currentTrack?.duration || 0) / effects.playbackRate)}</span>
        </div>
        <div className="dock-tools">
          <div className="loop-switch loop-icons" role="group" aria-label="Repeat mode">
            <button
              className={`loop-button hoverable ${loopMode === 'once' ? 'active' : ''}`}
              onClick={() => setLoopMode('once')}
              aria-pressed={loopMode === 'once'}
              title="Play once — stop when this track ends"
              aria-label="Play once"
            >
              <FiPlay aria-hidden="true" />
            </button>
            <button
              className={`loop-button hoverable ${loopMode === 'all' ? 'active' : ''}`}
              onClick={() => setLoopMode('all')}
              aria-pressed={loopMode === 'all'}
              title="Play through the whole queue"
              aria-label="Repeat queue"
            >
              <FiRepeat aria-hidden="true" />
            </button>
            <button
              className={`loop-button hoverable ${loopMode === 'one' ? 'active' : ''}`}
              onClick={() => setLoopMode('one')}
              aria-pressed={loopMode === 'one'}
              title="Replay — loop the current track"
              aria-label="Replay track"
            >
              <FiRotateCcw aria-hidden="true" />
            </button>
          </div>
          <div className="volume-control">
            <button
              className="volume-mute hoverable"
              onClick={() => setMuted(m => !m)}
              aria-label={muted ? 'Unmute' : 'Mute'}
              aria-pressed={muted}
              title={muted ? 'Unmute' : 'Mute'}
            >
              {muted || volume === 0 ? <FiVolumeX aria-hidden="true" /> : <FiVolume2 aria-hidden="true" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={muted ? 0 : volume}
              onChange={(e) => { setMuted(false); setVolume(Number(e.target.value)); }}
              aria-label="Volume"
              aria-valuetext={`${Math.round((muted ? 0 : volume) * 100)} percent`}
              title={`Volume ${Math.round((muted ? 0 : volume) * 100)}%`}
            />
            <output className="volume-readout" aria-hidden="true">{Math.round((muted ? 0 : volume) * 100)}</output>
          </div>
          <button
            className="dock-download hoverable"
            onClick={exportSelection}
            disabled={!currentTrack?.buffer || isExporting}
            title={currentTrack?.buffer ? 'Download this mix as WAV' : 'Load a track to enable download'}
            aria-label="Download mix as WAV"
          >
            <FiDownload aria-hidden="true" /><span>{isExporting ? 'Rendering…' : 'Download'}</span>
          </button>
          <button className={`hoverable ${isPlaylistOpen ? 'active' : ''}`} onClick={() => setIsPlaylistOpen(true)} aria-label="Open queue" aria-expanded={isPlaylistOpen} aria-controls="queue-title" title={`Open queue (${audio.playlist.length})`}>
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
        <aside ref={queuePanelRef} tabIndex={-1} className="studio-drawer queue-drawer" role="dialog" aria-modal="true" aria-labelledby="queue-title">
          <header className="drawer-heading">
            <div><p className="overline">Session</p><h2 id="queue-title">Track queue <span>{audio.playlist.length}</span></h2></div>
            <button className="icon-button" onClick={() => setIsPlaylistOpen(false)} aria-label="Close queue"><FiX /></button>
          </header>
          <div className="queue-actions">
            <label className="secondary-button hoverable" title="Add audio files to the queue"><FiUploadCloud /> Add tracks<input type="file" accept="audio/*" onChange={handleFileUpload} multiple /></label>
            <button className="text-button danger hoverable" onClick={() => setPendingClear(true)} disabled={!audio.playlist.length} title="Remove all tracks"><FiTrash2 /> Clear</button>
          </div>
          <div className="queue-link">
            <LinkImport compact onFile={handleRemoteFile} />
          </div>
          {sessionCache.length > 0 && audio.playlist.length === 0 && (
            <div className="queue-restore">
              <div>
                <strong>{sessionCache.length} saved track{sessionCache.length === 1 ? '' : 's'} from last time</strong>
                <small>Nothing loads until you ask — click to decode.</small>
              </div>
              <button className="secondary-button hoverable" onClick={() => void restoreSessionOnDemand()} disabled={isSessionRestoring}>
                {isSessionRestoring ? 'Loading…' : 'Restore session'}
              </button>
            </div>
          )}
          {pendingClear && (
            <div className="queue-confirm" role="alertdialog" aria-label="Confirm clearing the queue">
              <p>Remove all {audio.playlist.length} track{audio.playlist.length === 1 ? '' : 's'} from this session?</p>
              <div>
                <button className="text-button" onClick={() => setPendingClear(false)}>Cancel</button>
                <button className="text-button danger" onClick={() => { setPendingClear(false); clearPlaylist(); }}>Clear all</button>
              </div>
            </div>
          )}
          <div className="queue-list">
            {audio.playlist.map((track, index) => (
              <article className={`queue-item ${index === audio.currentTrackIndex ? 'active' : ''}`} key={track.id} title={index === audio.currentTrackIndex ? 'Now editing' : `Play ${track.file.name.replace(/\.[^/.]+$/, '')}`}>
                <button className="queue-select hoverable" onClick={() => playTrack(index)} title={`Play ${track.file.name.replace(/\.[^/.]+$/, '')}`}>
                  <span className="queue-index">{index === audio.currentTrackIndex && audio.isPlaying ? <FiActivity /> : String(index + 1).padStart(2, '0')}</span>
                  <span><strong>{track.file.name.replace(/\.[^/.]+$/, '')}</strong><small>{track.isLoading ? 'Preparing audio…' : formatTime(track.duration)}</small></span>
                </button>
                <button className="queue-remove hoverable" onClick={() => removeTrack(track.id)} aria-label={`Remove ${track.file.name}`} title={`Remove ${track.file.name.replace(/\.[^/.]+$/, '')}`}><FiX /></button>
              </article>
            ))}
            {!audio.playlist.length && sessionCache.length === 0 && <div className="queue-empty"><FiMusic /><strong>Queue is empty</strong><span>Add tracks to keep listening.</span></div>}
            {!audio.playlist.length && sessionCache.length > 0 && <div className="queue-empty"><FiMusic /><strong>Queue is empty</strong><span>Restore your last session above, or add fresh tracks.</span></div>}
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

      {cacheNotice && (
        <div className="status-toast" role="status">
          <FiInfo aria-hidden="true" />
          <span>{cacheNotice}</span>
          <button onClick={() => setCacheNotice(null)} aria-label="Dismiss message"><FiX /></button>
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
