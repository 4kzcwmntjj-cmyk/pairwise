/**
 * The Stats cards: what each one says, independent of how it is drawn. The
 * screen renders a spec as HTML, and `cardImage.ts` draws the same spec as a
 * picture to share, so the two always say the same thing.
 */

import {
  HOT_TAKES_MIN_RANKED,
  TYPE_LINES,
  blindSpots,
  eraLean,
  guiltyPleasure,
  hardestCall,
  hotTakes,
  pickType,
  studioLean,
  themeLeans,
  type HardestCall,
  type TypeFinding,
} from '../rank/findings';
import { recordOf, type CrowdView, type DuelRecord, type Move, type TopSpell } from '../rank/stats';
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
  /** A short line straight under the headline, e.g. the type's runner-up. */
  subhead?: string;
  /** A one-line description, set larger than the finding (the type card). */
  tagline?: string;
  /** Drawn larger, with a stronger tint: the type card, which opens Taste. */
  hero?: boolean;
  /** The finding, then any context for it. */
  lines: string[];
  covers: CardTitle[];
  /** Short heading over the covers or the rows, when the card has both and they mean different things. */
  coversLabel?: string;
  rows?: CardRow[];
  rowsLabel?: string;
  facts?: { label: string; value: string }[];
  /** One or two covers at the left, a third of the width, with the text beside them, instead of a strip under the text. */
  side?: boolean;
}

/**
 * Each kind of Taste card has its own colour: a hue in degrees. The kicker takes it, and so does a faint tint
 * behind the card, on screen and in the share picture. Cards not listed here (Compare, Tonight's pick) keep the app's accent.
 */
export const CARD_HUES: Record<string, number> = {
  type: 10,
  week: 140,
  takes: 255,
  themes: 190,
  era: 95,
  studio: 315,
  number1: 45,
  blind: 215,
  guilty: 340,
  hard: 280,
  undefeated: 170,
};

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
  /** Who climbed and fell in the last 7 days (`movers`), or null when too little was played before that. */
  week?: { climbers: Move[]; fallers: Move[] } | null;
  /** How long the title at #1 has held the top spot. */
  topSpell?: TopSpell | null;
  /** The title with the most wins and no loss (`duelStats().undefeated[0]`). */
  undefeated?: DuelRecord | null;
}

/** Smallest move, in places, that makes This week worth a card. */
export const MIN_WEEK_MOVE = 2;

export const ordinal = (n: number) => {
  const rem100 = n % 100;
  const suffix = rem100 >= 11 && rem100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
};

/** "A", "A and B", "A, B and C". */
const listOf = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/**
 * What the type card adds to what other cards and the headline already say: agreement with AniList and ties
 * are in More detail, the studio and theme leans have their own cards, and a genre type's genre is its name.
 */
