import { useEffect, useMemo } from 'react';
import { PLACED_AFTER } from '../rank/pairs';
import { Cover } from './Cover';
import { choicesFor, chosen, formUnknown } from '../rank/medium';
import { anilistUrl, metaLine } from './meta';
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
  const url = anilistUrl(item);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <button className="sheet-close btn btn-quiet btn-small" onClick={onClose}>
          Close
        </button>
        <div className="sheet-head">
          <Cover item={item} title={title} size="md" />
          <div>
            <h2 className="item-title">{title}</h2>
            <p className="item-meta">{metaLine(item)}</p>
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

        <div className="action-row">
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
          <p className="hint">You marked this as seen before manga was added. Say whether you watched it, read it, or both.</p>
        )}
        {!fullMark && app.groupOps.some((o) => o.kind === 'split' && o.id === itemId) && (
          <p className="hint">Split off from another title. Mark whether you've seen it.</p>
        )}
        <Regroup key={itemId} app={app} item={item} onOpen={onOpen} />
      </div>
    </div>
  );
}
