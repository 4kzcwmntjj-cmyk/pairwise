import { useMemo, useState } from 'react';
import { isSettled as isSettledIn } from '../rank/stats';
import { Cover } from './Cover';
import { renderTop } from './shareImage';
import { SharePreview } from './SharePreview';
import type { AppState } from './useApp';

export function Ranking({
  app,
  onOpen,
  onCompare,
  onDuel,
}: {
  app: AppState;
  onOpen: (id: string) => void;
  onCompare: () => void;
  onDuel: () => void;
}) {
  const [query, setQuery] = useState('');
  const [previewing, setPreviewing] = useState(false);

  const lists = useMemo(() => {
    return { ranked: app.fit.order.map((id) => app.itemById.get(id)!).filter(Boolean) };
  }, [app.fit, app.itemById]);

  const top = app.fit.order.slice(0, 10);
  const settled = top.filter((id) => isSettledIn(app.fit, id)).length;
  const noun = app.view === 'both' ? 'anime and manga' : app.view;
  async function drawTop() {
    const rows = top.flatMap((id, i) => {
      const item = app.itemById.get(id);
      if (!item) return [];
      const look = app.look(item);
      return [{ rank: i + 1, title: app.title(item), meta: look.short, cover: look.coverLarge ?? look.cover, color: look.coverColor }];
    });
    const { blob, missing } = await renderTop(rows, `My top ${rows.length} ${noun}`);
    return { blob, note: missing ? `${missing} of ${rows.length} covers didn't load.` : undefined };
  }
  const q = query.trim().toLowerCase();
  const shown = lists.ranked.filter(
    (i) => !q || [i.title, i.titleEnglish, i.titleRomaji].some((t) => t?.toLowerCase().includes(q)),
  );

  if (lists.ranked.length === 0) {
    return (
      <main className="screen empty">
        <h2>Nothing ranked yet</h2>
        <p>Titles join your ranking when you pick them in a duel or log them as seen in the Library.</p>
        <button className="btn btn-primary" onClick={onDuel}>
          Go to Duel
        </button>
        <button className="btn btn-quiet btn-small" onClick={onCompare}>
          Compare with a friend
        </button>
      </main>
    );
  }

  const anySettled = app.fit.order.some((id) => isSettledIn(app.fit, id));

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
        <div className="action-row start">
          {top.length >= 3 && (
            <button className="btn btn-small" onClick={() => setPreviewing(true)}>
              Share top {Math.min(top.length, 10)}
            </button>
          )}
          <button className="btn btn-small" onClick={onCompare}>
            Compare{app.friends.length > 0 ? ` (${app.friends.length})` : ' with a friend'}
          </button>
        </div>
        {anySettled && (
          <p className="hint">
            A tick <SettledMark /> marks a settled title: more duels are unlikely to move it far.
            {top.length >= 10 && ` ${settled} of your top 10 are settled.`}
          </p>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="empty-list">Nothing ranked matches "{query.trim()}".</p>
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
                          <span className="nowrap">
                            {duels === 0 ? 'no duels' : duels === 1 ? '1 duel' : `${duels} duels`}
                            {isSettled && <SettledMark label />}
                          </span>
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
      {previewing && (
        <SharePreview
          title={`My top ${top.length} ${noun}`}
          filename={`shobu-top-${top.length}`}
          make={drawTop}
          onClose={() => setPreviewing(false)}
        />
      )}
    </main>
  );
}

/** The tick after a settled title's duel count. With `label`, screen readers hear "settled". */
function SettledMark({ label }: { label?: boolean }) {
  return (
    <svg
      className="settled-mark"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      role={label ? 'img' : undefined}
      aria-label={label ? 'settled' : undefined}
      aria-hidden={label ? undefined : true}
    >
      {label && <title>Settled</title>}
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
