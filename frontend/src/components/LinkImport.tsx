import { useEffect, useRef, useState } from 'react';
import { FiDownload, FiLink, FiX } from 'react-icons/fi';
import { FaSoundcloud } from 'react-icons/fa';

interface LinkImportProps {
  onFile: (file: File) => void;
  compact?: boolean;
}

interface Meta {
  platform: string;
  title: string;
  duration: number;
  uploader?: string;
}

type Phase = 'idle' | 'resolving' | 'ready' | 'working' | 'failed';

function formatDuration(total: number): string {
  const mins = Math.floor(total / 60);
  const secs = Math.floor(total % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function guessPlatform(value: string): 'soundcloud' | null {
  const v = value.toLowerCase();
  if (/soundcloud|snd\.sc/.test(v)) return 'soundcloud';
  return null;
}

function PlatformLogo({ platform, size = 18 }: { platform: string | null; size?: number }) {
  if (platform === 'soundcloud') return <FaSoundcloud size={size} className="logo-soundcloud" aria-label="SoundCloud" />;
  return <FiLink size={size} aria-hidden="true" />;
}

export default function LinkImport({ onFile, compact }: LinkImportProps) {
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [meta, setMeta] = useState<Meta | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const platform = meta?.platform || guessPlatform(url);

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  const reset = () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    setPhase('idle');
    setMeta(null);
    setProgress(0);
    setError(null);
    setNotice(null);
    setUrl('');
  };

  const resolveWith = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setPhase('resolving');
    setError(null);
    setNotice(null);
    setMeta(null);
    try {
      const res = await fetch('/api/audio/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not read that link.');
      setMeta(data.meta);
      if (data.playlistStripped) {
        setNotice('Mix/playlist parameters were stripped — importing the single video.');
      }
      setPhase('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that link.');
      setPhase('failed');
    }
  };

  const resolve = () => resolveWith(url);

  // Fetch with byte progress. Resolves false when the size is unknown so the
  // caller can show an indeterminate state instead of a fake percentage.
  const fetchWithProgress = async (
    target: string,
    onProgress: (fraction: number | null, loaded: number) => void,
    signal?: AbortSignal
  ): Promise<Blob> => {
    const res = await fetch(target, signal ? { signal } : undefined);
    if (!res.ok) throw new Error(`Direct fetch failed (HTTP ${res.status}).`);
    const totalHeader = res.headers.get('content-length');
    const total = totalHeader ? Number(totalHeader) : NaN;
    if (!res.body || !Number.isFinite(total) || total <= 0) {
      const blob = await res.blob();
      onProgress(null, blob.size);
      return blob;
    }
    const reader = res.body.getReader();
    const chunks: BlobPart[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      onProgress(Math.min(0.99, loaded / total), loaded);
    }
    return new Blob(chunks as BlobPart[]);
  };

  const download = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setPhase('working');
    setProgress(0);
    setError(null);
    // 1) Direct browser fetch first: the visitor's own IP pulls the bytes, so
    // provider IP blocks against our servers don't apply. Falls back to the
    // server queue below on any failure (IP binding, CORS, adblock).
    try {
      setNotice('Fetching directly in your browser…');
      const streamRes = await fetch('/api/audio/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });
      const stream = await streamRes.json();
      if (!streamRes.ok) throw new Error(stream.error || 'Direct fetch unavailable.');
      if (stream.meta) setMeta(stream.meta);
      const blob = await fetchWithProgress(
        stream.streamUrl,
        (fraction, loaded) => {
          if (fraction == null) {
            setProgress(prev => Math.min(99, prev + 7));
            setNotice(`Fetching directly in your browser… ${(loaded / 1048576).toFixed(1)} MB`);
          } else {
            setProgress(Math.round(fraction * 100));
          }
        }
      );
      setProgress(100);
      // Guard: a playlist (m3u8) or error page decodes to EncodingError
      // downstream. Reject it here so the server job queue gets its turn.
      if (
        blob.size < 1024 ||
        /mpegurl|m3u8|^text\//i.test(blob.type || '')
      ) {
        throw new Error('Direct stream was a playlist, not audio.');
      }
      onFile(new File([blob], stream.fileName || 'link-import', { type: stream.mime || blob.type || 'audio/mpeg' }));
      reset();
      return;
    } catch (directErr) {
      console.warn('[link-import] direct browser fetch failed, falling back to server queue', directErr);
      setNotice('Direct fetch blocked — trying our server instead…');
      setProgress(0);
    }
    try {
      const res = await fetch('/api/audio/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Download failed.');
      if (data.meta) setMeta(data.meta);
      pollRef.current = window.setInterval(async () => {
        try {
          const status = await fetch(`/api/audio/jobs/${data.jobId}`);
          const s = await status.json();
          if (!status.ok) throw new Error(s.error || 'Download failed.');
          setProgress(s.job.progress || 0);
          if (s.job.status === 'done') {
            if (pollRef.current) window.clearInterval(pollRef.current);
            const fileRes = await fetch(`${s.job.fileUrl}`);
            if (!fileRes.ok) throw new Error('Could not fetch the finished audio.');
            const blob = await fileRes.blob();
            onFile(new File([blob], s.job.fileName || 'link-import.mp3', { type: 'audio/mpeg' }));
            reset();
          } else if (s.job.status === 'error') {
            throw new Error(s.job.error || 'Download failed.');
          }
        } catch (err) {
          if (pollRef.current) window.clearInterval(pollRef.current);
          setError(err instanceof Error ? err.message : 'Download failed.');
          setPhase('failed');
        }
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed.');
      setPhase('failed');
    }
  };

  const busy = phase === 'resolving' || phase === 'working';
  const inputId = compact ? 'link-url-queue' : 'link-url-empty';

  return (
    <div className={`link-import ${compact ? 'compact' : ''}`}>
      <div className="link-sources">
        <span className="link-step">Paste a link from</span>
        <span className="source-pill soundcloud"><FaSoundcloud aria-hidden="true" /> SoundCloud</span>
      </div>

      <div className={`link-row ${platform ? `has-${platform}` : ''}`}>
        <span className="link-row-logo"><PlatformLogo platform={platform} /></span>
        <label className="sr-only" htmlFor={inputId}>
          Paste a SoundCloud link
        </label>
        <input
          id={inputId}
          type="url"
          inputMode="url"
          placeholder="Paste a SoundCloud link here — we fetch it automatically"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (text.trim()) {
              e.preventDefault();
              setUrl(text.trim());
              resolveWith(text);
            }
          }}
          onKeyDown={(e) => e.key === 'Enter' && !busy && resolve()}
          disabled={busy}
        />
        {phase === 'ready' || phase === 'working' ? (
          <button className="link-cancel" onClick={reset} aria-label="Clear link">
            <FiX />
          </button>
        ) : (
          <button onClick={resolve} disabled={!url.trim() || busy}>
            {phase === 'resolving' ? <span className="link-spinner" aria-label="Reading link" /> : 'Fetch'}
          </button>
        )}
      </div>

      {error && <p className="link-error" role="alert">{error}</p>}
      {notice && !error && <p className="link-note" role="status">{notice}</p>}

      {meta && (phase === 'ready' || phase === 'working') && (
        <div className="link-meta">
          <span className="link-meta-logo"><PlatformLogo platform={meta.platform} size={22} /></span>
          <div>
            <strong>{meta.title}</strong>
            <small>{meta.uploader || 'unknown'} · {formatDuration(meta.duration)}</small>
          </div>
          {phase === 'ready' ? (
            <button className="link-download" onClick={download}>
              <FiDownload /> Add to queue
            </button>
          ) : (
            <div className="link-progress">
              <span>Adding… {progress}%</span>
              <progress max="100" value={progress}>{progress}%</progress>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
