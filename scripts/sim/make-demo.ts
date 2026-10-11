// Builds a demo export file: a made-up viewer with a taste for some genres, duelling over ten days.
// Usage: npx vite-node scripts/sim/make-demo.ts <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { nextPair, pairKey } from '../../src/rank/pairs';
import { fit } from '../../src/rank/solver';
import { toExport } from '../../src/store/store';
import { DEFAULT_SETTINGS, type Item, type Mark, type Vote } from '../../src/types';

let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const out = process.argv[2] ?? 'demo.json';
const items: Item[] = JSON.parse(readFileSync('public/catalogue.json', 'utf8')).items;
const byPop = [...items].sort((a, b) => b.popularity - a.popularity);

const loved = new Set(['Drama', 'Psychological', 'Sci-Fi', 'Thriller']);
const util = new Map<string, number>();
for (const it of byPop.slice(0, 120)) {
  const g = (it.genres ?? []).filter((x) => loved.has(x)).length;
  util.set(it.id, g * 0.9 + ((it.averageScore ?? 70) - 70) / 25 + (rnd() - 0.5) * 1.6);
}
const marks: Mark[] = byPop.slice(0, 150).map((it, i) => ({ itemId: it.id, status: i < 120 ? 'seen' : 'unseen', updatedAt: Date.now() }));
const ids = byPop.slice(0, 120).map((i) => i.id);

const votes: Vote[] = [];
const start = Date.now() - 12 * 86_400_000;
const days = [0, 1, 2, 4, 5, 8, 9, 11];
for (let d = 0; d < days.length; d++) {
  for (let k = 0; k < 75; k++) {
    const f = fit({ ids, anchors: {}, votes });
    const p = nextPair({ fit: f, recent: votes, skipped: new Set(), random: rnd });
    if (!p) break;
    const diff = util.get(p.a)! - util.get(p.b)!;
    const pa = 1 / (1 + Math.exp(-diff * 1.4));
    const r = rnd();
    const outcome = Math.abs(diff) < 0.12 && r < 0.3 ? 'tie' : r < pa ? 'a' : 'b';
    votes.push({ id: votes.length + 1, a: p.a, b: p.b, outcome, mode: p.mode, at: start + days[d] * 86_400_000 + k * 20_000 });
  }
}
void pairKey;
writeFileSync(out, JSON.stringify(toExport({ items, marks, votes, settings: DEFAULT_SETTINGS, meta: {} })));
console.log('votes', votes.length);
