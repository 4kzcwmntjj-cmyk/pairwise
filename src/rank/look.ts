import { describeFormats, isManga, representative } from '../anilist/group';
import type { Entry, Item, Mark, View } from '../types';
import { formsOf, hasBoth, knownIn } from './medium';

/**
 * How a title is shown: its cover, years and description.
 *
 * A title can be an anime and a manga at once. Its card shows the side you
 * know: in the anime view the anime, in the manga view the manga, and in the
 * both view whichever you've watched or read. When you know both, or haven't
 * said yet, the card shows the anime and mentions the manga.
 */
export type Side = 'anime' | 'manga' | 'both';

export interface Look {
  side: Side;
  cover?: string;
  coverLarge?: string;
  coverColor?: string;
  /** Years, e.g. "2006–2007". */
  years: string;
  /** Short line for lists: years and studio, or years and "manga". */
  short: string;
  /** Full line for cards: years, studio and what the side contains. */
  meta: string;
  startYear?: number;
  studio?: string;
  averageScore?: number;
  url?: string;
}

export function sideFor(item: Item, view: View, mark: Mark | undefined): Side {
  if (!hasBoth(item) || !item.entries?.length) return 'both';
  if (view !== 'both') return view;
  const watched = knownIn(item, mark, 'anime');
  const read = knownIn(item, mark, 'manga');
  if (read && !watched) return 'manga';
  if (watched && !read) return 'anime';
  return 'both';
}

const span = (from?: number, to?: number) => (!from ? '' : to && to !== from ? `${from}–${to}` : `${from}`);
const join = (parts: (string | undefined)[]) => parts.filter(Boolean).join(', ');
const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);
const larger = (cover?: string) => cover?.replace('/cover/medium/', '/cover/large/');
const topScore = (entries: Entry[]) => [...entries].sort((a, b) => b.popularity - a.popularity)[0]?.averageScore;

interface Part {
  rep: Entry;
  years: string;
  startYear?: number;
  studio?: string;
  contents: string;
  averageScore?: number;
  url: string;
}

function animePart(entries: Entry[]): Part {
  const rep = representative(entries);
  const ys = entries.map((e) => e.year).filter((y): y is number => y !== undefined);
  const start = ys.length ? Math.min(...ys) : undefined;
  return {
    rep,
    years: span(start, ys.length ? Math.max(...ys) : undefined),
    startYear: start,
    studio: rep.studio ?? entries.find((e) => e.studio)?.studio,
    contents: describeFormats(entries.map((e) => e.format)),
    averageScore: topScore(entries),
    url: `https://anilist.co/anime/${rep.id}`,
  };
}

function mangaPart(entries: Entry[]): Part {
  const rep = representative(entries);
  const count = (f: string) => entries.filter((e) => e.format === f).length;
  const manga = count('MANGA');
  const shots = count('ONE_SHOT');
  const novels = count('NOVEL');
  const contents =
    entries.length === 1
      ? rep.format === 'ONE_SHOT'
        ? 'one-shot'
        : rep.format === 'NOVEL'
          ? 'novel'
          : 'manga'
      : join([manga > 1 ? `${manga} manga` : manga ? 'manga' : '', shots ? plural(shots, 'one-shot', 'one-shots') : '', novels ? plural(novels, 'novel', 'novels') : '']);
  // The manga's own start year. Later one-shots and spin-offs would stretch a range into nonsense.
  return {
    rep,
    years: span(rep.year),
    startYear: rep.year,
    contents,
    averageScore: topScore(entries),
    url: `https://anilist.co/manga/${rep.id}`,
  };
}

const cache = new WeakMap<Item, Map<Side, Look>>();

export function lookOf(item: Item, side: Side): Look {
  let byItem = cache.get(item);
  if (!byItem) cache.set(item, (byItem = new Map()));
  let look = byItem.get(side);
  if (!look) byItem.set(side, (look = build(item, side)));
  return look;
}

function build(item: Item, side: Side): Look {
  const entries = item.entries ?? [];
  const animeEntries = entries.filter((e) => !isManga(e.format));
  const mangaEntries = entries.filter((e) => isManga(e.format));
  const ownCover = { cover: item.cover, coverLarge: item.coverLarge, coverColor: item.coverColor };

  // Older catalogues without entries: the franchise as a whole.
  if (!entries.length || (!animeEntries.length && !mangaEntries.length)) {
    const years = span(item.startYear, item.endYear);
    const forms = formsOf(item);
    return {
      side,
      ...ownCover,
      years,
      short: join([years, item.studio ?? (forms.manga && !forms.anime ? 'manga' : undefined)]),
      meta: join([years, item.studio, describeFormats(item.formats)]),
      startYear: item.startYear,
      studio: item.studio,
      averageScore: item.averageScore,
      url: item.source === 'anilist' ? `https://anilist.co/anime/${item.entryIds[0]}` : undefined,
    };
  }

  const anime = animeEntries.length ? animePart(animeEntries) : undefined;
  const manga = mangaEntries.length ? mangaPart(mangaEntries) : undefined;
  const showManga = side === 'manga' || !anime;

  if (showManga) {
    const m = manga!;
    // A manga-only title already carries the manga's cover and colour.
    const cover = anime ? { cover: m.rep.cover, coverLarge: larger(m.rep.cover) } : ownCover;
    return {
      side,
      ...cover,
      years: m.years,
      short: join([m.years, 'manga']),
      meta: join([m.years, m.contents]),
      startYear: m.startYear,
      averageScore: m.averageScore,
      url: m.url,
    };
  }

  const a = anime!;
  const mentionManga = side === 'both' && manga;
  return {
    side,
    ...ownCover,
    years: a.years,
    short: join([a.years, a.studio]),
    meta: join([a.years, a.studio, a.contents]) + (mentionManga ? ` · manga${manga.years ? ` from ${manga.years}` : ''}` : ''),
    startYear: a.startYear,
    studio: a.studio,
    averageScore: a.averageScore,
    url: a.url,
  };
}

/** The item with the shown side's facts, for stats that read years, studio and score. */
export const withLook = (item: Item, look: Look): Item => ({
  ...item,
  startYear: look.startYear,
  studio: look.studio,
  averageScore: look.averageScore,
});
