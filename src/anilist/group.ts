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
  /** AniList tags: rank is the share of voters (0–100) who agree the tag fits. */
  tags?: { name: string; rank: number | null; category: string | null; isGeneralSpoiler: boolean | null; isMediaSpoiler: boolean | null; isAdult: boolean | null }[] | null;
  recommendations?: { nodes: { rating: number | null; mediaRecommendation: { id: number; type: string } | null }[] } | null;
}

/** Recommendation links kept per franchise. */
const MAX_RECS = 12;

/** Relations that make two entries part of the same franchise. */
const SAME_FRANCHISE = new Set(['PREQUEL', 'SEQUEL', 'PARENT', 'SIDE_STORY', 'SUMMARY', 'COMPILATION', 'CONTAINS']);
/** Relations followed through entries that are not in the catalogue (missing middle seasons). */
const BRIDGE = new Set(['PREQUEL', 'SEQUEL']);
/** Relations that carry one story on: seasons in order, and recaps of them. */
const CONTINUITY = new Set(['PREQUEL', 'SEQUEL', 'SUMMARY', 'COMPILATION', 'CONTAINS']);
const SERIES_FORMATS = new Set(['TV', 'TV_SHORT', 'ONA']);
/** Formats of printed works. Everything else is anime. */
export const MANGA_FORMATS = new Set(['MANGA', 'ONE_SHOT', 'NOVEL']);
export const isManga = (format: string | null | undefined) => MANGA_FORMATS.has(format ?? '');
/** A title known only in print, with no anime. */
export const isMangaOnly = (item: { formats: string[] }) => item.formats.length > 0 && item.formats.every(isManga);
/** Relations that link a manga and an anime telling the same story. */
const SAME_STORY = new Set(['ADAPTATION', 'SOURCE']);

const yearOf = (m: RawMedia) => m.startDate?.year ?? m.seasonYear ?? undefined;

/**
 * A full series or film, as opposed to an extra (special, OVA, short, music video).
 * Web series count only when their episodes are a normal length, since many are shorts, and a
 * one-episode TV entry is a TV special (Lupin the 3rd vs. Detective Conan).
 */
export function isMajor(m: Pick<RawMedia, 'format' | 'duration' | 'episodes'>): boolean {
  const d = m.duration ?? undefined;
  if ((m.format === 'TV' || m.format === 'ONA') && m.episodes === 1) return false;
  if (m.format === 'TV') return d === undefined || d >= 10;
  if (m.format === 'MOVIE') return d === undefined || d >= 30;
  if (m.format === 'ONA') return d !== undefined && d >= 15;
  return false;
}

/**
 * Whether a set of entries stands on its own: it has a series, or (when `films` is set) two or more
 * films (Rebuild of Evangelion). A lone film is usually a side story of a series, so it never counts.
 */
function standsAlone(ids: Iterable<number>, byId: Map<number, RawMedia>, films = true): boolean {
  let count = 0;
  for (const id of ids) {
    const m = byId.get(id);
    if (!m || !isMajor(m)) continue;
    if (m.format !== 'MOVIE') return true;
    if (films && ++count >= 2) return true;
  }
  return false;
}

type Graph = Map<number, { to: number; type: string }[]>;

/**
 * Franchise links between the given anime, both ways. Entries missing from the catalogue appear as
 * nodes when they are a season in between (a sequel or prequel), as in the grouping itself.
 */
function animeGraph(members: RawMedia[], byId: Map<number, RawMedia>): Graph {
  const ids = new Set(members.map((m) => m.id));
  const g: Graph = new Map();
  const add = (a: number, b: number, type: string) => {
    if (!g.has(a)) g.set(a, []);
    g.get(a)!.push({ to: b, type });
  };
  for (const m of members) {
    if (!g.has(m.id)) g.set(m.id, []);
    for (const e of m.relations?.edges ?? []) {
      if (e.node.type !== 'ANIME' || !SAME_FRANCHISE.has(e.relationType) || e.node.id === m.id) continue;
      if (!ids.has(e.node.id) && (byId.has(e.node.id) || !BRIDGE.has(e.relationType))) continue;
      add(m.id, e.node.id, e.relationType);
      add(e.node.id, m.id, e.relationType);
    }
  }
  return g;
}

/** Connected parts of `nodes`, following only the links `follow` accepts. */
function partsOf(g: Graph, nodes: Set<number>, follow: (type: string) => boolean = () => true): number[][] {
  const seen = new Set<number>();
  const out: number[][] = [];
  for (const start of nodes) {
    if (seen.has(start)) continue;
    const part: number[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const n = stack.pop()!;
      part.push(n);
      for (const e of g.get(n) ?? []) {
        if (!nodes.has(e.to) || seen.has(e.to) || !follow(e.type)) continue;
        seen.add(e.to);
        stack.push(e.to);
      }
    }
    out.push(part);
  }
  return out;
}

