// Prints where manga-only titles land in a fresh Sort queue. Usage: npx vite-node scripts/sim/manga-queue.ts
import { readFileSync } from 'node:fs';
import { isMangaOnly } from '../../src/anilist/group';
import { seenModel } from '../../src/rank/seen';
import type { Item } from '../../src/types';

const items: Item[] = JSON.parse(readFileSync('public/catalogue.json', 'utf8')).items;
const m = seenModel(items, new Map());
const q = [...items].sort((a, b) => m.probability.get(b.id)! - m.probability.get(a.id)!);
const firstManga = q.findIndex(isMangaOnly);
console.log('first manga-only at', firstManga + 1, q[firstManga].title, m.probability.get(q[firstManga].id)!.toFixed(2));
for (const n of [50, 100, 200, 500]) console.log(`manga-only in top ${n}:`, q.slice(0, n).filter(isMangaOnly).length);
console.log(q.slice(0, 12).map((i) => `${i.title}${isMangaOnly(i) ? ' [M]' : ''} ${m.probability.get(i.id)!.toFixed(2)}`).join('\n'));
