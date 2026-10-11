import { useEffect, useRef, useState } from 'react';
import { Add } from './Add';
import { Duel } from './Duel';
import { ForYou } from './ForYou';
import { ItemSheet } from './ItemSheet';
import { Ranking } from './Ranking';
import { SettingsScreen } from './SettingsScreen';
import { Sort } from './Sort';
import { useApp } from './useApp';
import { Welcome } from './Welcome';

type Tab = 'duel' | 'sort' | 'ranking' | 'foryou' | 'add' | 'settings';
const TABS: [Tab, string][] = [
  ['duel', 'Duel'],
  ['sort', 'Sort'],
  ['ranking', 'Ranking'],
  ['foryou', 'For you'],
  ['add', 'Add'],
  ['settings', 'Settings'],
];

export function App() {
  const app = useApp();
  const seen = app.fit.order.length;
  const [tab, setTab] = useState<Tab | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

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
  if (!hasItems) return <Welcome app={app} />;

  const current: Tab = tab ?? (seen >= 2 ? 'duel' : 'sort');

  return (
    <div className="shell">
      <header className="topbar">
        <span className="wordmark">Shōbu</span>
        <nav className="tabs" aria-label="Sections">
          {TABS.map(([t, label]) => (
            <button key={t} className={current === t ? 'on' : ''} aria-current={current === t ? 'page' : undefined} onClick={() => setTab(t)}>
              {label}
            </button>
          ))}
        </nav>
      </header>
      {current === 'duel' && <Duel app={app} onSort={() => setTab('sort')} />}
      {current === 'sort' && <Sort app={app} onDone={() => setTab('duel')} onFind={() => setTab('add')} />}
      {current === 'foryou' && <ForYou app={app} onOpen={setOpenId} onSort={() => setTab('sort')} />}
      {current === 'ranking' && <Ranking app={app} onOpen={setOpenId} />}
      {current === 'add' && <Add app={app} onOpen={setOpenId} />}
      {current === 'settings' && <SettingsScreen app={app} />}
      {openId && <ItemSheet app={app} itemId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
