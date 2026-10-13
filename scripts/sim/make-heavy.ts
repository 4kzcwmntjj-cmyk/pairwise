// Builds a long made-up history for timing checks: N seen anime, M duels spread over D days, Anime view.
// Usage: npx vite-node scripts/sim/make-heavy.ts <out.json> 400 4000 60
import { readFileSync, writeFileSync } from 'node:fs';
import { toExport } from '../../src/store/store';
import { DEFAULT_SETTINGS, type Item, type Mark, type Vote } from '../../src/types';
const [out, nSeenS, nVotesS, nDaysS] = process.argv.slice(2);
const nSeen = +nSeenS, nVotes = +nVotesS, nDays = +nDaysS;
let seed = 3; const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const items: Item[] = JSON.parse(readFileSync('public/catalogue.json', 'utf8')).items;
const byPop = [...items].filter((i) => i.category === 'anime').sort((a, b) => b.popularity - a.popularity);
const ids = byPop.slice(0, nSeen).map((i) => i.id);
const util = new Map(ids.map((id) => [id, rnd() * 4]));
const marks: Mark[] = byPop.slice(0, nSeen + 60).map((it, i) => ({ itemId: it.id, status: i < nSeen ? 'seen' : 'unseen', updatedAt: Date.now() - 1e9 }));
const votes: Vote[] = [];
const start = Date.now() - nDays * 86_400_000;
for (let k = 0; k < nVotes; k++) {
  const ia = Math.floor(rnd() * nSeen); const ib = Math.min(nSeen - 1, Math.max(0, ia + Math.round((rnd() - 0.5) * 40)));
  if (ia === ib) continue;
  const a = ids[ia], b = ids[ib];
  const pa = 1 / (1 + Math.exp(util.get(b)! - util.get(a)!));
  votes.push({ id: votes.length + 1, a, b, outcome: rnd() < pa ? 'a' : 'b', mode: 'refine', at: start + Math.floor((k / nVotes) * nDays) * 86_400_000 + k * 1000 });
}
writeFileSync(out, JSON.stringify(toExport({ items, marks, votes, settings: { ...DEFAULT_SETTINGS, view: 'anime' }, meta: {} })));
console.log(votes.length, 'votes');
