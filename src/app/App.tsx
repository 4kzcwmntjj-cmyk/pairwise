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
  ['sort', 'Library'],
  ['ranking', 'Ranking'],
  ['stats', 'Stats'],
  ['foryou', 'For you'],
  ['settings', 'Settings'],
];

export function App() {
  const app = useApp();
  const [tab, setTab] = useState<Tab | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  /** The front page: shown on a first visit until Start, and whenever the Shōbu name is tapped. */
  const [home, setHome] = useState<boolean | null>(null);

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
    if (app.ready && hasItems && tab === null) setTab('duel');
  }, [app.ready, hasItems, tab]);

  // A first visit (nothing stored yet) opens on the front page and stays there until Start.
  useEffect(() => {
    if (app.ready && home === null) setHome(!hasItems);
  }, [app.ready, home, hasItems]);

  if (!app.ready || home === null) return <div className="boot" />;
  if (help) return <HowItWorks onClose={() => setHelp(false)} />;
  if (home || !hasItems) {
    // The welcome screen loads the catalogue itself; the launch check would only write it all again.
    if (!hasItems) synced.current = true;
    return (
      <Welcome
        app={app}
        onHelp={() => setHelp(true)}
        onStart={() => {
          setHome(false);
          setTab('duel');
        }}
      />
    );
  }

  const current: Tab = tab ?? 'duel';

  return (
    <div className="shell">
      <header className="topbar">
        <button className="wordmark" onClick={() => setHome(true)} aria-label="Shōbu: front page" title="Front page">
          Shōbu
        </button>
        <ViewSwitch app={app} compact />
        <nav className="tabs" aria-label="Sections">
          {TABS.map(([t, label]) => (
            <button key={t} className={current === t ? 'on' : ''} aria-current={current === t ? 'page' : undefined} onClick={() => setTab(t)}>
              {label}
            </button>
          ))}
        </nav>
      </header>
      {current === 'duel' && <Duel app={app} onLibrary={() => setTab('sort')} onOpen={setOpenId} />}
      {current === 'sort' && <Sort app={app} onDone={() => setTab('duel')} onOpen={setOpenId} />}
      {current === 'stats' && <Stats app={app} onOpen={setOpenId} />}
      {current === 'foryou' && <ForYou app={app} onOpen={setOpenId} onSort={() => setTab('sort')} />}
      {current === 'ranking' && <Ranking app={app} onOpen={setOpenId} />}
      {current === 'settings' && <SettingsScreen app={app} onHelp={() => setHelp(true)} />}
      {openId && <ItemSheet app={app} itemId={openId} onClose={() => setOpenId(null)} onOpen={setOpenId} />}
    </div>
  );
}
