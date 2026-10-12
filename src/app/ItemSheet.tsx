import { useEffect, useMemo, useState } from 'react';
import { PLACED_AFTER } from '../rank/pairs';
import { themeTags } from '../rank/findings';
import { Cover } from './Cover';
import { choicesFor, chosen, formUnknown } from '../rank/medium';
import { Regroup } from './Regroup';
import type { AppState } from './useApp';

export function ItemSheet({
  app,
  itemId,
  onClose,
  onOpen,
}: {
  app: AppState;
  itemId: string;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const item = app.itemById.get(itemId);
  // The sheet shows everything known about the title, whichever view is on.
  const fullMark = app.allMarks.get(itemId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const record = useMemo(() => {
    let won = 0;
    let lost = 0;
    let tied = 0;
    for (const v of app.votes) {
      if (v.a !== itemId && v.b !== itemId) continue;
      const other = v.a === itemId ? v.b : v.a;
      if (!app.rankOf.has(other)) continue;
      if (v.outcome === 'tie') tied++;
      else if ((v.outcome === 'a') === (v.a === itemId)) won++;
      else lost++;
    }
    return { won, lost, tied };
  }, [app.votes, app.rankOf, itemId]);

  if (!item) return null;
  const title = app.title(item);
  const rank = app.rankOf.get(itemId);
  const duels = app.fit.duels.get(itemId) ?? 0;
  const look = app.look(item);
  // Genres, then the strongest theme tags (cast and audience tags left out).
  const labels = [...(item.genres ?? []).slice(0, 3), ...themeTags(item)];
  const url = look.url;
  const hidden = item.entryIds.some((e) => app.dismissed.includes(String(e)));

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <button className="sheet-close btn btn-quiet btn-small" onClick={onClose}>
          Close
        </button>
        <div className="sheet-head">
          <Cover look={look} title={title} size="md" />
          <div>
            <h2 className="item-title">{title}</h2>
            <p className="item-meta">{look.meta}</p>
            {labels.length > 0 && <p className="item-tags">{labels.join(' · ')}</p>}
            {rank !== undefined && (
              <p className="sheet-rank">
                <span className="big-rank">#{rank}</span>
                <span>
                  {duels === 0
                    ? 'No duels yet'
                    : `${record.won} won, ${record.lost} lost${record.tied ? `, ${record.tied} too close` : ''}`}
                  {duels > 0 && duels < PLACED_AFTER ? '. Still being placed.' : '.'}
                </span>
              </p>
            )}
            {url && (
              <a className="btn-link" href={url} target="_blank" rel="noreferrer">
                Open on AniList
              </a>
            )}
          </div>
        </div>

        <h3 className="sheet-label">{choicesFor(item, 'both').length === 4 ? 'Which have you seen?' : 'Have you seen it?'}</h3>
        <div className="action-row start">
          {choicesFor(item, 'both').map((c) => (
            <button key={c.label} className="btn" aria-pressed={chosen(item, fullMark, c)} onClick={() => app.answer(itemId, c.answer)}>
              {c.label}
            </button>
          ))}
          {fullMark && (
            <button className="btn btn-quiet" onClick={() => app.clearMark(itemId, 'sort', true)}>
              Unmark
            </button>
          )}
        </div>
        {formUnknown(item, fullMark) && (
          <p className="hint">You logged this as seen before manga was added. Say whether it was the anime, the manga, or both.</p>
        )}
        {!fullMark && app.groupOps.some((o) => o.kind === 'split' && o.id === itemId) && (
          <p className="hint">Split off from another title. Mark whether you've seen it.</p>
        )}
        <FormsApart app={app} itemId={itemId} onOpen={onOpen} />
        <Regroup key={itemId} app={app} item={item} onOpen={onOpen} />
        {fullMark?.status !== 'seen' && item.source === 'anilist' && (
          <section className="sheet-section">
            <h3 className="sheet-label">Picks</h3>
            {hidden ? (
              <div className="action-row start">
                <span className="hint">Hidden from your suggestions.</span>
                <button className="btn btn-quiet btn-small" onClick={() => app.dismiss(itemId, false)}>
                  Show again
                </button>
              </div>
            ) : (
              <div className="action-row start">
                <button className="btn btn-quiet btn-small" onClick={() => app.dismiss(itemId, true)}>
                  Not interested
                </button>
                <span className="hint">Keeps it out of your suggestions.</span>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

/**
 * Ranking a title's anime and manga apart, for adaptations that differ in quality. Offered only once
 * you've said you know both.
 */
function FormsApart({ app, itemId, onOpen }: { app: AppState; itemId: string; onOpen: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const otherId = app.apart.get(itemId);
  const other = otherId ? app.itemById.get(otherId) : undefined;
  if (!other && !app.canRankApart(itemId)) return null;
  const run = async (f: () => Promise<string | undefined>, follow: boolean) => {
    setBusy(true);
    const to = await f();
    setBusy(false);
    // Ranked together from the manga part's card: that title is gone, so show the whole one.
    if (follow && to && to !== itemId) onOpen(to);
  };
  return (
    <section className="sheet-section">
      <h3 className="sheet-label">Anime and manga</h3>
      {other ? (
        <>
          <p className="hint">Ranked apart from {app.title(other)}.</p>
          <div className="action-row start">
            <button className="btn btn-quiet btn-small" onClick={() => onOpen(other.id)}>
              Open {app.title(other)}
            </button>
            <button className="btn btn-quiet btn-small" disabled={busy} onClick={() => run(() => app.rankTogether(itemId), true)}>
              Rank together again
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="hint">
            For when one is much better than the other. Each gets its own place in the ranking. Past duels where the card
            showed the manga go to the manga; the rest stay with the anime.
          </p>
          <button className="btn btn-quiet btn-small" disabled={busy} onClick={() => run(() => app.rankApart(itemId), false)}>
            Rank anime and manga apart
          </button>
        </>
      )}
    </section>
  );
}
