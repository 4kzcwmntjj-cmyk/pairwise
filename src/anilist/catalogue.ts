import { AniListError, gql } from './client';
import type { RawMedia } from './group';

export const CATALOGUE_SIZE = 5000;
export const MANGA_SIZE = 3000;

export type Medium = 'ANIME' | 'MANGA';
/** Manga, manhwa and manhua (all MANGA on AniList) and one-shots. Light novels are left out for now. */
const MANGA_FORMATS = '[MANGA, ONE_SHOT]';
const SEARCH_FORMATS = '[TV, TV_SHORT, MOVIE, SPECIAL, OVA, ONA, MUSIC, MANGA, ONE_SHOT]';

const FIELDS = `
  id
  title { romaji english }
  format
  episodes
  duration
  seasonYear
  startDate { year }
  popularity
  averageScore
  coverImage { large extraLarge color }
  studios(isMain: true) { nodes { name } }
  relations { edges { relationType(version: 2) node { id type } } }
  genres
  recommendations(perPage: 8, sort: RATING_DESC) { nodes { rating mediaRecommendation { id type } } }
`;

const pageQuery = (medium: Medium) => `query ($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage }
    media(type: ${medium}, ${medium === 'MANGA' ? `format_in: ${MANGA_FORMATS}, ` : ''}sort: POPULARITY_DESC, isAdult: false) { ${FIELDS} }
  }
}`;

const SEARCH_QUERY = `query ($search: String) {
  Page(page: 1, perPage: 12) {
    media(search: $search, format_in: ${SEARCH_FORMATS}, isAdult: false, sort: SEARCH_MATCH) { ${FIELDS} }
  }
}`;

interface PageResult {
  Page: { pageInfo?: { hasNextPage: boolean }; media: RawMedia[] };
}

export interface LoadProgress {
  loaded: number;
  total: number;
  waitingSeconds?: number;
}

/** Fetches the most popular anime (or manga), most popular first. */
export async function fetchCatalogue(
  onProgress: (p: LoadProgress) => void,
  total = CATALOGUE_SIZE,
  medium: Medium = 'ANIME',
): Promise<RawMedia[]> {
  const query = pageQuery(medium);
  // AniList sometimes returns an empty page, with no error, when a page asks for too much.
  // 40 per page works; on an empty page, halve the size (40, 20, 10 keep pages aligned) and retry.
  let perPage = 40;
  const out: RawMedia[] = [];
  const seen = new Set<number>();
  let emptyAtSmallest = 0;
  while (out.length < total) {
    // Pages are counted at the current page size from the number already loaded.
    const page = Math.floor(out.length / perPage) + 1;
    let data: PageResult;
    try {
      data = await gql<PageResult>(query, { page, perPage }, (s) =>
        onProgress({ loaded: out.length, total, waitingSeconds: s }),
      );
    } catch (e) {
      if (e instanceof AniListError && e.kind === 'complexity' && perPage > 10) {
        perPage /= 2;
        continue;
      }
      throw e;
    }
    if (data.Page.media.length === 0 && out.length < total) {
      if (perPage > 10) {
        perPage /= 2;
        continue;
      }
      // Still empty at the smallest page: give AniList a moment, then try a few more times.
      if (++emptyAtSmallest <= 3) {
        await new Promise((r) => setTimeout(r, 20000));
        continue;
      }
    }
    for (const m of data.Page.media) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        out.push(m);
      }
    }
    onProgress({ loaded: Math.min(out.length, total), total });
    if (!data.Page.pageInfo?.hasNextPage || data.Page.media.length === 0) break;
  }
  return out.slice(0, total);
}

export async function searchAniList(search: string): Promise<RawMedia[]> {
  const data = await gql<PageResult>(SEARCH_QUERY, { search });
  return data.Page.media;
}
