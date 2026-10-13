/**
 * Your page: what a friend sees when they open your link. Your ranking in the view you share from, and your
 * Taste cards as you see them, carried in the link (see rank/listLink.ts).
 */

import { entryOf, listLink, type SentList, type SharedCard, type SharedTitle } from '../rank/listLink';
import type { Item, View } from '../types';
import type { CardSpec, CardTitle } from './cards';

const today = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** The page's own address, for links back into the app. */
export const pageUrl = () => `${location.origin}${location.pathname}`;

/** Your cards with titles as AniList entries. A title with no entry (none should lack one) is left out. */
export function toSharedCards(cards: CardSpec[], itemById: Map<string, Item>): SharedCard[] {
  const entry = (id: string) => {
    const item = itemById.get(id);
    return item ? entryOf(item) : undefined;
  };
  const titles = (list: (CardTitle & { line?: string })[]): SharedTitle[] =>
    list.flatMap((t) => {
      const e = entry(t.id);
      return e === undefined ? [] : [{ entry: e, ...(t.caption ? { caption: t.caption } : {}), ...(t.line !== undefined ? { line: t.line } : {}) }];
    });
  return cards.map((c) => ({
    id: c.id,
    kicker: c.kicker,
    headline: c.headline,
    subhead: c.subhead,
    tagline: c.tagline,
    hero: c.hero,
    lines: c.lines,
    covers: titles(c.covers),
    coversLabel: c.coversLabel,
    rows: c.rows ? titles(c.rows) : undefined,
    rowsLabel: c.rowsLabel,
    facts: c.facts,
    side: c.side,
  }));
}

/** A friend's cards in your titles. Titles you don't have in your title list are left out. */
export function fromSharedCards(cards: SharedCard[], itemOfEntry: Map<number, string>): CardSpec[] {
  const titles = (list: SharedTitle[]) =>
    list.flatMap((t) => {
      const id = itemOfEntry.get(t.entry);
      return id ? [{ id, caption: t.caption, line: t.line ?? '' }] : [];
    });
  return cards.map((c) => ({
    id: c.id,
    kicker: c.kicker,
    headline: c.headline,
    subhead: c.subhead,
    tagline: c.tagline,
    hero: c.hero,
    lines: c.lines,
    covers: titles(c.covers).map(({ id, caption }) => ({ id, caption })),
    coversLabel: c.coversLabel,
    rows: c.rows ? titles(c.rows) : undefined,
    rowsLabel: c.rowsLabel,
    facts: c.facts,
    side: c.side,
  }));
}

/** Your ranking in this view as AniList entries, best first. */
export function viewEntries(order: string[], itemById: Map<string, Item>): number[] {
  return order.flatMap((id) => {
    const item = itemById.get(id);
    const e = item && entryOf(item);
    return e === undefined ? [] : [e];
  });
}

export interface PageInput {
  name: string;
  view: View;
  /** Your ranking in the view, best first (item ids). */
  order: string[];
  itemById: Map<string, Item>;
  cards: CardSpec[];
}

export function myPage(input: PageInput): SentList {
  return {
    name: input.name.trim() || undefined,
    made: today(),
    view: input.view,
    entries: viewEntries(input.order, input.itemById),
    cards: toSharedCards(input.cards, input.itemById),
  };
}

/** The link to your page; with `at`, it opens at that card. */
export const myPageLink = (page: SentList, at?: string) => listLink(pageUrl(), at ? { ...page, at } : page);

/** "Ryan's", "your friend's". */
export const possessive = (name?: string) => (name ? `${name}'${/s$/i.test(name) ? '' : 's'}` : "your friend's");

/** What the ranking holds, for headings: "anime", "manga", or "anime and manga" (also for version 1 links). */
export const viewNoun = (view?: View) => (view === 'anime' ? 'anime' : view === 'manga' ? 'manga' : 'anime and manga');
