import { describe, expect, it } from 'vitest';
import type { Item, Mark, Vote } from '../types';
import { pickType } from '../rank/findings';
import { crowdView } from '../rank/stats';
import { CARD_HUES, buildCards, hardSentence, spellSentence, typeFacts, type CardInput } from './cards';

const item = (id: string, extra: Partial<Item> = {}): Item => ({
  id,
  category: 'anime',
  source: 'anilist',
  title: id,
  entryIds: [1],
  formats: ['TV'],
  popularity: 1000,
  ...extra,
});
const vote = (a: string, b: string, outcome: Vote['outcome'], at = 0): Vote => ({ a, b, outcome, mode: 'refine', at });
const title = (id: string) => `T-${id}`;

/** Your order is the reverse of AniList's scores: g0 is the lowest scored and g44 the highest. */
const reversed = (n: number) => Array.from({ length: n }, (_, i) => item(`g${i}`, { averageScore: 60 + i, popularity: 5000 - i, startYear: 2000 + (i % 20) }));

function input(ranked: Item[], extra: Partial<CardInput> = {}): CardInput {
  return {
    ranked,
    catalogue: ranked,
    marks: new Map<string, Mark>(),
    votes: [],
    order: ranked.map((i) => i.id),
    crowd: crowdView(ranked),
    tieShare: 0.1,
    enoughForType: false,
    noun: 'anime',
    title,
    ...extra,
  };
}

const ids = (cards: { id: string }[]) => cards.map((c) => c.id);

describe('Hot takes', () => {
  it('needs 30 ranked titles, so "of your N" reads sensibly', () => {
    expect(ids(buildCards(input(reversed(29))))).not.toContain('takes');
    expect(ids(buildCards(input(reversed(30))))).toContain('takes');
  });

  it('puts the cover beside the text and says which way each title goes', () => {
    const takes = buildCards(input(reversed(45))).find((c) => c.id === 'takes')!;
    expect(takes.side).toBe(true);
    expect(takes.covers).toHaveLength(1);
    // g0 is ranked first but AniList scores it lowest: you rank it higher.
    expect(takes.headline).toBe('T-g0');
    expect(takes.lines[0]).toBe('You rank higher');
    expect(takes.lines[1]).toBe("You have it at #1. By AniList's scores it would be #45 of your 45.");
    expect(takes.rows!.map((r) => r.line.split(' · ')[0])).toEqual(['You rank lower', 'You rank higher']);
  });
});

describe('Guilty pleasure', () => {
  it('needs 40 ranked titles', () => {
    expect(ids(buildCards(input(reversed(39))))).not.toContain('guilty');
    expect(ids(buildCards(input(reversed(45))))).toContain('guilty');
  });

  it('skips the title Hot takes leads with', () => {
    const cards = buildCards(input(reversed(45)));
    const lead = cards.find((c) => c.id === 'takes')!.covers[0].id;
    const guilty = cards.find((c) => c.id === 'guilty')!;
    expect(lead).toBe('g0');
    // g0 has the lowest AniList score of the top 20; the next lowest is g1.
    expect(guilty.covers[0].id).toBe('g1');
    expect(guilty.lines[0]).toBe("Your #2, but AniList's average score for it is 61.");
  });
});

