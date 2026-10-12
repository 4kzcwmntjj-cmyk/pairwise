import { useEffect, useMemo, useRef, useState } from 'react';
import { isMangaOnly } from '../anilist/group';
import { choicesFor, formUnknown } from '../rank/medium';
import type { Item } from '../types';
import { Add } from './Add';
import { Cover } from './Cover';
import { viewWords } from './meta';
import type { AppState } from './useApp';

const PAGE = 60;

/** Which titles the browse grid shows. */
type Show = 'open' | 'unsorted' | 'seen' | 'unseen' | 'form';

export function Sort({ app, onDone, onOpen }: { app: AppState; onDone: () => void; onOpen: (id: string) => void }) {
  const [finding, setFinding] = useState(false);
  const onFind = () => setFinding(true);
  const seen = useMemo(() => [...app.marks.values()].filter((m) => m.status === 'seen').length, [app.marks]);
  const mode = app.settings.sortMode;
  const [show, setShow] = useState<Show>('open');
  // Titles marked seen before manga came in, which still need watched or read.
  const formless = useMemo(
    () => (app.view === 'both' ? app.items.filter((i) => formUnknown(i, app.allMarks.get(i.id))).length : 0),
    [app.items, app.allMarks, app.view],
  );
  const browse = (s: Show) => {
    setShow(s);
    if (mode !== 'grid') app.setSettings({ ...app.settings, sortMode: 'grid' });
  };
  if (finding) {
    return (
      <main className="screen sort">
        <div className="sort-head">
          <button className="btn btn-quiet btn-small" onClick={() => setFinding(false)}>
            Back to sorting
          </button>
        </div>
        <Add app={app} onOpen={onOpen} />
      </main>
    );
  }
  return (
    <main className="screen sort">
      <div className="sort-head">
        <div className="segmented" role="radiogroup" aria-label="Library view">
          {(
            [
              ['single', 'Quick sort'],
              ['grid', 'Browse'],
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
        <div className="action-row start">
          <button className="btn btn-small" onClick={onFind}>
            Search AniList
          </button>
          {seen >= 2 && (
            <button className="btn btn-primary btn-small" onClick={onDone}>
              Start duels ({seen} seen)
            </button>
          )}
        </div>
      </div>
      {formless > 0 && !(mode === 'grid' && show === 'form') && (
        <p className="hint">
          {formless === 1 ? '1 title is' : `${formless.toLocaleString()} titles are`} marked seen without saying whether you
          watched or read.{' '}
          <button className="btn-link inline" onClick={() => browse('form')}>
            Go through them
          </button>
        </p>
      )}
      {mode === 'grid' ? (
        <SortGrid app={app} onFind={onFind} onOpen={onOpen} show={show} setShow={setShow} />
      ) : (
        <SortSingle app={app} onDone={onDone} onFind={onFind} onBrowse={() => browse('unsorted')} />
      )}
    </main>
  );
}

/**
 * Every title as a cover grid, most popular first, narrowed by status, decade and year. Browsing by year
 * helps you remember what you've seen, which the quick sort can't guess once the obvious titles are done.
 * Tap marks it seen; tap again to undo.
 */
function SortGrid({
  app,
  onFind,
  onOpen,
  show,
  setShow,
}: {
  app: AppState;
  onFind: () => void;
  onOpen: (id: string) => void;
  show: Show;
  setShow: (s: Show) => void;
}) {
  const [query, setQuery] = useState('');
  const [decade, setDecade] = useState<number | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [limit, setLimit] = useState(PAGE);
  // Titles tapped since the filters last changed stay on screen, so a tap never makes a tile vanish under your finger.
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const sentinel = useRef<HTMLDivElement>(null);

  const q = query.trim().toLowerCase();
  const yearOf = (i: Item) => app.look(i).startYear;
  const decades = useMemo(() => {
    const ds = new Set<number>();
    for (const i of app.items) {
      const y = yearOf(i);
      if (y) ds.add(Math.floor(y / 10) * 10);
    }
    return [...ds].sort((a, b) => b - a);
  }, [app.items, app.look]);
  const list = useMemo(() => {
    let items = [...app.items].sort((a, b) => b.popularity - a.popularity);
    if (q) items = items.filter((i) => [i.title, i.titleEnglish, i.titleRomaji].some((t) => t?.toLowerCase().includes(q)));
    if (decade !== null) items = items.filter((i) => Math.floor((yearOf(i) ?? 0) / 10) * 10 === decade);
    if (year !== null) items = items.filter((i) => yearOf(i) === year);
    const status = (i: Item) => app.marks.get(i.id)?.status;
    const keep: Record<Show, (i: Item) => boolean> = {
      open: (i) => status(i) !== 'unseen',
      unsorted: (i) => !status(i),
      seen: (i) => status(i) === 'seen',
      unseen: (i) => status(i) === 'unseen',
      form: (i) => formUnknown(i, app.allMarks.get(i.id)),
    };
    return items.filter((i) => touched.has(i.id) || keep[show](i));
  }, [app.items, app.marks, app.allMarks, app.look, q, decade, year, show, touched]);

  useEffect(() => {
    setLimit(PAGE);
    setTouched(new Set());
  }, [q, decade, year, show]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setLimit((l) => l + PAGE);
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [list.length]);

  // One tap: seen. Two: haven't seen. Three: back to unmarked. Titles waiting for watched or read open instead.
  const cycle = (item: Item) => {
    if (show === 'form') return onOpen(item.id);
    setTouched((t) => new Set(t).add(item.id));
    const status = app.marks.get(item.id)?.status;
    if (!status) app.markItem(item.id, 'seen');
    else if (status === 'seen') app.markItem(item.id, 'unseen');
    else app.clearMark(item.id);
  };

  return (
    <>
      <p className="hint">
        {app.view === 'anime'
          ? "Tap once if you've watched it, twice if not, a third time to clear."
          : app.view === 'manga'
            ? "Tap once if you've read it, twice if not, a third time to clear."
            : "Tap once if you've seen or read it, twice if not, a third time to clear."}{' '}
        Duels work out the order.
      </p>
      <div className="grid-tools">
        <input
          id="sort-filter"
          className="search"
          type="search"
          placeholder="Filter these titles"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="grid-filters">
          <select id="grid-show" aria-label="Show" value={show} onChange={(e) => setShow(e.target.value as Show)}>
            <option value="open">Not sorted and seen</option>
            <option value="unsorted">Not sorted</option>
            <option value="seen">Seen</option>
            <option value="unseen">{viewWords(app.view).unseen}</option>
            {app.view === 'both' && <option value="form">Watched or read?</option>}
          </select>
          <select
            id="grid-decade"
            aria-label="Decade"
            value={decade ?? ''}
            onChange={(e) => {
              setDecade(e.target.value ? Number(e.target.value) : null);
              setYear(null);
            }}
          >
            <option value="">Any year</option>
            {decades.map((d) => (
              <option key={d} value={d}>
                {d}s
              </option>
            ))}
          </select>
          {decade !== null && (
            <select id="grid-year" aria-label="Year" value={year ?? ''} onChange={(e) => setYear(e.target.value ? Number(e.target.value) : null)}>
              <option value="">All of the {decade}s</option>
              {Array.from({ length: 10 }, (_, k) => decade + 9 - k)
                .filter((y) => y <= new Date().getFullYear())
                .map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
            </select>
          )}
        </div>
      </div>
      {list.length === 0 ? (
        <p className="empty-list">
          {q ? `Nothing matches "${query.trim()}" here.` : 'Nothing here with these filters.'}{' '}
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
                  <Cover look={app.look(item)} title={title} size="sm" />
                  {state === 'seen' && (
                    <span className="grid-badge" aria-hidden="true">
                      ✓
                    </span>
                  )}
                  {state === 'unseen' && <span className="grid-note">Haven't seen</span>}
                  <span className="grid-title">{title}</span>
                  <span className="grid-year">{app.look(item).years}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div ref={sentinel} aria-hidden="true" />
      <p className="undo-row">
        <button className="btn btn-quiet btn-small" onClick={() => app.undo('sort')} disabled={!app.canUndo('sort')}>
          Undo
        </button>
      </p>
    </>
  );
}

/**
 * Until you've answered about a few manga, one card in every MANGA_EVERY is the likeliest manga, so the
 * model gets to learn whether you read them. Otherwise anime would fill the queue and manga would never come up.
 */
const MANGA_EVERY = 5;
const MANGA_LEARNED = 8;

/** Long-shot notice: shown once enough has been sorted and recent answers are nearly all "haven't seen". */
const RECENT = 25;
const RECENT_HITS_AT_MOST = 2;
const SORTED_AT_LEAST = 60;
/** Below this chance of having seen the next title, the quick sort is digging through long shots. */
const LIKELY_AT_LEAST = 0.15;

/**
 * One title at a time: seen it, haven't seen, or ask later. Titles come in
 * order of how likely you are to have seen them, learned from your answers
 * so far (see rank/seen.ts), so the ones you've seen surface early.
 */
function SortSingle({ app, onDone, onFind, onBrowse }: { app: AppState; onDone: () => void; onFind: () => void; onBrowse: () => void }) {
  const [keepGoing, setKeepGoing] = useState(false);
  const model = app.seenGuess;
  const queue = useMemo(() => {
    const skipped = new Set(app.skipped);
    const p = (i: Item) => model.probability.get(i.id) ?? 0;
    const unmarked = app.items.filter((i) => !app.marks.has(i.id)).sort((a, b) => p(b) - p(a) || b.popularity - a.popularity);
    const order = new Map(app.skipped.map((id, i) => [id, i]));
    let fresh = unmarked.filter((i) => !skipped.has(i.id));
    if (app.view === 'both') {
      const isMangaId = (id: string) => {
        const it = app.itemById.get(id);
        return !!it && isMangaOnly(it);
      };
      const answered = [...app.marks.values()].filter((m) => isMangaId(m.itemId));
      if (answered.length < MANGA_LEARNED) {
        // Cards answered since the last manga.
        const recent = [...app.marks.values()].sort((x, y) => y.updatedAt - x.updatedAt);
        const since = recent.findIndex((m) => isMangaId(m.itemId));
        const gap = since === -1 ? recent.length : since;
        const first = fresh.findIndex(isMangaOnly);
        if (gap >= MANGA_EVERY - 1 && first > 0) fresh = [fresh[first], ...fresh.slice(0, first), ...fresh.slice(first + 1)];
      }
    }
    return [
      ...fresh,
      ...unmarked.filter((i) => skipped.has(i.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!),
    ];
  }, [app.items, app.itemById, app.marks, app.skipped, app.view, model]);

  const recentHits = useMemo(() => {
    const recent = [...app.marks.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, RECENT);
    return recent.filter((m) => m.status === 'seen').length;
  }, [app.marks]);
  // Long shots: your recent answers say so, or the model expects the next title to be one you haven't seen.
  const topChance = queue[0] ? model.probability.get(queue[0].id) ?? 0 : 0;
  const longShots =
    !keepGoing && app.marks.size >= SORTED_AT_LEAST && (recentHits <= RECENT_HITS_AT_MOST || topChance < LIKELY_AT_LEAST);
  const likelyLeft = Math.round(model.expectedRemaining);

  const item = queue[0];
  const next = queue[1];

  useEffect(() => {
    const nl = next && app.look(next);
    if (nl?.coverLarge ?? nl?.cover) new Image().src = (nl.coverLarge ?? nl.cover)!;
  }, [next]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!item || e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return;
      const k = e.key.toLowerCase();
      const choices = choicesFor(item, app.view);
      const choice =
        choices.find((c) => c.key === k) ??
        (k === 'enter' || k === 'arrowleft' || k === 'y' ? choices[0] : k === 'arrowright' ? choices[choices.length - 1] : undefined);
      if (choice) app.answer(item.id, choice.answer);
      else if (k === 's') app.skipSort(item.id);
      else if (k === 'backspace' || k === 'z') app.undo('sort');
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
      {app.fit.order.length >= 2 && !longShots && (
        <p className="hint">You don't need to sort everything here: duels bring in titles you've probably seen as they go.</p>
      )}
      {longShots && (
        <div className="notice" role="status">
          <p>
            What's left here is mostly long shots: the app expects about {likelyLeft.toLocaleString()} titles you've seen among
            the {(app.items.length - app.marks.size).toLocaleString()} unsorted ones. Browsing by year is a quicker way to find
            them, and duels bring in the likely ones as they go.
          </p>
          <div className="action-row start">
            <button className="btn btn-primary btn-small" onClick={onBrowse}>
              Browse by year
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
        <Cover look={app.look(item)} title={title} size="lg" />
        <h2 className="item-title">{title}</h2>
        <p className="item-meta">{app.look(item).meta}</p>
      </div>
      <div className={`action-row choices-${choicesFor(item, app.view).length}`}>
        {choicesFor(item, app.view).map((c, i) => (
          <button
            key={c.label}
            className={i === 0 ? 'btn btn-primary' : 'btn'}
            onClick={() => app.answer(item.id, c.answer)}
            title={`Key ${c.key.toUpperCase()}`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="action-row">
        <button className="btn btn-quiet" onClick={() => app.skipSort(item.id)} title="Key S">
          Ask later
        </button>
        <button className="btn btn-quiet" onClick={() => app.undo('sort')} disabled={!app.canUndo('sort')} title="Key Z">
          Undo
        </button>
      </div>
    </>
  );
}
