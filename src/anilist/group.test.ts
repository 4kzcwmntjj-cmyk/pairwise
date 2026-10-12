import { describe, expect, it } from 'vitest';
import { addEntry, describeFormats, franchiseFor, groupFranchises, storylinesOf, tagsOf, type BridgeCut, type RawMedia } from './group';

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

describe('cutting extras that link two series', () => {
  it('cuts a crossover special that is the only link between two series', () => {
    const cuts: BridgeCut[] = [];
    const items = groupFranchises(
      [
        media(1, 'Bakemonogatari', { popularity: 3000, rel: [['SEQUEL', 2]] }),
        media(2, 'Nisemonogatari', { popularity: 2000, rel: [['PREQUEL', 1]] }),
        media(10, 'Nisekoi', { popularity: 2500, rel: [['SEQUEL', 11]] }),
        media(11, 'Nisekoi:', { popularity: 1500, rel: [['PREQUEL', 10]] }),
        media(20, 'Nisekoimonogatari', { format: 'SPECIAL', popularity: 100, rel: [['PARENT', 1], ['PARENT', 10]] }),
      ],
      [],
      (c) => cuts.push(c),
    );
    expect(items.map((i) => i.entryIds).sort()).toEqual([[1, 2, 20], [10, 11]]);
    expect(cuts).toHaveLength(1);
    expect(cuts[0].extra.map((m) => m.id)).toEqual([20]);
  });

  it('keeps an OVA that sits between two seasons', () => {
    const items = groupFranchises([
      media(1, 'Show', { rel: [['SEQUEL', 2]] }),
      media(2, 'Show OVA', { format: 'OVA', rel: [['PREQUEL', 1], ['SEQUEL', 3]] }),
      media(3, 'Show S2', { rel: [['PREQUEL', 2]] }),
    ]);
    expect(items).toHaveLength(1);
  });

  it('cuts a lone crossover film, but keeps extras that hang off one series', () => {
    const items = groupFranchises([
      media(1, 'Lupin', { popularity: 500, rel: [['SIDE_STORY', 3]] }),
      media(2, 'Conan', { popularity: 900, rel: [['SIDE_STORY', 3]] }),
      media(3, 'Lupin vs Conan', { format: 'MOVIE', rel: [['PARENT', 1], ['PARENT', 2]] }),
      media(4, 'Lupin special', { format: 'SPECIAL', popularity: 10, rel: [['PARENT', 1]] }),
    ]);
    expect(items.map((i) => i.entryIds).sort()).toEqual([[1, 4], [2, 3]]);
  });

  it('keeps a series and a film chain together when the films continue the series', () => {
    const items = groupFranchises([
      media(30, 'Evangelion', { rel: [['SEQUEL', 32]] }),
      media(32, 'End of Evangelion', { format: 'MOVIE', rel: [['PREQUEL', 30], ['SEQUEL', 2759]] }),
      media(2759, 'Rebuild 1.0', { format: 'MOVIE', rel: [['PREQUEL', 32], ['SEQUEL', 3784]] }),
      media(3784, 'Rebuild 2.0', { format: 'MOVIE', rel: [['PREQUEL', 2759]] }),
      media(4130, 'Petit Eva', { format: 'ONA', rel: [['PARENT', 30]] }),
    ]);
    expect(items).toHaveLength(1);
  });

  it('counts a short web series as an extra but a full one as a series', () => {
    const shortOna = media(5, 'Petit', { format: 'ONA', rel: [['PARENT', 1], ['PARENT', 2]] });
    shortOna.duration = 3;
    const films = [media(2, 'Film 1', { format: 'MOVIE', rel: [['SEQUEL', 3]] }), media(3, 'Film 2', { format: 'MOVIE', rel: [['PREQUEL', 2]] })];
    const two = groupFranchises([media(1, 'TV', { popularity: 5000 }), ...films, shortOna]);
    expect(two.map((i) => i.entryIds).sort()).toEqual([[1, 5], [2, 3]]);
    const fullOna = { ...shortOna, duration: 24 };
    expect(groupFranchises([media(1, 'TV', { popularity: 5000 }), ...films, fullOna])).toHaveLength(1);
    // A single film linked only through the short stays: it is most likely a side story.
    expect(groupFranchises([media(1, 'TV', { popularity: 5000 }), films[0], shortOna])).toHaveLength(1);
  });

  it('lets the part the old title was named after keep its id, even if less popular', () => {
    const all = [
      media(1, 'Lupin', { year: 1971, popularity: 10 }),
      media(2, 'Conan', { year: 1996, popularity: 9000 }),
      media(3, 'Crossover', { format: 'SPECIAL', rel: [['PARENT', 1], ['PARENT', 2]] }),
    ];
    const before = [{ ...groupFranchises([media(1, 'Lupin', { year: 1971 }), media(2, 'Conan', { year: 1996, rel: [['SIDE_STORY', 1]] })])[0], id: 'al-x' }];
    expect(before[0].title).toBe('Lupin');
    const after = groupFranchises(all, before);
    expect(after.find((i) => i.entryIds.includes(1))!.id).toBe('al-x');
    expect(after.find((i) => i.entryIds.includes(2))!.id).not.toBe('al-x');
  });
});

