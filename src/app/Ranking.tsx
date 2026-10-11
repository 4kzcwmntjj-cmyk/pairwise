import { useMemo, useState } from 'react';
import { PLACED_AFTER } from '../rank/pairs';
import type { Item, Status } from '../types';
import { Cover } from './Cover';
import { years } from './meta';
import type { AppState } from './useApp';

type View = 'ranked' | 'unseen';
const SETTLED_SE = 0.5;

export function Ranking({ app, onOpen }: { app: AppState; onOpen: (id: string) => void }) {
  const [view, setView] = useState<View>('ranked');
  const [query, setQuery] = useState('');

  const lists = useMemo(() => {
    const byStatus = (s: Status) =>
      [...app.marks.values()]
        .filter((m) => m.status === s)
        .map((m) => app.itemById.get(m.itemId))
        .filter((i): i is Item => !!i)
        .sort((x, y) => y.popularity - x.popularity);
    return {
      ranked: app.fit.order.map((id) => app.itemById.get(id)!).filter(Boolean),
      unseen: byStatus('unseen'),
    };
  }, [app.fit, app.marks, app.itemById]);

  const top = app.fit.order.slice(0, 10);
  const settled = top.filter((id) => (app.fit.se.get(id) ?? 9) < SETTLED_SE && (app.fit.duels.get(id) ?? 0) >= PLACED_AFTER).length;
  const q = query.trim().toLowerCase();
  const shown = lists[view].filter(
    (i) => !q || [i.title, i.titleEnglish, i.titleRomaji].some((t) => t?.toLowerCase().includes(q)),
  );

  return (
    <main className="screen ranking">
      <div className="ranking-head">
        <div className="segmented" role="tablist">
          {(
            [
              ['ranked', `Ranked (${lists.ranked.length})`],
              ['unseen', `Haven't seen (${lists.unseen.length})`],
            ] as const
          ).map(([v, label]) => (
            <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
              {label}
            </button>
          ))}
        </div>
        <input
          id="ranking-filter"
          className="search"
          type="search"
          placeholder="Filter this list"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {view === 'ranked' && top.length >= 10 && (
          <p className="hint">
            {settled} of your top 10 are settled. A title is settled once more duels are unlikely to move it far.
          </p>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="empty-list">
          {view === 'ranked' ? 'Titles you mark as seen will be ranked here.' : 'Nothing here yet.'}
        </p>
      ) : (
        <ol className="rank-list">
          {shown.map((item) => {
            const rank = app.rankOf.get(item.id);
            const duels = app.fit.duels.get(item.id) ?? 0;
            const isSettled = (app.fit.se.get(item.id) ?? 9) < SETTLED_SE && duels >= PLACED_AFTER;
            const title = app.title(item);
            return (
              <li key={item.id}>
                <button className="rank-row" onClick={() => onOpen(item.id)}>
                  {view === 'ranked' && <span className="rank-num">{rank}</span>}
                  <Cover item={item} title={title} size="sm" />
                  <span className="rank-body">
                    <span className="rank-title">{title}</span>
                    <span className="rank-meta">
                      {[years(item), item.studio].filter(Boolean).join(', ')}
                      {view === 'ranked' && (
                        <>
                          {' · '}
                          {duels === 0 ? 'no duels' : duels === 1 ? '1 duel' : `${duels} duels`}
                          {isSettled ? ', settled' : ''}
                        </>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
