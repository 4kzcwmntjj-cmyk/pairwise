import { describe, expect, it } from 'vitest';
import type { Item } from '../types';
import { mergeCatalogue } from './catalogueFile';

const item = (id: string, entryIds: number[], extra: Partial<Item> = {}): Item => ({
  id,
  category: 'anime',
  source: 'anilist',
  title: id,
  entryIds,
  formats: entryIds.map(() => 'TV'),
  popularity: 1,
  ...extra,
});

describe('mergeCatalogue', () => {
  it('keeps the saved id when the new catalogue regroups a title', () => {
    const local = [item('al-5', [5, 6])];
    const incoming = [item('al-4', [4, 5, 6], { title: 'Show' })];
    const merged = mergeCatalogue(local, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('al-5');
    expect(merged[0].entryIds).toEqual([4, 5, 6]);
    expect(merged[0].title).toBe('Show');
  });

  it('keeps entries this device added by search', () => {
    const local = [item('al-1', [1, 99])];
    const merged = mergeCatalogue(local, [item('al-1', [1, 2])]);
    expect(merged[0].entryIds).toEqual([1, 2, 99]);
  });

  it('adds titles that are new in the catalogue', () => {
    const merged = mergeCatalogue([item('al-1', [1])], [item('al-1', [1]), item('al-7', [7])]);
    expect(merged.map((i) => i.id).sort()).toEqual(['al-1', 'al-7']);
  });
});
