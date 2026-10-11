import { useEffect, useState } from 'react';
import { PLACED_AFTER } from '../rank/pairs';
import type { Item, Outcome } from '../types';
import { Cover } from './Cover';
import { metaLine } from './meta';
import type { AppState } from './useApp';

export function Duel({ app, onSort }: { app: AppState; onSort: () => void }) {
  const [picked, setPicked] = useState<Outcome | null>(null);
  const pair = app.pair;
  const a = pair ? app.itemById.get(pair.a) : undefined;
  const b = pair ? app.itemById.get(pair.b) : undefined;

  function choose(outcome: Outcome) {
    if (!pair || picked) return;
    setPicked(outcome);
    window.setTimeout(
      () => {
        app.vote(outcome);
        setPicked(null);
      },
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220,
    );
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return;
      if (e.key === 'ArrowLeft') choose('a');
      else if (e.key === 'ArrowRight') choose('b');
      else if (e.key === 'ArrowDown' || e.key.toLowerCase() === 't') choose('tie');
      else if (e.key.toLowerCase() === 's') app.skipPair();
      else if (e.key === 'Backspace' || e.key.toLowerCase() === 'z') app.undo();
      else return;
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const seen = app.fit.order.length;
  if (seen < 2 || !a || !b) {
    return (
      <main className="screen empty">
        <h2>Nothing to compare yet</h2>
        <p>Mark at least two titles as seen in Sort, and duels start here.</p>
        <button className="btn btn-primary" onClick={onSort}>
          Go to Sort
        </button>
      </main>
    );
  }

  const placing = app.fit.order.filter((id) => (app.fit.duels.get(id) ?? 0) < PLACED_AFTER).length;
  const unsorted = app.items.length - app.marks.size;

  const side = (item: Item, outcome: 'a' | 'b') => {
    const title = app.title(item);
    const state = picked === outcome ? 'won' : picked && picked !== 'tie' ? 'lost' : picked === 'tie' ? 'tied' : '';
    return (
      <div className={`contender ${state}`}>
        <button className="contender-pick" onClick={() => choose(outcome)} aria-label={`Pick ${title}`}>
          <Cover item={item} title={title} size="lg" />
          <span className="contender-rank">#{app.rankOf.get(item.id)}</span>
        </button>
        <h2 className="item-title">{title}</h2>
        <p className="item-meta">{metaLine(item)}</p>
        <button
          className="btn btn-quiet btn-small"
          onClick={() => {
            if (!picked) app.markItem(item.id, 'unseen');
          }}
        >
          Haven't seen
        </button>
      </div>
    );
  };

  return (
    <main className="screen duel">
      <p className="progress-line">
        {app.votes.length.toLocaleString()} duels
        {placing > 0 ? `, ${placing} still being placed` : ''}
      </p>
      <p className="duel-question">Which do you prefer?</p>
      <div className="arena" key={`${pair!.a}|${pair!.b}`}>
        {side(a, 'a')}
        <div className="vs" aria-hidden="true">
          vs
        </div>
        {side(b, 'b')}
      </div>
      <div className="action-row">
        <button className="btn" onClick={() => choose('tie')} title="Down arrow or T">
          Too close to call
        </button>
        <button className="btn btn-quiet" onClick={app.skipPair} title="Key S">
          Skip
        </button>
        <button className="btn btn-quiet" onClick={app.undo} disabled={!app.canUndo} title="Key Z">
          Undo
        </button>
      </div>
      <p className="moved" aria-live="polite">
        {app.moved &&
          (app.moved.to < app.moved.from
            ? `${app.moved.title} moved up to #${app.moved.to} (was #${app.moved.from}).`
            : app.moved.to > app.moved.from
              ? `${app.moved.title} moved down to #${app.moved.to}.`
              : `${app.moved.title} stays at #${app.moved.to}.`)}
      </p>
      {unsorted > 0 && (
        <p className="hint">
          {unsorted.toLocaleString()} titles not sorted yet.{' '}
          <button className="btn-link inline" onClick={onSort}>
            Sort more
          </button>
        </p>
      )}
      <p className="keys">Keys: ← → pick, ↓ too close, S skip, Z undo</p>
    </main>
  );
}
