import { describeFormats } from '../anilist/group';
import type { Item, Settings } from '../types';

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

/** Button wording for marking a title, which depends on whether manga is included. */
export const markWords = (settings: Settings) =>
  settings.manga ? { seen: 'Seen or read it', unseen: 'Neither' } : { seen: 'Seen it', unseen: "Haven't seen" };
