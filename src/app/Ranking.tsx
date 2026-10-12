import { useMemo, useState } from 'react';
import { isSettled as isSettledIn } from '../rank/stats';
import { Cover } from './Cover';
import { saveFile } from './saveCopy';
import { renderTop } from './shareImage';
import type { AppState } from './useApp';

export function Ranking({ app, onOpen }: { app: AppState; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [sharing, setSharing] = useState<string | null>(null);

  const lists = useMemo(() => {
    return { ranked: app.fit.order.map((id) => app.itemById.get(id)!).filter(Boolean) };
  }, [app.fit, app.itemById]);

  const top = app.fit.order.slice(0, 10);
  const settled = top.filter((id) => isSettledIn(app.fit, id)).length;
  async function shareTop() {
    setSharing('Drawing…');
    try {
      const rows = top.flatMap((id, i) => {
        const item = app.itemById.get(id);
        if (!item) return [];
        const look = app.look(item);
        return [{ rank: i + 1, title: app.title(item), meta: look.short, cover: look.coverLarge ?? look.cover, color: look.coverColor }];
      });
      const noun = app.view === 'both' ? 'anime and manga' : app.view;
      const blob = await renderTop(rows, `My top ${rows.length} ${noun}`);
      const result = await saveFile(new File([blob], `shobu-top-${rows.length}.png`, { type: 'image/png' }));
      setSharing(result === 'shared' ? 'Shared.' : result === 'downloaded' ? 'Saved the picture.' : null);
    } catch (e) {
      setSharing((e as Error).message);
    }
  }
  const q = query.trim().toLowerCase();
  const shown = lists.ranked.filter(
    (i) => !q || [i.title, i.titleEnglish, i.titleRomaji].some((t) => t?.toLowerCase().includes(q)),
  );

  return (
    <main className="screen ranking">
      <div className="ranking-head">
        <input
          id="ranking-filter"
          className="search"
          type="search"
          placeholder="Filter this list"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {top.length >= 3 && (
          <div className="action-row start">
            <button className="btn btn-small" onClick={shareTop} disabled={sharing === 'Drawing…'}>
              Share top {Math.min(top.length, 10)}
            </button>
            {sharing && <span className="hint" role="status">{sharing}</span>}
          </div>
        )}
        {top.length >= 10 && (
          <p className="hint">
            {settled} of your top 10 are settled. A title is settled once more duels are unlikely to move it far.
          </p>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="empty-list">
          {q ? `Nothing ranked matches "${query.trim()}".` : 'Titles you mark as seen will be ranked here.'}
        </p>
      ) : (
        <ol className="rank-list">
          {shown.map((item) => {
            const rank = app.rankOf.get(item.id);
            const duels = app.fit.duels.get(item.id) ?? 0;
            const isSettled = isSettledIn(app.fit, item.id);
            const title = app.title(item);
            return (
              <li key={item.id}>
                <button className="rank-row" onClick={() => onOpen(item.id)}>
                  {<span className="rank-num">{rank}</span>}
                  <Cover look={app.look(item)} title={title} size="sm" />
                  <span className="rank-body">
                    <span className="rank-title">{title}</span>
                    <span className="rank-meta">
                      {app.look(item).short}
                      {(
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
