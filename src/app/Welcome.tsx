import { useRef, useState } from 'react';
import { CATALOGUE_SIZE, fetchCatalogue, type LoadProgress } from '../anilist/catalogue';
import { groupFranchises } from '../anilist/group';
import { fromExport } from '../store/store';
import type { AppState } from './useApp';

export function Welcome({ app }: { app: AppState }) {
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setError(null);
    setProgress({ loaded: 0, total: CATALOGUE_SIZE });
    try {
      const media = await fetchCatalogue(setProgress);
      await app.saveItems(groupFranchises(media));
    } catch (e) {
      setError((e as Error).message);
      setProgress(null);
    }
  }

  async function restore(file: File) {
    try {
      await app.replaceAll(fromExport(JSON.parse(await file.text())));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const secondsLeft = progress ? Math.ceil(((progress.total - progress.loaded) / 50) * 2.1) : 0;

  return (
    <main className="welcome">
      <div className="welcome-mark" aria-hidden="true">
        <span>A</span>
        <span className="welcome-vs">vs</span>
        <span>B</span>
      </div>
      <h1>Pairwise</h1>
      <p className="lede">Rank the anime you've watched by picking between two at a time. Your list sorts itself as you go.</p>

      {progress ? (
        <div className="loader" role="status">
          <div className="bar">
            <div className="bar-fill" style={{ width: `${(progress.loaded / progress.total) * 100}%` }} />
          </div>
          <p>
            {progress.waitingSeconds
              ? `AniList asked us to slow down. Resuming in ${progress.waitingSeconds} seconds.`
              : `Loaded ${progress.loaded.toLocaleString()} of ${progress.total.toLocaleString()} titles from AniList. About ${secondsLeft} seconds left.`}
          </p>
        </div>
      ) : (
        <div className="welcome-actions">
          <button className="btn btn-primary" onClick={load}>
            Load the {CATALOGUE_SIZE.toLocaleString()} most popular anime
          </button>
          <p className="hint">This happens once and takes about a minute. Seasons and films are grouped into one entry per series.</p>
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
