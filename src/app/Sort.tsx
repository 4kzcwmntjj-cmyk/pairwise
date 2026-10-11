import { useEffect, useMemo, useRef, useState } from 'react';
import { TIERS, type Item, type Tier } from '../types';
import { Cover } from './Cover';
import { metaLine, years } from './meta';
import type { AppState } from './useApp';

export const TIER_HELP: Record<Tier, string> = {
  S: 'All-time favourite',
  A: 'Loved it',
  B: 'Liked it',
  C: 'It was fine',
  D: 'Did not like it',
};

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
              ['grid', 'Tap what you’ve seen'],
              ['single', 'One at a time'],
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
      {mode === 'grid' ? <SortGrid app={app} onFind={onFind} /> : <SortSingle app={app} onDone={onDone} />}
    </main>
  );
}

/** Every title as a cover grid, most popular first. Tap marks it seen; tap again to undo. */
function SortGrid({ app, onFind }: { app: AppState; onFind: () => void }) {
  const [query, setQuery] = useState('');
  const [hideSorted, setHideSorted] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement>(null);

  const q = query.trim().toLowerCase();
  const list = useMemo(() => {
    let items = [...app.items].sort((a, b) => b.popularity - a.popularity);
    if (q) items = items.filter((i) => [i.title, i.titleEnglish, i.titleRomaji].some((t) => t?.toLowerCase().includes(q)));
    if (hideSorted) items = items.filter((i) => !app.marks.has(i.id));
    return items;
  }, [app.items, app.marks, q, hideSorted]);

  useEffect(() => setLimit(PAGE), [q, hideSorted]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setLimit((l) => l + PAGE);
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [list.length]);

  const toggle = (item: Item) => {
    const mark = app.marks.get(item.id);
    if (mark?.status === 'seen') app.clearMark(item.id);
    else app.markItem(item.id, 'seen');
  };

  return (
    <>
      <p className="hint">
        Tap every title you've seen; tap again to take it back. Duels sort out the order, so there's no need to rate anything
        here.
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
        <label className="check">
          <input id="hide-sorted" type="checkbox" checked={hideSorted} onChange={(e) => setHideSorted(e.target.checked)} />
          Hide titles already marked
        </label>
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
                <button onClick={() => toggle(item)} aria-pressed={state === 'seen'} aria-label={`${title}${state === 'seen' ? ', seen' : ''}`}>
                  <Cover item={item} title={title} size="sm" />
                  {state === 'seen' && (
                    <span className="grid-badge" aria-hidden="true">
                      ✓
                    </span>
                  )}
                  {(state === 'want' || state === 'unseen') && (
                    <span className="grid-note">{state === 'want' ? 'Want to watch' : 'Not seen'}</span>
                  )}
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

/** One title at a time, with an optional starting tier. */
function SortSingle({ app, onDone }: { app: AppState; onDone: () => void }) {
  const queue = useMemo(() => {
    const skipped = new Set(app.skipped);
    const unmarked = app.items.filter((i) => !app.marks.has(i.id)).sort((a, b) => b.popularity - a.popularity);
    const order = new Map(app.skipped.map((id, i) => [id, i]));
    return [
      ...unmarked.filter((i) => !skipped.has(i.id)),
      ...unmarked.filter((i) => skipped.has(i.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!),
    ];
  }, [app.items, app.marks, app.skipped]);

  const item = queue[0];
  const next = queue[1];

  useEffect(() => {
    if (next?.coverLarge ?? next?.cover) new Image().src = (next.coverLarge ?? next.cover)!;
  }, [next]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!item || e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return;
      const k = e.key.toLowerCase();
      const tier = TIERS[Number(k) - 1];
      if (tier) app.markItem(item.id, 'seen', tier);
      else if (k === 'y' || k === 'enter') app.markItem(item.id, 'seen');
      else if (k === 'w') app.markItem(item.id, 'want');
      else if (k === 'n') app.markItem(item.id, 'unseen');
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
        <button className="btn" onClick={() => app.markItem(item.id, 'want')} title="Key W">
          Want to watch
        </button>
      </div>
      <p className="sort-question">Or rate it as you mark it (optional)</p>
      <div className="tier-row compact" role="group" aria-label="Seen it: choose a starting tier">
        {TIERS.map((t, i) => (
          <button key={t} className={`tier-btn tier-${t}`} onClick={() => app.markItem(item.id, 'seen', t)} title={`${TIER_HELP[t]} (key ${i + 1})`}>
            <span className="tier-letter">{t}</span>
            <span className="tier-help">{TIER_HELP[t]}</span>
          </button>
        ))}
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