/** Chains of entries that carry one story on (seasons, recaps), ignoring side stories. */
const chainsOf = (g: Graph, nodes: Set<number>) => partsOf(g, nodes, (t) => CONTINUITY.has(t));

/** Something said about a cut, for the build log. */
export interface BridgeCut {
  extra: RawMedia[];
  parts: RawMedia[][];
}

/**
 * Splits a group of anime where an extra (a special, OVA, short, or a lone film with its extras) is
 * the only thing linking two parts that each stand on their own (a series, or two or more films):
 * Nisekoimonogatari between Monogatari and Nisekoi, the Lupin vs. Conan special and film. The extra
 * stays with the part it has most links to. An extra that is a season in between (a sequel of one
 * and prequel of the other) is never cut, since that is one story.
 */
function cutBridges(members: RawMedia[], byId: Map<number, RawMedia>, onCut?: (cut: BridgeCut) => void): RawMedia[][] {
  const g = animeGraph(members, byId);
  const memberIds = new Set(members.map((m) => m.id));
  const pop = (part: number[]) => Math.max(0, ...part.map((id) => (memberIds.has(id) ? (byId.get(id)!.popularity ?? 0) : 0)));
  const toMedia = (part: Iterable<number>) => [...part].filter((id) => memberIds.has(id)).map((id) => byId.get(id)!);

  const work = [new Set(g.keys())];
  const done: Set<number>[] = [];
  while (work.length) {
    const nodes = work.pop()!;
    let split = false;
    for (const chain of chainsOf(g, nodes)) {
      if (standsAlone(chain.filter((id) => memberIds.has(id)), byId)) continue;
      const inChain = new Set(chain);
      const rest = new Set([...nodes].filter((n) => !inChain.has(n)));
      const parts = partsOf(g, rest);
      const anchored = parts.filter((p) => standsAlone(p.filter((id) => memberIds.has(id)), byId));
      if (anchored.length < 2) continue;
      // The extra goes with the part it is most linked to (the more popular part on a tie); parts with
      // no series or film of their own hung off the extra, so they go with it.
      const links = (p: number[]) => {
        const inP = new Set(p);
        return chain.reduce((n, id) => n + (g.get(id) ?? []).filter((e) => inP.has(e.to)).length, 0);
      };
      const home = [...anchored].sort((a, b) => links(b) - links(a) || pop(b) - pop(a))[0];
      const homeSet = new Set([...home, ...chain, ...parts.filter((p) => !anchored.includes(p)).flat()]);
      const others = anchored.filter((p) => p !== home).map((p) => new Set(p));
      onCut?.({ extra: toMedia(chain), parts: [toMedia(homeSet), ...others.map(toMedia)] });
      work.push(homeSet, ...others);
      split = true;
      break;
    }
    if (!split) done.push(nodes);
  }
  return done.map(toMedia).filter((p) => p.length > 0);
}

/**
 * Which storyline each entry of a franchise belongs to, or null if it has only one. A storyline is a
 * chain of seasons and films that carry one story on (sequels, prequels, recaps), with its side stories
 * films and extras attached; each has a series (a chain of films alone, like One Piece's, does not count). Manga join the storyline they were adapted
 * into. The key of a storyline is the id of one of its entries.
 */