describe('the type card', () => {
  it('keeps only facts no other card shows', () => {
    const ranked = Array.from({ length: 40 }, (_, i) =>
      item(`p${i}`, { genres: i < 18 ? ['Psychological'] : ['Action'], studio: i < 6 ? 'Madhouse' : `S${i}`, tags: ['Crime', 'Philosophy'], startYear: 2000 + (i % 15), popularity: 2000 - i }),
    );
    const catalogue = [...ranked, ...Array.from({ length: 300 }, (_, i) => item(`x${i}`, { genres: ['Action'], tags: ['Sports'], startYear: 2010, studio: `Z${i}`, popularity: 10_000 - i }))];
    const t = pickType({ ranked, catalogue, agreement: 0.4, tieShare: 0.1, duels: 200, noun: 'anime' });
    expect(t.type.name).toBe('The Overthinker');
    const labels = typeFacts(t).map((f) => f.label);
    // The headline says the genre; Your themes, Your studio and More detail cover the rest.
    for (const gone of ['Genre lean', 'Theme lean', 'Studio', 'Agrees with AniList', 'Too close to call']) expect(labels).not.toContain(gone);
    expect(labels).toContain('Era');
  });

  it('keeps the genre lean when the type is something else', () => {
    const ranked = Array.from({ length: 40 }, (_, i) => item(`q${i}`, { genres: i < 8 ? ['Comedy'] : ['Action'], startYear: i < 10 ? 1990 + (i % 5) : 2020, popularity: 100 + i }));
    const catalogue = [...ranked, ...Array.from({ length: 300 }, (_, i) => item(`y${i}`, { genres: ['Action'], startYear: 2015, popularity: 10_000 - i }))];
    const t = pickType({ ranked, catalogue, agreement: 0.4, tieShare: 0.1, duels: 200, noun: 'anime' });
    const facts = typeFacts({ ...t, type: { ...t.type, id: 'old' } });
    expect(facts.map((f) => f.label)).toContain('Genre lean');
  });

  it('drops the popularity fact for The Crowd Pleaser, whose sentence already says it', () => {
    // A big, flat catalogue, so the 100 most popular titles hold only a small share of what a typical list draws from.
    const ranked = Array.from({ length: 40 }, (_, i) => item(`r${i}`, { popularity: 2000 - i, startYear: 2010 }));
    const catalogue = [...ranked, ...Array.from({ length: 2000 }, (_, i) => item(`w${i}`, { popularity: 1000, startYear: 2010 }))];
    const t = pickType({ ranked, catalogue, agreement: 0.4, tieShare: 0.1, duels: 200, noun: 'anime' });
    expect(t.type.id).toBe('popular');
    expect(typeFacts(t).map((f) => f.label)).not.toContain('Mainstream');
  });
});

describe('Hardest call wording', () => {
  const h = (results: string[], aWins: number, bWins: number, ties = 0) => ({ a: 'a', b: 'b', aWins, bWins, ties, flips: 1, results, aRank: 3, bRank: 9 });
  it('says what happened, in order', () => {
    expect(hardSentence(h(['a', 'b'], 1, 1), title)).toBe('You picked T-a, then T-b. 1–1, over 2 duels.');
    expect(hardSentence(h(['b', 'a', 'a'], 2, 1), title)).toBe('You picked T-b, then T-a, then T-a. 2–1, over 3 duels.');
    expect(hardSentence(h(['a', 'tie', 'b'], 1, 1, 1), title)).toBe('You picked T-a, then called it too close, then T-b. 1–1, with 1 too close to call, over 3 duels.');
  });
  it('does not list a long run meeting by meeting', () => {
    expect(hardSentence(h(['a', 'b', 'a', 'b', 'a'], 3, 2), title)).toBe('You keep going back and forth: 3–2, over 5 duels.');
  });
  it('shows the two covers beside the text', () => {
    const ranked = reversed(45);
    const votes = [vote('g3', 'g8', 'a', 1), vote('g8', 'g3', 'a', 2)];
    const hard = buildCards(input(ranked, { votes })).find((c) => c.id === 'hard')!;
    expect(hard.side).toBe(true);
    expect(hard.covers.map((c) => c.caption)).toEqual(['#4', '#9']);
    expect(hard.lines[0]).toBe('You picked T-g3, then T-g8. 1–1, over 2 duels.');
  });
});

