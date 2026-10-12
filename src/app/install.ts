import { useSyncExternalStore } from 'react';

/**
 * Adding the app to the Home Screen. Chrome and Edge (Android and desktop) hand the page an install prompt
 * that one button can open. iPhone Safari has no such thing: the person has to use the Share menu.
 */
interface PromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const hasWindow = typeof window !== 'undefined';
const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;

export const isIos =
  /iphone|ipad|ipod/i.test(ua) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isPhone = isIos || /android/i.test(ua);

const runningInstalled = () =>
  hasWindow && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);

let deferred: PromptEvent | null = null;
let installed = runningInstalled();
let snap = { installed, canPrompt: false };
const listeners = new Set<() => void>();

function publish() {
  snap = { installed, canPrompt: deferred !== null };
  listeners.forEach((l) => l());
}

// The event can arrive before the app has drawn anything, so it is caught here, when this file loads.
if (hasWindow) {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as PromptEvent;
    publish();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    publish();
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Opens the browser's own install prompt. A prompt can be used once. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const ev = deferred;
  if (!ev) return 'unavailable';
  deferred = null;
  publish();
  await ev.prompt();
  return (await ev.userChoice).outcome;
}

export const installLabel = isPhone ? 'Add to Home Screen' : 'Install app';

export const installSteps = isIos
  ? 'Tap the Share button in Safari, then Add to Home Screen. Safari can clear a site\'s data after about a week away; a Home Screen app is exempt. It keeps its own data, so save a copy first and use Load a copy in it.'
  : 'Open the browser menu and choose Add to Home screen (or Install app).';

export function useInstall() {
  const s = useSyncExternalStore(subscribe, () => snap, () => snap);
  return { ...s, available: !s.installed && (s.canPrompt || isPhone) };
}