function storylines(members: RawMedia[], byId: Map<number, RawMedia>): Map<number, number> | null {
  const anime = members.filter((m) => !isManga(m.format));
  if (anime.length < 2) return null;
  const memberIds = new Set(members.map((m) => m.id));
  const g = animeGraph(anime, byId);
  const major = (id: number) => memberIds.has(id) && isMajor(byId.get(id)!);
  const pop = (id: number) => byId.get(id)?.popularity ?? 0;
  const chains = chainsOf(g, new Set(g.keys()));
  const main = chains.filter((c) => standsAlone(c.filter((id) => memberIds.has(id)), byId, false));
  if (main.length < 2) return null;

  const story = new Map<number, number>();
  const keyPop = new Map<number, number>();
  for (const c of main) {
    const majors = c.filter(major);
    const key = Math.min(...majors);
    keyPop.set(key, Math.max(...majors.map(pop)));
    for (const n of c) story.set(n, key);
  }
  const best = (votes: Map<number, number>) => [...votes].sort((a, b) => b[1] - a[1] || keyPop.get(b[0])! - keyPop.get(a[0])!)[0]?.[0];
  const lead = best(new Map([...keyPop.keys()].map((k) => [k, 0])))!;

  // Extras join the storyline they link to most, spreading outward from the storylines.
  let pending = chains.filter((c) => !main.includes(c));
  while (pending.length) {
    const left: number[][] = [];
    for (const c of pending) {
      const votes = new Map<number, number>();
      for (const n of c) {
        for (const e of g.get(n) ?? []) {
          const s = story.get(e.to);
          if (s !== undefined && !c.includes(e.to)) votes.set(s, (votes.get(s) ?? 0) + 1);
        }
      }
      const s = best(votes);
      if (s === undefined) left.push(c);
      else for (const n of c) story.set(n, s);
    }
    if (left.length === pending.length) {
      for (const c of left) for (const n of c) story.set(n, lead);
      break;
    }
    pending = left;
  }

  // Manga: the storyline of the anime they were adapted into; failing that, of the manga they continue
  // (a sequel or prequel); failing that, the main storyline.
  const manga = members.filter((m) => isManga(m.format));
  const fromAnime = new Map<number, number[]>();
  for (const a of anime) {
    for (const e of a.relations?.edges ?? []) {
      if (e.node.type !== 'MANGA' || !SAME_STORY.has(e.relationType)) continue;
      if (!fromAnime.has(e.node.id)) fromAnime.set(e.node.id, []);
      fromAnime.get(e.node.id)!.push(a.id);
    }
  }
  const unplaced: RawMedia[] = [];
  for (const m of manga) {
    const votes = new Map<number, number>();
    const vote = (animeId: number) => {
      const s = story.get(animeId);
      if (s !== undefined) votes.set(s, (votes.get(s) ?? 0) + 1);
    };
    for (const e of m.relations?.edges ?? []) if (e.node.type === 'ANIME' && SAME_STORY.has(e.relationType)) vote(e.node.id);
    for (const a of fromAnime.get(m.id) ?? []) vote(a);
    const s = best(votes);
    if (s === undefined) unplaced.push(m);
    else story.set(m.id, s);
  }
  let rest = unplaced;
  while (rest.length) {
    const left = rest.filter((m) => {
      const votes = new Map<number, number>();
      for (const e of m.relations?.edges ?? []) {
        const linked = e.node.type === 'MANGA' && memberIds.has(e.node.id) && CONTINUITY.has(e.relationType);
        const s = linked ? story.get(e.node.id) : undefined;
        if (s !== undefined) votes.set(s, (votes.get(s) ?? 0) + 1);
      }
      for (const other of manga) {
        if (!other.relations?.edges.some((e) => e.node.id === m.id && CONTINUITY.has(e.relationType))) continue;
        const s = story.get(other.id);
        if (s !== undefined) votes.set(s, (votes.get(s) ?? 0) + 1);
      }
      const s = best(votes);
      if (s !== undefined) story.set(m.id, s);
      return s === undefined;
    });
    if (left.length === rest.length) {
      for (const m of left) story.set(m.id, lead);
      break;
    }
    rest = left;
  }

  const out = new Map<number, number>();
  for (const id of memberIds) out.set(id, story.get(id) ?? lead);
  return out;
}

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
export function groupFranchises(media: RawMedia[], existing: Item[] = [], onCut?: (cut: BridgeCut) => void): Item[] {
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
  // Anime groups, with any extra that was the only link between two series cut out. Each part is
  // keyed by its smallest entry id; `animeGroup` says which part an anime entry ended up in.
  const groups = new Map<number, RawMedia[]>();
  const animeGroup = new Map<number, number>();
  for (const members of raw.values()) {
    if (mediumOf(members[0]) !== 'ANIME') continue;
    for (const part of cutBridges(members, byId, onCut)) {
      const key = Math.min(...part.map((m) => m.id));
      groups.set(key, [...part]);
      for (const m of part) animeGroup.set(m.id, key);
    }
  }
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
  for (const [root, members] of [...raw]) {
    if (mediumOf(members[0]) !== 'MANGA') continue;
    const links = new Map<number, number>();
    const count = (animeId: number) => {
      const a = byId.get(animeId);
      if (!a || mediumOf(a) !== 'ANIME') return;
      const r = animeGroup.get(animeId)!;
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
  // When a franchise is cut in two, the part holding the entry it was named after keeps its id (and
  // the marks and duels on it), since that is the title people saw.
  const oldIdByLead = new Map<number, string>();
  for (const item of existing) if (item.entries?.length) oldIdByLead.set(representative(item.entries).id, item.id);

  const items: Item[] = [];
  const membersById = new Map<string, RawMedia[]>();
  const used = new Set<string>();
  // Titles holding an old title's lead entry pick ids first, then the rest by popularity.
  const pop = (g: RawMedia[]) => Math.max(...g.map((m) => m.popularity ?? 0));
  const leads = (g: RawMedia[]) => g.some((m) => oldIdByLead.has(m.id));
  const ordered = [...groups.values()].sort((a, b) => Number(leads(b)) - Number(leads(a)) || pop(b) - pop(a));
  for (const members of ordered) {
    const item = toItem(members, oldIdByEntry, used, storylines(members, byId), oldIdByLead);
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

/** Tags kept per entry: AniList's rank (share of voters who agree) at least this, at most MAX_ENTRY_TAGS. */
export const TAG_MIN_RANK = 60;
export const MAX_ENTRY_TAGS = 6;
export const MAX_ITEM_TAGS = 8;
/** Tag categories left out: sexual content, and technical ones (CGI, Full Color) that say nothing about taste. */
const DROP_TAG_CATEGORIES = new Set(['Sexual Content', 'Technical']);
/** Tags left out by name: content warnings that would read badly as a reason or a type, and Heterosexual (near-universal). */
export const DROP_TAGS = new Set([
  'Nudity',
  'Suicide',
  'Bullying',
  'Torture',
  'Drugs',
  'Slavery',
  'Cannibalism',
  'Psychosexual',
  'Ero Guro',
  'Incest',
  'Heterosexual',
]);

/** An entry's tags, strongest first, without spoilers, adult tags and the ones dropped above. */
export function tagsOf(m: Pick<RawMedia, 'tags'>): string[] {
  return [...(m.tags ?? [])]
    .filter(
      (t) =>
        !t.isAdult &&
        !t.isMediaSpoiler &&
        !t.isGeneralSpoiler &&
        (t.rank ?? 0) >= TAG_MIN_RANK &&
        !DROP_TAG_CATEGORIES.has(t.category ?? '') &&
        !DROP_TAGS.has(t.name),
    )
    .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))
    .slice(0, MAX_ENTRY_TAGS)
    .map((t) => t.name);
}

/**
 * A franchise's tags from its entries: each entry votes for its tags with the square root of its
 * popularity, so the main series counts for more than a stray OVA. A tag needs entries holding at
 * least a quarter of the votes when the franchise has several entries.
 */
export function franchiseTags(entries: Entry[]): string[] {
  const weight = new Map<string, number>();
  let total = 0;
  for (const e of entries) {
    if (!e.tags?.length) continue;
    const w = Math.sqrt(Math.max(e.popularity, 1));
    total += w;
    e.tags.forEach((t, i) => weight.set(t, (weight.get(t) ?? 0) + w * (1 - i * 0.05)));
  }
  return [...weight.entries()]
    .filter(([, w]) => w >= total * 0.25)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_ITEM_TAGS)
    .map(([t]) => t);
}

export function entryOf(m: RawMedia, story?: number): Entry {
  const genres = m.genres ?? [];
  const tags = tagsOf(m);
  return {
    ...(story !== undefined ? { story } : {}),
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
    ...(tags.length ? { tags } : {}),
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
  const tags = franchiseTags(entries);
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
    ...(tags.length ? { tags } : {}),
    entries,
  };
}

export function toItem(
  members: RawMedia[],
  oldIdByEntry = new Map<number, string>(),
  used = new Set<string>(),
  story: Map<number, number> | null = null,
  oldIdByLead = new Map<number, string>(),
): Item {
  const entries = members.map((m) => entryOf(m, story?.get(m.id)));
  const summary = summarise(entries);
  const rep = members.find((m) => m.id === representative(entries).id)!;
  const ids = summary.entryIds.map((e) => oldIdByLead.get(e) ?? oldIdByEntry.get(e));
  const fresh = [rep.id, ...summary.entryIds].map((e) => `al-${e}`);
  let id = ids.find((x) => x && !used.has(x)) ?? fresh.find((x) => !used.has(x)) ?? `al-${summary.entryIds[0]}`;
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

/** One storyline of a franchise, as recorded in the catalogue. */
export interface Storyline {
  key: number;
  /** The entry it is named after (its first series or film). */
  lead: Entry;
  entries: Entry[];
  anime: number;
  manga: number;
}

/**
 * The storylines of a title, oldest first, or an empty list when it has only one. Entries the
 * catalogue gave no storyline (added by search) go with the storyline the title is named after.
 */
export function storylinesOf(entries: Entry[] | undefined): Storyline[] {
  if (!entries?.some((e) => e.story !== undefined)) return [];
  const leadKey = representative(entries).story;
  const byKey = new Map<number, Entry[]>();
  for (const e of entries) {
    const k = e.story ?? leadKey ?? -1;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(e);
  }
  if (byKey.size < 2) return [];
  return [...byKey]
    .map(([key, es]) => ({
      key,
      lead: representative(es),
      entries: es,
      anime: es.filter((e) => !isManga(e.format)).length,
      manga: es.filter((e) => isManga(e.format)).length,
    }))
    .sort((a, b) => (a.lead.year ?? 9999) - (b.lead.year ?? 9999) || a.key - b.key);
}
