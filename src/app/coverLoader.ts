/**
 * Loads covers so they can be drawn onto a canvas that is then exported.
 *
 * AniList's CDN allows CORS reads, but a plain `<img crossorigin>` can reuse a
 * copy the browser cached without CORS headers, and then fails. So covers are
 * fetched, as bytes, with a few tries that differ in how they treat the cache.
 * Bytes are kept in memory, so switching layouts or drawing another card does
 * not fetch them again. Decoding tries `createImageBitmap` first and an
 * `<img>` from a blob URL second, because browsers differ on the first.
 *
 * (wsrv.nl was tried as a proxy; it refuses AniList images.)
 */

export type Drawable = (ImageBitmap | HTMLImageElement) & { width: number; height: number };

const TIMEOUT_MS = 12000;
const CONCURRENCY = 4;
const bytes = new Map<string, Blob>();

async function fetchBlob(url: string, cache: RequestCache): Promise<Blob> {
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { mode: 'cors', cache, signal: ctl.signal });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const blob = await res.blob();
    if (!blob.size) throw new Error('empty response');
    return blob;
  } finally {
    window.clearTimeout(timer);
  }
}

async function decode(blob: Blob): Promise<Drawable> {
  try {
    return await createImageBitmap(blob);
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      // The decoded image stays usable after the URL is released.
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }
}

export interface CoverResult {
  img: Drawable | null;
  /** Plain-words account of how the cover loaded or why it did not. */
  how: string;
}

/** Decodes a cover again through an `<img>` element, for browsers where the bitmap drew blank. */
export async function decodeAsImage(src: string): Promise<HTMLImageElement | null> {
  const blob = bytes.get(src);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    return null;
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** Returns the cover, or null img after every route has failed. */
export async function loadCover(src: string | undefined): Promise<CoverResult> {
  if (!src) return { img: null, how: 'no cover address' };
  const known = bytes.get(src);
  if (known) {
    try {
      return { img: await decode(known), how: 'kept from earlier' };
    } catch {
      bytes.delete(src);
    }
  }
  const tries: [string, RequestCache][] = [
    [src, 'reload'],
    [src, 'default'],
    [`${src}${src.includes('?') ? '&' : '?'}cb=${Date.now()}`, 'no-store'],
  ];
  const errors: string[] = [];
  for (const [i, [url, cache]] of tries.entries()) {
    try {
      const blob = await fetchBlob(url, cache);
      const img = await decode(blob);
      bytes.set(src, blob);
      return { img, how: `loaded on try ${i + 1}, ${img.width}×${img.height}, ${blob.type || 'unknown type'}` };
    } catch (e) {
      errors.push(`try ${i + 1}: ${(e as Error).message}`);
      console.warn('Cover failed', url, (e as Error).message);
    }
  }
  return { img: null, how: `failed (${errors.join('; ')})` };
}

/** Loads covers a few at a time, in order. */
export async function loadCovers(srcs: (string | undefined)[]): Promise<CoverResult[]> {
  const out: CoverResult[] = new Array(srcs.length).fill({ img: null, how: 'not started' });
  let next = 0;
  async function worker() {
    while (next < srcs.length) {
      const i = next++;
      out[i] = await loadCover(srcs[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, srcs.length) }, worker));
  return out;
}
