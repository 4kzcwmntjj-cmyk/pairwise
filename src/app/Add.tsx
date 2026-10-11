import { useMemo, useState } from 'react';
import { searchAniList } from '../anilist/catalogue';
import { addEntry, franchiseFor, toItem, type RawMedia } from '../anilist/group';
import type { Item } from '../types';
import { Cover } from './Cover';
import { metaLine } from './meta';
import type { AppState } from './useApp';

const STATUS_LABEL = { seen: 'Seen', unseen: "Haven't seen" } as const;

export function Add({ app, onOpen }: { app: AppState; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<RawMedia[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const local = useMemo(() => {
    if (q.length < 2) return [];
    return app.allItems
      .filter((i) => [i.title, i.titleEnglish, i.titleRomaji].some((t) => t?.toLowerCase().includes(q)))
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 20);
  }, [q, app.allItems]);

  const entryOwner = useMemo(() => {
    const m = new Map<number, Item>();
    for (const i of app.allItems) for (const e of i.entryIds) m.set(e, i);
    return m;
  }, [app.allItems]);

  async function search() {
    if (!q) return;
    setBusy(true);
    setError(null);
    try {
      setRemote(await searchAniList(query.trim()));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addRemote(m: RawMedia) {
    const owned = entryOwner.get(m.id);
    if (owned) return onOpen(owned.id);
    // New entries join the catalogue's own franchise; your grouping changes then apply on top.
    const parent = franchiseFor(m, app.baseItems);
    const item = parent ? addEntry(parent, m) : toItem([m]);
    await app.saveItems([item]);
    onOpen(app.resolveId(item.id));
  }

  const row = (item: Item) => {
    const title = app.title(item);
    const mark = app.marks.get(item.id);
    return (
      <li key={item.id}>
        <button className="rank-row" onClick={() => onOpen(item.id)}>
          <Cover item={item} title={title} size="sm" />
          <span className="rank-body">
            <span className="rank-title">{title}</span>
            <span className="rank-meta">{metaLine(item)}</span>
          </span>
          <span className="status-note">{mark ? STATUS_LABEL[mark.status] : 'Not sorted'}</span>
        </button>
      </li>
    );
  };

  return (
    <div className="screen-body add">
      <form
        className="search-form"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <input
          id="add-search"
          className="search"
          type="search"
          placeholder="Search by title"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setRemote(null);
          }}
          autoFocus
        />
        <button className="btn" type="submit" disabled={!q || busy}>
          {busy ? 'Searching…' : 'Search AniList'}
        </button>
      </form>
      <p className="hint">Matches in your catalogue show as you type. Search AniList for anything older or less popular, anime or manga.</p>
      {error && <p className="error">{error}</p>}

      {local.length > 0 && (
        <>
          <h3 className="list-heading">In your catalogue</h3>
          <ol className="rank-list">{local.map(row)}</ol>
        </>
      )}

      {remote && (
        <>
          <h3 className="list-heading">From AniList</h3>
          {remote.length === 0 ? (
            <p className="empty-list">AniList has nothing matching "{query.trim()}".</p>
          ) : (
            <ol className="rank-list">
              {remote.map((m) => {
                const owned = entryOwner.get(m.id);
                const preview = toItem([m]);
                const title = app.title(preview);
                return (
                  <li key={m.id}>
                    <button className="rank-row" onClick={() => addRemote(m)}>
                      <Cover item={preview} title={title} size="sm" />
                      <span className="rank-body">
                        <span className="rank-title">{title}</span>
                        <span className="rank-meta">{metaLine(preview)}</span>
                      </span>
                      <span className="status-note">{owned ? `Part of ${app.title(owned)}` : 'Add'}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
