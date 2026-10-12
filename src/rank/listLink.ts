/**
 * A ranked list carried in a link, for comparing with a friend without a server.
 *
 * The list goes in the URL fragment (after `#`), which browsers never send to a
 * server. Titles are written as AniList entry ids rather than item ids, so a
 * title one person has split, joined or ranked apart still finds its match in
 * the other person's list. Each id is a fixed-width base64url number: three
 * characters while every id is below 262,144, four after that.
 */

import { representative } from '../anilist/group';
import type { Item } from '../types';

export interface SentList {
  /** The sender's name, as they typed it. */
  name?: string;
  /** The day the link was made, YYYY-MM-DD. */
  made?: string;
  /** One AniList entry per ranked title, best first. */
  entries: number[];
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

/** The fragment for a list, without the `#`. */
export function encodeList(list: SentList): string {
  const ids = list.entries.slice(0, MAX_LIST);
  const { width, text } = encodeIds(ids);
  const p = new URLSearchParams();
  p.set('v', '1');
  const name = cleanName(list.name);
  if (name) p.set('n', name);
  if (list.made) p.set('d', list.made.replace(/-/g, ''));
  p.set('w', String(width));
  p.set('list', text);
  return p.toString();
}

/** Reads a fragment (with or without the `#`). Null when it isn't a list, or is damaged. */
export function decodeList(fragment: string): SentList | null {
  const p = new URLSearchParams(fragment.replace(/^#/, ''));
  const text = p.get('list');
  if (!text || p.get('v') !== '1') return null;
  const ids = decodeIds(text, Number(p.get('w') ?? 3));
  if (!ids || ids.length === 0 || ids.length > MAX_LIST) return null;
  const d = p.get('d');
  const made = d && /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : undefined;
  return { name: cleanName(p.get('n') ?? undefined), made, entries: ids };
}

/** The full link: this page's address with the list after `#`. */
export function listLink(pageUrl: string, list: SentList): string {
  return `${pageUrl.replace(/#.*$/, '')}#${encodeList(list)}`;
}
