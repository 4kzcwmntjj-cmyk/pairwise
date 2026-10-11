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

describe('recommendation links', () => {
  it('sums AniList recommendations up to franchise level and drops self-links', () => {
    const rec = (id: number, rating: number) => ({ rating, mediaRecommendation: { id, type: 'ANIME' } });
    const items = groupFranchises([
      { ...media(1, 'A', { rel: [['SEQUEL', 2]] }), recommendations: { nodes: [rec(10, 30), rec(2, 99)] } },
      { ...media(2, 'A2', { rel: [['PREQUEL', 1]] }), recommendations: { nodes: [rec(10, 5), rec(20, 7), rec(999, 50)] } },
      media(10, 'B'),
      media(20, 'C'),
    ]);
    const a = items.find((i) => i.entryIds.includes(1))!;
    const b = items.find((i) => i.entryIds.includes(10))!;
    const c = items.find((i) => i.entryIds.includes(20))!;
    expect(a.recs).toEqual([
      [b.id, 35],
      [c.id, 7],
    ]);
    expect(b.recs).toBeUndefined();
  });
});

describe('manga in franchises', () => {
  const rel = (pairs: [string, number, 'ANIME' | 'MANGA'][]) => ({
    edges: pairs.map(([relationType, id, type]) => ({ relationType, node: { id, type } })),
  });
  const manga = (id: number, title: string, rels: [string, number, 'ANIME' | 'MANGA'][] = [], popularity = 500): RawMedia => ({
    ...media(id, title, { format: 'MANGA', popularity, year: 2005 }),
    relations: rel(rels),
  });
  const anime = (id: number, title: string, rels: [string, number, 'ANIME' | 'MANGA'][] = [], popularity = 1000): RawMedia => ({
    ...media(id, title, { popularity, year: 2008 }),
    relations: rel(rels),
  });

  it('attaches a manga to the anime made from it and keeps the anime as the name', () => {
    const items = groupFranchises([anime(1, 'Death Note', [['SOURCE', 100, 'MANGA']]), manga(100, 'Death Note (manga)', [['ADAPTATION', 1, 'ANIME']])]);
    expect(items).toHaveLength(1);
    expect(items[0].entryIds).toEqual([1, 100]);
    expect(items[0].title).toBe('Death Note');
    expect(describeFormats(items[0].formats)).toBe('1 season, manga');
  });

  it('makes a manga with no anime its own title, grouped with its sequels', () => {
    const items = groupFranchises([manga(200, 'Bokurano'), manga(201, 'Bokurano 2', [['PREQUEL', 200, 'MANGA']]), anime(1, 'Other')]);
    const b = items.find((i) => i.entryIds.includes(200))!;
    expect(b.entryIds).toEqual([200, 201]);
    expect(b.title).toBe('Bokurano');
    expect(describeFormats(b.formats)).toBe('manga');
  });

  it('never joins two anime franchises through a manga adapted twice', () => {
    const items = groupFranchises([
      anime(1, 'FMA 2003', [['SOURCE', 300, 'MANGA']], 2000),
      anime(2, 'FMA Brotherhood', [['SOURCE', 300, 'MANGA']], 5000),
      manga(300, 'FMA (manga)', [['ADAPTATION', 1, 'ANIME'], ['ADAPTATION', 2, 'ANIME']]),
    ]);
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.entryIds.includes(2))!.entryIds).toEqual([2, 300]);
    expect(items.find((i) => i.entryIds.includes(1))!.entryIds).toEqual([1]);
  });

  it('does not let a manga sequel link join anime to anime', () => {
    const items = groupFranchises([
      anime(1, 'Show A', [['SEQUEL', 2, 'ANIME']]),
      anime(5, 'Show B'),
      manga(400, 'B manga', [['ADAPTATION', 5, 'ANIME'], ['PREQUEL', 1, 'ANIME']]),
    ]);
    expect(items.find((i) => i.entryIds.includes(1))!.entryIds).toEqual([1]);
    expect(items.find((i) => i.entryIds.includes(5))!.entryIds).toEqual([5, 400]);
  });

  it('finds the franchise for a manga found by search', () => {
    const items = groupFranchises([anime(1, 'Death Note')]);
    expect(franchiseFor(manga(100, 'DN manga', [['ADAPTATION', 1, 'ANIME']]), items)?.entryIds).toEqual([1]);
  });
});
