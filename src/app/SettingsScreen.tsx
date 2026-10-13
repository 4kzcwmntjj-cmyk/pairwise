import { useRef, useState } from 'react';
import { CATALOGUE_SIZE, MANGA_SIZE } from '../anilist/catalogue';
import { fromExport, type Snapshot } from '../store/store';
import { AddToHome } from './AddToHome';
import { useInstall } from './install';
import type { AppState } from './useApp';

type Where = 'data' | 'catalogue';

const longDate = (t: number | string, year = false) =>
  new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'long', ...(year ? { year: 'numeric' } : {}) });

/**
 * Settings, most used first: your data (counts, last saved, Save / Load a copy), then the app (title language,
 * tips, How it works), your grouping changes, the catalogue, and Start over at the bottom. Each section is one
 * card of rows; a result shows under the button that caused it, not at the foot of the page.
 */
export function SettingsScreen({ app, onHelp }: { app: AppState; onHelp: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ kind: 'import'; snapshot: Snapshot } | { kind: 'reset' } | null>(null);
  const [message, setMessage] = useState<{ where: Where; text: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tipsReset, setTipsReset] = useState(false);
  const install = useInstall();

  const say = (where: Where, text: string) => setMessage({ where, text });
  const note = (where: Where) =>
    message?.where === where && (
      <p className="set-message" role="status">
        {message.text}
      </p>
    );

  async function exportData() {
    setMessage(null);
    const result = await app.saveBackup();
    if (result === 'shared') say('data', 'Shared. Pick Save to Files to keep it.');
    else if (result === 'downloaded') say('data', 'Saved a copy to your downloads.');
  }

  async function chooseImport(file: File) {
    try {
      setPending({ kind: 'import', snapshot: fromExport(JSON.parse(await file.text())) });
      setMessage(null);
    } catch (e) {
      say('data', (e as Error).message);
    }
  }

  async function refreshCatalogue() {
    setMessage(null);
    setRefreshing(true);
    try {
      const added = await app.syncCatalogue(true);
      say('catalogue', added === 0 ? 'Up to date.' : `${added} new titles added.`);
    } catch (e) {
      say('catalogue', (e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  const logged = app.marks.size;
  const duels = app.duelsPlayed;
  const replaced = Object.entries(app.resets)
    .filter(([id]) => app.itemById.has(id))
    .sort((x, y) => y[1] - x[1]);
  const savedAt = app.backup?.at;
  const ops = [...app.groupOps].reverse().filter((op) => op.kind !== 'forms' || app.apart.has(op.id));
  const tipsShown = app.tips.seen.length;

  const keep =
    app.persisted === 'yes'
      ? ' The browser has agreed not to clear it.'
      : app.persisted === 'no'
        ? ` The browser may clear it when space runs low${install.available ? '; adding the app to your Home Screen usually stops that' : ''}.`
        : '';

  return (
    <main className="screen settings-page">
      <h2 className="settings-title">Settings</h2>

      <section aria-labelledby="set-data">
        <h3 id="set-data">Your data</h3>
        <div className="set-group">
          <div className="set-row">
            <div>
              <p className="set-counts">
                {logged || duels ? (
                  <>
                    <b>{logged.toLocaleString()}</b> {logged === 1 ? 'title' : 'titles'} logged · <b>{duels.toLocaleString()}</b>{' '}
                    {duels === 1 ? 'duel' : 'duels'}
                  </>
                ) : (
                  'Nothing logged yet'
                )}
              </p>
              {(logged > 0 || duels > 0) && (
                <p className={app.backupDue ? 'set-sub due' : 'set-sub'}>
                  {savedAt ? `Last saved to a file on ${longDate(savedAt)}.` : 'Not saved to a file yet.'}
                </p>
              )}
            </div>
            <div className="action-row start">
              <button className={logged || duels ? 'btn btn-primary' : 'btn'} onClick={exportData}>
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
            {note('data')}
            {pending?.kind === 'import' && (
              <div className="confirm">
                <p>
                  Replace everything here with the copy from that file ({pending.snapshot.marks.length.toLocaleString()} logged,{' '}
                  {pending.snapshot.votes.length.toLocaleString()} duels)?
                </p>
                <div className="action-row start">
                  <button
                    className="btn btn-danger"
                    onClick={async () => {
                      await app.replaceAll(pending.snapshot);
                      setPending(null);
                      say('data', 'Loaded your copy.');
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
            <p className="set-sub">
              Your list is kept in this browser only.{keep} A saved copy is your backup, and how you move the list to another
              device. On a phone, Save a copy opens the share sheet: choose Save to Files.
            </p>
          </div>
          {install.available && (
            <div className="set-row">
              <div className="set-line">
                <div>
                  <p className="set-label">Home Screen app</p>
                  <p className="set-sub">Opens full screen, like an app, and works without a connection.</p>
                </div>
              </div>
              <div className="action-row start set-install">
                <AddToHome className="btn btn-small" />
              </div>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="set-app">
        <h3 id="set-app">App</h3>
        <div className="set-group">
          <div className="set-row">
            <div className="set-line">
              <p className="set-label" id="set-lang">
                Titles in
              </p>
              <div className="segmented" role="radiogroup" aria-labelledby="set-lang">
                {(
                  [
                    ['english', 'English'],
                    ['romaji', 'Romaji'],
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
            </div>
          </div>
          <div className="set-row">
            <div className="set-line">
              <div>
                <p className="set-label" id="set-tips">
                  Tips
                </p>
                <p className="set-sub">
                  Short notes in Duel, each shown once.
                  {tipsReset ? (
                    ' Seen ones will show again.'
                  ) : tipsShown > 0 ? (
                    <>
                      {' '}
                      <button
                        className="btn-link inline"
                        onClick={() => {
                          app.changeTips({ off: false, seen: [], lastAt: 0 });
                          setTipsReset(true);
                        }}
                      >
                        Show seen tips again
                      </button>
                    </>
                  ) : null}
                </p>
              </div>
              <button
                className="switch"
                role="switch"
                aria-checked={!app.tips.off}
                aria-labelledby="set-tips"
                onClick={() => app.changeTips({ ...app.tips, off: !app.tips.off })}
              />
            </div>
          </div>
          <button className="set-row set-row-button" onClick={onHelp}>
            <span className="set-line">
              <span>
                <span className="set-label">How it works</span>
                <span className="set-sub">Duels, the ranking, Taste and Picks, and where your data lives.</span>
              </span>
              <Chevron />
            </span>
          </button>
        </div>
      </section>

      {ops.length > 0 && (
        <section aria-labelledby="set-ops">
          <h3 id="set-ops">Your grouping changes</h3>
          <div className="set-group">
            {ops.map((op) => (
              <div className="set-row" key={`${op.kind}${op.at}`}>
                <div className="set-line">
                  <div>
                    <p className="set-label">
                      {op.label ?? (op.kind === 'join' ? 'Two titles' : op.kind === 'forms' ? 'A title' : 'Part of a title')}
                    </p>
                    <p className="set-sub">
                      {op.kind === 'join' ? 'Joined' : op.kind === 'forms' ? 'Anime and manga ranked apart' : 'Split up'} ·{' '}
                      {new Date(op.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                  <button className="btn btn-small" onClick={() => app.removeGroupOp(op)}>
                    Undo
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="set-foot">
            Kept on top of every catalogue update. Undo puts the titles back as they were, each with its own duels.
          </p>
        </section>
      )}

      {replaced.length > 0 && (
        <section aria-labelledby="set-replaced">
          <h3 id="set-replaced">Re-placed titles</h3>
          <div className="set-group">
            {replaced.map(([id, at]) => {
              const aside = app.setAsideOf(id);
              return (
                <div className="set-row" key={id}>
                  <div className="set-line">
                    <div>
                      <p className="set-label">{app.title(app.itemById.get(id)!)}</p>
                      <p className="set-sub">
                        Re-placed · {new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                        {aside > 0 ? ` · ${aside} ${aside === 1 ? 'duel' : 'duels'} set aside` : ''}
                      </p>
                    </div>
                    <button className="btn btn-small" onClick={() => app.restoreDuels(id)}>
                      Count again
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="set-foot">Count again puts a title's earlier duels back, alongside the ones played since.</p>
        </section>
      )}

      <section aria-labelledby="set-cat">
        <h3 id="set-cat">Catalogue</h3>
        <div className="set-group">
          <div className="set-row">
            <div className="set-line">
              <div>
                <p className="set-label">
                  {app.items.length.toLocaleString()} titles
                  {app.catalogueAt ? <span className="set-label-date"> · built {longDate(app.catalogueAt, true)}</span> : null}
                </p>
                <p className="set-sub">
                  From AniList's {CATALOGUE_SIZE.toLocaleString()} most popular anime and {MANGA_SIZE.toLocaleString()} most popular
                  manga. Rebuilt monthly; new titles arrive when you open the app, and your list is kept.
                </p>
              </div>
            </div>
            <div className="action-row start">
              <button className="btn btn-small" onClick={refreshCatalogue} disabled={refreshing}>
                {refreshing ? 'Checking…' : 'Check for new titles'}
              </button>
            </div>
            {note('catalogue')}
          </div>
        </div>
      </section>

      <section aria-label="Start over">
        <div className="set-group">
          <div className="set-row">
            {pending?.kind === 'reset' ? (
              <div className="confirm">
                <p>
                  Delete your list, duels, grouping changes and friends' lists from this browser? Save a copy first if you might
                  want them back.
                </p>
                <div className="action-row start">
                  <button
                    className="btn btn-danger"
                    onClick={async () => {
                      setPending(null);
                      setMessage(null);
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
              <div className="set-line">
                <div>
                  <p className="set-label">Start over</p>
                  <p className="set-sub">Removes everything Shōbu keeps in this browser.</p>
                </div>
                <button className="btn btn-small btn-danger-quiet" onClick={() => setPending({ kind: 'reset' })}>
                  Delete all data
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <p className="hint about">
        Anime data and cover art from{' '}
        <a href="https://anilist.co" target="_blank" rel="noreferrer">
          AniList
        </a>
        .
      </p>
    </main>
  );
}

function Chevron() {
  return (
    <svg className="set-chevron" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
