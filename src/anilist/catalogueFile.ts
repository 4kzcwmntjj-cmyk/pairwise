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
  const used = new Set<string>();
  const out: Item[] = [];
  const finalId = new Map<string, string>();
  for (const inc of incoming) {
    const owner = inc.entryIds.map((e) => ownerOfEntry.get(e)).find((o) => o && !used.has(o.id));
    const id = owner?.id ?? inc.id;
    if (used.has(id) || (!owner && localById.has(id) && localById.get(id)!.source === 'manual')) continue;
    used.add(id);
    finalId.set(inc.id, id);
    const extraEntries = owner ? owner.entryIds.filter((e) => !inc.entryIds.includes(e)) : [];
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

