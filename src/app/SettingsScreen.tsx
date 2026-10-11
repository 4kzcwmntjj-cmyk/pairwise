import { useRef, useState } from 'react';
import { CATALOGUE_SIZE, fetchCatalogue, type LoadProgress } from '../anilist/catalogue';
import { groupFranchises } from '../anilist/group';
import { fromExport, toExport, type Snapshot } from '../store/store';
import type { AppState } from './useApp';

export function SettingsScreen({ app }: { app: AppState }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ kind: 'import'; snapshot: Snapshot } | { kind: 'reset' } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [refresh, setRefresh] = useState<LoadProgress | null>(null);

  function exportData() {
    const blob = new Blob([JSON.stringify(toExport(app.snapshot()))], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pairwise-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('Saved a copy of your data.');
  }

  async function chooseImport(file: File) {
    try {
      setPending({ kind: 'import', snapshot: fromExport(JSON.parse(await file.text())) });
      setMessage(null);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }

  async function refreshCatalogue() {
    setMessage(null);
    setRefresh({ loaded: 0, total: CATALOGUE_SIZE });
    try {
      const media = await fetchCatalogue(setRefresh);
      const before = app.items.length;
      const grouped = groupFranchises(media, app.items.filter((i) => i.source === 'anilist'));
      await app.saveItems(grouped);
      setMessage(`Catalogue refreshed. ${Math.max(0, grouped.length - before)} new titles.`);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setRefresh(null);
    }
  }

  return (
    <main className="screen settings">
      <section>
        <h3>Titles</h3>
        <div className="segmented" role="radiogroup" aria-label="Title language">
          {(
            [
              ['english', 'English'],
              ['romaji', 'Japanese (romaji)'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              role="radio"
              aria-checked={app.settings.titleLanguage === v}
              className={app.settings.titleLanguage === v ? 'on' : ''}
              onClick={() => app.setSettings({ ...app.settings, titleLanguage: v })}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>Your data</h3>
        <p>
          Everything is saved in this browser only: {app.marks.size.toLocaleString()} titles sorted and{' '}
          {app.votes.length.toLocaleString()} duels. Save a copy now and then, and use it to move your list to another device.
        </p>
        <div className="action-row start">
          <button className="btn" onClick={exportData}>
            Save a copy
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Load a copy
          </button>
          <input
            ref={fileRef}
            id="import-file"
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              if (e.target.files?.[0]) chooseImport(e.target.files[0]);
              e.target.value = '';
            }}
          />
        </div>
        {pending?.kind === 'import' && (
          <div className="confirm">
            <p>
              Replace everything here with the copy from that file ({pending.snapshot.marks.length.toLocaleString()} sorted,{' '}
              {pending.snapshot.votes.length.toLocaleString()} duels)?
            </p>
            <div className="action-row start">
              <button
                className="btn btn-danger"
                onClick={async () => {
                  await app.replaceAll(pending.snapshot);
                  setPending(null);
                  setMessage('Loaded your copy.');
                }}
              >
                Replace my data
              </button>
              <button className="btn btn-quiet" onClick={() => setPending(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      <section>
        <h3>Catalogue</h3>
        <p>
          {app.items.length.toLocaleString()} titles. Refreshing fetches the current {CATALOGUE_SIZE.toLocaleString()} most popular
          from AniList and adds new ones. Your sorting and duels are kept.
        </p>
        {refresh ? (
          <p role="status">
            Loaded {refresh.loaded.toLocaleString()} of {refresh.total.toLocaleString()}…
          </p>
        ) : (
          <button className="btn" onClick={refreshCatalogue}>
            Refresh catalogue
          </button>
        )}
      </section>

      <section>
        <h3>Start over</h3>
        {pending?.kind === 'reset' ? (
          <div className="confirm">
            <p>This deletes your catalogue, sorting and every duel from this browser. Save a copy first if you might want it back.</p>
            <div className="action-row start">
              <button
                className="btn btn-danger"
                onClick={async () => {
                  setPending(null);
                  await app.resetAll();
                }}
              >
                Delete everything
              </button>
              <button className="btn btn-quiet" onClick={() => setPending(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="btn btn-quiet" onClick={() => setPending({ kind: 'reset' })}>
            Delete all data
          </button>
        )}
      </section>

      {message && (
        <p className="toast" role="status">
          {message}
        </p>
      )}
      <p className="hint about">
        Anime data and cover art from <a href="https://anilist.co" target="_blank" rel="noreferrer">AniList</a>.
      </p>
    </main>
  );
}
