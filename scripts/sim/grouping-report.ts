/**
 * Regroups the raw AniList data offline and reports what the grouping does: which extras were cut out
 * as the only link between two series, and which titles have two or more storylines.
 *
 * Get the data from the latest catalogue run first:
 *   gh run download -R 4kzcwmntjj-cmyk/shobu -n raw-media -D /tmp/raw
 * Then: npx vite-node scripts/sim/grouping-report.ts /tmp/raw/raw-media.json.gz [title filter…]
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { groupFranchises, storylinesOf, type BridgeCut, type RawMedia } from '../../src/anilist/group';
import type { Item } from '../../src/types';

const [path, ...filters] = process.argv.slice(2);
if (!path) throw new Error('Give the path to raw-media.json.gz');
const media = JSON.parse(gunzipSync(readFileSync(path)).toString()) as RawMedia[];
const previous = (JSON.parse(readFileSync('public/catalogue.json', 'utf8')) as { items: Item[] }).items;

const name = (m: { title: { english: string | null; romaji: string | null } }) => m.title.english ?? m.title.romaji;
const cuts: BridgeCut[] = [];
const items = groupFranchises(media, previous, (c) => cuts.push(c));

const lead = (part: RawMedia[]) => [...part].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))[0];
console.log(`${items.length} titles (was ${previous.length}); ${cuts.length} extras cut out\n`);
console.log('Cuts, most popular first:');
for (const c of [...cuts].sort((a, b) => (lead(b.parts.flat())?.popularity ?? 0) - (lead(a.parts.flat())?.popularity ?? 0))) {
  const extra = c.extra.map((m) => `${name(m)} [${m.format}]`).join(' + ');
  console.log(`  ${extra}\n      ${c.parts.map((p) => `${name(lead(p))} (${p.length})`).join('  |  ')}`);
}

const multi = items.filter((i) => storylinesOf(i.entries).length >= 2);
console.log(`\n${multi.length} titles with 2+ storylines. Top 40 by popularity:`);
for (const i of multi.slice(0, 40)) {
  const lines = storylinesOf(i.entries);
  console.log(`  ${i.title} (${i.entryIds.length}): ${lines.map((l) => `${l.lead.titleEnglish ?? l.lead.titleRomaji} [${l.anime}a ${l.manga}m]`).join('; ')}`);
}

for (const f of filters) {
  console.log(`\n== ${f}`);
  for (const i of items.filter((x) => [x.title, x.titleRomaji].some((t) => t?.toLowerCase().includes(f.toLowerCase())))) {
    console.log(`${i.id} ${i.title}: ${i.entryIds.length} entries`);
    for (const e of [...(i.entries ?? [])].sort((a, b) => (a.story ?? 0) - (b.story ?? 0) || (a.year ?? 0) - (b.year ?? 0))) {
      console.log(`   story ${e.story ?? '-'}  ${e.format.padEnd(8)} ${e.year ?? '    '}  ${e.titleEnglish ?? e.titleRomaji}`);
    }
  }
}
