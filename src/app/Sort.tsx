import { useEffect, useMemo, useRef, useState } from 'react';
import { isMangaOnly } from '../anilist/group';
import { choicesFor, formUnknown } from '../rank/medium';
import type { Item } from '../types';
import { Add } from './Add';
import { Cover } from './Cover';
import { TitleLink } from './TitleLink';
import { viewWords } from './meta';
import type { AppState } from './useApp';

const PAGE = 60;

/** Which titles the browse grid shows. */
type Show = 'all' | 'unmarked' | 'seen' | 'unseen' | 'form';

export function Sort({ app, onDone, onOpen }: { app: AppState; onDone: () => void; onOpen: (id: string) => void }) {
  /** Searching AniList for this text, or null. */
  const [finding, setFinding] = useState<string | null>(null);
  const onFind = (query = '') => setFinding(query);
  const mode = app.settings.sortMode;
  const [show, setShow] = useState<Show>('all');
  // Titles marked seen before manga came in, which still need watched or read.
  const formless = useMemo(
    () => (app.view === 'both' ? app.items.filter((i) => formUnknown(i, app.allMarks.get(i.id))).length : 0),
    [app.items, app.allMarks, app.view],
  );
  const browse = (s: Show) => {
    setShow(s);
    if (mode !== 'grid') app.setSettings({ ...app.settings, sortMode: 'grid' });
  };
  if (finding !== null) {
    return (
      <main className="screen sort">
        <div className="sort-head">
          <button className="btn btn-quiet btn-small" onClick={() => setFinding(null)}>
            Back to the Library
          </button>
        </div>
        <Add app={app} onOpen={onOpen} initial={finding} />
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
      </div>
      {formless > 0 && !(mode === 'grid' && show === 'form') && (
        <p className="hint">
          {formless === 1 ? '1 title is' : `${formless.toLocaleString()} titles are`} marked seen without saying whether it was
          the anime or the manga.{' '}
          <button className="btn-link inline" onClick={() => browse('form')}>
            Go through them
          </button>
        </p>
      )}
      {mode === 'grid' ? (
        <SortGrid app={app} onFind={onFind} onOpen={onOpen} show={show} setShow={setShow} />
      ) : (
        <SortSingle app={app} onDone={onDone} onBrowse={() => browse('unmarked')} onOpen={onOpen} />
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
  onFind: (query?: string) => void;
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
  const words = viewWords(app.view);
  const yearOf = (i: Item) => app.look(i).startYear;
  const decades = useMemo(() => {
    const ds = new Set<number>();
    for (const i of app.items) {
      const y = yearOf(i);
      if (y) ds.add(Math.floor(y / 10) * 10);
    }
    return [...ds].sort((a, b) => b - a);
  }, [app.items, app.look]);
  // Marks as they are now, read when the filters change (not on every tap) to fix the order in All.
  const marksNow = useRef(app.marks);
  marksNow.current = app.marks;
  const inScope = (i: Item) => {
    const y = yearOf(i);
    if (decade !== null && Math.floor((y ?? 0) / 10) * 10 !== decade) return false;
    return year === null || y === year;
  };
  const counts = useMemo(() => {
    const c: Record<Show, number> = { all: 0, unmarked: 0, seen: 0, unseen: 0, form: 0 };
    for (const i of app.items) {
      if (!inScope(i)) continue;
      const status = app.marks.get(i.id)?.status;
      c.all++;
      if (!status) c.unmarked++;
      else c[status]++;
      if (formUnknown(i, app.allMarks.get(i.id))) c.form++;
    }
    return c;
  }, [app.items, app.marks, app.allMarks, app.look, decade, year]);
  // In All, titles marked Haven't seen come after the rest. Who counts is fixed when the filters change,
  // so a tile tapped to Haven't seen stays where it is.
  const lastInAll = useMemo(() => {
    const ids = new Set<string>();
    if (show !== 'all') return ids;
    for (const i of app.items) if (marksNow.current.get(i.id)?.status === 'unseen') ids.add(i.id);
    return ids;
  }, [app.items, app.ready, show, decade, year]);
  const list = useMemo(() => {
    let items = [...app.items].sort((a, b) => b.popularity - a.popularity);
    // A search looks through every title, whatever the other filters say.
    if (q) return items.filter((i) => [i.title, i.titleEnglish, i.titleRomaji].some((t) => t?.toLowerCase().includes(q)));
    items = items.filter(inScope);
    const status = (i: Item) => app.marks.get(i.id)?.status;
    const keep: Record<Show, (i: Item) => boolean> = {
      all: () => true,
      unmarked: (i) => !status(i),
      seen: (i) => status(i) === 'seen',
      unseen: (i) => status(i) === 'unseen',
      form: (i) => formUnknown(i, app.allMarks.get(i.id)),
    };
    items = items.filter((i) => touched.has(i.id) || keep[show](i));
    if (show === 'all') items = [...items.filter((i) => !lastInAll.has(i.id)), ...items.filter((i) => lastInAll.has(i.id))];
    return items;
  }, [app.items, app.marks, app.allMarks, app.look, q, decade, year, show, touched, lastInAll]);

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
        {show === 'all' && ` Titles marked "${viewWords(app.view).unseen}" come last.`}
      </p>
      <div className="grid-tools">
        <input
          id="sort-filter"
          className="search"
          type="search"
          placeholder="Search titles"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {q ? (
          <p className="hint">
            Showing matches from every title.{' '}
            <button className="btn-link inline" onClick={() => onFind(query.trim())}>
              Not here? Search AniList for "{query.trim()}"
            </button>
          </p>
        ) : (
          <div className="grid-filters">
          <select id="grid-show" aria-label="Show" value={show} onChange={(e) => setShow(e.target.value as Show)}>
            <option value="all">All ({counts.all.toLocaleString()})</option>
            <option value="unmarked">Not marked ({counts.unmarked.toLocaleString()})</option>
            <option value="seen">
              {words.seenLabel} ({counts.seen.toLocaleString()})
            </option>
            <option value="unseen">
              {words.unseen} ({counts.unseen.toLocaleString()})
            </option>
            {app.view === 'both' && <option value="form">Anime or manga? ({counts.form.toLocaleString()})</option>}
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
        )}
      </div>
      {list.length === 0 ? (
        <p className="empty-list">
          {q ? `Nothing in the catalogue matches "${query.trim()}".` : 'Nothing here with these filters.'}
        </p>
      ) : (
        <ul className="cover-grid">
          {list.slice(0, limit).map((item) => {
            const mark = app.marks.get(item.id);
            const title = app.title(item);
            const state = mark?.status ?? 'none';
            const stateWord = state === 'seen' ? words.seenLabel : state === 'unseen' ? words.unseen : null;
            return (
              <li key={item.id} className={`grid-item is-${state}`}>
                <button onClick={() => cycle(item)} aria-label={stateWord ? `${title}, ${stateWord.toLowerCase()}` : title}>
                  <Cover look={app.look(item)} title={title} size="sm" />
                  <span className="grid-title">{title}</span>
                  <span className="grid-year">{app.look(item).years}</span>
                  {stateWord && <span className="grid-state">{stateWord}</span>}
                </button>
                <span className="grid-info-area">
                  <button className="info-button" onClick={() => onOpen(item.id)} aria-label={`Details for ${title}`} title="Details">
                    i
                  </button>
                </span>
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
function SortSingle({
  app,
  onDone,
  onBrowse,
  onOpen,
}: {
  app: AppState;
  onDone: () => void;
  onBrowse: () => void;
  onOpen: (id: string) => void;
}) {
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
      if (!item || e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || document.querySelector('[aria-modal="true"]')) return;
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
        <TitleLink title={title} onOpen={() => onOpen(item.id)} />
        <p className="item-meta">{app.look(item).meta}</p>
      </div>
      {choicesFor(item, app.view).length === 4 && <p className="sort-question">Which have you seen?</p>}
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
      <p className="progress-line">
        {app.marks.size.toLocaleString()} of {app.items.length.toLocaleString()} sorted
      </p>
    </>
  );
}
