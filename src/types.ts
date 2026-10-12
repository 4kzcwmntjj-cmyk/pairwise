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
  /** AniList tags (themes, settings, cast), strongest first; spoilers and adult tags left out. */
  tags?: string[];
  /** Which storyline of its franchise the entry belongs to (an entry id). Only set when there are two or more. */
  story?: number;
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
  /** AniList tags across the franchise, strongest first (see franchiseTags). Absent in catalogues before 13 Oct 2026. */
  tags?: string[];
  /** AniList user recommendations from this title: [item id, total rating], strongest first. */
  recs?: [string, number][];
  /** The entries that make up the franchise, when known (catalogues built before October 2026 lack them). */
  entries?: Entry[];
}

export interface Mark {
  itemId: string;
  /** Seen in any form (watched or read), or not. */
  status: Status;
  updatedAt: number;
  /**
   * For titles with both an anime and a manga: whether you've watched it and
   * whether you've read it. Undefined means not asked. Titles with only one
   * form, and marks made before forms were recorded, have neither.
   */
  anime?: boolean;
  manga?: boolean;
}

/** Which titles the app is showing: anime, manga, or everything. */
export type View = 'anime' | 'manga' | 'both';
/** Which side of a title a card showed: its anime, its manga, or both. */
export type Side = 'anime' | 'manga' | 'both';
export type Medium = 'anime' | 'manga';

export type Outcome = 'a' | 'b' | 'tie';
/** 'new' brings in a title you hadn't sorted yet. */
export type DuelMode = 'place' | 'refine' | 'explore' | 'new';

export interface Vote {
  id?: number;
  a: string;
  b: string;
  outcome: Outcome;
  mode: DuelMode;
  at: number;
  /** Which side of each title was showing. Absent on duels from before this was recorded. */
  sideA?: Side;
  sideB?: Side;
}

export interface Settings {
  titleLanguage: 'english' | 'romaji';
  sortMode: 'grid' | 'single';
  view: View;
}

export const DEFAULT_SETTINGS: Settings = { titleLanguage: 'english', sortMode: 'single', view: 'both' };
