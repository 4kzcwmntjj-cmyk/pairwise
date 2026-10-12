import type { Entry, Item } from '../types';

export interface RawMedia {
  id: number;
  title: { romaji: string | null; english: string | null };
  format: string | null;
  /** Episode count and minutes per episode, when AniList knows them. */
  episodes?: number | null;
  duration?: number | null;
  seasonYear: number | null;
  startDate: { year: number | null } | null;
  popularity: number | null;
  averageScore: number | null;
  coverImage: { large: string | null; extraLarge?: string | null; color: string | null } | null;
  studios: { nodes: { name: string }[] } | null;
  relations: { edges: { relationType: string; node: { id: number; type: string } }[] } | null;
  genres?: string[] | null;
  recommendations?: { nodes: { rating: number | null; mediaRecommendation: { id: number; type: string } | null }[] } | null;
}

/** Recommendation links kept per franchise. */
const MAX_RECS = 12;

/** Relations that make two entries part of the same franchise. */
const SAME_FRANCHISE = new Set(['PREQUEL', 'SEQUEL', 'PARENT', 'SIDE_STORY', 'SUMMARY', 'COMPILATION', 'CONTAINS']);
/** Relations followed through entries that are not in the catalogue (missing middle seasons). */
const BRIDGE = new Set(['PREQUEL', 'SEQUEL']);
const SERIES_FORMATS = new Set(['TV', 'TV_SHORT', 'ONA']);
/** Formats of printed works. Everything else is anime. */
export const MANGA_FORMATS = new Set(['MANGA', 'ONE_SHOT', 'NOVEL']);
export const isManga = (format: string | null | undefined) => MANGA_FORMATS.has(format ?? '');
/** A title known only in print, with no anime. */
export const isMangaOnly = (item: { formats: string[] }) => item.formats.length > 0 && item.formats.every(isManga);
/** Relations that link a manga and an anime telling the same story. */
const SAME_STORY = new Set(['ADAPTATION', 'SOURCE']);

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
 *
 * Anime join anime (seasons, films, side stories) and manga join manga the
 * same way. Each manga group then attaches to the one anime franchise it is
 * most linked to by adaptation, if any. A manga never joins two anime
 * franchises together: many manga were adapted more than once (a remake, a
 * spin-off), and letting those links join franchises would weld unrelated
 * anime into one title.
 */
export function groupFranchises(media: RawMedia[], existing: Item[] = []): Item[] {
  const byId = new Map<number, RawMedia>();
  for (const m of media) if (!byId.has(m.id)) byId.set(m.id, m);
  const mediumOf = (m: RawMedia) => (isManga(m.format) ? 'MANGA' : 'ANIME');
  const uf = new UnionFind();
  for (const m of byId.values()) {
    for (const e of m.relations?.edges ?? []) {
      if (e.node.type !== mediumOf(m) || !SAME_FRANCHISE.has(e.relationType)) continue;
      const other = byId.get(e.node.id);
      if (other ? mediumOf(other) === mediumOf(m) : BRIDGE.has(e.relationType)) uf.union(m.id, e.node.id);
    }
  }
  const raw = new Map<number, RawMedia[]>();
  for (const m of byId.values()) {
    const root = uf.find(m.id);
    if (!raw.has(root)) raw.set(root, []);
    raw.get(root)!.push(m);
  }

  // Attach each manga group to the anime group it has the most adaptation links with; ties go to the more popular.
  const groups = new Map<number, RawMedia[]>();
  for (const [root, members] of raw) if (mediumOf(members[0]) === 'ANIME') groups.set(root, [...members]);
  const groupPopularity = (root: number) => Math.max(...groups.get(root)!.map((m) => m.popularity ?? 0));
  // Links recorded on the anime side: manga id -> anime groups that name it as their source or adaptation.
  const fromAnime = new Map<number, number[]>();
  for (const [r, anime] of groups) {
    for (const a of anime) {
      for (const e of a.relations?.edges ?? []) {
        if (e.node.type !== 'MANGA' || !SAME_STORY.has(e.relationType)) continue;
        if (!fromAnime.has(e.node.id)) fromAnime.set(e.node.id, []);
        fromAnime.get(e.node.id)!.push(r);
      }
    }
  }
  for (const [root, members] of raw) {
    if (mediumOf(members[0]) !== 'MANGA') continue;
    const links = new Map<number, number>();
    const count = (animeId: number) => {
      const a = byId.get(animeId);
      if (!a || mediumOf(a) !== 'ANIME') return;
      const r = uf.find(animeId);
      links.set(r, (links.get(r) ?? 0) + 1);
    };
    for (const m of members) {
      for (const e of m.relations?.edges ?? []) if (e.node.type === 'ANIME' && SAME_STORY.has(e.relationType)) count(e.node.id);
    }
    for (const m of members) for (const r of fromAnime.get(m.id) ?? []) links.set(r, (links.get(r) ?? 0) + 1);
    const best = [...links].sort((x, y) => y[1] - x[1] || groupPopularity(y[0]) - groupPopularity(x[0]))[0];
    if (best) groups.get(best[0])!.push(...members);
    else groups.set(root, [...members]);
  }

  const oldIdByEntry = new Map<number, string>();
  for (const item of existing) for (const e of item.entryIds) oldIdByEntry.set(e, item.id);

  const items: Item[] = [];
  const membersById = new Map<string, RawMedia[]>();
  const used = new Set<string>();
  for (const members of groups.values()) {
    const item = toItem(members, oldIdByEntry, used);
    items.push(item);
    membersById.set(item.id, members);
  }

  // AniList users' "if you liked this, try that" links, summed up to franchise level.
  const franchiseOfEntry = new Map<number, string>();
  for (const item of items) for (const e of item.entryIds) franchiseOfEntry.set(e, item.id);
  for (const item of items) {
    const totals = new Map<string, number>();
    for (const m of membersById.get(item.id)!) {
      for (const n of m.recommendations?.nodes ?? []) {
        const target = n.mediaRecommendation;
        if (!target || !n.rating || n.rating <= 0) continue;
        const f = franchiseOfEntry.get(target.id);
        if (!f || f === item.id) continue;
        totals.set(f, (totals.get(f) ?? 0) + n.rating);
      }
    }
    if (totals.size) {
      item.recs = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_RECS);
    }
  }
  return items.sort((a, b) => b.popularity - a.popularity);
}

