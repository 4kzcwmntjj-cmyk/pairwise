/**
 * Comparing your ranking with a friend's, from the list in their link (see listLink.ts).
 * Pure functions; the Compare screen and its share picture are built from the result.
 */

/** A title from their list, as one of your titles, with their rank for it. */
export interface Placed {
  id: string;
  /** Their rank, 1 = their favourite, counted over everything they sent. */
  rank: number;
}

/** A title you've both ranked. */
export interface Shared {
  id: string;
  mine: number;
  theirs: number;
}

export interface Comparison {
  /** How many titles each of you has ranked. */
  mine: number;
  theirs: number;
  /** Titles you've both ranked, in your order. */
  common: Shared[];
  /** Of every pair of shared titles, the share you put in the same order. Null with fewer than MIN_COMMON shared. */
  match: { share: number; pairs: number } | null;
  /** Titles in both your top N, for the smallest N of 10, 20 and 50 that gives a few. */
  bothLove: { top: number; titles: Shared[] } | null;
  /** The shared titles you place furthest apart, biggest gap first. */
  disagree: Shared[];
  /** Titles in their top 10 that aren't on your list. */
  theirTop: Placed[];
}

export const MIN_COMMON = 5;
/** Below this, the receiver sees the friend's top 10 instead of a comparison. */
export const MIN_RANKED = 10;
const LOVE_TIERS = [10, 20, 50];
/** A disagreement needs the title at least this far apart, as a share of the shared list. */
const MIN_GAP = 0.25;

/** Their list in your titles. When several of their titles fall in one of yours, the best rank counts. */
export function placeList(entries: number[], itemOfEntry: (entry: number) => string | undefined): { placed: Placed[]; missing: number } {
  const placed: Placed[] = [];
  const taken = new Set<string>();
  let missing = 0;
  entries.forEach((entry, i) => {
    const id = itemOfEntry(entry);
    if (!id) {
      missing++;
      return;
    }
    if (taken.has(id)) return;
    taken.add(id);
    placed.push({ id, rank: i + 1 });
  });
  return { placed, missing };
}

/** Share of pairs in the same order in both lists. `theirs` holds their position for each title, in your order. */
export function pairAgreement(theirs: number[]): { share: number; pairs: number } {
  let same = 0;
  let pairs = 0;
  for (let i = 0; i < theirs.length; i++)
    for (let j = i + 1; j < theirs.length; j++) {
      pairs++;
      if (theirs[i] < theirs[j]) same++;
    }
  return { share: pairs ? same / pairs : 0, pairs };
}

export function compareLists(myOrder: string[], placed: Placed[], theirLength = placed.length): Comparison {
  const myRank = new Map(myOrder.map((id, i) => [id, i + 1]));
  const common: Shared[] = placed
    .filter((p) => myRank.has(p.id))
    .map((p) => ({ id: p.id, mine: myRank.get(p.id)!, theirs: p.rank }))
    .sort((a, b) => a.mine - b.mine);

  // Positions among the shared titles, so lists of different lengths compare fairly.
  const byTheirs = [...common].sort((a, b) => a.theirs - b.theirs);
  const theirPos = new Map(byTheirs.map((s, i) => [s.id, i]));

  const match = common.length >= MIN_COMMON ? pairAgreement(common.map((s) => theirPos.get(s.id)!)) : null;

  let bothLove: Comparison['bothLove'] = null;
  const longest = Math.max(MIN_RANKED, Math.min(myOrder.length, theirLength));
  const tiers = LOVE_TIERS.filter((t) => t <= longest);
  const inTier = (top: number) =>
    common
      .filter((s) => s.mine <= top && s.theirs <= top)
      .sort((a, b) => Math.max(a.mine, a.theirs) - Math.max(b.mine, b.theirs) || a.mine + a.theirs - (b.mine + b.theirs));
  const top = tiers.find((t) => inTier(t).length >= 3) ?? tiers.find((t) => inTier(t).length >= 1);
  if (top !== undefined) bothLove = { top, titles: inTier(top).slice(0, 5) };

  let disagree: Shared[] = [];
  if (common.length >= MIN_COMMON) {
    const span = common.length - 1;
    disagree = common
      .map((s, i) => ({ s, gap: Math.abs(i - theirPos.get(s.id)!) / span }))
      .filter((d) => d.gap >= MIN_GAP)
      .sort((a, b) => b.gap - a.gap || Math.min(a.s.mine, a.s.theirs) - Math.min(b.s.mine, b.s.theirs))
      .slice(0, 3)
      .map((d) => d.s);
  }

  const theirTop = placed.filter((p) => p.rank <= 10 && !myRank.has(p.id));

  return { mine: myOrder.length, theirs: theirLength, common, match, bothLove, disagree, theirTop };
}
