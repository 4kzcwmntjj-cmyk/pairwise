import { useMemo, useState } from 'react';
import type { Item } from '../types';
import { Cover } from './Cover';
import { isManga } from '../anilist/group';
import { formatLabel } from './meta';
import type { AppState } from './useApp';

type Mode = null | 'split' | 'join';

/** Fixing how a title is grouped: split parts of it off, or join another title into it. */
export function Regroup({ app, item, onOpen }: { app: AppState; item: Item; onOpen: (id: string) => void }) {
  const [mode, setMode] = useState<Mode>(null);
  const canSplit = item.entryIds.length > 1;

  return (
    <section className="regroup">
      {mode === null && (
        <div className="action-row start">
          {canSplit && (
            <button className="btn btn-quiet btn-small" onClick={() => setMode('split')}>
              Split up
            </button>
          )}
          <button className="btn btn-quiet btn-small" onClick={() => setMode('join')}>
            Join with another title
          </button>
        </div>
      )}
      {mode === 'split' && <Split app={app} item={item} onOpen={onOpen} onClose={() => setMode(null)} />}
      {mode === 'join' && <Join app={app} item={item} onClose={() => setMode(null)} />}
    </section>
  );
}

function Split({ app, item, onOpen, onClose }: { app: AppState; item: Item; onOpen: (id: string) => void; onClose: () => void }) {
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [made, setMade] = useState<string[] | null>(null);
  const entries = useMemo(
    () => [...(item.entries ?? [])].sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.id - b.id),
    [item.entries],
  );

  if (entries.length < item.entryIds.length) {
    return (
      <div className="regroup-panel">
        <p className="hint">
          Splitting needs the newer catalogue, which lists each season and film. It is being built now and will arrive the next
          time you open the app after it's ready.
        </p>
        <button className="btn btn-quiet btn-small" onClick={onClose}>
          Close
        </button>
      </div>
    );
  }

  const toggle = (id: number) =>
    setTicked((t) => {
      const n = new Set(t);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const valid = ticked.size > 0 && ticked.size < entries.length;
  const mangaIds = entries.filter((e) => isManga(e.format)).map((e) => e.id);
  const [busy, setBusy] = useState(false);
  const split = async (groups: number[][]) => {
    setBusy(true);
    const ids = await app.splitItem(item.id, groups);
    setBusy(false);
    setTicked(new Set());
    setMade(ids);
  };

  if (made) {
    return (
      <div className="regroup-panel">
        <p>
          {made.length === 1 ? 'Made a separate title.' : `Made ${made.length} separate titles.`} Past duels stay with{' '}
          {app.title(item)}; new titles start with no duels.
        </p>
        <ul className="plain-list">
          {made.map((id) => {
            const it = app.itemById.get(id);
            const m = app.allMarks.get(id);
            return (
              <li key={id} className="made-row">
                <span>
                  {it ? app.title(it) : 'New title'}
                  {it && <span className="hint"> · {app.look(it).meta}{m ? `, ${m.status === 'seen' ? 'marked seen' : 'marked not seen'}` : ', not marked yet'}</span>}
                </span>
                <button className="btn btn-quiet btn-small" onClick={() => onOpen(id)}>
                  Open
                </button>
              </li>
            );
          })}
        </ul>
        <div className="action-row start">
          <button className="btn btn-quiet btn-small" onClick={() => setMade(null)}>
            Split more
          </button>
          <button className="btn btn-quiet btn-small" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="regroup-panel">
      <p className="hint">
        Tick the parts that should come out of {app.title(item)}. Past duels stay with {app.title(item)}.
      </p>
      {mangaIds.length > 0 && mangaIds.length < entries.length && (
        <button className="btn btn-quiet btn-small" onClick={() => setTicked(new Set(mangaIds))}>
          Tick the manga
        </button>
      )}
      <ul className="entry-list">
        {entries.map((e) => (
          <li key={e.id}>
            <label className="check">
              <input type="checkbox" checked={ticked.has(e.id)} onChange={() => toggle(e.id)} />
              <span>
                <span className="entry-title">
                  {(app.settings.titleLanguage === 'romaji' ? e.titleRomaji : e.titleEnglish) ?? e.titleRomaji ?? e.titleEnglish}
                </span>
                <span className="entry-meta">
                  {formatLabel(e.format)}
                  {e.year ? `, ${e.year}` : ''}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="action-row start">
        <button className="btn btn-primary btn-small" disabled={!valid || busy} onClick={() => split([[...ticked]])}>
          {ticked.size > 1 ? 'Make these one title' : 'Make it a separate title'}
        </button>
        {ticked.size > 1 && valid && (
          <button className="btn btn-small" disabled={busy} onClick={() => split([...ticked].map((e) => [e]))}>
            Make each its own title
          </button>
        )}
        <button className="btn btn-quiet btn-small" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Join({ app, item, onClose }: { app: AppState; item: Item; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Item | null>(null);
  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (q.length < 2) return [];
    return app.allItems
      .filter((i) => i.id !== item.id && [i.title, i.titleEnglish, i.titleRomaji].some((t) => t?.toLowerCase().includes(q)))
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 8);
  }, [q, app.allItems, item.id]);

  if (picked) {
    const both = app.fit.duels.get(picked.id) ?? 0;
    return (
      <div className="regroup-panel">
        <p>
          Join <strong>{app.title(picked)}</strong> into <strong>{app.title(item)}</strong>?
        </p>
        <p className="hint">
          {both > 0 ? `Its ${both === 1 ? 'duel counts' : `${both} duels count`} for ${app.title(item)}, except any between the two, which are set aside. ` : ''}
          If you'd seen either, the joined title counts as seen. You can undo this from Settings.
        </p>
        <div className="action-row start">
          <button
            className="btn btn-primary btn-small"
            onClick={async () => {
              await app.joinItems(item.id, picked.id);
              onClose();
            }}
          >
            Join
          </button>
          <button className="btn btn-quiet btn-small" onClick={() => setPicked(null)}>
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="regroup-panel">
      <input
        className="search"
        type="search"
        placeholder="Find the title to join into this one"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      {matches.length > 0 && (
        <ol className="rank-list">
          {matches.map((m) => (
            <li key={m.id}>
              <button className="rank-row" onClick={() => setPicked(m)}>
                <Cover look={app.look(m)} title={app.title(m)} size="sm" />
                <span className="rank-body">
                  <span className="rank-title">{app.title(m)}</span>
                  <span className="rank-meta">{app.look(m).short}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <button className="btn btn-quiet btn-small" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}
