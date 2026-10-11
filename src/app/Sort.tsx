import { useEffect, useMemo } from 'react';
import { TIERS, type Tier } from '../types';
import { Cover } from './Cover';
import { metaLine } from './meta';
import type { AppState } from './useApp';

export const TIER_HELP: Record<Tier, string> = {
  S: 'All-time favourite',
  A: 'Loved it',
  B: 'Liked it',
  C: 'It was fine',
  D: 'Did not like it',
};

export function Sort({ app, onDone }: { app: AppState; onDone: () => void }) {
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
  const sorted = app.marks.size;
  const seen = [...app.marks.values()].filter((m) => m.status === 'seen').length;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!item || e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return;
      const k = e.key.toLowerCase();
      const tier = TIERS[Number(k) - 1];
      if (tier) app.markItem(item.id, 'seen', tier);
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
      <main className="screen empty">
        <h2>Everything is sorted</h2>
        <p>You've been through all {app.items.length.toLocaleString()} titles. Add more from the Add tab, or go and rank what you've seen.</p>
        <button className="btn btn-primary" onClick={onDone}>
          Start duels
        </button>
      </main>
    );
  }

  const title = app.title(item);
  return (
    <main className="screen sort">
      <p className="progress-line">
        {sorted.toLocaleString()} of {app.items.length.toLocaleString()} sorted, {seen.toLocaleString()} seen
      </p>
      <div className="sort-card" key={item.id}>
        <Cover item={item} title={title} size="lg" />
        <h2 className="item-title">{title}</h2>
        <p className="item-meta">{metaLine(item)}</p>
      </div>

      <p className="sort-question">Seen it? Rate it.</p>
      <div className="tier-row" role="group" aria-label="Seen it: choose a tier">
        {TIERS.map((t, i) => (
          <button key={t} className={`tier-btn tier-${t}`} onClick={() => app.markItem(item.id, 'seen', t)} title={`${TIER_HELP[t]} (key ${i + 1})`}>
            <span className="tier-letter">{t}</span>
            <span className="tier-help">{TIER_HELP[t]}</span>
          </button>
        ))}
      </div>
      <div className="action-row">
        <button className="btn" onClick={() => app.markItem(item.id, 'unseen')} title="Key N">
          Haven't seen
        </button>
        <button className="btn" onClick={() => app.markItem(item.id, 'want')} title="Key W">
          Want to watch
        </button>
        <button className="btn btn-quiet" onClick={() => app.skipSort(item.id)} title="Key S">
          Ask later
        </button>
        <button className="btn btn-quiet" onClick={app.undo} disabled={!app.canUndo} title="Key Z">
          Undo
        </button>
      </div>
      {seen >= 2 && (
        <button className="btn btn-link" onClick={onDone}>
          Start duels with the {seen} you've seen
        </button>
      )}
      {next?.cover && <link rel="prefetch" href={next.cover} />}
    </main>
  );
}