export function entryOf(m: RawMedia): Entry {
  const genres = m.genres ?? [];
  return {
    id: m.id,
    format: m.format ?? 'OTHER',
    year: yearOf(m),
    titleEnglish: m.title.english ?? undefined,
    titleRomaji: m.title.romaji ?? undefined,
    popularity: m.popularity ?? 0,
    averageScore: m.averageScore ?? undefined,
    cover: m.coverImage?.large ?? undefined,
    studio: m.studios?.nodes[0]?.name,
    ...(genres.length ? { genres } : {}),
  };
}

/** The entry a franchise is named after: its first series, or its first entry if it has no series. */
export function representative(entries: Entry[]): Entry {
  // Named after the anime where there is one, since that is how most people know it.
  const anime = entries.filter((e) => !isManga(e.format));
  const pool = anime.length > 0 ? anime : entries;
  const series = pool.filter((e) => SERIES_FORMATS.has(e.format));
  const candidates = series.length > 0 ? series : pool;
  return [...candidates].sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || b.popularity - a.popularity)[0];
}

/** Franchise-level fields worked out from its entries. `entries` must not be empty. */
export function summarise(entries: Entry[]): Omit<Item, 'id' | 'recs'> {
  const rep = representative(entries);
  const top = [...entries].sort((a, b) => b.popularity - a.popularity)[0];
  const years = entries.map((e) => e.year).filter((y): y is number => y !== undefined);
  const genreCount = new Map<string, number>();
  for (const e of entries) for (const g of e.genres ?? []) genreCount.set(g, (genreCount.get(g) ?? 0) + 1);
  const genres = [...genreCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([g]) => g);
  return {
    category: 'anime',
    source: 'anilist',
    title: rep.titleEnglish ?? rep.titleRomaji ?? `AniList ${rep.id}`,
    titleEnglish: rep.titleEnglish,
    titleRomaji: rep.titleRomaji,
    entryIds: entries.map((e) => e.id).sort((a, b) => a - b),
    formats: entries.map((e) => e.format),
    startYear: years.length ? Math.min(...years) : undefined,
    endYear: years.length ? Math.max(...years) : undefined,
    studio: rep.studio ?? top.studio,
    cover: rep.cover,
    popularity: top.popularity,
    averageScore: top.averageScore,
    ...(genres.length ? { genres } : {}),
    entries,
  };
}

export function toItem(members: RawMedia[], oldIdByEntry = new Map<number, string>(), used = new Set<string>()): Item {
  const entries = members.map(entryOf);
  const summary = summarise(entries);
  const rep = members.find((m) => m.id === representative(entries).id)!;
  let id = summary.entryIds.map((e) => oldIdByEntry.get(e)).find((x) => x && !used.has(x)) ?? `al-${summary.entryIds[0]}`;
  if (used.has(id)) id = `al-${summary.entryIds[0]}-${used.size}`;
  used.add(id);
  const item: Item = {
    id,
    ...summary,
    coverLarge: rep.coverImage?.extraLarge ?? undefined,
    coverColor: rep.coverImage?.color ?? undefined,
  };
  // Drop empty fields so the catalogue file stays small.
  for (const k of Object.keys(item) as (keyof Item)[]) if (item[k] === undefined) delete item[k];
  for (const e of item.entries!) for (const k of Object.keys(e) as (keyof Entry)[]) if (e[k] === undefined) delete e[k];
  return item;
}

/** Finds the franchise a newly found entry belongs to, if any. */
export function franchiseFor(m: RawMedia, items: Item[]): Item | undefined {
  const related = new Set<number>([m.id]);
  for (const e of m.relations?.edges ?? []) {
    if (SAME_FRANCHISE.has(e.relationType) || SAME_STORY.has(e.relationType)) related.add(e.node.id);
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
    ...(item.entries ? { entries: [...item.entries, entryOf(m)] } : {}),
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
  if (series) parts.push(series === 1 ? '1 season' : `${series} seasons`);
  if (films) parts.push(films === 1 ? '1 film' : `${films} films`);
  if (extras) parts.push(extras === 1 ? '1 extra' : `${extras} extras`);
  if (count(['MANGA', 'ONE_SHOT'])) parts.push('manga');
  if (count(['NOVEL'])) parts.push('novel');
  return parts.join(', ');
}
