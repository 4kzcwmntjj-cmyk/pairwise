import { describe, expect, it } from 'vitest';
import type { Item, Mark } from '../types';
import { recommend } from './recommend';
import { fit } from './solver';

const item = (id: string, extra: Partial<Item> = {}): Item => ({
  id,
  category: 'anime',
  source: 'anilist',
  title: id,
  entryIds: [Number(id.replace(/\D/g, '')) || 1],
  formats: ['TV'],
  popularity: 1,
  ...extra,
});
const seen = (ids: string[]) => new Map<string, Mark>(ids.map((id) => [id, { itemId: id, status: 'seen', updatedAt: 0 }]));

describe('recommend', () => {
  // loved > middle > disliked, by duels.
  const f = fit({
    ids: ['loved', 'middle', 'disliked'],
    anchors: {},
    votes: [
      ...Array(4).fill({ a: 'loved', b: 'middle', outcome: 'a' }),
      ...Array(4).fill({ a: 'middle', b: 'disliked', outcome: 'a' }),
    ],
  });

  it('prefers titles recommended from what you rank highly', () => {
    const items = [
      item('loved', { recs: [['x1', 50]], genres: ['Drama'] }),
      item('middle', { genres: ['Comedy'] }),
      item('disliked', { recs: [['x2', 50]], genres: ['Action'] }),
      item('x1', { genres: ['Comedy'] }),
      item('x2', { genres: ['Comedy'] }),
    ];
    const recs = recommend(items, f, seen(['loved', 'middle', 'disliked']));
    expect(recs[0].item.id).toBe('x1');
    expect(recs[0].because).toEqual(['loved']);
    expect(recs.find((r) => r.item.id === 'x2')).toBeUndefined();
  });

  it('falls back on genres when there are no links', () => {
    const items = [
      item('loved', { genres: ['Drama'] }),
      item('middle', { genres: ['Comedy'] }),
      item('disliked', { genres: ['Action'] }),
      item('g1', { genres: ['Drama'] }),
      item('g2', { genres: ['Action'] }),
    ];
    const recs = recommend(items, f, seen(['loved', 'middle', 'disliked']));
    expect(recs.map((r) => r.item.id)).toEqual(['g1']);
    expect(recs[0].genres).toEqual(['Drama']);
  });

  it('never suggests a title you have marked seen', () => {
    const items = [item('loved', { recs: [['middle', 99]] }), item('middle'), item('disliked')];
    const recs = recommend(items, f, seen(['loved', 'middle', 'disliked']));
    expect(recs.find((r) => r.item.id === 'middle')).toBeUndefined();
  });
});
