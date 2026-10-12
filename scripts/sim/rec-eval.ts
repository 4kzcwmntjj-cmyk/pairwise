// Tries recommendation weights on made-up viewers and reports how many of the titles each viewer
// had seen (and liked) come back in the top 50 when they are hidden.
// Usage: npx vite-node scripts/sim/rec-eval.ts
//
// Each viewer's taste is drawn one of four ways (genres, tags, AniList recommendation links around a
// few favourites, or genres and tags together), so no single signal is favoured by the setup.
// A viewer sees about 150 of the 800 most popular titles, more likely the popular ones and the
// ones they like; a quarter of those are hidden and the rest ranked by taste.
import { readFileSync } from 'node:fs';
import { withTags } from '../../src/anilist/catalogueFile';
import { WEIGHTS, recommend } from '../../src/rank/recommend';
import type { Fit } from '../../src/rank/solver';
import type { Item, Mark } from '../../src/types';

const items: Item[] = withTags(JSON.parse(readFileSync('public/catalogue.json', 'utf8')).items);
const byPop = [...items].sort((a, b) => b.popularity - a.popularity);
const pool = byPop.slice(0, 800);
const byId = new Map(items.map((i) => [i.id, i]));

let seed = Number(process.argv[3] ?? 11);
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const pickWeighted = <T,>(xs: [T, number][]): T => {
  const total = xs.reduce((a, [, w]) => a + w, 0);
  let r = rnd() * total;
  for (const [x, w] of xs) if ((r -= w) <= 0) return x;
  return xs[xs.length - 1][0];
};
const pickSome = <T,>(xs: [T, number][], n: number): T[] => {
  const out = new Set<T>();
  while (out.size < n) out.add(pickWeighted(xs));
  return [...out];
};

const counts = (f: (i: Item) => string[] | undefined) => {
  const m = new Map<string, number>();
  for (const i of pool) for (const g of f(i) ?? []) m.set(g, (m.get(g) ?? 0) + 1);
  return [...m].filter(([, n]) => n >= 15 && n <= 300);
};
const genreChoices = counts((i) => i.genres);
const tagChoices = counts((i) => i.tags);

type Model = 'genre' | 'tag' | 'links' | 'mixed';
function utilities(model: Model): Map<string, number> {
  const quality = (i: Item) => ((i.averageScore ?? 70) - 70) / 25;
  const u = new Map<string, number>();
  if (model === 'links') {
    const seeds = pickSome(pool.slice(0, 300).map((i) => [i.id, 1] as [string, number]), 3);
    const near = new Map<string, number>();
    for (const s of seeds) {
      near.set(s, (near.get(s) ?? 0) + 3);
      for (const [t, w] of byId.get(s)!.recs ?? []) near.set(t, (near.get(t) ?? 0) + Math.log1p(w) / 3);
      // Second step, weaker.
      for (const [t] of (byId.get(s)!.recs ?? []).slice(0, 5))
        for (const [t2, w2] of byId.get(t)?.recs ?? []) near.set(t2, (near.get(t2) ?? 0) + Math.log1p(w2) / 8);
    }
    for (const i of pool) u.set(i.id, (near.get(i.id) ?? 0) + quality(i) + gauss() * 0.8);
    return u;
  }
  const genres = model === 'genre' || model === 'mixed' ? new Set(pickSome(genreChoices, model === 'mixed' ? 1 : 3)) : new Set<string>();
  const tags = model === 'tag' || model === 'mixed' ? new Set(pickSome(tagChoices, model === 'mixed' ? 3 : 5)) : new Set<string>();
  for (const i of pool) {
    const g = (i.genres ?? []).filter((x) => genres.has(x)).length;
    const t = (i.tags ?? []).filter((x) => tags.has(x)).length;
    u.set(i.id, g * 0.9 + t * 1.1 + quality(i) + gauss() * 0.8);
  }
  return u;
}

interface Viewer {
  train: string[];
  hidden: string[];
  liked: Set<string>;
  util: Map<string, number>;
}

function viewer(model: Model): Viewer {
  const util = utilities(model);
  const weights: [string, number][] = pool.map((i, r) => [i.id, Math.pow(800 - r, 0.7) * Math.exp(0.6 * util.get(i.id)!)]);
  const seen = pickSome(weights, 150);
  const sorted = [...seen].sort((a, b) => util.get(b)! - util.get(a)!);
  const median = util.get(sorted[Math.floor(sorted.length / 2)])!;
  const shuffled = [...seen].sort(() => rnd() - 0.5);
  const hidden = shuffled.slice(0, 38);
  return { train: shuffled.slice(38), hidden, liked: new Set(hidden.filter((id) => util.get(id)! > median)), util };
}

function fitOf(v: Viewer): Fit {
  const order = [...v.train].sort((a, b) => v.util.get(b)! - v.util.get(a)!);
  // Strengths spread like a fitted ranking: rank-based, 0 at the middle.
  const theta = new Map(order.map((id, i) => [id, 2 - (4 * i) / order.length]));
  return { theta, se: new Map(), duels: new Map(), order, iterations: 0 };
}

const variants: [string, typeof WEIGHTS][] = [
  ['no tags (before)', { ...WEIGHTS, tag: 0 }],
  ['tag 1.5 mean', { ...WEIGHTS, tag: 1.5 }],
  ['tag 4 top3', { ...WEIGHTS, tag: 4, tagTop: 3 }],
  ['tag 8 top3', { ...WEIGHTS, tag: 8, tagTop: 3 }],
  ['genre 3 tag 6 top3', { ...WEIGHTS, genre: 3, tag: 6, tagTop: 3 }],
];

const PER_MODEL = Number(process.argv[2] ?? 40);
const models: Model[] = ['genre', 'tag', 'links', 'mixed'];
const viewers = new Map(models.map((m) => [m, Array.from({ length: PER_MODEL }, () => viewer(m))]));

console.log(`${PER_MODEL} viewers per taste; numbers are hidden titles back in the top 50 (all seen / liked), per viewer`);
console.log('variant'.padEnd(22), models.map((m) => m.padStart(13)).join(''), '      all');
for (const [name, w] of variants) {
  const cells: string[] = [];
  let allSeen = 0;
  let allLiked = 0;
  for (const m of models) {
    let hitSeen = 0;
    let hitLiked = 0;
    for (const v of viewers.get(m)!) {
      const marks = new Map<string, Mark>(v.train.map((id) => [id, { itemId: id, status: 'seen', updatedAt: 0 }]));
      const top = recommend(items, fitOf(v), marks, 50, w).map((r) => r.item.id);
      const set = new Set(top);
      hitSeen += v.hidden.filter((id) => set.has(id)).length;
      hitLiked += [...v.liked].filter((id) => set.has(id)).length;
    }
    allSeen += hitSeen;
    allLiked += hitLiked;
    const n = viewers.get(m)!.length;
    cells.push(`${(hitSeen / n).toFixed(1)} / ${(hitLiked / n).toFixed(1)}`.padStart(13));
  }
  const n = PER_MODEL * models.length;
  console.log(name.padEnd(22), cells.join(''), `${(allSeen / n).toFixed(1)} / ${(allLiked / n).toFixed(1)}`.padStart(13));
}
