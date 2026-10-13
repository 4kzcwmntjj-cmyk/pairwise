import { useEffect, useMemo, useState } from 'react';
import { MAX_NAME, type SentList } from '../rank/listLink';
import { myPage, myPageLink, viewNoun } from './page';
import { PictureButton } from './ShareButtons';
import { copyLink, shareLink } from './share';
import { renderTop } from './shareImage';
import { useTaste } from './useTaste';
import type { AppState } from './useApp';

export { pageUrl } from './page';

/**
 * Share my page: a link to your ranking and Taste cards, as you see them in this view. Nothing is uploaded;
 * the page sits in the link. With `at`, the link opens at that Taste card.
 */
export function SendList({
  app,
  at,
  onClose,
  onPreview,
}: {
  app: AppState;
  at?: string;
  onClose: () => void;
  onPreview: (page: SentList) => void;
}) {
  const [name, setName] = useState(app.myName);
  const [status, setStatus] = useState<string | null>(null);
  /** The link written out, when copying didn't work, to select by hand. */
  const [manual, setManual] = useState<string | null>(null);
  const { cards } = useTaste(app);
  const canShare = typeof navigator.share === 'function';
  const count = app.fit.order.length;
  const noun = viewNoun(app.view);
  const atCard = at ? cards.find((c) => c.id === at) : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const page = useMemo(
    () => myPage({ name, view: app.view, order: app.fit.order, itemById: app.itemById, cards }),
    [name, app.view, app.fit.order, app.itemById, cards],
  );
  const shareTitle = name.trim() ? `${name.trim()}'s Shōbu` : 'My Shōbu';

  // Safari only allows sharing and copying straight from the tap, so those come first and the name is saved alongside.
  function share() {
    setStatus(null);
    setManual(null);
    app.setMyName(name).catch(() => undefined);
    shareLink(myPageLink(page, at), shareTitle, atCard ? `${atCard.kicker}: ${atCard.headline}` : undefined).then((o) => {
      setStatus(o.status);
      setManual(o.manual ?? null);
    });
  }

  function copy() {
    setStatus(null);
    setManual(null);
    app.setMyName(name).catch(() => undefined);
    copyLink(myPageLink(page, at)).then((o) => {
      setStatus(o.status);
      setManual(o.manual ?? null);
    });
  }

  const top = app.fit.order.slice(0, 10);
  async function drawTop() {
    const rows = top.flatMap((id, i) => {
      const item = app.itemById.get(id);
      if (!item) return [];
      const look = app.look(item);
      return [{ rank: i + 1, title: app.title(item), meta: look.short, cover: look.coverLarge ?? look.cover, color: look.coverColor }];
    });
    const { blob, missing } = await renderTop(rows, `My top ${rows.length} ${noun}`);
    return { blob, missing };
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet send-sheet" role="dialog" aria-modal="true" aria-label="Share my page" onClick={(e) => e.stopPropagation()}>
        <button className="sheet-close btn btn-quiet btn-small" onClick={onClose}>
          Close
        </button>
        <h3 className="sheet-label">Share my page</h3>
        <p>
          Your page shows your {noun} ranking ({count.toLocaleString()} {count === 1 ? 'title' : 'titles'})
          {cards.length > 0 ? ' and your Taste cards' : ''}, as you see them now. It sits in the link itself; nothing is
          uploaded.{atCard ? ` The link opens at ${atCard.kicker}.` : ''}
        </p>
        <label className="field">
          <span>Your name, as friends will see it</span>
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
          <button
            className="btn btn-quiet"
            onClick={() => {
              app.setMyName(name).catch(() => undefined);
              onPreview(page);
            }}
          >
            See my page
          </button>
        </div>
        {status && (
          <p className="hint" role="status">
            {status}
          </p>
        )}
        {manual && <textarea className="link-text" readOnly value={manual} rows={4} onFocus={(e) => e.currentTarget.select()} />}
        {!at && top.length >= 3 && (
          <div className="send-picture action-row start">
            <PictureButton
              make={drawTop}
              drawKey={top.join('|')}
              filename={`shobu-top-${top.length}`}
              title={`My top ${top.length} ${noun}`}
              label={`Top ${top.length} as a picture`}
              eager
              onStatus={setStatus}
            />
          </div>
        )}
        <p className="hint">The link shows your page as it is now. Send a new one after more duels.</p>
      </div>
    </div>
  );
}
