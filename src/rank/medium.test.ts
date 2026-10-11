import { describe, expect, it } from 'vitest';
import type { Item, Mark } from '../types';
import { applyAnswer, choicesFor, chosen, clearIn, formUnknown, inView, knownIn, project } from './medium';

const anime: Pick<Item, 'id' | 'formats'> = { id: 'a', formats: ['TV', 'MOVIE'] };
const manga: Pick<Item, 'id' | 'formats'> = { id: 'm', formats: ['MANGA'] };
const mixed: Pick<Item, 'id' | 'formats'> = { id: 'x', formats: ['TV', 'MANGA'] };
const mark = (status: Mark['status'], extra: Partial<Mark> = {}): Mark => ({ itemId: 'x', status, updatedAt: 1, ...extra });

describe('views', () => {
  it('puts titles in the views they exist in', () => {
    expect(inView(anime, 'manga')).toBe(false);
    expect(inView(manga, 'anime')).toBe(false);
    expect(inView(mixed, 'anime')).toBe(true);
    expect(inView(mixed, 'manga')).toBe(true);
    expect(inView(manga, 'both')).toBe(true);
  });

  it('shows a title read but not watched as seen in the manga view only', () => {
    const m = applyAnswer(mixed, undefined, { anime: false, manga: true }, 2);
    expect(m.status).toBe('seen');
    expect(project(mixed, m, 'manga')?.status).toBe('seen');
    expect(project(mixed, m, 'anime')?.status).toBe('unseen');
    expect(project(mixed, m, 'both')?.status).toBe('seen');
  });

  it('leaves a title unsorted in a view whose form was not asked', () => {
    const m = applyAnswer(mixed, undefined, { anime: true }, 2);
    expect(project(mixed, m, 'anime')?.status).toBe('seen');
    expect(project(mixed, m, 'manga')).toBeUndefined();
    const not = applyAnswer(mixed, undefined, { anime: false }, 2);
    expect(not.status).toBe('unseen');
    expect(project(mixed, not, 'both')).toBeUndefined();
  });

  it('treats a mark from before forms were recorded as covering both', () => {
    const old = mark('seen');
    expect(formUnknown(mixed, old)).toBe(true);
    expect(knownIn(mixed, old, 'anime')).toBe(true);
    expect(knownIn(mixed, old, 'manga')).toBe(true);
    expect(project(mixed, mark('unseen'), 'manga')?.status).toBe('unseen');
  });
});

describe('applyAnswer', () => {
  it('keeps only the status for a title with one form', () => {
    expect(applyAnswer(anime, undefined, { anime: true }, 2)).toEqual({ itemId: 'a', status: 'seen', updatedAt: 2 });
    expect(applyAnswer(manga, undefined, { manga: false }, 2)).toEqual({ itemId: 'm', status: 'unseen', updatedAt: 2 });
  });

  it('merges a new answer with what was known', () => {
    const watched = applyAnswer(mixed, undefined, { anime: true }, 2);
    const both = applyAnswer(mixed, watched, { manga: true }, 3);
    expect(both).toMatchObject({ status: 'seen', anime: true, manga: true });
  });

  it('reads an old "seen" plus "haven\'t watched" as read', () => {
    const m = applyAnswer(mixed, mark('seen'), { anime: false }, 2);
    expect(m).toMatchObject({ status: 'seen', anime: false, manga: true });
  });

  it('reads an old "not seen" as neither', () => {
    const m = applyAnswer(mixed, mark('unseen'), { manga: true }, 2);
    expect(m).toMatchObject({ status: 'seen', anime: false, manga: true });
  });
});

describe('clearIn', () => {
  it('clears one form and keeps the other', () => {
    const both = applyAnswer(mixed, undefined, { anime: true, manga: false }, 2);
    expect(clearIn(mixed, both, 'anime', 3)).toMatchObject({ status: 'unseen', manga: false });
    expect(clearIn(mixed, both, 'anime', 3)?.anime).toBeUndefined();
    expect(clearIn(mixed, applyAnswer(mixed, undefined, { anime: true }, 2), 'anime', 3)).toBeUndefined();
    expect(clearIn(anime, mark('seen'), 'anime', 3)).toBeUndefined();
  });
});

describe('choicesFor', () => {
  it('asks which form for a title with both, in the both view', () => {
    expect(choicesFor(mixed, 'both').map((c) => c.label)).toEqual(['Watched', 'Read', 'Both', 'Neither']);
    expect(choicesFor(mixed, 'manga').map((c) => c.label)).toEqual(['Read it', "Haven't read"]);
    expect(choicesFor(anime, 'both').map((c) => c.label)).toEqual(['Watched it', "Haven't watched"]);
  });

  it('marks the matching choice as on', () => {
    const m = applyAnswer(mixed, undefined, { anime: false, manga: true }, 2);
    const on = choicesFor(mixed, 'both').filter((c) => chosen(mixed, m, c)).map((c) => c.label);
    expect(on).toEqual(['Read']);
  });

  it('reads a title split down to one form by that form only', () => {
    const readOnly = applyAnswer(mixed, undefined, { anime: false, manga: true }, 2);
    const animeLeft = { formats: ['TV'] };
    expect(project(animeLeft, readOnly, 'both')?.status).toBe('unseen');
    expect(project(animeLeft, readOnly, 'anime')?.status).toBe('unseen');
    const partial = applyAnswer(mixed, undefined, { manga: true }, 2);
    expect(project(animeLeft, partial, 'both')).toBeUndefined();
  });
});
