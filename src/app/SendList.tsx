import { useEffect, useState } from 'react';
import { listLink, MAX_NAME } from '../rank/listLink';
import type { AppState } from './useApp';

const today = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** The page's own address, for links back into the app. */
export const pageUrl = () => `${location.origin}${location.pathname}`;

/** Makes a link holding your ranked list, to share or copy. Nothing is uploaded: the list is in the link. */
export function SendList({ app, onClose }: { app: AppState; onClose: () => void }) {
  const [name, setName] = useState(app.myName);
  const [status, setStatus] = useState<string | null>(null);
  /** The link written out, when copying didn't work, to select by hand. */
  const [manual, setManual] = useState<string | null>(null);
  const count = app.myEntries.length;
  const canShare = typeof navigator.share === 'function';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const link = () => listLink(pageUrl(), { name, made: today(), entries: app.myEntries });

  // Safari only allows sharing and copying straight from the tap, so those come first and the name is saved alongside.
  async function share() {
    setStatus(null);
    app.setMyName(name).catch(() => undefined);
    try {
      await navigator.share({ title: name.trim() ? `${name.trim()}'s Shōbu list` : 'My Shōbu list', url: link() });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setStatus("Couldn't open the share menu. Copy the link instead.");
    }
  }

  async function copy() {
    setStatus(null);
    app.setMyName(name).catch(() => undefined);
    try {
      await navigator.clipboard.writeText(link());
      setStatus('Link copied.');
    } catch {
      setStatus("Couldn't copy the link here. Select it below and copy it.");
      setManual(link());
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet send-sheet" role="dialog" aria-modal="true" aria-label="Send my list" onClick={(e) => e.stopPropagation()}>
        <button className="sheet-close btn btn-quiet btn-small" onClick={onClose}>
          Close
        </button>
        <h3 className="sheet-label">Send my list</h3>
        <p>
          The link holds your ranking: {count.toLocaleString()} {count === 1 ? 'title' : 'titles'}, anime and manga together, best
          first. The list sits in the link itself and isn't uploaded anywhere. Whoever opens it sees how your lists compare,
          and can send theirs back.
        </p>
        <label className="field">
          <span>Your name, as your friend will see it</span>
          <input
            id="send-name"
            className="search"
            type="text"
            value={name}
            maxLength={MAX_NAME}
            placeholder="Optional"
            autoComplete="nickname"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="action-row start">
          {canShare && (
            <button className="btn btn-primary" onClick={share}>
              Share link
            </button>
          )}
          <button className={canShare ? 'btn' : 'btn btn-primary'} onClick={copy}>
            Copy link
          </button>
        </div>
        {status && (
          <p className="hint" role="status">
            {status}
          </p>
        )}
        {manual && <textarea className="link-text" readOnly value={manual} rows={4} onFocus={(e) => e.currentTarget.select()} />}
        <p className="hint">The link shows your list as it is now. Send a new one after more duels.</p>
      </div>
    </div>
  );
}
