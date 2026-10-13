/**
 * Compares Quick log orders on the real catalogue with simulated viewers.
 * Run with: npx vite-node scripts/sim/sort-sim.ts
 *
 * A simulated viewer's seen set comes from taste clusters: a few favourite
 * shows, spreading along AniList recommendation links, plus a popularity
 * effect. The viewer answers Quick log prompts truthfully; we count how many of
 * their seen titles each order finds within a number of prompts.
 */
import { readFileSync } from 'node:fs';
import { seenModel } from '../../src/rank/seen';
import type { Item, Mark } from '../../src/types';

const items: Item[] = JSON.parse(readFileSync('public/catalogue.json', 'utf8')).items;
const byId = new Map(items.map((i) => [i.id, i]));

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function viewer(seed: number, popularityBias: number, seedFrom = 0, seedTo = 300): Set<string> {
  const r = rng(seed);
  const seen = new Set<string>();
  const top = items.slice(seedFrom, seedTo);
  // Popular titles: chance grows with popularity rank.
  items.forEach((it, rank) => {
    if (r() < popularityBias * Math.exp(-rank / 250)) seen.add(it.id);
  });
  // Taste clusters: walk recommendation links from a few favourites.
  for (let c = 0; c < 4; c++) {
    let cur = top[Math.floor(r() * top.length)].id;
    for (let step = 0; step < 35; step++) {
      seen.add(cur);
      const recs = byId.get(cur)?.recs ?? [];
      if (!recs.length) break;
      cur = recs[Math.floor(r() * Math.min(6, recs.length))][0];
    }
  }
  return seen;
}

function run(truth: Set<string>, order: 'popularity' | 'model', prompts: number) {
  const marks = new Map<string, Mark>();
  let found = 0;
  let model = seenModel(items, marks);
  const byPop = [...items].sort((a, b) => b.popularity - a.popularity);
  for (let k = 0; k < prompts; k++) {
    let next: Item | undefined;
    if (order === 'popularity') next = byPop.find((i) => !marks.has(i.id));
    else {
      if (k % 10 === 0) model = seenModel(items, marks);
      let best = -1;
      for (const [id, p] of model.probability) if (!marks.has(id) && p > best) ((best = p), (next = byId.get(id)));
    }
    if (!next) break;
    const status = truth.has(next.id) ? 'seen' : 'unseen';
    if (status === 'seen') found++;
    marks.set(next.id, { itemId: next.id, status, updatedAt: 0 });
  }
  return { found, expectedLeft: Math.round(seenModel(items, marks).expectedRemaining) };
}

for (const [seed, bias, from, to, label] of [
  [1, 0.9, 0, 300, 'mainstream'],
  [2, 0.6, 0, 300, 'mainstream'],
  [3, 0.3, 0, 300, 'mainstream'],
  [4, 0.4, 300, 1500, 'niche'],
  [5, 0.2, 300, 2000, 'niche'],
  [6, 0.1, 500, 2500, 'deep niche'],
] as const) {
  const truth = viewer(seed, bias, from, to);
  const line = [`viewer ${seed} (${label}): has seen ${truth.size}`];
  for (const prompts of [150, 300, 600]) {
    const pop = run(truth, 'popularity', prompts);
    const mod = run(truth, 'model', prompts);
    line.push(`after ${prompts} prompts: popularity finds ${pop.found}, model finds ${mod.found} (model thinks ~${mod.expectedLeft} left, truly ${truth.size - mod.found})`);
  }
  console.log(line.join('\n  '));
}
