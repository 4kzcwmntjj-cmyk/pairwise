/**
 * A person's page carried in a link: their ranking and their Taste cards, with no server.
 *
 * Everything goes in the URL fragment (after `#`), which browsers never send to a
 * server. Titles are written as AniList entry ids rather than item ids, so a
 * title one person has split, joined or ranked apart still finds its match in
 * the other person's list. Each id is a fixed-width base64url number: three
 * characters while every id is below 262,144, four after that.
 *
 * Version 1 carried only the ranking (anime and manga together). Version 2 adds
 * the view it was shared from (the ranking is that view's), the sender's Taste
 * cards, packed (deflate, then base64url), and optionally a card to open at.
 */

import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { representative } from '../anilist/group';
import type { Item, View } from '../types';

/** A cover or a row on a shared card, with its title as an AniList entry. */
export interface SharedTitle {
  entry: number;
  caption?: string;
  /** Rows only: the line under the title. */
  line?: string;
}

/** A Taste card as the sender saw it (see `CardSpec` in app/cards.ts), with titles as AniList entries. */
export interface SharedCard {
  id: string;
  kicker: string;
  headline: string;
  subhead?: string;
  tagline?: string;
  hero?: boolean;
  lines: string[];
  covers: SharedTitle[];
  coversLabel?: string;
  rows?: SharedTitle[];
  rowsLabel?: string;
  facts?: { label: string; value: string }[];
  side?: boolean;
}

export interface SentList {
  /** The sender's name, as they typed it. */
  name?: string;
  /** The day the link was made, YYYY-MM-DD. */
  made?: string;
  /** One AniList entry per ranked title, best first. */
  entries: number[];
  /** The view the ranking was shared from. Absent on version 1 links, which hold anime and manga together. */
  view?: View;
  /** The sender's Taste cards, as they saw them. */
  cards?: SharedCard[];
  /** A card to open the page at. Read from the link; not kept with a stored list. */
  at?: string;
}

const DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const VALUE = new Map([...DIGITS].map((c, i) => [c, i]));
/** More than anyone ranks; a longer list in a link is treated as damaged. */
export const MAX_LIST = 3000;
export const MAX_NAME = 30;

/** The AniList entry that stands for a title: the one its id was named after, else its representative entry. */
export function entryOf(item: Pick<Item, 'id' | 'entryIds' | 'entries'>): number | undefined {
  const named = /^(?:al|s)-(\d+)/.exec(item.id);
  if (named && item.entryIds.includes(Number(named[1]))) return Number(named[1]);
  if (item.entries?.length) return representative(item.entries).id;
  return item.entryIds[0];
}

export function cleanName(name: string | undefined): string | undefined {
  const n = (name ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME);
  return n || undefined;
}

function encodeIds(ids: number[]): { width: number; text: string } {
  const max = Math.max(0, ...ids);
  const width = max < 64 ** 3 ? 3 : 4;
  let text = '';
  for (const id of ids) {
    let s = '';
    for (let k = 0, v = id; k < width; k++, v = Math.floor(v / 64)) s = DIGITS[v % 64] + s;
    text += s;
  }
  return { width, text };
}

function decodeIds(text: string, width: number): number[] | null {
  if (width !== 3 && width !== 4) return null;
  if (text.length % width !== 0) return null;
  const ids: number[] = [];
  for (let i = 0; i < text.length; i += width) {
    let v = 0;
    for (let k = 0; k < width; k++) {
      const d = VALUE.get(text[i + k]);
      if (d === undefined) return null;
      v = v * 64 + d;
    }
    ids.push(v);
  }
  return ids;
}

