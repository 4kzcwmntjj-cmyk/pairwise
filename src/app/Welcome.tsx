import { useEffect, useRef, useState } from 'react';
import { fromExport } from '../store/store';
import { Mark } from './Mark';
import type { AppState } from './useApp';

/**
 * The front page. On a first visit it loads the title list and waits for Start. Later, tapping the Shōbu
 * name in the top bar comes back here.
 */
export function Welcome({ app, onHelp, onStart }: { app: AppState; onHelp: () => void; onStart: () => void }) {
  const hasItems = app.items.length > 0;
  const [loading, setLoading] = useState(!hasItems);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const started = useRef(false);
  // Someone with a list already: Load a copy would replace it, so that stays in Settings behind a confirmation.
  const returning = app.marks.size > 0 || app.votes.length > 0;

  async function load() {
    setError(null);
    setLoading(true);
    try {
      await app.syncCatalogue(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Load the bundled title list as soon as the app opens for the first time.
  useEffect(() => {
    if (started.current || hasItems) return;
    started.current = true;
    load();
  });

  async function restore(file: File) {
    try {
      await app.replaceAll(fromExport(JSON.parse(await file.text())));
      onStart();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const ranked = app.fit.order.length;

  return (
    <main className="welcome">
      <Mark size={88} />
      <h1>Shōbu</h1>
      <p className="lede">
        Rank the anime you've watched and the manga you've read by picking between two at a time. Your list sorts itself as you go.
      </p>

      {loading ? (
        <div className="loader" role="status">
          <div className="bar">
            <div className="bar-fill indeterminate" />
          </div>
          <p>Loading the title list…</p>
        </div>
      ) : !hasItems ? (
        <div className="welcome-actions">
          <button className="btn btn-primary" onClick={load}>
            Try again
          </button>
        </div>
      ) : (
        <div className="welcome-actions">
          <button className="btn btn-primary" onClick={onStart}>
            {returning ? 'Back to duels' : 'Start'}
          </button>
          {returning && (
            <p className="hint">
              {ranked.toLocaleString()} ranked, {app.votes.length.toLocaleString()} {app.votes.length === 1 ? 'duel' : 'duels'} so far.
            </p>
          )}
        </div>
      )}

      <div className="welcome-actions welcome-more">
        <button className="btn btn-quiet" onClick={onHelp}>
          How it works
        </button>
        {!returning && (
          <>
            <button className="btn btn-quiet" onClick={() => fileRef.current?.click()}>
              Load a saved copy
            </button>
            <input
              ref={fileRef}
              id="restore-file"
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])}
            />
          </>
        )}
      </div>
      {error && <p className="error">{error}</p>}
    </main>
  );
}