export function typeFacts(t: TypeFinding): { label: string; value: string }[] {
  const { mainstream, era, genre } = t.traits;
  const facts: { label: string; value: string }[] = [];
  // The sentence for The Crowd Pleaser already gives this count.
  if (t.type.id !== 'popular') facts.push({ label: 'Mainstream', value: `${mainstream.count} of top ${mainstream.of} in the 100 most popular` });
  if (era.median) facts.push({ label: 'Era', value: `Top ${era.of} started ${era.median} (median)` });
  if (genre && t.type.id !== `genre:${genre.name}`) {
    facts.push({ label: 'Genre lean', value: `${genre.name}, ${genre.count} of top ${genre.of} (typical ${Math.max(Math.round(genre.typical), 0)})` });
  }
  return facts;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayMonth = (at: number) => `${new Date(at).getDate()} ${MONTHS[new Date(at).getMonth()]}`;
const places = (n: number) => `${n} ${n === 1 ? 'place' : 'places'}`;
const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/** What happened in the pair's meetings, in order: "You picked A, then B. 1–1, over 2 duels." */
export function hardSentence(h: HardestCall, title: (id: string) => string): string {
  const n = h.results.length;
  const score = `${h.aWins}–${h.bWins}${h.ties ? `, with ${h.ties} too close to call` : ''}, over ${n} duels`;
  if (n > 4) return `You keep going back and forth: ${score}.`;
  const parts = h.results.map((r, k) => (r === 'tie' ? 'called it too close' : k === 0 ? `picked ${title(r)}` : title(r)));
  return `You ${parts.join(', then ')}. ${score}.`;
}

/** How long a title has held #1, as a sentence. */
export function spellSentence(spell: TopSpell | null | undefined): string {
  if (!spell) return 'Your #1.';
  if (spell.fromStart) return spell.days === 0 ? 'Your #1 so far.' : `Your #1 since your first duel, ${days(spell.days)} ago.`;
  if (spell.days === 0) return 'Took the top spot today.';
  if (spell.atLeast) return `Your #1 for at least ${days(spell.days)}, since before ${dayMonth(spell.since)}.`;
  return `Your #1 for ${days(spell.days)}, since ${dayMonth(spell.since)}.`;
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
      subhead: t.runnerUp ? `with a streak of ${t.runnerUp.name}` : undefined,
      tagline: TYPE_LINES[t.type.name],
      hero: true,
      lines: [t.type.sentence, ...(t.type.typical ? [t.type.typical] : [])],
      covers: ranked5(t.type.ids.length ? t.type.ids : ranked.slice(0, 5).map((i) => i.id)),
      facts: typeFacts(t),
    });
  }

  // This week: the biggest climber and the biggest faller.
  const up = input.week?.climbers.find((m) => m.from - m.to >= MIN_WEEK_MOVE);
  const down = input.week?.fallers.find((m) => m.to - m.from >= MIN_WEEK_MOVE);
  if (up || down) {
    const upLine = up && `Up ${places(up.from - up.to)} this week, from #${up.from} to #${up.to}.`;
    const downLine = down && `Down ${places(down.to - down.from)} this week, from #${down.from} to #${down.to}.`;
    cards.push(
      up && down
        ? {
            id: 'week',
            kicker: 'This week',
            headline: title(up.id),
            lines: [upLine!, `Biggest fall: ${title(down.id)}, down ${places(down.to - down.from)}, from #${down.from} to #${down.to}.`],
            covers: [
              { id: up.id, caption: `Up to #${up.to}` },
              { id: down.id, caption: `Down to #${down.to}` },
            ],
          }
        : {
            id: 'week',
            kicker: 'This week',
            headline: title((up ?? down)!.id),
            lines: [(upLine ?? downLine)!],
            covers: [{ id: (up ?? down)!.id }],
            side: true,
          },
    );
  }

  // Hot takes: the biggest gaps with AniList's order, either way. Needs 30 so the "of your N" makes sense.
  let takenIds: string[] = [];
  if (input.crowd && input.crowd.n >= HOT_TAKES_MIN_RANKED) {
    const takes = hotTakes(input.crowd);
    const n = input.crowd.n;
    if (takes.length) {
      const [first, ...rest] = takes;
      takenIds = takes.map((x) => x.item.id);
      const way = (gap: number) => (gap > 0 ? 'You rank higher' : 'You rank lower');
      cards.push({
        id: 'takes',
        kicker: 'Hot takes',
        headline: title(first.item.id),
        lines: [way(first.gap), `You have it at #${first.yourRank}. By AniList's scores it would be #${first.crowdRank} of your ${n}.`],
        covers: [{ id: first.item.id }],
        side: true,
        rows: rest.map((t) => ({ id: t.item.id, line: `${way(t.gap)} · yours #${t.yourRank}, AniList's #${t.crowdRank}` })),
      });
    }
  }

  const themes = themeLeans(ranked);
  if (themes.length) {
    const names = themes.map((t) => t.name);
    const headline = listOf(names);
    const covers: string[] = [];
    for (const t of themes) for (const id of t.ids) if (!covers.includes(id)) covers.push(id);
    covers.sort((a, b) => rankOf.get(a)! - rankOf.get(b)!);
    cards.push({
      id: 'themes',
      kicker: themes.length > 1 ? 'Your themes' : 'Your theme',
      headline,
      lines: [
        `${listOf(themes.map((t) => `${t.name} ${t.ids.length}`))} of your top ${themes[0].of}.`,
        `Across your whole list: ${listOf(themes.map((t) => `${t.name} ${Math.round(t.listShare * 100)}%`))}.`,
      ],
      covers: ranked5(covers),
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

  // Your #1: how long it has held the top spot, and its record.
  const champion = ranked[0];
  if (champion) {
    const r = recordOf(input.votes, champion.id);
    cards.push({
      id: 'number1',
      kicker: 'Your #1',
      headline: title(champion.id),
      lines: [spellSentence(input.topSpell), `Record: ${r.wins}–${r.losses}${r.ties ? `, ${r.ties} too close to call` : ''}.`],
      covers: [{ id: champion.id }],
      side: true,
    });
  }

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

  // Guilty pleasure never repeats a title Hot takes shows.
  const guilty = guiltyPleasure(ranked, undefined, undefined, takenIds);
  if (guilty)
    cards.push({
      id: 'guilty',
      kicker: 'Guilty pleasure',
      headline: title(guilty.item.id),
      lines: [`Your #${guilty.rank}, but AniList's average score for it is ${guilty.score}.`, `Your top ${guilty.of} average ${guilty.topMean}.`],
      covers: [{ id: guilty.item.id }],
      side: true,
    });

  const hard = hardestCall(input.votes, input.order);
  if (hard)
    cards.push({
      id: 'hard',
      kicker: 'Hardest call',
      headline: `${title(hard.a)} v ${title(hard.b)}`,
      lines: [hardSentence(hard, title), `They sit at #${hard.aRank} and #${hard.bRank}.`],
      covers: [
        { id: hard.a, caption: `#${hard.aRank}` },
        { id: hard.b, caption: `#${hard.bRank}` },
      ],
      side: true,
    });

  const unbeaten = input.undefeated;
  if (unbeaten && rankOf.has(unbeaten.id))
    cards.push({
      id: 'undefeated',
      kicker: 'Undefeated',
      headline: title(unbeaten.id),
      lines: [`${unbeaten.wins} ${unbeaten.wins === 1 ? 'win' : 'wins'}, no losses.`, `It sits at #${rankOf.get(unbeaten.id)} on your list.`],
      covers: [{ id: unbeaten.id }],
      side: true,
    });

  return cards;
}
