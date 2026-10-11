import Dexie, { type Table } from 'dexie';
import { DEFAULT_SETTINGS, type Item, type Mark, type Settings, type Vote } from '../types';

/**
 * Everything the app saves goes through this interface, so the storage can
 * later move to a server (for friends) by writing one new implementation.
 */
export interface Store {
  loadAll(): Promise<Snapshot>;
  putItems(items: Item[]): Promise<void>;
  setMark(mark: Mark): Promise<void>;
  deleteMark(itemId: string): Promise<void>;
  addVote(vote: Vote): Promise<number>;
  deleteVote(id: number): Promise<void>;
  setSettings(settings: Settings): Promise<void>;
  setMeta(key: string, value: unknown): Promise<void>;
  replaceAll(snapshot: Snapshot): Promise<void>;
  clearAll(): Promise<void>;
}

export interface Snapshot {
  items: Item[];
  marks: Mark[];
  votes: Vote[];
  settings: Settings;
  meta: Record<string, unknown>;
}

interface KV {
  key: string;
  value: unknown;
}

class PairwiseDB extends Dexie {
  items!: Table<Item, string>;
  marks!: Table<Mark, string>;
  votes!: Table<Vote, number>;
  kv!: Table<KV, string>;
  constructor() {
    super('pairwise');
    this.version(1).stores({ items: 'id', marks: 'itemId', votes: '++id, at', kv: 'key' });
  }
}

export class LocalStore implements Store {
  private db = new PairwiseDB();

  async loadAll(): Promise<Snapshot> {
    const [items, marks, votes, kv] = await Promise.all([
      this.db.items.toArray(),
      this.db.marks.toArray(),
      this.db.votes.orderBy('id').toArray(),
      this.db.kv.toArray(),
    ]);
    const meta: Record<string, unknown> = {};
    for (const { key, value } of kv) meta[key] = value;
    const settings = { ...DEFAULT_SETTINGS, ...((meta.settings as Settings) ?? {}) };
    delete meta.settings;
    return { items, marks, votes, settings, meta };
  }
  async putItems(items: Item[]) {
    await this.db.items.bulkPut(items);
  }
  async setMark(mark: Mark) {
    await this.db.marks.put(mark);
  }
  async deleteMark(itemId: string) {
    await this.db.marks.delete(itemId);
  }
  async addVote(vote: Vote) {
    const { id: _ignored, ...rest } = vote;
    return (await this.db.votes.add(rest as Vote)) as number;
  }
  async deleteVote(id: number) {
    await this.db.votes.delete(id);
  }
  async setSettings(settings: Settings) {
    await this.db.kv.put({ key: 'settings', value: settings });
  }
  async setMeta(key: string, value: unknown) {
    await this.db.kv.put({ key, value });
  }
  async replaceAll(s: Snapshot) {
    await this.db.transaction('rw', [this.db.items, this.db.marks, this.db.votes, this.db.kv], async () => {
      await Promise.all([this.db.items.clear(), this.db.marks.clear(), this.db.votes.clear(), this.db.kv.clear()]);
      await this.db.items.bulkPut(s.items);
      await this.db.marks.bulkPut(s.marks);
      await this.db.votes.bulkAdd(s.votes.map(({ id: _id, ...v }) => v as Vote));
      await this.db.kv.bulkPut([
        { key: 'settings', value: s.settings },
        ...Object.entries(s.meta).map(([key, value]) => ({ key, value })),
      ]);
    });
  }
  async clearAll() {
    await Promise.all([this.db.items.clear(), this.db.marks.clear(), this.db.votes.clear(), this.db.kv.clear()]);
  }
}

export const EXPORT_FORMAT = 'pairwise-export';
export const EXPORT_VERSION = 1;

export function toExport(s: Snapshot) {
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: new Date().toISOString(), ...s };
}

export function fromExport(raw: unknown): Snapshot {
  const o = raw as Partial<Snapshot> & { format?: string };
  if (!o || o.format !== EXPORT_FORMAT || !Array.isArray(o.items) || !Array.isArray(o.marks) || !Array.isArray(o.votes)) {
    throw new Error('This file is not a Pairwise export.');
  }
  return {
    items: o.items,
    marks: o.marks,
    votes: o.votes,
    settings: { ...DEFAULT_SETTINGS, ...(o.settings ?? {}) },
    meta: o.meta ?? {},
  };
}
