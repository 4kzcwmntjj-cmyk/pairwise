import { describeFormats } from '../anilist/group';
import type { Item } from '../types';

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
