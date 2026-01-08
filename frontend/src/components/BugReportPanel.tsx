import { useEffect } from 'react';

interface Props {
  open: boolean;
  title: string;
  description: string;
  email: string;
  submitting: boolean;
  message: string | null;
  onClose: () => void;
  onChangeTitle: (v: string) => void;
  onChangeDescription: (v: string) => void;
  onChangeEmail: (v: string) => void;
  onSubmit: () => void;
}

const TITLE_MAX = 200;
const DESC_MAX = 5000;
const EMAIL_MAX = 200;

export default function BugReportPanel({
  open,
  title,
  description,
  email,
  submitting,
  message,
  onClose,
  onChangeTitle,
  onChangeDescription,
  onChangeEmail,
  onSubmit,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if ((e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        onSubmit();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, onSubmit]);

  if (!open) return null;

  const canSubmit = title.trim().length > 0 && description.trim().length > 0 && !submitting;

  return (
    <div className={`drawer-overlay ${open ? 'open' : ''}`} onClick={onClose}>
      <aside className={`drawer ${open ? 'open' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <h3>Report a Bug</h3>
          <button className="icon-btn" onClick={onClose} title="Close">✕</button>
        </div>
        <div className="drawer-body">
          <div className="form-row">
            <label>Title <span className="muted">({title.length}/{TITLE_MAX})</span></label>
            <input
              value={title}
              onChange={(e) => onChangeTitle(e.target.value.slice(0, TITLE_MAX))}
              maxLength={TITLE_MAX}
              placeholder="Short summary"
              autoFocus
            />
          </div>
          <div className="form-row">
            <label>Description <span className="muted">({description.length}/{DESC_MAX})</span></label>
            <textarea
              value={description}
              onChange={(e) => onChangeDescription(e.target.value.slice(0, DESC_MAX))}
              rows={8}
              maxLength={DESC_MAX}
              placeholder="What happened? Steps to reproduce, expected vs actual."
            />
          </div>
          <div className="form-row">
            <label>Email <span className="muted">optional</span></label>
            <input
              type="email"
              value={email}
              onChange={(e) => onChangeEmail(e.target.value.slice(0, EMAIL_MAX))}
              maxLength={EMAIL_MAX}
              placeholder="you@example.com"
            />
          </div>
          {message && <div className="notice info">{message}</div>}
        </div>
        <div className="drawer-actions">
          <button className="button-secondary" onClick={onClose}>Cancel</button>
          <button className="button-primary" disabled={!canSubmit} onClick={onSubmit}>
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </aside>
    </div>
  );
}
