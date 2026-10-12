import { useMemo, useState } from 'react';
import { MIN_RANKED, recommend } from '../rank/recommend';
import { Cover } from './Cover';
import type { AppState } from './useApp';

export function ForYou({ app, onOpen, onSort }: { app: AppState; onOpen: (id: string) => void; onSort: () => void }) {
  const [justHidden, setJustHidden] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const hiddenKeys = useMemo(() => new Set(app.dismissed), [app.dismissed]);
  const isHidden = (entryIds: number[]) => entryIds.some((e) => hiddenKeys.has(String(e)));
  const recs = useMemo(() => recommend(app.items, app.fit, app.marks, 400), [app.items, app.fit, app.marks]);
  const shown = recs.filter((r) => !isHidden(r.item.entryIds)).slice(0, 50);
  const hidden = app.items.filter((i) => isHidden(i.entryIds) && app.marks.get(i.id)?.status !== 'seen');

  const hide = async (id: string) => {
    await app.dismiss(id, true);
    setJustHidden(id);
  };

  if (app.fit.order.length < MIN_RANKED) {
    return (
      <main className="screen empty">
        <h2>Nothing to go on yet</h2>
        <p>Mark a few titles as seen in the Library and do some duels. Suggestions come from the shows you rank highest.</p>
        <button className="btn btn-primary" onClick={onSort}>
          Go to the Library
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
        Titles you haven't logged as seen, from AniList users' recommendations for the shows you rank highest, and the genres
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
              <li key={item.id} className="rec-item">
                <button className="rank-row rec-row" onClick={() => onOpen(item.id)}>
                  <Cover look={app.look(item)} title={title} size="sm" />
                  <span className="rank-body">
                    <span className="rank-title">{title}</span>
                    <span className="rank-meta">{app.look(item).meta}</span>
                    <span className="rec-reason">{reason}</span>
                  </span>
                  {status === 'unseen' && <span className="status-note">Logged as not seen</span>}
                </button>
                <button className="btn btn-quiet btn-small rec-hide" onClick={() => hide(item.id)}>
                  Not interested
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {justHidden && app.itemById.get(justHidden) && (
        <p className="toast" role="status">
          Hidden {app.title(app.itemById.get(justHidden)!)}.{' '}
          <button
            className="btn btn-quiet btn-small"
            onClick={async () => {
              await app.dismiss(justHidden, false);
              setJustHidden(null);
            }}
          >
            Undo
          </button>
        </p>
      )}
      {hidden.length > 0 && (
        <section className="hidden-recs">
          <button className="btn btn-quiet btn-small" onClick={() => setShowHidden(!showHidden)}>
            {showHidden ? 'Hide the list' : `Hidden suggestions (${hidden.length})`}
          </button>
          {showHidden && (
            <ul className="op-list">
              {hidden.map((i) => (
                <li key={i.id}>
                  <span>{app.title(i)}</span>
                  <button className="btn btn-quiet btn-small" onClick={() => app.dismiss(i.id, false)}>
                    Show again
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
