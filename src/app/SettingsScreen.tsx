import { useRef, useState } from 'react';
import { CATALOGUE_SIZE } from '../anilist/catalogue';
import { fromExport, toExport, type Snapshot } from '../store/store';
import type { AppState } from './useApp';

export function SettingsScreen({ app }: { app: AppState }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ kind: 'import'; snapshot: Snapshot } | { kind: 'reset' } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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
    setRefreshing(true);
    try {
      const added = await app.syncCatalogue(true);
      setMessage(added === 0 ? 'Catalogue is up to date.' : `Catalogue updated: ${added} new titles.`);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setRefreshing(false);
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
          {app.items.length.toLocaleString()} titles, built from AniList's {CATALOGUE_SIZE.toLocaleString()} most popular anime
          {app.catalogueAt ? ` on ${new Date(app.catalogueAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}.
          The list is rebuilt monthly and new titles are added when you open the app. Your sorting and duels are kept.
        </p>
        <button className="btn" onClick={refreshCatalogue} disabled={refreshing}>
          {refreshing ? 'Checking…' : 'Check for new titles'}
        </button>
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
