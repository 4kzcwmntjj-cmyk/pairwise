import { AniListError, gql } from './client';
import type { RawMedia } from './group';

export const CATALOGUE_SIZE = 1500;

const FIELDS = `
  id
  title { romaji english }
  format
  seasonYear
  startDate { year }
  popularity
  averageScore
  coverImage { large color }
  studios(isMain: true) { nodes { name } }
  relations { edges { relationType(version: 2) node { id type } } }
`;

const PAGE_QUERY = `query ($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage }
    media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) { ${FIELDS} }
  }
}`;

const SEARCH_QUERY = `query ($search: String) {
  Page(page: 1, perPage: 12) {
    media(type: ANIME, search: $search, isAdult: false, sort: SEARCH_MATCH) { ${FIELDS} }
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

/** Fetches the most popular anime, most popular first. */
export async function fetchCatalogue(onProgress: (p: LoadProgress) => void, total = CATALOGUE_SIZE): Promise<RawMedia[]> {
  let perPage = 50;
  const out: RawMedia[] = [];
  const seen = new Set<number>();
  while (out.length < total) {
    // Pages are counted at the current page size from the number already loaded.
    const page = Math.floor(out.length / perPage) + 1;
    let data: PageResult;
    try {
      data = await gql<PageResult>(PAGE_QUERY, { page, perPage }, (s) =>
        onProgress({ loaded: out.length, total, waitingSeconds: s }),
      );
    } catch (e) {
      if (e instanceof AniListError && e.kind === 'complexity' && perPage > 10) {
        perPage = Math.max(10, Math.floor(perPage / 2));
        continue;
      }
      throw e;
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
