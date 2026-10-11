import type { Item } from '../types';

export interface RawMedia {
  id: number;
  title: { romaji: string | null; english: string | null };
  format: string | null;
  seasonYear: number | null;
  startDate: { year: number | null } | null;
  popularity: number | null;
  averageScore: number | null;
  coverImage: { large: string | null; color: string | null } | null;
  studios: { nodes: { name: string }[] } | null;
  relations: { edges: { relationType: string; node: { id: number; type: string } }[] } | null;
}

/** Relations that make two entries part of the same franchise. */
const SAME_FRANCHISE = new Set(['PREQUEL', 'SEQUEL', 'PARENT', 'SIDE_STORY', 'SUMMARY', 'COMPILATION', 'CONTAINS']);
/** Relations followed through entries that are not in the catalogue (missing middle seasons). */
const BRIDGE = new Set(['PREQUEL', 'SEQUEL']);
const SERIES_FORMATS = new Set(['TV', 'TV_SHORT', 'ONA']);

const yearOf = (m: RawMedia) => m.startDate?.year ?? m.seasonYear ?? undefined;

class UnionFind {
  private parent = new Map<number, number>();
  find(x: number): number {
    let p = this.parent.get(x) ?? x;
    if (p !== x) {
      p = this.find(p);
      this.parent.set(x, p);
    }
    return p;
  }
  union(a: number, b: number) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(Math.max(ra, rb), Math.min(ra, rb));
  }
}

/**
 * Groups AniList entries into franchises. `existing` lets a refreshed
 * catalogue keep the ids of franchises it already had, so marks and votes
 * still point at the right item.
 */
export function groupFranchises(media: RawMedia[], existing: Item[] = []): Item[] {
  const byId = new Map<number, RawMedia>();
  for (const m of media) if (!byId.has(m.id)) byId.set(m.id, m);
  const uf = new UnionFind();
  for (const m of byId.values()) {
    for (const e of m.relations?.edges ?? []) {
      if (e.node.type !== 'ANIME' || !SAME_FRANCHISE.has(e.relationType)) continue;
      if (byId.has(e.node.id) || BRIDGE.has(e.relationType)) uf.union(m.id, e.node.id);
    }
  }
  const groups = new Map<number, RawMedia[]>();
  for (const m of byId.values()) {
    const root = uf.find(m.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(m);
  }

  const oldIdByEntry = new Map<number, string>();
  for (const item of existing) for (const e of item.entryIds) oldIdByEntry.set(e, item.id);

  const items: Item[] = [];
  const used = new Set<string>();
  for (const members of groups.values()) {
    items.push(toItem(members, oldIdByEntry, used));
  }
  return items.sort((a, b) => b.popularity - a.popularity);
}

export function toItem(members: RawMedia[], oldIdByEntry = new Map<number, string>(), used = new Set<string>()): Item {
  const series = members.filter((m) => SERIES_FORMATS.has(m.format ?? ''));
  const candidates = series.length > 0 ? series : members;
  const rep = [...candidates].sort(
    (a, b) => (yearOf(a) ?? 9999) - (yearOf(b) ?? 9999) || (b.popularity ?? 0) - (a.popularity ?? 0),
  )[0];
  const top = [...members].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))[0];
  const years = members.map(yearOf).filter((y): y is number => y !== undefined);
  const entryIds = members.map((m) => m.id).sort((a, b) => a - b);
  let id = entryIds.map((e) => oldIdByEntry.get(e)).find((x) => x && !used.has(x)) ?? `al-${entryIds[0]}`;
  if (used.has(id)) id = `al-${entryIds[0]}-${used.size}`;
  used.add(id);
  return {
    id,
    category: 'anime',
    source: 'anilist',
    title: rep.title.english ?? rep.title.romaji ?? `AniList ${rep.id}`,
    titleEnglish: rep.title.english ?? undefined,
    titleRomaji: rep.title.romaji ?? undefined,
    entryIds,
    formats: members.map((m) => m.format ?? 'OTHER'),
    startYear: years.length ? Math.min(...years) : undefined,
    endYear: years.length ? Math.max(...years) : undefined,
    studio: rep.studios?.nodes[0]?.name ?? top.studios?.nodes[0]?.name,
    cover: rep.coverImage?.large ?? undefined,
    coverColor: rep.coverImage?.color ?? undefined,
    popularity: top.popularity ?? 0,
    averageScore: top.averageScore ?? undefined,
  };
}

/** Finds the franchise a newly found entry belongs to, if any. */
export function franchiseFor(m: RawMedia, items: Item[]): Item | undefined {
  const related = new Set<number>([m.id]);
  for (const e of m.relations?.edges ?? []) {
    if (e.node.type === 'ANIME' && SAME_FRANCHISE.has(e.relationType)) related.add(e.node.id);
  }
  return items.find((it) => it.source === 'anilist' && it.entryIds.some((e) => related.has(e)));
}

/** Adds an entry to an existing franchise, keeping its id. */
export function addEntry(item: Item, m: RawMedia): Item {
  if (item.entryIds.includes(m.id)) return item;
  const years = [item.startYear, item.endYear, yearOf(m)].filter((y): y is number => y !== undefined);
  return {
    ...item,
    entryIds: [...item.entryIds, m.id].sort((a, b) => a - b),
    formats: [...item.formats, m.format ?? 'OTHER'],
    startYear: years.length ? Math.min(...years) : undefined,
    endYear: years.length ? Math.max(...years) : undefined,
    popularity: Math.max(item.popularity, m.popularity ?? 0),
  };
}

/** "3 seasons · 2 films" style summary of what a franchise contains. */
export function describeFormats(formats: string[]): string {
  const count = (fs: string[]) => formats.filter((f) => fs.includes(f)).length;
  const parts: string[] = [];
  const series = count(['TV', 'TV_SHORT', 'ONA']);
  const films = count(['MOVIE']);
  const extras = count(['OVA', 'SPECIAL', 'MUSIC']);
  if (series) parts.push(series === 1 ? '1 series' : `${series} series`);
  if (films) parts.push(films === 1 ? '1 film' : `${films} films`);
  if (extras) parts.push(extras === 1 ? '1 extra' : `${extras} extras`);
  return parts.join(', ');
}