describe('This week, Your #1 and Undefeated', () => {
  const week = { climbers: [{ id: 'g5', from: 12, to: 5 }], fallers: [{ id: 'g8', from: 4, to: 9 }] };

  it('shows the biggest climber and faller together', () => {
    const c = buildCards(input(reversed(45), { week })).find((x) => x.id === 'week')!;
    expect(c.headline).toBe('T-g5');
    expect(c.lines[0]).toBe('Up 7 places this week, from #12 to #5.');
    expect(c.lines[1]).toBe('Biggest fall: T-g8, down 5 places, from #4 to #9.');
    expect(c.covers.map((x) => x.caption)).toEqual(['Up to #5', 'Down to #9']);
    expect(c.side).toBeUndefined();
  });

  it('puts one mover beside the text, and ignores a move of a single place', () => {
    const only = buildCards(input(reversed(45), { week: { climbers: [], fallers: week.fallers } })).find((x) => x.id === 'week')!;
    expect(only.side).toBe(true);
    expect(only.lines).toEqual(['Down 5 places this week, from #4 to #9.']);
    const tiny = { climbers: [{ id: 'g5', from: 6, to: 5 }], fallers: [] };
    expect(ids(buildCards(input(reversed(45), { week: tiny })))).not.toContain('week');
    expect(ids(buildCards(input(reversed(45), { week: null })))).not.toContain('week');
  });

  it('says how long #1 has held the top spot, with its record', () => {
    const votes = [vote('g0', 'g1', 'a', 1), vote('g2', 'g0', 'b', 2), vote('g0', 'g3', 'tie', 3), vote('g4', 'g0', 'a', 4)];
    const spell = { since: new Date(2026, 9, 3, 12).getTime(), days: 10, fromStart: false, atLeast: false };
    const c = buildCards(input(reversed(45), { votes, topSpell: spell })).find((x) => x.id === 'number1')!;
    expect(c.headline).toBe('T-g0');
    expect(c.side).toBe(true);
    expect(c.lines).toEqual(['Your #1 for 10 days, since 3 Oct.', 'Record: 2–1, 1 too close to call.']);
  });

  it('words the spell for each case', () => {
    const base = { since: new Date(2026, 9, 3, 12).getTime(), days: 4, fromStart: false, atLeast: false };
    expect(spellSentence(null)).toBe('Your #1.');
    expect(spellSentence({ ...base, days: 0 })).toBe('Took the top spot today.');
    expect(spellSentence({ ...base, days: 1 })).toBe('Your #1 for 1 day, since 3 Oct.');
    expect(spellSentence({ ...base, atLeast: true, days: 40 })).toBe('Your #1 for at least 40 days, since before 3 Oct.');
    expect(spellSentence({ ...base, fromStart: true })).toBe('Your #1 since your first duel, 4 days ago.');
    expect(spellSentence({ ...base, fromStart: true, days: 0 })).toBe('Your #1 so far.');
  });

  it('shows the title with the most wins and no loss', () => {
    const c = buildCards(input(reversed(45), { undefeated: { id: 'g6', wins: 7, losses: 0, ties: 0 } })).find((x) => x.id === 'undefeated')!;
    expect(c.headline).toBe('T-g6');
    expect(c.lines).toEqual(['7 wins, no losses.', 'It sits at #7 on your list.']);
    expect(ids(buildCards(input(reversed(45), { undefeated: null })))).not.toContain('undefeated');
  });
});

describe('card order and colours', () => {
  it('follows the agreed order', () => {
    const ranked = reversed(45);
    const marks = new Map<string, Mark>([['g44', { itemId: 'g44', status: 'unseen', updatedAt: 0 }]]);
    const cards = buildCards(
      input(ranked, {
        marks,
        enoughForType: true,
        votes: [vote('g3', 'g8', 'a', 1), vote('g8', 'g3', 'a', 2)],
        week: { climbers: [{ id: 'g5', from: 12, to: 5 }], fallers: [] },
        topSpell: null,
        undefeated: { id: 'g6', wins: 7, losses: 0, ties: 0 },
      }),
    );
    const order = ['type', 'week', 'takes', 'themes', 'era', 'studio', 'number1', 'blind', 'guilty', 'hard', 'undefeated'];
    const got = ids(cards);
    for (const id of ['type', 'week', 'takes', 'number1', 'blind', 'guilty', 'hard', 'undefeated']) expect(got).toContain(id);
    expect(got.map((id) => order.indexOf(id))).toEqual([...got.map((id) => order.indexOf(id))].sort((a, b) => a - b));
  });

  it('gives every Taste card its own hue', () => {
    const hues = Object.values(CARD_HUES);
    expect(Object.keys(CARD_HUES).sort()).toEqual(['blind', 'era', 'guilty', 'hard', 'number1', 'studio', 'takes', 'themes', 'type', 'undefeated', 'week']);
    expect(new Set(hues).size).toBe(hues.length);
  });
});
