import { useEffect, useState } from 'react';
import { renderCard, type CardArt } from './cardImage';
import type { CardSpec } from './cards';
import { sharePicture, shareLink, usePicture, type Picture } from './share';
import type { AppState } from './useApp';

/** Covers and titles for drawing a card, from your titles. */
export function cardArt(app: AppState): (id: string) => CardArt {
  return (id) => {
    const item = app.itemById.get(id);
    if (!item) return { title: id };
    const look = app.look(item);
    return { title: app.title(item), cover: look.coverLarge ?? look.cover, color: look.coverColor };
  };
}

export const drawCard = (card: CardSpec, app: AppState) => () => renderCard(card, cardArt(app)).then(({ blob, missing }) => ({ blob, missing }));

/** What a card's picture shows, so it is drawn again when that changes. */
const cardKey = (c: CardSpec) => [c.id, c.headline, ...c.lines, ...c.covers.map((x) => x.id)].join('|');

/**
 * Shares a picture in one tap: it is drawn once the button has been on screen for a moment, so the tap can
 * open the share sheet straight away (iPhone allows that only from the tap). On a computer the picture downloads.
 */
export function PictureButton({
  make,
  drawKey,
  filename,
  title,
  label = 'Picture',
  eager,
  quiet = true,
  onStatus,
}: {
  make: () => Promise<Picture>;
  drawKey: string;
  filename: string;
  title: string;
  label?: string;
  eager?: boolean;
  quiet?: boolean;
  onStatus: (s: string | null) => void;
}) {
  const { ref, picture, failed, want } = usePicture(make, drawKey, eager);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    if (!waiting) return;
    if (picture) {
      setWaiting(false);
      onStatus(`The picture is ready. Tap ${label} again to share it.`);
    } else if (failed) {
      setWaiting(false);
      onStatus("Couldn't draw the picture.");
    }
  }, [waiting, picture, failed, label, onStatus]);

  function tap() {
    if (picture) {
      onStatus(null);
      sharePicture(picture.blob, filename, title).then(onStatus);
    } else {
      want();
      setWaiting(true);
      onStatus('Drawing the picture…');
    }
  }

  return (
    <button ref={(el) => (ref.current = el)} className={`btn btn-small${quiet ? ' btn-quiet' : ''}`} onClick={tap}>
      {label}
    </button>
  );
}

/**
 * Share and Picture under a card. Share sends a link to your page that opens at this card; with no link
 * (no name saved yet), `onLink` is asked instead, which opens the share sheet.
 */
export function CardShare({
  card,
  app,
  link,
  shareTitle,
  onNoLink,
}: {
  card: CardSpec;
  app: AppState;
  /** The link to your page at this card, or null to send people through the share sheet first. */
  link: ((at: string) => string) | null;
  shareTitle: string;
  onNoLink?: (at: string) => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [manual, setManual] = useState<string | null>(null);

  function share() {
    setStatus(null);
    setManual(null);
    if (!link) return onNoLink?.(card.id);
    shareLink(link(card.id), shareTitle, `${card.kicker}: ${card.headline}`).then((o) => {
      setStatus(o.status);
      setManual(o.manual ?? null);
    });
  }

  return (
    <>
      <div className="action-row start">
        <button className="btn btn-small" onClick={share}>
          Share
        </button>
        <PictureButton
          make={drawCard(card, app)}
          drawKey={cardKey(card)}
          filename={`shobu-${card.id}`}
          title={`${card.kicker}: ${card.headline}`}
          onStatus={setStatus}
        />
      </div>
      {status && (
        <p className="hint share-status" role="status">
          {status}
        </p>
      )}
      {manual && <textarea className="link-text" readOnly value={manual} rows={3} onFocus={(e) => e.currentTarget.select()} />}
    </>
  );
}
