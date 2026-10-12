/** The cards on the Compare screen, as specs (see cards.ts), so the screen and the share picture say the same thing. */

import type { Comparison } from '../rank/compare';
import type { CardSpec } from './cards';

export interface Names {
  /** "Alex", or "your friend" when the link had no name. */
  name: string;
  /** "Alex's" or "their". */
  their: string;
  /** For short lines: "Alex" or "Them". */
  short: string;
}

export function namesFor(name: string | undefined): Names {
  return name ? { name, their: `${name}'s`, short: name } : { name: 'your friend', their: 'their', short: 'Them' };
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export function compareCards(c: Comparison, names: Names): CardSpec[] {
  const cards: CardSpec[] = [];
  const shared = c.common.length;
  const pct = c.match ? Math.round(c.match.share * 100) : null;
  const together = names.name === 'your friend' ? 'You and your friend' : `You and ${names.name}`;

  const lines =
    pct !== null
      ? [
          `Of the ${shared} titles you've both ranked, you'd pick the same one in ${pct}% of the duels between them.`,
          'Two lists in random order would agree about half the time.',
        ]
      : [`You've both ranked ${plural(shared, 'title', 'titles')}. A match score needs 5.`];

  cards.push({
    id: 'match',
    kicker: together,
    headline: pct !== null ? `${pct}% match` : shared === 0 ? 'Nothing in common yet' : `${shared} in common`,
    lines,
    coversLabel: c.bothLove ? `In both your top ${c.bothLove.top}s (your rank, then ${names.their})` : undefined,
    covers: (c.bothLove?.titles ?? []).map((s) => ({ id: s.id, caption: `#${s.mine} · #${s.theirs}` })),
    rowsLabel: c.disagree.length > 1 ? 'Biggest disagreements' : 'Biggest disagreement',
    rows: c.disagree.map((s) => ({ id: s.id, line: `You #${s.mine} · ${names.short} #${s.theirs}` })),
  });

  if (c.theirTop.length) {
    const n = c.theirTop.length;
    cards.push({
      id: 'picks',
      kicker: `From ${names.their} top 10`,
      headline: `${plural(n, 'title', 'titles')} not on your list`,
      lines: [`${n === 1 ? 'It ranks' : 'They rank'} in ${names.their} top 10, and you haven't ranked ${n === 1 ? 'it' : 'them'}.`],
      // Up to five fit as covers; more go in rows.
      covers: n <= 5 ? c.theirTop.map((p) => ({ id: p.id, caption: `Their #${p.rank}` })) : [],
      rows: n > 5 ? c.theirTop.map((p) => ({ id: p.id, line: `Their #${p.rank}` })) : undefined,
    });
  }

  return cards;
}
