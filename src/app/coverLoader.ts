/**
 * Loads a cover so it can be drawn onto a canvas that is then exported.
 *
 * A plain `<img crossorigin>` can reuse the copy the browser cached without CORS
 * headers when the same cover was shown in the Ranking list, and then fails.
 * So each cover is fetched with CORS and `cache: 'reload'`. If that fails
 * (the CDN sends no Access-Control-Allow-Origin, or the network refuses),
 * the same image is fetched through wsrv.nl, which adds the header.
 */

const TIMEOUT_MS = 8000;

async function fetchBitmap(url: string): Promise<ImageBitmap> {
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { mode: 'cors', cache: 'reload', signal: ctl.signal });
    if (!res.ok) throw new Error(`Cover request failed (${res.status})`);
    return await createImageBitmap(await res.blob());
  } finally {
    window.clearTimeout(timer);
  }
}

export const viaProxy = (src: string, width = 480) =>
  `https://wsrv.nl/?url=${encodeURIComponent(src)}&w=${width}&output=jpg`;

/** Returns the cover as something `drawImage` accepts, or null if neither route worked. */
export async function loadCover(src: string | undefined): Promise<ImageBitmap | null> {
  if (!src) return null;
  try {
    return await fetchBitmap(src);
  } catch {
    // Fall through to the proxy.
  }
  try {
    return await fetchBitmap(viaProxy(src));
  } catch {
    return null;
  }
}
