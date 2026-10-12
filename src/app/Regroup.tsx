import { useMemo, useState } from 'react';
import type { Item } from '../types';
import { Cover } from './Cover';
import { isManga, storylinesOf } from '../anilist/group';
import { formatLabel, shortFormat } from './meta';
import { entryName, type AppState } from './useApp';

type Mode = null | 'split' | 'join';

/** Fixing how a title is grouped: split parts of it off, or join another title into it. */
export function Regroup({ app, item, onOpen }: { app: AppState; item: Item; onOpen: (id: string) => void }) {
  const [mode, setMode] = useState<Mode>(null);
  const canSplit = item.entryIds.length > 1;

  return (
    <section className="regroup">
      {mode === null && <h3 className="sheet-label">What's in it</h3>}
      {mode === null && <Contents app={app} item={item} />}
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

/** The seasons, films and manga grouped under this title, oldest first. Long lists start folded. */
function Contents({ app, item }: { app: AppState; item: Item }) {
  const [all, setAll] = useState(false);
  const entries = useMemo(
    () => [...(item.entries ?? [])].sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.id - b.id),
    [item.entries],
  );
  if (entries.length === 0) return null;
  if (entries.length === 1) {
    return <p className="hint">One entry: {formatLabel(entries[0].format).toLowerCase()}{entries[0].year ? `, ${entries[0].year}` : ''}.</p>;
  }
  const FOLD = 6;
  const shown = all ? entries : entries.slice(0, FOLD);
  const name = (e: (typeof entries)[number]) =>
    app.settings.titleLanguage === 'romaji' ? (e.titleRomaji ?? e.titleEnglish) : (e.titleEnglish ?? e.titleRomaji);
  return (
    <>
      <ul className="contents-list">
        {shown.map((e) => (
          <li key={e.id}>
            <span className="contents-year">{e.year ?? ''}</span>
            <span className="contents-format">{shortFormat(e.format)}</span>
            <span>{name(e)}</span>
          </li>
        ))}
      </ul>
      {entries.length > FOLD && (
        <button className="btn-link inline" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${entries.length}`}
        </button>
      )}
    </>
  );
}

function Split({ app, item, onOpen, onClose }: { app: AppState; item: Item; onOpen: (id: string) => void; onClose: () => void }) {
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [made, setMade] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const entries = useMemo(
    () => [...(item.entries ?? [])].sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.id - b.id),
    [item.entries],
  );
  const lines = useMemo(() => storylinesOf(item.entries), [item.entries]);
  // With two or more storylines, whole storylines are offered first; single entries are one tap away.
  const [byEntry, setByEntry] = useState(false);
  const pickLines = lines.length >= 2 && !byEntry;

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
  const switchTo = (entriesMode: boolean) => {
    setTicked(new Set());
    setByEntry(entriesMode);
  };
  const total = pickLines ? lines.length : entries.length;
  const valid = ticked.size > 0 && ticked.size < total;
  // What each ticked box moves: a storyline's entries, or one entry.
  const groupsFor = (boxes: number[]) =>
    pickLines ? boxes.map((k) => lines.find((l) => l.key === k)!.entries.map((e) => e.id)) : boxes.map((e) => [e]);
  const mangaIds = entries.filter((e) => isManga(e.format)).map((e) => e.id);
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

  const counts = (anime: number, manga: number) =>
    [anime ? `${anime} anime` : '', manga ? `${manga} manga` : ''].filter(Boolean).join(', ');

  return (
    <div className="regroup-panel">
      <p className="hint">
        Tick the {pickLines ? 'storylines' : 'parts'} that should come out of {app.title(item)}. Past duels stay with {app.title(item)}.
      </p>
      {!pickLines && mangaIds.length > 0 && mangaIds.length < entries.length && (
        <button className="btn btn-quiet btn-small" onClick={() => setTicked(new Set(mangaIds))}>
          Tick the manga
        </button>
      )}
      <ul className="entry-list">
        {pickLines
          ? lines.map((l) => (
              <li key={l.key}>
                <label className="check">
                  <input type="checkbox" checked={ticked.has(l.key)} onChange={() => toggle(l.key)} />
                  <span>
                    <span className="entry-title">{entryName(l.lead, app.settings)}</span>
                    <span className="entry-meta">
                      {counts(l.anime, l.manga)}
                      {l.lead.year ? `, from ${l.lead.year}` : ''}
                    </span>
                  </span>
                </label>
              </li>
            ))
          : entries.map((e) => (
              <li key={e.id}>
                <label className="check">
                  <input type="checkbox" checked={ticked.has(e.id)} onChange={() => toggle(e.id)} />
                  <span>
                    <span className="entry-title">{entryName(e, app.settings)}</span>
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
        <button className="btn btn-primary btn-small" disabled={!valid || busy} onClick={() => split([groupsFor([...ticked]).flat()])}>
          {ticked.size > 1 ? 'Make these one title' : 'Make it a separate title'}
        </button>
        {ticked.size > 1 && valid && (
          <button className="btn btn-small" disabled={busy} onClick={() => split(groupsFor([...ticked]))}>
            Make each its own title
          </button>
        )}
        <button className="btn btn-quiet btn-small" onClick={onClose}>
          Cancel
        </button>
      </div>
      {lines.length >= 2 && (
        <button className="btn-link inline" onClick={() => switchTo(!byEntry)}>
          {byEntry ? 'Choose whole storylines instead' : 'Pick entries yourself'}
        </button>
      )}
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
