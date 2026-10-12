/**
 * Tips: one short note at a time, shown the first time something relevant happens.
 * Each tip appears once. They stay out of the first few duels and are spaced apart.
 */

export interface TipState {
  /** Tips switched off in Settings. */
  off: boolean;
  /** Ids of tips already shown. */
  seen: string[];
  /** Duel count when the last tip was shown. */
  lastAt: number;
}

export const NO_TIPS: TipState = { off: false, seen: [], lastAt: 0 };

export const FIRST_TIP_AFTER = 8;
export const TIP_GAP = 10;

export interface TipContext {
  duels: number;
  /** Titles ranked in the current view. */
  ranked: number;
  /** The titles on screen, with their rank in this view and how many entries they group. */
  onScreen: { id: string; title: string; rank?: number; entries: number; anime: number; manga: number }[];
  /** Whether each recent newcomer was a title you'd seen, oldest first. */
  newcomerLog: boolean[];
  /** The last outcomes, oldest first. */
  recent: ('a' | 'b' | 'tie')[];
  /** The last duel's winner moved up this many places (0 if new or not up). */
  movedUp: { title: string; places: number } | null;
  /** You have answered anime-only or manga-only for a title that is both. */
  knowsOneForm: boolean;
}

export interface Tip {
  id: string;
  text: string;
  /** A title the tip is about, with a button to open it. */
  open?: { itemId: string; label: string };
}

export const MIN_RANKED_FOR_FORYOU = 20;
export const MIN_RANKED_FOR_STATS = 30;
export const MIN_DUELS_FOR_STATS = 100;

/** The tip to show now, or null. */
export function pickTip(state: TipState, ctx: TipContext): Tip | null {
  if (state.off || ctx.duels < FIRST_TIP_AFTER) return null;
  if (state.lastAt > 0 && ctx.duels - state.lastAt < TIP_GAP) return null;
  const fresh = (id: string) => !state.seen.includes(id);

  const big = ctx.onScreen.find((t) => t.entries >= 10 && t.rank !== undefined && t.rank <= 30);
  if (big && fresh('split')) {
    return {
      id: 'split',
      text: `${big.title} groups ${big.entries} entries. If you'd rather rank some of them on their own, you can split it up.`,
      open: { itemId: big.id, label: `Open ${big.title}` },
    };
  }
  const lastFive = ctx.newcomerLog.slice(-5);
  if (lastFive.length === 5 && lastFive.every((hit) => !hit) && fresh('browse')) {
    return {
      id: 'browse',
      text: "You've passed on the last five new titles. In the Library, Browse lets you filter by year, which helps you spot ones you know.",
    };
  }
  if (ctx.knowsOneForm && fresh('views')) {
    return {
      id: 'views',
      text: 'The Anime, Manga and Both switch at the top changes which titles Duel uses. Each view shows the side of a title you know.',
    };
  }
  if (ctx.movedUp && ctx.movedUp.places >= 8 && fresh('jump')) {
    return {
      id: 'jump',
      text: `${ctx.movedUp.title} jumped ${ctx.movedUp.places} places. Early positions are rough and settle as a title meets more opponents.`,
    };
  }
  const lastFifteen = ctx.recent.slice(-15);
  if (lastFifteen.length === 15 && lastFifteen.filter((o) => o === 'tie').length >= 5 && fresh('ties')) {
    return {
      id: 'ties',
      text: 'A tie tells the ranking less than a pick does. If you lean even slightly, choose a side.',
    };
  }
  if (ctx.ranked >= MIN_RANKED_FOR_FORYOU && fresh('foryou')) {
    return {
      id: 'foryou',
      text: `With ${MIN_RANKED_FOR_FORYOU} titles ranked, the For you tab can suggest what to watch or read next.`,
    };
  }
  if (ctx.ranked >= MIN_RANKED_FOR_STATS && ctx.duels >= MIN_DUELS_FOR_STATS && fresh('stats')) {
    return {
      id: 'stats',
      text: "Stats has enough to show where your taste leans and where you disagree with AniList's scores.",
    };
  }
  return null;
}

export const afterShown = (state: TipState, tip: Tip, duels: number): TipState => ({
  ...state,
  seen: [...state.seen, tip.id],
  lastAt: duels,
});
