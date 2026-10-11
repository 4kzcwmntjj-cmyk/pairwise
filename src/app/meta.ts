import { describeFormats } from '../anilist/group';
import type { Item, View } from '../types';

export function years(item: Item) {
  if (!item.startYear) return '';
  return item.endYear && item.endYear !== item.startYear ? `${item.startYear}–${item.endYear}` : `${item.startYear}`;
}

/** One line of facts: years, studio, what the franchise contains. */
export function metaLine(item: Item) {
  return [years(item), item.studio, describeFormats(item.formats)].filter(Boolean).join(', ');
}

export const anilistUrl = (item: Item) =>
  item.source === 'anilist' ? `https://anilist.co/anime/${item.entryIds[0]}` : undefined;

const FORMAT_LABEL: Record<string, string> = {
  TV: 'Series',
  TV_SHORT: 'Short series',
  ONA: 'Web series',
  MOVIE: 'Film',
  OVA: 'OVA',
  SPECIAL: 'Special',
  MUSIC: 'Music video',
  MANGA: 'Manga',
  ONE_SHOT: 'One-shot',
  NOVEL: 'Novel',
};
export const formatLabel = (format: string) => FORMAT_LABEL[format] ?? 'Other';

/** How the view talks about knowing a title. */
export const viewWords = (view: View) =>
  view === 'anime'
    ? { seen: 'watched', unseen: "Haven't watched" }
    : view === 'manga'
      ? { seen: 'read', unseen: "Haven't read" }
      : { seen: 'seen', unseen: "Haven't seen" };
