/*
 * Lets Shōbu start without a connection. Your lists are already stored on the device; this stores the app itself
 * and the title catalogue.
 *
 * - App cache (named after the build, so each deploy gets a fresh one and the old one is deleted): the page,
 *   its script and style files, the icons and the manifest. Filled when the worker installs, by reading
 *   index.html for the file names.
 * - Data cache (kept across deploys): catalogue.json, so a new deploy doesn't download it again for nothing.
 * - Font cache: the Google Fonts stylesheet and font files.
 *
 * The page and the catalogue are fetched from the network first (so a new deploy or a new catalogue shows up as
 * before) and fall back to the stored copy when the network fails or takes too long. Script, style and icon
 * files have the build hash in their names, so the stored copy is used first.
 *
 * AniList cover images are not stored: they come from another site and each would take far more room than its
 * size. Offline, covers show as colour blocks with initials.
 */
const BUILD = '__BUILD__';
const APP = `shobu-app-${BUILD}`;
const DATA = 'shobu-data';
const FONTS = 'shobu-fonts';

const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-180.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP);
      // Read the built page to find the hashed script and style files.
      const res = await fetch('./index.html', { cache: 'reload' });
      const html = await res.clone().text();
      const files = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map((m) => m[1]);
      await cache.put('./index.html', res.clone());
      await cache.put('./', res);
      await Promise.all(
        [...new Set([...SHELL.slice(2), ...files])].map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: 'reload' }));
          } catch {
            // One missing file shouldn't stop the worker installing; it is stored when first used.
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([APP, DATA, FONTS]);
      for (const name of await caches.keys()) {
        if (name.startsWith('shobu-') && !keep.has(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

/** Network first. After `timeoutMs` (or on failure) the stored copy is used if there is one. */
async function networkFirst(request, cacheName, timeoutMs, fallbackKey) {
  const cache = await caches.open(cacheName);
  const network = fetch(request).then((res) => {
    if (res.ok) cache.put(fallbackKey ?? request, res.clone());
    return res;
  });
  const stored = () => cache.match(fallbackKey ?? request, { ignoreSearch: true });
  try {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), timeoutMs));
    const hit = await stored();
    // With nothing stored there is nothing to fall back to, so wait for the network.
    return hit ? await Promise.race([network, timeout]) : await network;
  } catch (err) {
    network.catch(() => {}); // a late answer still updates the stored copy
    const hit = await stored();
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const fresh = fetch(request)
    .then((res) => {
      // Stylesheet and font files come from another site, so the answer can be opaque (status 0).
      if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
      return res;
    })
    .catch(() => undefined);
  if (hit) {
    fresh.catch(() => {});
    return hit;
  }
  return (await fresh) ?? Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    const path = url.pathname;
    if (path.endsWith('/catalogue.json')) {
      event.respondWith(networkFirst(request, DATA, 10000));
    } else if (request.mode === 'navigate') {
      event.respondWith(networkFirst(request, APP, 4000, './index.html'));
    } else if (path.endsWith('/sw.js') || path.endsWith('/catalogue-version.json')) {
      // The worker file: the browser checks it for a new worker itself. The version file: only worth asking
      // the network; offline there is nothing new to bring in.
      return;
    } else {
      event.respondWith(cacheFirst(request, APP));
    }
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(request, FONTS));
  }
});
