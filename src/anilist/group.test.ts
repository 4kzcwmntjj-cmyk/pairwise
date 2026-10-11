import { describe, expect, it } from 'vitest';
import { addEntry, describeFormats, franchiseFor, groupFranchises, type RawMedia } from './group';

function media(id: number, title: string, opts: Partial<RawMedia> & { year?: number; rel?: [string, number][] } = {}): RawMedia {
  return {
    id,
    title: { english: title, romaji: title },
    format: opts.format ?? 'TV',
    seasonYear: opts.year ?? 2010,
    startDate: { year: opts.year ?? 2010 },
    popularity: opts.popularity ?? 1000,
    averageScore: 80,
    coverImage: { large: `https://img/${id}.jpg`, color: '#123456' },
    studios: { nodes: [{ name: 'Studio' }] },
    relations: { edges: (opts.rel ?? []).map(([relationType, node]) => ({ relationType, node: { id: node, type: 'ANIME' } })) },
  };
}

describe('groupFranchises', () => {
  it('joins seasons, films and side stories into one franchise led by the first series', () => {
    const items = groupFranchises([
      media(2, 'Show S2', { year: 2015, popularity: 900, rel: [['PREQUEL', 1]] }),
      media(1, 'Show', { year: 2013, popularity: 2000, rel: [['SEQUEL', 2]] }),
      media(3, 'Show: The Movie', { format: 'MOVIE', year: 2016, rel: [['PARENT', 1]] }),
      media(9, 'Other Show', { year: 2012 }),
    ]);
    expect(items).toHaveLength(2);
    const show = items.find((i) => i.entryIds.includes(1))!;
    expect(show.entryIds).toEqual([1, 2, 3]);
    expect(show.title).toBe('Show');
    expect(show.startYear).toBe(2013);
    expect(show.endYear).toBe(2016);
    expect(show.popularity).toBe(2000);
    expect(describeFormats(show.formats)).toBe('2 seasons, 1 film');
  });

  it('bridges a missing middle season but not a missing spin-off', () => {
    const items = groupFranchises([
      media(1, 'A', { rel: [['SEQUEL', 2]] }),
      media(3, 'A S3', { rel: [['PREQUEL', 2]] }),
      media(10, 'B', { rel: [['SPIN_OFF', 11]] }),
      media(12, 'C', { rel: [['SPIN_OFF', 11]] }),
    ]);
    expect(items.find((i) => i.entryIds.includes(1))!.entryIds).toEqual([1, 3]);
    expect(items.find((i) => i.entryIds.includes(10))!.entryIds).toEqual([10]);
  });

  it('keeps an existing franchise id when the catalogue is refreshed', () => {
    const first = groupFranchises([media(5, 'X', { rel: [['SEQUEL', 6]] }), media(6, 'X2', { rel: [['PREQUEL', 5]] })]);
    const id = first[0].id;
    const second = groupFranchises([media(4, 'X0', { rel: [['SEQUEL', 5]] }), media(5, 'X', { rel: [['PREQUEL', 4]] })], first);
    expect(second[0].id).toBe(id);
  });
});

describe('franchiseFor and addEntry', () => {
  it('attaches a searched entry to the franchise it belongs to', () => {
    const items = groupFranchises([media(1, 'Show')]);
    const found = media(50, 'Show OVA', { format: 'OVA', year: 2020, rel: [['PARENT', 1]] });
    const owner = franchiseFor(found, items)!;
    expect(owner.id).toBe(items[0].id);
    const updated = addEntry(owner, found);
    expect(updated.entryIds).toEqual([1, 50]);
    expect(updated.endYear).toBe(2020);
  });
});
