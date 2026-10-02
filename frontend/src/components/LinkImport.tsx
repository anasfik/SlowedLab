import { useEffect, useRef, useState } from 'react';
import { FiDownload, FiLink, FiX } from 'react-icons/fi';
import { FaSoundcloud, FaYoutube } from 'react-icons/fa';

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

function guessPlatform(value: string): 'youtube' | 'soundcloud' | null {
  const v = value.toLowerCase();
  if (/youtu\.?be|youtube|youtube-nocookie/.test(v)) return 'youtube';
  if (/soundcloud|snd\.sc/.test(v)) return 'soundcloud';
  return null;
}

function PlatformLogo({ platform, size = 18 }: { platform: string | null; size?: number }) {
  if (platform === 'youtube') return <FaYoutube size={size} className="logo-youtube" aria-label="YouTube" />;
  if (platform === 'soundcloud') return <FaSoundcloud size={size} className="logo-soundcloud" aria-label="SoundCloud" />;
  return <FiLink size={size} aria-hidden="true" />;
}

export default function LinkImport({ onFile, compact }: LinkImportProps) {
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [meta, setMeta] = useState<Meta | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
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
    setUrl('');
  };

  const resolveWith = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setPhase('resolving');
    setError(null);
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
      setPhase('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that link.');
      setPhase('failed');
    }
  };

  const resolve = () => resolveWith(url);

  const download = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setPhase('working');
    setProgress(0);
    setError(null);
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
        <span className="source-pill youtube"><FaYoutube aria-hidden="true" /> YouTube</span>
        <span className="source-pill soundcloud"><FaSoundcloud aria-hidden="true" /> SoundCloud</span>
      </div>

      <div className={`link-row ${platform ? `has-${platform}` : ''}`}>
        <span className="link-row-logo"><PlatformLogo platform={platform} /></span>
        <label className="sr-only" htmlFor={inputId}>
          Paste a YouTube or SoundCloud link
        </label>
        <input
          id={inputId}
          type="url"
          inputMode="url"
          placeholder="Paste link here — we fetch it automatically"
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
