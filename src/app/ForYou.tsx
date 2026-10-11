import { useMemo } from 'react';
import { MIN_RANKED, recommend } from '../rank/recommend';
import { Cover } from './Cover';
import { metaLine } from './meta';
import type { AppState } from './useApp';

export function ForYou({ app, onOpen, onSort }: { app: AppState; onOpen: (id: string) => void; onSort: () => void }) {
  const recs = useMemo(() => recommend(app.items, app.fit, app.marks, 200), [app.items, app.fit, app.marks]);
  const shown = recs.slice(0, 50);

  if (app.fit.order.length < MIN_RANKED) {
    return (
      <main className="screen empty">
        <h2>Nothing to go on yet</h2>
        <p>Mark a few titles as seen and do some duels. Suggestions come from the shows you rank highest.</p>
        <button className="btn btn-primary" onClick={onSort}>
          Go to Sort
        </button>
      </main>
    );
  }

  const name = (id: string) => {
    const it = app.itemById.get(id);
    return it ? `${app.title(it)} (#${app.rankOf.get(id)})` : '';
  };

  return (
    <main className="screen for-you">
      <p className="hint">
        Titles you haven't marked as seen, from AniList users' recommendations for the shows you rank highest, and the genres
        you rank well. They sharpen as your ranking settles.
      </p>
      {shown.length === 0 ? (
        <p className="empty-list">
          No suggestions yet. Rank a few more titles.
        </p>
      ) : (
        <ol className="rank-list">
          {shown.map(({ item, because, genres }) => {
            const title = app.title(item);
            const status = app.marks.get(item.id)?.status;
            const reason = because.length
              ? `Because you rank ${because.slice(0, 2).sort((x, y) => (app.rankOf.get(x) ?? 0) - (app.rankOf.get(y) ?? 0)).map(name).join(' and ')} highly`
              : `Genres you rank well: ${genres.slice(0, 3).join(', ')}`;
            return (
              <li key={item.id}>
                <button className="rank-row rec-row" onClick={() => onOpen(item.id)}>
                  <Cover item={item} title={title} size="sm" />
                  <span className="rank-body">
                    <span className="rank-title">{title}</span>
                    <span className="rank-meta">{metaLine(item)}</span>
                    <span className="rec-reason">{reason}</span>
                  </span>
                  {status === 'unseen' && <span className="status-note">Marked not seen</span>}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
