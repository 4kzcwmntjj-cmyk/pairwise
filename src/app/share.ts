import { useEffect, useRef, useState } from 'react';

/**
 * Sharing straight from a tap. iPhone Safari opens the share sheet only from the tap itself, so anything that
 * takes time (drawing a picture, packing a link) is done beforehand and these functions do no waiting before
 * they call `navigator.share`.
 */

type Nav = Navigator & { canShare?: (d: ShareData) => boolean };

/** What happened, as a line to show under the button; null when nothing needs saying (shared, or cancelled). */
export type ShareOutcome = { status: string | null; manual?: string };

/** Opens the share sheet with a link, or copies it where there is no share sheet (most desktop browsers). */
export async function shareLink(url: string, title: string, text?: string): Promise<ShareOutcome> {
  const nav = navigator as Nav;
  if (typeof nav.share === 'function') {
    try {
      await nav.share({ title, text, url });
      return { status: null };
    } catch (e) {
      if ((e as Error).name === 'AbortError') return { status: null };
      // Fall through to copying.
    }
  }
  return copyLink(url);
}

export async function copyLink(url: string): Promise<ShareOutcome> {
  try {
    await navigator.clipboard.writeText(url);
    return { status: 'Link copied.' };
  } catch {
    return { status: "Couldn't copy the link here. Select it below and copy it.", manual: url };
  }
}

/** Opens the share sheet with a picture where files can be shared (phones), else downloads it. */
export async function sharePicture(blob: Blob, filename: string, title: string): Promise<string | null> {
  const file = new File([blob], `${filename}.png`, { type: 'image/png' });
  const nav = navigator as Nav;
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return null;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return null;
    }
  }
  const href = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = href;
  a.download = file.name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
  return 'Saved the picture to your downloads.';
}

export interface Picture {
  blob: Blob;
  /** Covers that didn't load and show as colour blocks. */
  missing: number;
}

/** How long a card must stay on screen before its picture is drawn, so scrolling past doesn't draw them all. */
const DWELL_MS = 500;
/** One more try for covers that failed, a little later. */
const RETRY_MS = 4000;

/**
 * Draws a picture ahead of the tap: once the element has been on screen for a moment (or at once with
 * `eager`). `key` changes when what the picture shows changes, and the picture is drawn again.
 */
export function usePicture(make: () => Promise<Picture>, key: string, eager = false) {
  const ref = useRef<HTMLElement | null>(null);
  const [picture, setPicture] = useState<Picture | null>(null);
  const [failed, setFailed] = useState(false);
  const [wanted, setWanted] = useState(eager);
  const makeRef = useRef(make);
  makeRef.current = make;

  // Start once the element has stayed on screen for DWELL_MS.
  useEffect(() => {
    if (wanted) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setWanted(true);
      return;
    }
    let timer: number | undefined;
    const watch = new IntersectionObserver(([entry]) => {
      window.clearTimeout(timer);
      if (entry.isIntersecting) timer = window.setTimeout(() => setWanted(true), DWELL_MS);
    });
    watch.observe(el);
    return () => {
      window.clearTimeout(timer);
      watch.disconnect();
    };
  }, [wanted]);

  useEffect(() => {
    if (!wanted) return;
    let alive = true;
    let retry: number | undefined;
    setPicture(null);
    setFailed(false);
    const draw = (again: boolean) =>
      makeRef
        .current()
        .then((p) => {
          if (!alive) return;
          setPicture(p);
          if (p.missing > 0 && again) retry = window.setTimeout(() => draw(false), RETRY_MS);
        })
        .catch(() => alive && setFailed(true));
    void draw(true);
    return () => {
      alive = false;
      window.clearTimeout(retry);
    };
  }, [wanted, key]);

  return { ref, picture, failed, want: () => setWanted(true) };
}
