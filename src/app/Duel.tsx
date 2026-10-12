import { useEffect, useState } from 'react';
import { PLACED_AFTER } from '../rank/pairs';
import type { Item, Outcome } from '../types';
import { Cover } from './Cover';
import { viewWords } from './meta';
import type { AppState } from './useApp';

/** Titles waiting for "anime or manga?" before Duel asks about them together. */
const FORM_BATCH = 4;

export function Duel({ app, onLibrary, onOpen }: { app: AppState; onLibrary: () => void; onOpen: (id: string) => void }) {
  const [picked, setPicked] = useState<Outcome | null>(null);
  const pair = app.pair;
  const fresh = pair?.fresh ?? [];
  // Once the watched-or-read card opens, it stays until every title on it is answered.
  const [formOpen, setFormOpen] = useState(false);
  const pending = app.formPending.length;
  useEffect(() => {
    if (pending >= FORM_BATCH) setFormOpen(true);
    else if (pending === 0) setFormOpen(false);
  }, [pending]);
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
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || (formOpen && pending > 0)) return;
      if (e.key === 'ArrowLeft') choose('a');
      else if (e.key === 'ArrowRight') choose('b');
      else if (e.key === 'ArrowDown' || e.key.toLowerCase() === 't') choose('tie');
      else if (e.key.toLowerCase() === 's') app.skipPair();
      else if (e.key.toLowerCase() === 'n' && fresh.length === 1 && !picked) app.notSeenInDuel(fresh[0]);
      else if (e.key === 'Backspace' || e.key.toLowerCase() === 'z') app.undo('duel');
      else return;
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!a || !b) {
    return (
      <main className="screen empty">
        <h2>Nothing to compare</h2>
        <p>There are no titles left to bring in. Add one from the Library and duels start again.</p>
        <button className="btn btn-primary" onClick={onLibrary}>
          Go to the Library
        </button>
      </main>
    );
  }
  const starting = app.votes.length === 0;

  // A few new titles that exist as anime and manga are waiting: ask about them in place of the next duel.
  if (formOpen && pending > 0) {
    return (
      <main className="screen duel quick-check">
        <div className="notice form-ask" role="status">
          <p>
            <span className="note-label">Quick check</span>
            You've added {pending === 1 ? 'a title' : `${pending} titles`} that {pending === 1 ? 'exists' : 'exist'} as both anime
            and manga. Which did you see? This decides where they show in the Anime and Manga views.
          </p>
          <ul className="form-list">
            {app.formPending.map((id) => {
              const it = app.itemById.get(id);
              if (!it) return null;
              return (
                <li key={id}>
                  <span>{app.title(it)}</span>
                  <span className="form-choices">
                    <button className="btn btn-small" onClick={() => app.answerForm(id, { anime: true, manga: false })}>
                      Anime
                    </button>
                    <button className="btn btn-small" onClick={() => app.answerForm(id, { anime: false, manga: true })}>
                      Manga
                    </button>
                    <button className="btn btn-small" onClick={() => app.answerForm(id, { anime: true, manga: true })}>
                      Both
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
          <button className="btn btn-quiet btn-small" onClick={() => app.answerForm(null, null)}>
            Back to duels (the rest wait in the Library)
          </button>
        </div>
      </main>
    );
  }

  const placing = app.fit.order.filter((id) => (app.fit.duels.get(id) ?? 0) < PLACED_AFTER).length;
  const side = (item: Item, outcome: 'a' | 'b') => {
    const title = app.title(item);
    const isNew = fresh.includes(item.id);
    const state = picked === outcome ? 'won' : picked && picked !== 'tie' ? 'lost' : picked === 'tie' ? 'tied' : '';
    return (
      <div className={`contender ${state}`}>
        <button className="contender-pick" onClick={() => choose(outcome)} aria-label={`Pick ${title}`}>
          <Cover look={app.look(item)} title={title} size="lg" />
          <span className={`contender-rank${isNew ? ' is-new' : ''}`}>{isNew ? 'New' : `#${app.rankOf.get(item.id)}`}</span>
        </button>
        <h2 className="item-title">{title}</h2>
        <p className="item-meta">{app.look(item).meta}</p>
        <button
          className="btn btn-quiet btn-small"
          onClick={() => {
            if (!picked) app.notSeenInDuel(item.id);
          }}
          title={isNew ? 'Key N' : undefined}
        >
          {viewWords(app.view).unseen}
        </button>
      </div>
    );
  };

  return (
    <main className="screen duel">
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
        <button className="btn btn-quiet" onClick={() => app.undo('duel')} disabled={!app.canUndo('duel')} title="Key Z">
          Undo
        </button>
      </div>
      {app.tip && (
        <div className="tip" role="status">
          <p>
            <span className="note-label">Tip</span>
            {app.tip.text}
          </p>
          <div className="tip-actions">
            {app.tip.open && (
              <button
                className="btn btn-small"
                onClick={() => {
                  onOpen(app.tip!.open!.itemId);
                  app.dismissTip();
                }}
              >
                {app.tip.open.label}
              </button>
            )}
            <button className="btn btn-quiet btn-small" onClick={app.dismissTip}>
              Got it
            </button>
          </div>
        </div>
      )}
      {app.tip ? null : fresh.length === 2 ? (
        <p className="hint newcomer-hint">
          {starting ? 'Your list starts here. ' : ''}Pick the one you prefer, or press Haven't seen under one you don't know.
        </p>
      ) : fresh.length === 1 ? (
        <p className="hint newcomer-hint">
          New to your list. Pick as usual if you know it.
        </p>
      ) : null}
      <p className="moved" aria-live="polite">
        {app.moved &&
          (app.moved.isNew
            ? app.moved.both
              ? `${app.moved.title} join your list.`
              : `${app.moved.title} joins your list at #${app.moved.to}.`
            : app.moved.to < app.moved.from
            ? `${app.moved.title} moved up to #${app.moved.to} (was #${app.moved.from}).`
            : app.moved.to > app.moved.from
              ? `${app.moved.title} moved down to #${app.moved.to}.`
              : `${app.moved.title} stays at #${app.moved.to}.`)}
      </p>
      <p className="progress-line">
        {app.votes.length.toLocaleString()} duels
        {placing > 0 ? `, ${placing} still being placed` : ''}
      </p>
      <p className="keys">Keys: ← → pick, ↓ too close, S skip, Z undo{fresh.length === 1 ? ', N haven\'t seen the new one' : ''}</p>
    </main>
  );
}
