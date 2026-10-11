import { useState } from 'react';
import type { Item } from '../types';

export function Cover({ item, title, size = 'md' }: { item: Item; title: string; size?: 'sm' | 'md' | 'lg' }) {
  const [failed, setFailed] = useState(false);
  const initials = title
    .split(/[\s:]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return (
    <div className={`cover cover-${size}`} style={{ backgroundColor: item.coverColor ?? undefined }}>
      {item.cover && !failed ? (
        <img
          src={size === 'lg' ? item.coverLarge ?? item.cover : item.cover}
          alt=""
          loading={size === 'sm' ? 'lazy' : 'eager'}
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="cover-fallback" aria-hidden="true">
          {initials}
        </span>
      )}
    </div>
  );
}
