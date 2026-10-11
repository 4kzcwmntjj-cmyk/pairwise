import { useEffect, useRef, useState } from 'react';
import { Duel } from './Duel';
import { ForYou } from './ForYou';
import { HowItWorks } from './HowItWorks';
import { ItemSheet } from './ItemSheet';
import { Ranking } from './Ranking';
import { SettingsScreen } from './SettingsScreen';
import { Sort } from './Sort';
import { Stats } from './Stats';
import { useApp } from './useApp';
import { ViewSwitch } from './ViewSwitch';
import { Welcome } from './Welcome';

type Tab = 'duel' | 'sort' | 'ranking' | 'stats' | 'foryou' | 'settings';
const TABS: [Tab, string][] = [
  ['duel', 'Duel'],
  ['sort', 'Sort'],
  ['ranking', 'Ranking'],
  ['stats', 'Stats'],
  ['foryou', 'For you'],
  ['settings', 'Settings'],
];

export function App() {
  const app = useApp();
  const seen = app.fit.order.length;
  const [tab, setTab] = useState<Tab | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [help, setHelp] = useState(false);

  const hasItems = app.items.length > 0;

  // Bring in a newer catalogue, if the site has one, once per launch.
  const synced = useRef(false);
  useEffect(() => {
    if (!app.ready || !hasItems || synced.current) return;
    synced.current = true;
    app.syncCatalogue().catch(() => undefined);
  });

  // Pick the opening screen once, when data first loads; after that only the person changes tabs.
  useEffect(() => {
    if (app.ready && hasItems && tab === null) setTab(seen >= 2 ? 'duel' : 'sort');
  }, [app.ready, hasItems, tab, seen]);

  if (!app.ready) return <div className="boot" />;
  if (help) return <HowItWorks onClose={() => setHelp(false)} />;
  if (!hasItems) return <Welcome app={app} onHelp={() => setHelp(true)} />;

  const current: Tab = tab ?? (seen >= 2 ? 'duel' : 'sort');

  return (
    <div className="shell">
      <header className="topbar">
        <span className="wordmark">Shōbu</span>
        <ViewSwitch app={app} compact />
        <nav className="tabs" aria-label="Sections">
          {TABS.map(([t, label]) => (
            <button key={t} className={current === t ? 'on' : ''} aria-current={current === t ? 'page' : undefined} onClick={() => setTab(t)}>
              {label}
            </button>
          ))}
        </nav>
      </header>
      {app.backupDue && (
        <div className="notice backup-note" role="status">
          <p>
            {app.backup
              ? 'You have new sorting and duels since your last saved copy.'
              : 'Your list only exists in this browser so far.'}{' '}
            Save a copy so it can't be lost.
          </p>
          <div className="action-row start">
            <button className="btn btn-primary btn-small" onClick={() => app.saveBackup()}>
              Save a copy
            </button>
            <button className="btn btn-quiet btn-small" onClick={() => app.snoozeBackup()}>
              Not now
            </button>
          </div>
        </div>
      )}
      {current === 'duel' && <Duel app={app} onSort={() => setTab('sort')} />}
      {current === 'sort' && <Sort app={app} onDone={() => setTab('duel')} onOpen={setOpenId} />}
      {current === 'stats' && <Stats app={app} onOpen={setOpenId} />}
      {current === 'foryou' && <ForYou app={app} onOpen={setOpenId} onSort={() => setTab('sort')} />}
      {current === 'ranking' && <Ranking app={app} onOpen={setOpenId} />}
      {current === 'settings' && <SettingsScreen app={app} onHelp={() => setHelp(true)} />}
      {openId && <ItemSheet app={app} itemId={openId} onClose={() => setOpenId(null)} onOpen={setOpenId} />}
    </div>
  );
}
