import { useSyncExternalStore } from 'react';

/**
 * A new version of the site has taken over (public/sw.js activates a new worker straight away). The page in
 * front still runs the old code until it reloads, so the app offers a Reload. A Home Screen app can stay open
 * for days, so the worker is also asked to look for a new version whenever the app comes back to the front.
 */
let ready = false;
const listeners = new Set<() => void>();

function markReady() {
  if (ready) return;
  ready = true;
  for (const l of listeners) l();
}

/** Call before registering the worker. The first install also takes control; that one isn't an update. */
export function watchForUpdates(): void {
  const sw = navigator.serviceWorker;
  const hadController = !!sw.controller;
  sw.addEventListener('controllerchange', () => {
    if (hadController) markReady();
  });
}

/** Asks the browser to check for a new worker when the app returns to the front, at most once every 10 minutes. */
export function checkWhenShown(reg: ServiceWorkerRegistration): void {
  let last = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || Date.now() - last < 10 * 60_000) return;
    last = Date.now();
    reg.update().catch(() => undefined);
  });
}

export function useUpdateReady(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => ready,
  );
}
