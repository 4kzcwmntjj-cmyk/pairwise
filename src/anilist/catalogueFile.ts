import type { Item } from '../types';

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
  return body;
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

