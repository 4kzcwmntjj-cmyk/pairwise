import type { Item } from '../types';
import { franchiseTags } from './group';

export const CATALOGUE_FORMAT = 'pairwise-catalogue';

/** The prebuilt catalogue shipped with the site as catalogue.json. */
export interface CatalogueFile {
  format: typeof CATALOGUE_FORMAT;
  version: 1;
  generatedAt: string;
  source: string;
  entries: number;
  items: Item[];
}

export async function loadCatalogueFile(): Promise<CatalogueFile> {
  let res: Response;
  try {
    res = await fetch('./catalogue.json', { cache: 'no-cache' });
  } catch {
    throw new Error('Could not load the title list. Check your connection and try again.');
  }
  if (res.status === 404) throw new Error('The title list is still being built. Try again in a few minutes.');
  const body = (await res.json().catch(() => null)) as CatalogueFile | null;
  if (!res.ok || body?.format !== CATALOGUE_FORMAT || !Array.isArray(body.items)) {
    throw new Error('The title list could not be read. Try again later.');
  }
  withTags(body.items);
  return body;
}

/**
 * When the deployed catalogue was built, from the small file written beside it at build time. Null when this
 * site has no such file (the dev server), so the caller loads the catalogue itself; throws when offline.
 */
export async function loadCatalogueVersion(): Promise<string | null> {
  const res = await fetch('./catalogue-version.json', { cache: 'no-cache' });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { generatedAt?: unknown } | null;
  return typeof body?.generatedAt === 'string' ? body.generatedAt : null;
}

/** Fills in each title's tags from its entries; the file leaves them out to save space. */
export function withTags(items: Item[]): Item[] {
  for (const item of items) {
    if (item.tags || !item.entries) continue;
    const tags = franchiseTags(item.entries);
    if (tags.length) item.tags = tags;
  }
  return items;
}

/**
 * Merges a newer catalogue into the titles already saved on this device.
 * Returns the items to write. Titles are matched by AniList entry, so a
 * saved title keeps its id (and its marks and votes) even if the catalogue
 * regrouped it; entries added by search stay in their franchise.
 */
export function mergeCatalogue(local: Item[], incoming: Item[]): Item[] {
  const localById = new Map(local.map((i) => [i.id, i]));
  const ownerOfEntry = new Map<number, Item>();
  for (const item of local) for (const e of item.entryIds) ownerOfEntry.set(e, item);
  const inCatalogue = new Set(incoming.flatMap((i) => i.entryIds));
  const used = new Set<string>();
  const out: Item[] = [];
  const finalId = new Map<string, string>();
  // When the catalogue cuts a saved title in two, the part that kept the catalogue id keeps the saved
  // title too, so titles that keep their id are placed first.
  const owners = (inc: Item) => inc.entryIds.map((e) => ownerOfEntry.get(e)).filter((o): o is Item => !!o);
  const keepsId = (inc: Item) => owners(inc).some((o) => o.id === inc.id);
  const order = [...incoming.filter(keepsId), ...incoming.filter((i) => !keepsId(i))];
  for (const inc of order) {
    const candidates = owners(inc).filter((o) => !used.has(o.id));
    const owner = candidates.find((o) => o.id === inc.id) ?? candidates[0];
    const id = owner?.id ?? inc.id;
    if (used.has(id) || (!owner && localById.has(id) && localById.get(id)!.source === 'manual')) continue;
    used.add(id);
    finalId.set(inc.id, id);
    // Entries this device added by search, which the catalogue doesn't have anywhere.
    const extraEntries = owner ? owner.entryIds.filter((e) => !inCatalogue.has(e)) : [];
    const extraData = (owner?.entries ?? []).filter((e) => extraEntries.includes(e.id));
    out.push({
      ...inc,
      id,
      entryIds: [...inc.entryIds, ...extraEntries].sort((a, b) => a - b),
      ...(inc.entries ? { entries: [...inc.entries, ...extraData] } : {}),
    });
  }
  // Recommendation links point at catalogue ids; follow any that were renamed above.
  for (const item of out) {
    if (item.recs) item.recs = item.recs.map(([target, w]) => [finalId.get(target) ?? target, w]);
  }
  return out;
}

