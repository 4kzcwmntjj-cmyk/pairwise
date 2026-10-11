import { useEffect, useRef, useState } from 'react';
import { fromExport } from '../store/store';
import type { AppState } from './useApp';

export function Welcome({ app }: { app: AppState }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const started = useRef(false);

  async function load() {
    setError(null);
    setLoading(true);
    try {
      await app.syncCatalogue(true);
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }

  // Load the bundled title list as soon as the app opens for the first time.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    load();
  });

  async function restore(file: File) {
    try {
      await app.replaceAll(fromExport(JSON.parse(await file.text())));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <main className="welcome">
      <div className="welcome-mark" aria-hidden="true">
        <span>A</span>
        <span className="welcome-vs">vs</span>
        <span>B</span>
      </div>
      <h1>Pairwise</h1>
      <p className="lede">Rank the anime you've watched by picking between two at a time. Your list sorts itself as you go.</p>

      {loading && !error ? (
        <div className="loader" role="status">
          <div className="bar">
            <div className="bar-fill indeterminate" />
          </div>
          <p>Loading the 1,500 most popular anime…</p>
        </div>
      ) : (
        <div className="welcome-actions">
          <button className="btn btn-primary" onClick={load}>
            Try again
          </button>
          <button className="btn btn-quiet" onClick={() => fileRef.current?.click()}>
            Restore from a saved file
          </button>
          <input
            ref={fileRef}
            id="restore-file"
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])}
          />
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </main>
  );
}
