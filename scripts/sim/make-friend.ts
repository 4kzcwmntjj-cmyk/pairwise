// Builds a friend's list link for testing Compare: a made-up friend whose taste overlaps the demo list in part.
// Usage: npx vite-node scripts/sim/make-friend.ts [name]   (prints the fragment, without '#')
import { readFileSync } from 'node:fs';
import { encodeList, entryOf } from '../../src/rank/listLink';
import type { Item } from '../../src/types';

let seed = 11;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const items: Item[] = JSON.parse(readFileSync('public/catalogue.json', 'utf8')).items;
const byPop = [...items].sort((a, b) => b.popularity - a.popularity);
// Overlaps the demo's 120 seen titles on about 80, and adds titles the demo hasn't seen.
const pool = [...byPop.slice(0, 80), ...byPop.slice(125, 220)];
const loved = new Set(['Drama', 'Psychological', 'Romance', 'Slice of Life']);
const util = new Map(pool.map((it) => [it.id, (it.genres ?? []).filter((g) => loved.has(g)).length * 0.8 + ((it.averageScore ?? 70) - 70) / 20 + (rnd() - 0.5) * 2]));
const order = [...pool].sort((a, b) => util.get(b.id)! - util.get(a.id)!);
const entries = order.map((i) => entryOf(i)!).filter((e) => e !== undefined);
console.log(encodeList({ name: process.argv[2] || undefined, made: '2026-10-12', entries }));
