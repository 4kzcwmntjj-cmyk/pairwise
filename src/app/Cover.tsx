import { useState } from 'react';
import type { Look } from '../rank/look';

export function Cover({ look, title, size = 'md' }: { look: Pick<Look, 'cover' | 'coverLarge' | 'coverColor'>; title: string; size?: 'sm' | 'md' | 'lg' }) {
  const item = look;
  const [failedSrc, setFailed] = useState<string | null>(null);
  const initials = title
    .split(/[\s:]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return (
    <div className={`cover cover-${size}`} style={{ backgroundColor: item.coverColor ?? undefined }}>
      {item.cover && failedSrc !== item.cover ? (
        <img
          src={size === 'lg' ? item.coverLarge ?? item.cover : item.cover}
          alt=""
          loading={size === 'sm' ? 'lazy' : 'eager'}
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          onError={() => setFailed(item.cover ?? null)}
        />
      ) : (
        <span className="cover-fallback" aria-hidden="true">
          {initials}
        </span>
      )}
    </div>
  );
}
