/**
 * Fetches the most popular anime and manga from AniList, groups them into franchises
 * and writes public/catalogue.json. Runs on GitHub Actions (see
 * .github/workflows/catalogue.yml) so phones never have to download the
 * catalogue from AniList themselves.
 *
 * Run locally with: npx vite-node scripts/build-catalogue.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { CATALOGUE_SIZE, MANGA_SIZE, fetchCatalogue, type Medium } from '../src/anilist/catalogue';
import { configureClient } from '../src/anilist/client';
import { groupFranchises } from '../src/anilist/group';
import { CATALOGUE_FORMAT, type CatalogueFile } from '../src/anilist/catalogueFile';
import type { Item } from '../src/types';

const OUT = 'public/catalogue.json';

async function main() {
  configureClient({ minIntervalMs: 3000, attempts: 12 });
  let previous: Item[] = [];
  if (existsSync(OUT)) {
    previous = (JSON.parse(readFileSync(OUT, 'utf8')) as CatalogueFile).items;
  }
  const started = Date.now();
  const fetchAll = async (medium: Medium, total: number) => {
    let lastLog = 0;
    const media = await fetchCatalogue(
      (p) => {
        if (p.waitingSeconds) console.log(`AniList rate limit: waiting ${p.waitingSeconds}s`);
        if (p.loaded - lastLog >= 200 || p.loaded === p.total) {
          lastLog = p.loaded;
          console.log(`${medium}: ${p.loaded}/${p.total} after ${Math.round((Date.now() - started) / 1000)}s`);
        }
      },
      total,
      medium,
    );
    if (media.length < total * 0.9) {
      throw new Error(`Only ${media.length} ${medium.toLowerCase()} entries came back; keeping the previous catalogue.`);
    }
    return media;
  };
  const anime = await fetchAll('ANIME', CATALOGUE_SIZE);
  const manga = await fetchAll('MANGA', MANGA_SIZE);
  const media = [...anime, ...manga];
  // The raw AniList answers, kept as a workflow artifact (not committed) so grouping can be checked offline.
  writeFileSync('raw-media.json.gz', gzipSync(JSON.stringify(media)));
  // Keep the ids of franchises from the previous file so saved marks and votes still match.
  const items = groupFranchises(media, previous);
  const file: CatalogueFile = {
    format: CATALOGUE_FORMAT,
    version: 1,
    generatedAt: new Date().toISOString(),
    source: 'AniList (https://anilist.co)',
    entries: media.length,
    items,
  };
  writeFileSync(OUT, JSON.stringify(file));
  console.log(`Wrote ${items.length} franchises from ${media.length} entries to ${OUT}`);
  if (process.env.GITHUB_ACTIONS) {
    console.log(`::notice title=Catalogue built::${items.length} franchises from ${media.length} entries in ${Math.round((Date.now() - started) / 1000)}s`);
  }
}

main().catch((e) => {
  console.error(e);
  // Annotations show on the workflow run page and through the API.
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=Catalogue build failed::${String((e as Error)?.message ?? e)}`);
  process.exit(1);
});
