/**
 * The Stats cards: what each one says, independent of how it is drawn. The
 * screen renders a spec as HTML, and `cardImage.ts` draws the same spec as a
 * picture to share, so the two always say the same thing.
 */

import { blindSpots, eraLean, guiltyPleasure, hardestCall, hotTakes, pickType, studioLean, type TypeFinding } from '../rank/findings';
import type { CrowdView } from '../rank/stats';
import type { Item, Mark, Vote } from '../types';

export interface CardTitle {
  id: string;
  /** Short line under the cover, e.g. "#4". */
  caption?: string;
}

export interface CardRow extends CardTitle {
  line: string;
}

export interface CardSpec {
  id: string;
  /** Small label above the headline: what kind of finding this is. */
  kicker: string;
  headline: string;
  /** The finding, then any context for it. */
  lines: string[];
  covers: CardTitle[];
  /** Short heading over the covers or the rows, when the card has both and they mean different things. */
  coversLabel?: string;
  rows?: CardRow[];
  rowsLabel?: string;
  facts?: { label: string; value: string }[];
}

export interface CardInput {
  /** Ranked titles in the view, best first, as you know them (`withLook`). */
  ranked: Item[];
  /** Every title in the view, as you know them. */
  catalogue: Item[];
  marks: Map<string, Mark>;
  votes: Vote[];
  order: string[];
  crowd: CrowdView | null;
  tieShare: number;
  /** Whether there are enough ranked titles and duels for the type. */
  enoughForType: boolean;
  noun: string;
  title: (id: string) => string;
}

export const ordinal = (n: number) => {
  const rem100 = n % 100;
  const suffix = rem100 >= 11 && rem100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
};

export function typeFacts(t: TypeFinding): { label: string; value: string }[] {
  const { mainstream, agreement, era, genre, studio, tieShare } = t.traits;
  const facts = [{ label: 'Mainstream', value: `${mainstream.count} of top ${mainstream.of} in the 100 most popular` }];
  facts.push({ label: 'Agrees with AniList', value: agreement === null ? 'Too few scores' : `${Math.round(agreement * 100)}%` });
  if (era.median) facts.push({ label: 'Era', value: `Top ${era.of} started ${era.median} (median)` });
  if (genre) facts.push({ label: 'Genre lean', value: `${genre.name}, ${genre.count} of top ${genre.of} (typical ${Math.max(Math.round(genre.typical), 0)})` });
  if (studio) facts.push({ label: 'Studio', value: `${studio.name}, ${studio.count} of top ${studio.of}` });
  facts.push({ label: 'Too close to call', value: `${Math.round(tieShare * 100)}% of duels` });
  return facts;
}

export function buildCards(input: CardInput): CardSpec[] {
  const { ranked, title, noun } = input;
  const rankOf = new Map(ranked.map((i, k) => [i.id, k + 1]));
  const ranked5 = (ids: string[]) => ids.slice(0, 5).map((id) => ({ id, caption: `#${rankOf.get(id)}` }));
  const cards: CardSpec[] = [];

  if (input.enoughForType) {
    const t = pickType({
      ranked,
      catalogue: input.catalogue,
      agreement: input.crowd?.agreement ?? null,
      tieShare: input.tieShare,
      duels: input.votes.length,
      noun,
    });
    cards.push({
      id: 'type',
      kicker: 'Your type',
      headline: t.type.name,
      lines: [t.type.sentence, ...(t.type.typical ? [t.type.typical] : [])],
      covers: ranked5(t.type.ids.length ? t.type.ids : ranked.slice(0, 5).map((i) => i.id)),
      facts: typeFacts(t),
    });
  }

  if (input.crowd) {
    const takes = hotTakes(input.crowd);
    const n = input.crowd.n;
    const line = (yours: number, crowd: number) => `You have it at #${yours}. By AniList's scores it would be #${crowd} of your ${n}.`;
    if (takes.length) {
      const [first, ...rest] = takes;
      cards.push({
        id: 'takes',
        kicker: 'Hot takes',
        headline: title(first.item.id),
        lines: [line(first.yourRank, first.crowdRank)],
        covers: [{ id: first.item.id }],
        rows: rest.map((t) => ({ id: t.item.id, line: `Yours #${t.yourRank} · AniList's scores #${t.crowdRank}` })),
      });
    }
  }

  const guilty = guiltyPleasure(ranked);
  if (guilty)
    cards.push({
      id: 'guilty',
      kicker: 'Guilty pleasure',
      headline: title(guilty.item.id),
      lines: [`Your #${guilty.rank}. Its AniList average is ${guilty.score}, the lowest in your top ${guilty.of}.`, `Your top ${guilty.of} average ${guilty.topMean}.`],
      covers: [{ id: guilty.item.id }],
    });

  const blind = blindSpots(input.catalogue, input.marks);
  if (blind.length) {
    const [first] = blind;
    cards.push({
      id: 'blind',
      kicker: blind.length > 1 ? 'Blind spots' : 'Blind spot',
      headline: title(first.item.id),
      lines: [`The ${ordinal(first.popularRank)} most popular ${noun === 'titles' ? 'title' : noun} on AniList, and you haven't seen it.`],
      covers: blind.map((b) => ({ id: b.item.id, caption: `#${b.popularRank} most popular` })),
    });
  }

  const hard = hardestCall(input.votes, input.order);
  if (hard) {
    const meetings = hard.aWins + hard.bWins + hard.ties;
    const score = `${hard.aWins}–${hard.bWins}${hard.ties ? `, with ${hard.ties} too close to call` : ''}`;
    cards.push({
      id: 'hard',
      kicker: 'Hardest call',
      headline: `${title(hard.a)} v ${title(hard.b)}`,
      lines: [`${score}, over ${meetings} duels. They sit at #${hard.aRank} and #${hard.bRank}.`],
      covers: [
        { id: hard.a, caption: `#${hard.aRank}` },
        { id: hard.b, caption: `#${hard.bRank}` },
      ],
    });
  }

  const era = eraLean(ranked);
  if (era)
    cards.push({
      id: 'era',
      kicker: 'Your era',
      headline: `The ${era.name}`,
      lines: [`${era.ids.length} of your top ${era.of} started in the ${era.name}. Across your whole list, ${Math.round(era.listShare * 100)}% did.`],
      covers: ranked5(era.ids),
    });

  const studio = studioLean(ranked);
  if (studio)
    cards.push({
      id: 'studio',
      kicker: 'Your studio',
      headline: studio.name,
      lines: [`${studio.ids.length} of your top ${studio.of} are from ${studio.name}. Across your whole list, ${Math.round(studio.listShare * 100)}% are.`],
      covers: ranked5(studio.ids),
    });

  return cards;
}
