export type Tier = 'S' | 'A' | 'B' | 'C' | 'D';
export const TIERS: Tier[] = ['S', 'A', 'B', 'C', 'D'];

/** Log-strength each tier starts from before any duels. */
export const TIER_ANCHOR: Record<Tier, number> = { S: 2, A: 1, B: 0, C: -1, D: -2 };

export type Status = 'seen' | 'unseen' | 'want';

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
  coverColor?: string;
  /** AniList popularity of the most popular entry. */
  popularity: number;
  /** AniList mean score of the most popular entry, 0–100. */
  averageScore?: number;
}

export interface Mark {
  itemId: string;
  status: Status;
  tier?: Tier;
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
}

export const DEFAULT_SETTINGS: Settings = { titleLanguage: 'english' };
