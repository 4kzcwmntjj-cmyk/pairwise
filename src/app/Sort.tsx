import { useEffect, useMemo, useRef, useState } from 'react';
import { seenModel } from '../rank/seen';
import type { Item } from '../types';
import { Cover } from './Cover';
import { metaLine, years } from './meta';
import type { AppState } from './useApp';

const PAGE = 60;

export function Sort({ app, onDone, onFind }: { app: AppState; onDone: () => void; onFind: () => void }) {
  const seen = useMemo(() => [...app.marks.values()].filter((m) => m.status === 'seen').length, [app.marks]);
  const mode = app.settings.sortMode;
  return (
    <main className="screen sort">
      <div className="sort-head">
        <div className="segmented" role="radiogroup" aria-label="How to sort">
          {(
            [
              ['single', 'One at a time'],
              ['grid', 'Tap what you’ve seen'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              role="radio"
              aria-checked={mode === v}
              className={mode === v ? 'on' : ''}
              onClick={() => app.setSettings({ ...app.settings, sortMode: v })}
            >
              {label}
            </button>
          ))}
        </div>
        {seen >= 2 && (
          <button className="btn btn-primary btn-small" onClick={onDone}>
            Start duels ({seen} seen)
          </button>
        )}
      </div>
      {mode === 'grid' ? <SortGrid app={app} onFind={onFind} /> : <SortSingle app={app} onDone={onDone} onFind={onFind} />}
    </main>
  );
}

/** Every title as a cover grid, most popular first. Tap marks it seen; tap again to undo. */
function SortGrid({ app, onFind }: { app: AppState; onFind: () => void }) {
  const [query, setQuery] = useState('');
  const [hideUnseen, setHideUnseen] = useState(true);
  const [hideSeen, setHideSeen] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  // Titles tapped since the filters last changed stay on screen, so a tap never makes a tile vanish under your finger.
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const sentinel = useRef<HTMLDivElement>(null);

  const q = query.trim().toLowerCase();
  const list = useMemo(() => {
    let items = [...app.items].sort((a, b) => b.popularity - a.popularity);
    if (q) items = items.filter((i) => [i.title, i.titleEnglish, i.titleRomaji].some((t) => t?.toLowerCase().includes(q)));
    if (hideUnseen) items = items.filter((i) => touched.has(i.id) || app.marks.get(i.id)?.status !== 'unseen');
    if (hideSeen) items = items.filter((i) => touched.has(i.id) || app.marks.get(i.id)?.status !== 'seen');
    return items;
  }, [app.items, app.marks, q, hideUnseen, hideSeen, touched]);

  useEffect(() => {
    setLimit(PAGE);
    setTouched(new Set());
  }, [q, hideUnseen, hideSeen]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setLimit((l) => l + PAGE);
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [list.length]);

  // One tap: seen. Two: haven't seen. Three: back to unmarked.
  const cycle = (item: Item) => {
    setTouched((t) => new Set(t).add(item.id));
    const status = app.marks.get(item.id)?.status;
    if (!status) app.markItem(item.id, 'seen');
    else if (status === 'seen') app.markItem(item.id, 'unseen');
    else app.clearMark(item.id);
  };

  return (
    <>
      <p className="hint">
        Tap once for seen, twice for haven't seen, a third time to clear. Duels work out the order.
      </p>
      <div className="grid-tools">
        <input
          id="sort-filter"
          className="search"
          type="search"
          placeholder="Find a title"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="checks">
          <label className="check">
            <input id="hide-unseen" type="checkbox" checked={hideUnseen} onChange={(e) => setHideUnseen(e.target.checked)} />
            Hide titles marked haven't seen
          </label>
          <label className="check">
            <input id="hide-seen" type="checkbox" checked={hideSeen} onChange={(e) => setHideSeen(e.target.checked)} />
            Hide titles marked seen
          </label>
        </div>
      </div>
      {list.length === 0 ? (
        <p className="empty-list">
          Nothing matches "{query.trim()}" in the catalogue.{' '}
          <button className="btn-link inline" onClick={onFind}>
            Search AniList
          </button>
        </p>
      ) : (
        <ul className="cover-grid">
          {list.slice(0, limit).map((item) => {
            const mark = app.marks.get(item.id);
            const title = app.title(item);
            const state = mark?.status ?? 'none';
            return (
              <li key={item.id} className={`grid-item is-${state}`}>
                <button onClick={() => cycle(item)} aria-label={`${title}${state === 'seen' ? ', seen' : state === 'unseen' ? ", haven't seen" : ''}`}>
                  <Cover item={item} title={title} size="sm" />
                  {state === 'seen' && (
                    <span className="grid-badge" aria-hidden="true">
                      ✓
                    </span>
                  )}
                  {state === 'unseen' && <span className="grid-note">Haven't seen</span>}
                  <span className="grid-title">{title}</span>
                  <span className="grid-year">{years(item)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div ref={sentinel} aria-hidden="true" />
      <p className="undo-row">
        <button className="btn btn-quiet btn-small" onClick={app.undo} disabled={!app.canUndo}>
          Undo
        </button>
      </p>
    </>
  );
}

/** Long-shot notice: shown once enough has been sorted and recent answers are nearly all "haven't seen". */
const RECENT = 25;
const RECENT_HITS_AT_MOST = 2;
const SORTED_AT_LEAST = 60;

/**
 * One title at a time: seen it, haven't seen, or ask later. Titles come in
 * order of how likely you are to have seen them, learned from your answers
 * so far (see rank/seen.ts), so the ones you've seen surface early.
 */
function SortSingle({ app, onDone, onFind }: { app: AppState; onDone: () => void; onFind: () => void }) {
  const [keepGoing, setKeepGoing] = useState(false);
  const model = useMemo(() => seenModel(app.items, app.marks), [app.items, app.marks]);
  const queue = useMemo(() => {
    const skipped = new Set(app.skipped);
    const p = (i: Item) => model.probability.get(i.id) ?? 0;
    const unmarked = app.items.filter((i) => !app.marks.has(i.id)).sort((a, b) => p(b) - p(a) || b.popularity - a.popularity);
    const order = new Map(app.skipped.map((id, i) => [id, i]));
    return [
      ...unmarked.filter((i) => !skipped.has(i.id)),
      ...unmarked.filter((i) => skipped.has(i.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!),
    ];
  }, [app.items, app.marks, app.skipped, model]);

  const recentHits = useMemo(() => {
    const recent = [...app.marks.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, RECENT);
    return recent.filter((m) => m.status === 'seen').length;
  }, [app.marks]);
  const longShots = !keepGoing && app.marks.size >= SORTED_AT_LEAST && recentHits <= RECENT_HITS_AT_MOST;

  const item = queue[0];
  const next = queue[1];

  useEffect(() => {
    if (next?.coverLarge ?? next?.cover) new Image().src = (next.coverLarge ?? next.cover)!;
  }, [next]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!item || e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return;
      const k = e.key.toLowerCase();
      if (k === 'y' || k === 'enter' || k === 'arrowleft') app.markItem(item.id, 'seen');
      else if (k === 'n' || k === 'arrowright') app.markItem(item.id, 'unseen');
      else if (k === 's') app.skipSort(item.id);
      else if (k === 'backspace' || k === 'z') app.undo();
      else return;
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, app]);

  if (!item) {
    return (
      <div className="empty">
        <h2>Everything is sorted</h2>
        <p>You've been through all {app.items.length.toLocaleString()} titles.</p>
        <button className="btn btn-primary" onClick={onDone}>
          Go to duels
        </button>
      </div>
    );
  }

  const title = app.title(item);
  return (
    <>
      <p className="progress-line">
        {app.marks.size.toLocaleString()} of {app.items.length.toLocaleString()} sorted
      </p>
      {longShots && (
        <div className="notice" role="status">
          <p>
            {recentHits === 0 ? 'None' : `Only ${recentHits}`} of your last {RECENT} were titles you've seen, so what's left is
            mostly long shots. Search for anything specific you've seen, or keep going.
          </p>
          <div className="action-row start">
            <button className="btn btn-primary btn-small" onClick={onFind}>
              Find a title
            </button>
            {app.fit.order.length >= 2 && (
              <button className="btn btn-small" onClick={onDone}>
                Go to duels
              </button>
            )}
            <button className="btn btn-quiet btn-small" onClick={() => setKeepGoing(true)}>
              Keep going
            </button>
          </div>
        </div>
      )}
      <div className="sort-card" key={item.id}>
        <Cover item={item} title={title} size="lg" />
        <h2 className="item-title">{title}</h2>
        <p className="item-meta">{metaLine(item)}</p>
      </div>
      <div className="action-row">
        <button className="btn btn-primary" onClick={() => app.markItem(item.id, 'seen')} title="Key Y">
          Seen it
        </button>
        <button className="btn" onClick={() => app.markItem(item.id, 'unseen')} title="Key N">
          Haven't seen
        </button>
      </div>
      <div className="action-row">
        <button className="btn btn-quiet" onClick={() => app.skipSort(item.id)} title="Key S">
          Ask later
        </button>
        <button className="btn btn-quiet" onClick={app.undo} disabled={!app.canUndo} title="Key Z">
          Undo
        </button>
      </div>
    </>
  );
}
