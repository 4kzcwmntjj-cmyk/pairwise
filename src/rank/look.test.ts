import { describe, expect, it } from 'vitest';
import { summarise } from '../anilist/group';
import type { Entry, Item, Mark } from '../types';
import { lookOf, sideFor } from './look';

const e = (id: number, format: string, year: number, extra: Partial<Entry> = {}): Entry => ({
  id,
  format,
  year,
  popularity: 1000 - id,
  cover: `https://s4.anilist.co/file/anilistcdn/media/x/cover/medium/${id}.jpg`,
  ...extra,
});

const item = (entries: Entry[]): Item => ({ id: 'x', ...summarise(entries) }) as Item;

const deathNote = item([
  e(1, 'TV', 2006, { studio: 'MADHOUSE', averageScore: 84 }),
  e(2, 'SPECIAL', 2007, { studio: 'MADHOUSE' }),
  e(3, 'MANGA', 2003, { averageScore: 80 }),
  e(4, 'ONE_SHOT', 2021),
]);
const mark = (m: Partial<Mark>): Mark => ({ itemId: 'x', status: 'seen', updatedAt: 0, ...m });

describe('sideFor', () => {
  it('follows the view outside the both view', () => {
    expect(sideFor(deathNote, 'anime', undefined)).toBe('anime');
    expect(sideFor(deathNote, 'manga', undefined)).toBe('manga');
  });
  it('shows what you know in the both view', () => {
    expect(sideFor(deathNote, 'both', mark({ anime: false, manga: true }))).toBe('manga');
    expect(sideFor(deathNote, 'both', mark({ anime: true, manga: false }))).toBe('anime');
    expect(sideFor(deathNote, 'both', mark({ anime: true, manga: true }))).toBe('both');
    expect(sideFor(deathNote, 'both', undefined)).toBe('both');
    expect(sideFor(deathNote, 'both', mark({}))).toBe('both'); // seen, form not said
  });
  it('is the whole title when there is one form', () => {
    expect(sideFor(item([e(1, 'TV', 2006)]), 'anime', undefined)).toBe('both');
  });
});

describe('lookOf', () => {
  it('anime side: anime years, studio and contents, no manga', () => {
    const l = lookOf(deathNote, 'anime');
    expect(l.meta).toBe('2006–2007, MADHOUSE, 1 season, 1 extra');
    expect(l.short).toBe('2006–2007, MADHOUSE');
    expect(l.cover).toContain('/1.jpg');
    expect(l.url).toBe('https://anilist.co/anime/1');
    expect(l.averageScore).toBe(84);
  });
  it('manga side: manga cover, its start year, no studio', () => {
    const l = lookOf(deathNote, 'manga');
    expect(l.meta).toBe('2003, manga, 1 one-shot');
    expect(l.short).toBe('2003, manga');
    expect(l.cover).toContain('/3.jpg');
    expect(l.coverLarge).toContain('/cover/large/3.jpg');
    expect(l.studio).toBeUndefined();
    expect(l.url).toBe('https://anilist.co/manga/3');
    expect(l.averageScore).toBe(80);
  });
  it('both side mentions the manga', () => {
    expect(lookOf(deathNote, 'both').meta).toBe('2006–2007, MADHOUSE, 1 season, 1 extra · manga from 2003');
  });
  it('a manga-only title', () => {
    const l = lookOf(item([e(9, 'MANGA', 2004)]), 'both');
    expect(l.meta).toBe('2004, manga');
    expect(l.url).toBe('https://anilist.co/manga/9');
  });
});
