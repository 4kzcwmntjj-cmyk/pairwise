import { useLayoutEffect, useRef, useState } from 'react';
import type { Look } from '../rank/look';

type CoverLook = Pick<Look, 'cover' | 'coverLarge' | 'coverColor'>;

/** The picture a cover of this size shows. */
export function coverSrc(look: CoverLook, size: 'sm' | 'md' | 'lg'): string | undefined {
  return (size === 'lg' ? look.coverLarge ?? look.cover : look.cover) ?? undefined;
}

// The last few preloaded pictures, held so the browser keeps them decoded until the duel shows them.
const held: HTMLImageElement[] = [];

/**
 * Loads and decodes a large cover ahead of showing it. Resolves when it is ready, or failed (the cover then
 * shows its colour block as usual); never rejects.
 */
export function preloadCover(look: CoverLook): Promise<void> {
  const src = coverSrc(look, 'lg');
  if (!src) return Promise.resolve();
  const img = new Image();
  img.referrerPolicy = 'no-referrer';
  img.decoding = 'async';
  img.src = src;
  held.push(img);
  if (held.length > 6) held.shift();
  return img.decode().catch(() => undefined);
}

export function Cover({ look, title, size = 'md' }: { look: CoverLook; title: string; size?: 'sm' | 'md' | 'lg' }) {
  const item = look;
  const [failedSrc, setFailed] = useState<string | null>(null);
  const src = coverSrc(item, size);
  const initials = title
    .split(/[\s:]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return (
    <div className={`cover cover-${size}`} style={{ backgroundColor: item.coverColor ?? undefined }}>
      {src && item.cover && failedSrc !== item.cover ? (
        <CoverImg key={src} src={src} lazy={size === 'sm'} onFail={() => setFailed(item.cover ?? null)} />
      ) : (
        <span className="cover-fallback" aria-hidden="true">
          {initials}
        </span>
      )}
    </div>
  );
}

/**
 * The picture over the colour block. One that arrives late fades in rather than snapping in; one already in
 * the browser (preloaded, or seen before) shows at once, with no fade.
 */
function CoverImg({ src, lazy, onFail }: { src: string; lazy: boolean; onFail: () => void }) {
  const ref = useRef<HTMLImageElement>(null);
  const [state, setState] = useState<'wait' | 'fade' | 'ready'>('wait');
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth > 0) setState('ready');
  }, []);
  return (
    <img
      ref={ref}
      className={state === 'wait' ? 'is-loading' : state === 'fade' ? 'is-fading-in' : undefined}
      src={src}
      alt=""
      loading={lazy ? 'lazy' : 'eager'}
      decoding="async"
      referrerPolicy="no-referrer"
      draggable={false}
      onLoad={() => setState((s) => (s === 'wait' ? 'fade' : s))}
      onError={onFail}
    />
  );
}
