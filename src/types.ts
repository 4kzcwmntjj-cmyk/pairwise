export type Status = 'seen' | 'unseen';

/** One AniList entry (a season, film or extra) inside a franchise. Kept so franchises can be split and joined. */
export interface Entry {
  id: number;
  format: string;
  year?: number;
  titleEnglish?: string;
  titleRomaji?: string;
  popularity: number;
  averageScore?: number;
  cover?: string;
  studio?: string;
  genres?: string[];
}

/** One rankable item. For anime, a franchise: several AniList entries grouped together. */
export interface Item {
  id: string;
  category: 'anime';
  source: 'anilist' | 'manual';
  title: string;
  titleEnglish?: string;
  titleRomaji?: string;
  entryIds: number[];
  /** Entry formats, e.g. TV, MOVIE, OVA, one per entry. */
  formats: string[];
  startYear?: number;
  endYear?: number;
  studio?: string;
  cover?: string;
  /** Higher-resolution cover for large cards. */
  coverLarge?: string;
  coverColor?: string;
  /** AniList popularity of the most popular entry. */
  popularity: number;
  /** AniList mean score of the most popular entry, 0–100. */
  averageScore?: number;
  /** AniList genres across the franchise, most common first. */
  genres?: string[];
  /** AniList user recommendations from this title: [item id, total rating], strongest first. */
  recs?: [string, number][];
  /** The entries that make up the franchise, when known (catalogues built before October 2026 lack them). */
  entries?: Entry[];
}

export interface Mark {
  itemId: string;
  status: Status;
  updatedAt: number;
}

export type Outcome = 'a' | 'b' | 'tie';
export type DuelMode = 'place' | 'refine' | 'explore';

export interface Vote {
  id?: number;
  a: string;
  b: string;
  outcome: Outcome;
  mode: DuelMode;
  at: number;
}

export interface Settings {
  titleLanguage: 'english' | 'romaji';
  sortMode: 'grid' | 'single';
}

export const DEFAULT_SETTINGS: Settings = { titleLanguage: 'english', sortMode: 'single' };