describe('storylines', () => {
  const rel = (pairs: [string, number, 'ANIME' | 'MANGA'][]) => ({
    edges: pairs.map(([relationType, id, type]) => ({ relationType, node: { id, type } })),
  });
  it('records storylines, with side stories and manga attached', () => {
    const items = groupFranchises([
      { ...media(1, 'Fate/stay night', { year: 2006, popularity: 3000 }), relations: rel([['SIDE_STORY', 5, 'ANIME'], ['SOURCE', 100, 'MANGA']]) },
      { ...media(2, 'Fate/Zero', { year: 2011, popularity: 5000 }), relations: rel([['SEQUEL', 3, 'ANIME'], ['SEQUEL', 1, 'ANIME'], ['SOURCE', 101, 'MANGA']]) },
      { ...media(3, 'Fate/Zero 2', { year: 2012 }), relations: rel([['PREQUEL', 2, 'ANIME']]) },
      { ...media(5, 'Prisma Illya', { year: 2013, popularity: 2000 }), relations: rel([['PARENT', 1, 'ANIME'], ['SEQUEL', 6, 'ANIME']]) },
      { ...media(6, 'Prisma Illya 2wei', { year: 2014 }), relations: rel([['PREQUEL', 5, 'ANIME'], ['SIDE_STORY', 7, 'ANIME']]) },
      { ...media(7, 'Prisma Illya OVA', { format: 'OVA', year: 2015 }), relations: rel([['PARENT', 6, 'ANIME']]) },
      { ...media(100, 'Fate/stay night manga', { format: 'MANGA' }), relations: rel([['ADAPTATION', 1, 'ANIME']]) },
      { ...media(101, 'Fate/Zero manga', { format: 'MANGA' }), relations: rel([['ADAPTATION', 2, 'ANIME'], ['SEQUEL', 102, 'MANGA']]) },
      { ...media(102, 'Fate/Zero manga 2', { format: 'MANGA' }), relations: rel([['PREQUEL', 101, 'MANGA']]) },
    ]);
    expect(items).toHaveLength(1);
    const lines = storylinesOf(items[0].entries);
    // Zero is a prequel of stay night, so they are one storyline; Prisma Illya is a side story with series of its own.
    expect(lines.map((l) => [l.lead.titleEnglish, l.anime, l.manga])).toEqual([
      ['Fate/stay night', 3, 3],
      ['Prisma Illya', 3, 0],
    ]);
  });

  it('records nothing for a franchise with one storyline', () => {
    const items = groupFranchises([
      media(1, 'Jujutsu Kaisen', { rel: [['SEQUEL', 2], ['SIDE_STORY', 3]] }),
      media(2, 'Jujutsu Kaisen 2', { rel: [['PREQUEL', 1]] }),
      media(3, 'Jujutsu Kaisen 0', { format: 'MOVIE', rel: [['PARENT', 1]] }),
    ]);
    expect(items[0].entries!.some((e) => e.story !== undefined)).toBe(false);
    expect(storylinesOf(items[0].entries)).toEqual([]);
  });
});

describe('tags', () => {
  const tag = (name: string, rank: number, more: Partial<NonNullable<RawMedia['tags']>[number]> = {}) => ({
    name,
    rank,
    category: 'Theme-Other',
    isGeneralSpoiler: false,
    isMediaSpoiler: false,
    isAdult: false,
    ...more,
  });

  it('keeps strong, spoiler-free, non-adult tags, strongest first, at most six', () => {
    const m = {
      tags: [
        tag('Weak', 40),
        tag('Time Skip', 70),
        tag('Revenge', 93),
        tag('Twist', 90, { isMediaSpoiler: true }),
        tag('Other twist', 90, { isGeneralSpoiler: true }),
        tag('CGI', 95, { category: 'Technical' }),
        tag('Adult', 95, { isAdult: true }),
        tag('Nudity', 95),
        tag('A', 61),
        tag('B', 62),
        tag('C', 63),
        tag('D', 64),
        tag('E', 65),
      ],
    };
    expect(tagsOf(m)).toEqual(['Revenge', 'Time Skip', 'E', 'D', 'C', 'B']);
  });

  it('puts franchise tags in the order of the entries that carry them, weighted by popularity', () => {
    const items = groupFranchises([
      { ...media(1, 'Show', { popularity: 10000, rel: [['SEQUEL', 2]] }), tags: [tag('Tragedy', 90), tag('War', 80)] },
      { ...media(2, 'Show S2', { popularity: 8100, year: 2012, rel: [['PREQUEL', 1]] }), tags: [tag('War', 90), tag('Time Skip', 85)] },
      { ...media(3, 'Show OVA', { format: 'OVA', popularity: 100, rel: [['PARENT', 1]] }), tags: [tag('Beach', 90)] },
    ]);
    const show = items[0];
    expect(show.entries!.find((e) => e.id === 1)!.tags).toEqual(['Tragedy', 'War']);
    // War is on both seasons; Tragedy and Time Skip on one each; Beach is on a small OVA only.
    expect(show.tags).toEqual(['War', 'Tragedy', 'Time Skip']);
  });
});
