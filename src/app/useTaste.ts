import { useMemo } from 'react';
import { duelStats, enoughForTaste, movers, overview, topSpell, crowdView } from '../rank/stats';
import { withLook } from '../rank/look';
import type { Item } from '../types';
import { buildCards } from './cards';
import type { AppState } from './useApp';

let lastCatalogue: { items: Item[]; look: AppState['look']; out: Item[] } | null = null;
/**
 * Every title in the view as you know it. Kept between visits to Taste: it only changes with the view or your
 * marks, and keeping the same array lets the type card's base rates (kept per array) carry over too.
 */
function lookedCatalogue(items: Item[], look: AppState['look']): Item[] {
  if (lastCatalogue?.items === items && lastCatalogue.look === look) return lastCatalogue.out;
  const out = items.map((i) => withLook(i, look(i)));
  lastCatalogue = { items, look, out };
  return out;
}

/**
 * What Taste is built from, and its cards. Used by the Taste tab and by the share sheet, which puts the same
 * cards on your page, so a friend sees what you see.
 */
export function useTaste(app: AppState) {
  const { fit, votes, marks } = app;

  // Titles that have played at least one duel, best first. Unplayed ones sit at the midpoint and would blur the groups.
  const ranked: Item[] = useMemo(
    () =>
      fit.order
        .filter((id) => (fit.duels.get(id) ?? 0) > 0)
        .map((id) => app.itemById.get(id)!)
        .filter(Boolean)
        // Years, studio and AniList score of the side you know: in the manga view, the manga's.
        .map((i) => withLook(i, app.look(i))),
    [fit, app.itemById, app.look],
  );
  // The fit runs over everything you've seen; ranks are counted within the current view.
  const seenIds = app.seenIds;
  const within = useMemo(() => new Set(fit.order), [fit]);
  const now = useMemo(() => Date.now(), [votes]);

  const over = useMemo(() => overview(votes, marks, now), [votes, marks, now]);
  const week = useMemo(() => movers(votes, seenIds, now - 7 * 86_400_000, 3, 30, within), [votes, seenIds, now, within]);
  const unlocked = enoughForTaste(ranked.length, votes.length);
  const crowd = useMemo(() => crowdView(ranked), [ranked]);
  const duels = useMemo(() => duelStats(votes, fit.order), [votes, fit.order]);
  // How long the title at #1 has held the top spot: a replay of the votes, so only when there are cards to show.
  const spell = useMemo(
    () => (ranked.length >= 10 ? topSpell(votes, seenIds, ranked[0].id, now, within) : null),
    [ranked, votes, seenIds, now, within],
  );
  const noun = app.view === 'both' ? 'titles' : app.view;
  // Every title in the view, as you know it: the base for "typical" and popularity positions.
  const catalogue = useMemo(() => lookedCatalogue(app.items, app.look), [app.items, app.look]);
  const cards = useMemo(
    () =>
      ranked.length < 10
        ? []
        : buildCards({
            ranked,
            catalogue,
            marks,
            votes,
            order: fit.order,
            crowd,
            tieShare: over.tieShare,
            enoughForType: unlocked,
            noun,
            week,
            topSpell: spell,
            undefeated: duels.undefeated[0] ?? null,
            title: (id) => {
              const item = app.itemById.get(id);
              return item ? app.title(item) : id;
            },
          }),
    [ranked, catalogue, marks, votes, fit.order, crowd, over.tieShare, unlocked, noun, week, spell, duels, app.itemById, app.title],
  );

  return { ranked, seenIds, within, now, over, week, unlocked, crowd, duels, noun, catalogue, cards };
}
