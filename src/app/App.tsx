import { useEffect, useRef, useState } from 'react';
import { decodeList } from '../rank/listLink';
import { Compare } from './Compare';
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
  ['ranking', 'Ranking'],
  ['sort', 'Library'],
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
  /** The Compare screen, open over the tabs, with the friend's list to show first. */
  const [comparing, setComparing] = useState<{ key?: string } | null>(null);

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

  // A friend's list arrives in the link's fragment: keep it, take it out of the address bar, and open Compare.
  // Pasting a link into a tab that's already open changes only the fragment, hence the hashchange listener.
  const addFriend = useRef(app.addFriend);
  addFriend.current = app.addFriend;
  useEffect(() => {
    if (!app.ready) return;
    const take = () => {
      const list = decodeList(location.hash);
      if (!list) return;
      history.replaceState(null, '', location.pathname + location.search);
      addFriend.current(list).then((key) => setComparing({ key }));
    };
    take();
    window.addEventListener('hashchange', take);
    return () => window.removeEventListener('hashchange', take);
  }, [app.ready]);

  // A first visit (nothing stored yet) opens on the front page and stays there until Start.
  useEffect(() => {
    if (app.ready && home === null) setHome(!hasItems);
  }, [app.ready, home, hasItems]);

  if (!app.ready || home === null) return <div className="boot" />;
  if (help) return <HowItWorks onClose={() => setHelp(false)} />;
  // A friend's link shows Compare even on a first visit, once the title list has loaded.
  const showCompare = comparing !== null && hasItems;
  if ((home || !hasItems) && !showCompare) {
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
        <button
          className="wordmark"
          onClick={() => {
            setComparing(null);
            setHome(true);
          }}
          aria-label="Shōbu: front page"
          title="Front page"
        >
          Shōbu
        </button>
        <ViewSwitch app={app} compact />
        <nav className="tabs" aria-label="Sections">
          {TABS.map(([t, label]) => (
            <button
              key={t}
              className={current === t && !showCompare ? 'on' : ''}
              aria-current={current === t && !showCompare ? 'page' : undefined}
              onClick={() => {
                setComparing(null);
                setHome(false);
                setTab(t);
              }}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>
      {showCompare && (
        <Compare
          app={app}
          initialKey={comparing.key}
          onOpen={setOpenId}
          onClose={() => setComparing(null)}
          onStart={() => {
            setComparing(null);
            setHome(false);
            setTab('duel');
          }}
        />
      )}
      {!showCompare && current === 'duel' && <Duel app={app} onLibrary={() => setTab('sort')} onOpen={setOpenId} />}
      {!showCompare && current === 'sort' && <Sort app={app} onDone={() => setTab('duel')} onOpen={setOpenId} />}
      {!showCompare && current === 'stats' && <Stats app={app} onOpen={setOpenId} />}
      {!showCompare && current === 'foryou' && <ForYou app={app} onOpen={setOpenId} onSort={() => setTab('sort')} />}
      {!showCompare && current === 'ranking' && <Ranking app={app} onOpen={setOpenId} onCompare={() => setComparing({})} />}
      {!showCompare && current === 'settings' && <SettingsScreen app={app} onHelp={() => setHelp(true)} />}
      {openId && <ItemSheet app={app} itemId={openId} onClose={() => setOpenId(null)} onOpen={setOpenId} />}
    </div>
  );
}