const VIEWS: View[] = ['anime', 'manga', 'both'];
/** More cards than Taste makes; a longer set in a link is treated as damaged. */
const MAX_CARDS = 20;
const CARD_ID = /^[a-z0-9]{1,20}$/;

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array | null {
  try {
    const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

// Short keys keep the packed cards small; these are the only names the link uses.
type Packed = {
  i: string; k: string; h: string; s?: string; t?: string; x?: 1; l: string[];
  c: (number | [number, string])[]; cl?: string; r?: [number, string, string?][]; rl?: string; f?: [string, string][]; d?: 1;
};

export function packCards(cards: SharedCard[]): string {
  const packed: Packed[] = cards.slice(0, MAX_CARDS).map((c) => ({
    i: c.id,
    k: c.kicker,
    h: c.headline,
    ...(c.subhead ? { s: c.subhead } : {}),
    ...(c.tagline ? { t: c.tagline } : {}),
    ...(c.hero ? { x: 1 as const } : {}),
    l: c.lines,
    c: c.covers.map((t) => (t.caption ? [t.entry, t.caption] : t.entry)),
    ...(c.coversLabel ? { cl: c.coversLabel } : {}),
    ...(c.rows?.length ? { r: c.rows.map((t): [number, string, string?] => (t.caption ? [t.entry, t.line ?? '', t.caption] : [t.entry, t.line ?? ''])) } : {}),
    ...(c.rowsLabel ? { rl: c.rowsLabel } : {}),
    ...(c.facts?.length ? { f: c.facts.map((x): [string, string] => [x.label, x.value]) } : {}),
    ...(c.side ? { d: 1 as const } : {}),
  }));
  return toBase64Url(deflateSync(strToU8(JSON.stringify(packed)), { level: 9 }));
}

const str = (x: unknown): x is string => typeof x === 'string';
const num = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0;

/** Null when the text isn't a set of cards, or is damaged. Anything malformed in a card drops that card. */
export function unpackCards(text: string): SharedCard[] | null {
  const bytes = fromBase64Url(text);
  if (!bytes) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(inflateSync(bytes)));
  } catch {
    return null;
  }
  if (!Array.isArray(raw)) return null;
  const cards: SharedCard[] = [];
  for (const p of raw.slice(0, MAX_CARDS) as Partial<Packed>[]) {
    if (!p || !str(p.i) || !CARD_ID.test(p.i) || !str(p.k) || !str(p.h) || !Array.isArray(p.l) || !p.l.every(str) || !Array.isArray(p.c)) continue;
    const covers: SharedTitle[] = [];
    for (const c of p.c) {
      if (num(c)) covers.push({ entry: c });
      else if (Array.isArray(c) && num(c[0]) && str(c[1])) covers.push({ entry: c[0], caption: c[1] });
    }
    const rows: SharedTitle[] = [];
    if (Array.isArray(p.r))
      for (const r of p.r) if (Array.isArray(r) && num(r[0]) && str(r[1])) rows.push({ entry: r[0], line: r[1], ...(str(r[2]) ? { caption: r[2] } : {}) });
    const facts = Array.isArray(p.f) ? p.f.filter((f) => Array.isArray(f) && str(f[0]) && str(f[1])).map(([label, value]) => ({ label, value })) : [];
    cards.push({
      id: p.i,
      kicker: p.k,
      headline: p.h,
      ...(str(p.s) ? { subhead: p.s } : {}),
      ...(str(p.t) ? { tagline: p.t } : {}),
      ...(p.x ? { hero: true } : {}),
      lines: p.l,
      covers,
      ...(str(p.cl) ? { coversLabel: p.cl } : {}),
      ...(rows.length ? { rows } : {}),
      ...(str(p.rl) ? { rowsLabel: p.rl } : {}),
      ...(facts.length ? { facts } : {}),
      ...(p.d ? { side: true } : {}),
    });
  }
  return cards;
}

/** The fragment for a list, without the `#`. Version 2 when it carries a view or cards. */
export function encodeList(list: SentList): string {
  const ids = list.entries.slice(0, MAX_LIST);
  const { width, text } = encodeIds(ids);
  const p = new URLSearchParams();
  const v2 = !!list.view || !!list.cards;
  p.set('v', v2 ? '2' : '1');
  const name = cleanName(list.name);
  if (name) p.set('n', name);
  if (list.made) p.set('d', list.made.replace(/-/g, ''));
  if (list.view) p.set('vw', list.view);
  if (list.at && CARD_ID.test(list.at)) p.set('at', list.at);
  p.set('w', String(width));
  p.set('list', text);
  // Cards last: they are the long part, and a chat app that cuts the link short loses them before the list.
  if (list.cards?.length) p.set('c', packCards(list.cards));
  return p.toString();
}

/** Reads a fragment (with or without the `#`). Null when it isn't a list, or is damaged. */
export function decodeList(fragment: string): SentList | null {
  const p = new URLSearchParams(fragment.replace(/^#/, ''));
  const text = p.get('list');
  const v = p.get('v');
  if (!text || (v !== '1' && v !== '2')) return null;
  const ids = decodeIds(text, Number(p.get('w') ?? 3));
  if (!ids || ids.length === 0 || ids.length > MAX_LIST) return null;
  const d = p.get('d');
  const made = d && /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : undefined;
  const list: SentList = { name: cleanName(p.get('n') ?? undefined), made, entries: ids };
  if (v === '2') {
    const view = p.get('vw') as View | null;
    if (view && VIEWS.includes(view)) list.view = view;
    const packed = p.get('c');
    // Damaged cards don't lose the list: the page shows it without them.
    const cards = packed ? unpackCards(packed) : null;
    if (cards?.length) list.cards = cards;
    const at = p.get('at');
    if (at && CARD_ID.test(at)) list.at = at;
  }
  return list;
}

/** The full link: this page's address with the list after `#`. */
export function listLink(pageUrl: string, list: SentList): string {
  return `${pageUrl.replace(/#.*$/, '')}#${encodeList(list)}`;
}
