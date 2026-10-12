import { describe, expect, it } from 'vitest';
import { wrapLines } from './shareImage';

const measure = (s: string) => s.length * 10;

describe('wrapLines', () => {
  it('keeps short text on one line', () => {
    expect(wrapLines(measure, 'Death Note', 200, 2)).toEqual(['Death Note']);
  });
  it('wraps at word boundaries', () => {
    expect(wrapLines(measure, 'Fullmetal Alchemist Brotherhood', 220, 2)).toEqual(['Fullmetal Alchemist', 'Brotherhood']);
  });
  it('ends the last line with an ellipsis when cut', () => {
    const lines = wrapLines(measure, 'One two three four five six seven eight', 100, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
    expect(measure(lines[1])).toBeLessThanOrEqual(100);
  });
  it('cuts a single long word', () => {
    const [l] = wrapLines(measure, 'Supercalifragilistic', 80, 1);
    expect(l.endsWith('…')).toBe(true);
    expect(measure(l)).toBeLessThanOrEqual(80);
  });
});
