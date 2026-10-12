import type { Item, Mark } from '../types';
import type { Fit } from './solver';
import { NOT_THEMES } from './findings';

export interface Recommendation {
  item: Item;
  score: number;
  /** The part of the score that comes from recommendation links (negative when titles you rank low point here). */
  links: number;
  /** Seen titles whose AniList recommendations point here, strongest first. */
  because: string[];
  /** Genres this title shares with the ones you rank highly. */
  genres: string[];
  /** Tags this title shares with the ones you rank highly, strongest first. */
  tags: string[];
}

/** How much each part counts. Exported so the simulation can try others. */
export const WEIGHTS = { links: 1, genre: 1.5, tag: 4, quality: 0.3, shrink: 3, tagTop: 3 };

/** Below this many ranked titles there isn't enough to go on. */
export const MIN_RANKED = 3;

/**
 * Suggests titles you haven't seen.
 *
 * Each ranked title gets a liking score: how far above or below the middle
 * of your ranking it sits, in standard deviations. A candidate then collects
 * - AniList users' recommendation links from your ranked titles to it, each
 *   weighted by how much you like the source (a link from a title you rank
 *   low counts against it); and
 * - a smaller genre term: how much you like the genres it belongs to.
 * AniList's average score breaks near-ties.
 */
export function recommend(items: Item[], fit: Fit, marks: Map<string, Mark>, limit = 50, w = WEIGHTS): Recommendation[] {
  const ranked = fit.order;
  if (ranked.length < MIN_RANKED) return [];
  const thetas = ranked.map((id) => fit.theta.get(id)!);
  const mean = thetas.reduce((a, b) => a + b, 0) / thetas.length;
  const sd = Math.max(0.3, Math.sqrt(thetas.reduce((a, t) => a + (t - mean) ** 2, 0) / thetas.length));
  const liking = new Map(ranked.map((id) => [id, (fit.theta.get(id)! - mean) / sd]));
  const byId = new Map(items.map((i) => [i.id, i]));

  // Genre affinity, shrunk towards zero for genres you've ranked few of.
  const genreSum = new Map<string, number>();
  const genreCount = new Map<string, number>();
  for (const id of ranked) {
    for (const g of byId.get(id)?.genres ?? []) {
      genreSum.set(g, (genreSum.get(g) ?? 0) + liking.get(id)!);
      genreCount.set(g, (genreCount.get(g) ?? 0) + 1);
    }
  }
  const affinity = (g: string) => (genreSum.get(g) ?? 0) / ((genreCount.get(g) ?? 0) + w.shrink);

  // Tag affinity, the same way. Tags are more specific than genres, so each is held by fewer titles.
  const tagSum = new Map<string, number>();
  const tagCount = new Map<string, number>();
  for (const id of ranked) {
    for (const t of byId.get(id)?.tags ?? []) {
      tagSum.set(t, (tagSum.get(t) ?? 0) + liking.get(id)!);
      tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
    }
  }
  const tagAffinity = (t: string) => (tagSum.get(t) ?? 0) / ((tagCount.get(t) ?? 0) + w.shrink);

  // Recommendation links from ranked titles.
  const linkScore = new Map<string, number>();
  const sources = new Map<string, [string, number][]>();
  for (const id of ranked) {
    const like = liking.get(id)!;
    for (const [target, weight] of byId.get(id)?.recs ?? []) {
      if (marks.get(target)?.status === 'seen') continue;
      const contribution = like * Math.log1p(weight);
      linkScore.set(target, (linkScore.get(target) ?? 0) + contribution);
      if (contribution > 0) {
        if (!sources.has(target)) sources.set(target, []);
        sources.get(target)!.push([id, contribution]);
      }
    }
  }

  const out: Recommendation[] = [];
  for (const item of items) {
    if (marks.get(item.id)?.status === 'seen') continue;
    const gs = item.genres ?? [];
    const genreScore = gs.length ? gs.reduce((a, g) => a + affinity(g), 0) / gs.length : 0;
    const ts = item.tags ?? [];
    const aff = ts.map(tagAffinity).sort((a, b) => b - a);
    const used = w.tagTop > 0 ? aff.slice(0, w.tagTop) : aff;
    const tagScore = used.length ? used.reduce((a, x) => a + x, 0) / (w.tagTop > 0 ? w.tagTop : used.length) : 0;
    const quality = ((item.averageScore ?? 65) - 65) / 40;
    const links = linkScore.get(item.id) ?? 0;
    const score = w.links * links + w.genre * genreScore + w.tag * tagScore + w.quality * quality;
    // Needs a reason: a positive link, or genres or tags you clearly rank highly.
    if (score <= 0 || (links <= 0 && genreScore <= 0.05 && tagScore <= 0.05)) continue;
    out.push({
      item,
      score,
      links,
      because: (sources.get(item.id) ?? []).sort((a, b) => b[1] - a[1]).map(([id]) => id),
      genres: gs.filter((g) => affinity(g) > 0.05).sort((a, b) => affinity(b) - affinity(a)),
      tags: ts.filter((t) => !NOT_THEMES.has(t) && tagAffinity(t) > 0.1 && (tagCount.get(t) ?? 0) >= 2).sort((a, b) => tagAffinity(b) - tagAffinity(a)),
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
