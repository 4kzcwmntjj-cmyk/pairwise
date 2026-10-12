import type { Item, Mark } from '../types';
import type { Fit } from './solver';

export interface Recommendation {
  item: Item;
  score: number;
  /** The part of the score that comes from recommendation links (negative when titles you rank low point here). */
  links: number;
  /** Seen titles whose AniList recommendations point here, strongest first. */
  because: string[];
  /** Genres this title shares with the ones you rank highly. */
  genres: string[];
}

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
export function recommend(items: Item[], fit: Fit, marks: Map<string, Mark>, limit = 50): Recommendation[] {
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
  const affinity = (g: string) => (genreSum.get(g) ?? 0) / ((genreCount.get(g) ?? 0) + 3);

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
    const quality = ((item.averageScore ?? 65) - 65) / 40;
    const links = linkScore.get(item.id) ?? 0;
    const score = links + 1.5 * genreScore + 0.3 * quality;
    // Needs a real reason: a positive link, or genres you clearly rank highly.
    if (score <= 0 || (links <= 0 && genreScore <= 0.05)) continue;
    out.push({
      item,
      score,
      links,
      because: (sources.get(item.id) ?? []).sort((a, b) => b[1] - a[1]).map(([id]) => id),
      genres: gs.filter((g) => affinity(g) > 0.05).sort((a, b) => affinity(b) - affinity(a)),
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
