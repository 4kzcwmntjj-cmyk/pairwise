/** Tonight's pick as a card (see cards.ts), so it can be shared as a picture. */

import type { CardSpec } from './cards';

export function tonightCard(id: string, title: string, reason: string, meta: string): CardSpec {
  return {
    id: 'tonight',
    kicker: "Tonight's pick",
    headline: title,
    lines: [reason, meta].filter(Boolean),
    covers: [{ id }],
  };
}
