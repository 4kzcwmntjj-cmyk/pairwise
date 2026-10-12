import type { View } from '../types';

const FORMAT_LABEL: Record<string, string> = {
  TV: 'Anime series',
  TV_SHORT: 'Anime shorts',
  ONA: 'Web anime',
  MOVIE: 'Anime film',
  OVA: 'Anime OVA',
  SPECIAL: 'Anime special',
  MUSIC: 'Music video',
  MANGA: 'Manga',
  ONE_SHOT: 'One-shot manga',
  NOVEL: 'Novel',
};
export const formatLabel = (format: string) => FORMAT_LABEL[format] ?? 'Other';

const SHORT_FORMAT: Record<string, string> = {
  TV: 'Series',
  TV_SHORT: 'Shorts',
  ONA: 'Web',
  MOVIE: 'Film',
  OVA: 'OVA',
  SPECIAL: 'Special',
  MUSIC: 'Music',
  MANGA: 'Manga',
  ONE_SHOT: 'One-shot',
  NOVEL: 'Novel',
};
/** One word, for lists where the anime/manga split is clear from context. */
export const shortFormat = (format: string) => SHORT_FORMAT[format] ?? 'Other';

/** How the view talks about knowing a title. */
export const viewWords = (view: View) =>
  view === 'anime'
    ? { seen: 'watched', unseen: "Haven't watched" }
    : view === 'manga'
      ? { seen: 'read', unseen: "Haven't read" }
      : { seen: 'seen', unseen: "Haven't seen" };
