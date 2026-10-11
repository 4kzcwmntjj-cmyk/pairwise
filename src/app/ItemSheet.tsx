import { useEffect, useMemo } from 'react';
import { PLACED_AFTER } from '../rank/pairs';
import { TIERS } from '../types';
import { Cover } from './Cover';
import { anilistUrl, metaLine } from './meta';
import { TIER_HELP } from './Sort';
import type { AppState } from './useApp';

export function ItemSheet({ app, itemId, onClose }: { app: AppState; itemId: string; onClose: () => void }) {
  const item = app.itemById.get(itemId);
  const mark = app.marks.get(itemId);

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

        <p className="sheet-label">Starting tier</p>
        <div className="tier-row compact">
          {TIERS.map((t) => (
            <button
              key={t}
              className={`tier-btn tier-${t} ${mark?.status === 'seen' && mark.tier === t ? 'is-current' : ''}`}
              aria-pressed={mark?.status === 'seen' && mark.tier === t}
              title={TIER_HELP[t]}
              onClick={() => app.markItem(itemId, 'seen', t)}
            >
              <span className="tier-letter">{t}</span>
            </button>
          ))}
        </div>
        <p className="hint">The tier only sets where a title starts. Duels decide its rank.</p>
        <div className="action-row">
          <button className="btn" aria-pressed={mark?.status === 'unseen'} onClick={() => app.markItem(itemId, 'unseen')}>
            Haven't seen
          </button>
          <button className="btn" aria-pressed={mark?.status === 'want'} onClick={() => app.markItem(itemId, 'want')}>
            Want to watch
          </button>
          {mark && (
            <button className="btn btn-quiet" onClick={() => app.clearMark(itemId)}>
              Back to Sort
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
