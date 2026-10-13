import { useEffect, useRef, useState } from 'react';
import { useDialogFocus } from './dialogFocus';

/**
 * Full-screen preview of a picture to share. Built to be reused by every card:
 * the caller supplies `make`, which draws the picture for the chosen option.
 * Share opens the system sheet where files can be shared; Save downloads the file.
 * Long-press and screenshot also work on the image.
 */
export interface ShareOption {
  id: string;
  label: string;
}

interface Props {
  /** Shown in the header, and used as the dialog name. */
  title: string;
  /** File name without extension. */
  filename: string;
  /** Draws the picture. Called again when the option changes or Try again is pressed. `note` is shown as a warning. */
  make: (option: string) => Promise<{ blob: Blob; note?: string }>;
  options?: ShareOption[];
  onClose: () => void;
}

export function SharePreview({ title, filename, make, options, onClose }: Props) {
  const [option, setOption] = useState(options?.[0]?.id ?? '');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const makeRef = useRef(make);
  makeRef.current = make;
  const dialog = useRef<HTMLDivElement>(null);
  useDialogFocus(dialog);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    let made: string | null = null;
    setBlob(null);
    setError(null);
    setNote(null);
    setStatus(null);
    makeRef
      .current(option)
      .then(({ blob: b, note: n }) => {
        if (cancelled) return;
        made = URL.createObjectURL(b);
        setBlob(b);
        setUrl(made);
        setNote(n ?? null);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [option, attempt]);

  const file = blob ? new File([blob], `${filename}.png`, { type: 'image/png' }) : null;
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const canShare = !!file && typeof nav.share === 'function' && !!nav.canShare?.({ files: [file] });

  async function share() {
    if (!file) return;
    try {
      await nav.share({ files: [file], title });
      setStatus('Shared.');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setStatus('Could not open the share sheet. Try Save.');
    }
  }

  function save() {
    if (!file) return;
    const href = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = href;
    a.download = file.name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    setStatus('Saved the picture.');
  }

  return (
    <div ref={dialog} tabIndex={-1} className="share-preview" role="dialog" aria-modal="true" aria-label={title}>
      <div className="share-preview-head">
        <h2>{title}</h2>
        <button className="btn btn-small" onClick={onClose}>
          Close
        </button>
      </div>
      {options && options.length > 1 && (
        <div className="share-preview-options" role="group" aria-label="Layout">
          {options.map((o) => (
            <button key={o.id} className={option === o.id ? 'on' : ''} aria-pressed={option === o.id} onClick={() => setOption(o.id)}>
              {o.label}
            </button>
          ))}
        </div>
      )}
      <div className="share-preview-stage">
        {error ? (
          <p className="hint" role="alert">
            {error}
          </p>
        ) : !blob || !url ? (
          <p className="hint" role="status">
            Drawing…
          </p>
        ) : (
          <img src={url} alt={title} />
        )}
      </div>
      <div className="share-preview-actions">
        {canShare && (
          <button className="btn btn-primary" onClick={share}>
            Share
          </button>
        )}
        <button className={canShare ? 'btn' : 'btn btn-primary'} onClick={save} disabled={!file}>
          Save
        </button>
      </div>
      {note && (
        <p className="hint share-preview-note" role="status">
          {note}{' '}
          <button className="btn-link inline" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </p>
      )}
      <p className="hint share-preview-note" role="status">
        {status ?? 'You can also press and hold the picture, or take a screenshot.'}
      </p>
    </div>
  );
}
