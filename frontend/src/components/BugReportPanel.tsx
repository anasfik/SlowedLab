import { useEffect } from 'react';
import { FiX } from 'react-icons/fi';

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
    <div className="modal-layer" onClick={onClose}>
      <aside className="report-dialog" role="dialog" aria-modal="true" aria-labelledby="report-title" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div><p className="overline">Feedback</p><h2 id="report-title">Report a problem</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close report form"><FiX /></button>
        </div>
        <div className="drawer-body">
          <div className="form-row">
            <label htmlFor="bug-title">Title <span>({title.length}/{TITLE_MAX})</span></label>
            <input
              id="bug-title"
              value={title}
              onChange={(e) => onChangeTitle(e.target.value.slice(0, TITLE_MAX))}
              maxLength={TITLE_MAX}
              placeholder="Short summary"
              autoFocus
            />
          </div>
          <div className="form-row">
            <label htmlFor="bug-description">What happened? <span>({description.length}/{DESC_MAX})</span></label>
            <textarea
              id="bug-description"
              value={description}
              onChange={(e) => onChangeDescription(e.target.value.slice(0, DESC_MAX))}
              rows={8}
              maxLength={DESC_MAX}
              placeholder="What happened? Steps to reproduce, expected vs actual."
            />
          </div>
          <div className="form-row">
            <label htmlFor="bug-email">Email <span>optional</span></label>
            <input
              id="bug-email"
              type="email"
              value={email}
              onChange={(e) => onChangeEmail(e.target.value.slice(0, EMAIL_MAX))}
              maxLength={EMAIL_MAX}
              placeholder="you@example.com"
            />
          </div>
          {message && <div className="form-message" role="status">{message}</div>}
        </div>
        <div className="drawer-actions">
          <button className="secondary-button" onClick={onClose}>Cancel</button>
          <button className="primary-button" disabled={!canSubmit} onClick={onSubmit}>
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </aside>
    </div>
  );
}
