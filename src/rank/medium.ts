import { isManga } from '../anilist/group';
import type { Item, Mark, Medium, Status, View } from '../types';

/**
 * Anime, manga, or both.
 *
 * A title can exist as anime, manga, or both. A mark records whether you've
 * seen it at all (`status`) and, for titles that exist in both forms, which
 * forms you know (`anime`, `manga`). The app shows one view at a time. Each
 * view sees marks projected onto it: in the anime view, a title counts as
 * seen if you've watched it, and as not seen if you haven't.
 *
 * There is one ranking underneath. Views filter it; they don't keep their own.
 */

export interface Forms {
  anime: boolean;
  manga: boolean;
}

export function formsOf(item: Pick<Item, 'formats'>): Forms {
  const manga = item.formats.some(isManga);
  const anime = item.formats.some((f) => !isManga(f));
  return { anime, manga };
}

export const hasBoth = (item: Pick<Item, 'formats'>) => {
  const f = formsOf(item);
  return f.anime && f.manga;
};

/** Whether a title belongs in a view at all. */
export function inView(item: Pick<Item, 'formats'>, view: View): boolean {
  if (view === 'both') return true;
  return formsOf(item)[view];
}

const flagsSet = (m: Mark) => m.anime !== undefined || m.manga !== undefined;

/**
 * Whether you know a title in one form: true, false, or undefined if not asked
 * (or the title doesn't exist in that form).
 */
export function knownIn(item: Pick<Item, 'formats'>, mark: Mark | undefined, medium: Medium): boolean | undefined {
  const forms = formsOf(item);
  if (!forms[medium] || !mark) return undefined;
  const flag = mark[medium];
  if (flag !== undefined) return flag;
  // One form answered, the other not: the other hasn't been asked.
  if (flagsSet(mark)) return undefined;
  // A title with one form, or a mark from before forms were recorded: the status covers every form.
  return mark.status === 'seen';
}

/** True when a title with both forms was marked seen without saying which. */
export const formUnknown = (item: Pick<Item, 'formats'>, mark: Mark | undefined) =>
  !!mark && mark.status === 'seen' && hasBoth(item) && !flagsSet(mark);

/** The mark as a view sees it, or undefined if the title isn't sorted in that view. */
export function project(item: Pick<Item, 'formats'>, mark: Mark | undefined, view: View): Mark | undefined {
  if (!mark) return undefined;
  if (view !== 'both') {
    const k = knownIn(item, mark, view);
    if (k === undefined) return undefined;
    const status: Status = k ? 'seen' : 'unseen';
    return status === mark.status ? mark : { ...mark, status };
  }
  if (!flagsSet(mark)) return mark;
  if (!hasBoth(item)) {
    // A title that lost one form to a split: only the form it still has counts.
    const forms = formsOf(item);
    const k = knownIn(item, mark, forms.anime ? 'anime' : 'manga');
    if (k === undefined) return undefined;
    const status: Status = k ? 'seen' : 'unseen';
    return status === mark.status ? mark : { ...mark, status };
  }
  const a = knownIn(item, mark, 'anime');
  const m = knownIn(item, mark, 'manga');
  if (a || m) return mark.status === 'seen' ? mark : { ...mark, status: 'seen' };
  if (a === false && m === false) return mark.status === 'unseen' ? mark : { ...mark, status: 'unseen' };
  return undefined; // one form ruled out, the other not asked
}

export function projectMarks(items: Iterable<Item>, marks: Map<string, Mark>, view: View): Map<string, Mark> {
  const out = new Map<string, Mark>();
  for (const item of items) {
    const p = project(item, marks.get(item.id), view);
    if (p) out.set(item.id, p);
  }
  return out;
}

export type Answer = Partial<Record<Medium, boolean>>;

/**
 * The mark that results from an answer. For a title with one form, only the
 * status is kept. For a title with both, the forms are merged with what was
 * known before, and the status follows: seen if either form is known.
 */
export function applyAnswer(item: Pick<Item, 'id' | 'formats'>, prev: Mark | undefined, answer: Answer, at: number): Mark {
  const forms = formsOf(item);
  if (!(forms.anime && forms.manga)) {
    const known = forms.anime ? answer.anime : answer.manga;
    const status: Status = (known ?? answer.anime ?? answer.manga) ? 'seen' : 'unseen';
    return { itemId: item.id, status, updatedAt: at };
  }
  let anime = answer.anime;
  let manga = answer.manga;
  // Carry over what was known. An old mark without forms says something about the form not being answered:
  // "seen" plus "not watched" means it was read; "not seen" means neither.
  const carry = (medium: Medium, given: boolean | undefined): boolean | undefined => {
    if (!prev) return undefined;
    if (flagsSet(prev)) return prev[medium];
    if (prev.status === 'unseen') return false;
    return given === false ? true : undefined;
  };
  if (anime === undefined) anime = carry('anime', manga);
  if (manga === undefined) manga = carry('manga', anime);
  const status: Status = anime || manga ? 'seen' : 'unseen';
  const mark: Mark = { itemId: item.id, status, updatedAt: at };
  if (anime !== undefined) mark.anime = anime;
  if (manga !== undefined) mark.manga = manga;
  return mark;
}

/** The mark after clearing one form (or everything, in the both view). Undefined means no mark is left. */
export function clearIn(item: Pick<Item, 'id' | 'formats'>, prev: Mark | undefined, view: View, at: number): Mark | undefined {
  if (!prev || view === 'both' || !hasBoth(item)) return undefined;
  const other: Medium = view === 'anime' ? 'manga' : 'anime';
  const keep = knownIn(item, prev, other);
  if (keep === undefined) return undefined;
  return applyAnswer(item, undefined, { [other]: keep }, at);
}

/** The buttons to offer for a title in a view. */
export interface Choice {
  label: string;
  answer: Answer;
  /** Keyboard shortcut. */
  key: string;
}

export function choicesFor(item: Pick<Item, 'formats'>, view: View): Choice[] {
  const forms = formsOf(item);
  const medium: Medium | null = forms.anime && forms.manga ? (view === 'both' ? null : view) : forms.anime ? 'anime' : 'manga';
  if (medium === 'anime') {
    return [
      { label: 'Watched it', answer: { anime: true }, key: 'y' },
      { label: "Haven't watched", answer: { anime: false }, key: 'n' },
    ];
  }
  if (medium === 'manga') {
    return [
      { label: 'Read it', answer: { manga: true }, key: 'y' },
      { label: "Haven't read", answer: { manga: false }, key: 'n' },
    ];
  }
  return [
    { label: 'Watched', answer: { anime: true, manga: false }, key: 'w' },
    { label: 'Read', answer: { anime: false, manga: true }, key: 'r' },
    { label: 'Both', answer: { anime: true, manga: true }, key: 'b' },
    { label: 'Neither', answer: { anime: false, manga: false }, key: 'n' },
  ];
}

/** Whether a mark matches a choice, for showing which button is on. */
export function chosen(item: Pick<Item, 'formats'>, mark: Mark | undefined, choice: Choice): boolean {
  if (!mark) return false;
  return (Object.keys(choice.answer) as Medium[]).every((m) => knownIn(item, mark, m) === choice.answer[m]);
}

export const VIEW_LABEL: Record<View, string> = { anime: 'Anime', manga: 'Manga', both: 'Both' };
