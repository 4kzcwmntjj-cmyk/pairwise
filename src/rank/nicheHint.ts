/**
 * Duel's standing hint for lists whose titles never come up.
 *
 * Newcomer duels only offer titles you haven't logged that have at least a 40% chance of having been seen, and
 * that chance follows popularity closely. If your titles are mostly less popular, or you've already logged every
 * likely one, no newcomer is waiting and nothing from the Library reaches Duel on its own. The hint points to the
 * Library for as long as that holds, and goes away when it stops (logging titles teaches the guess what you watch,
 * so newcomers start coming again).
 */

/** Fewer than this many newcomers waiting counts as none worth waiting for. */
export const NICHE_MAX_WAITING = 3;

/** Duels before the hint can show, so a list that has barely started doesn't get it. */
export const NICHE_MIN_DUELS = 10;

/** The text before the Library link; Duel ends the sentence with the link and a full stop. */
export const NICHE_HINT = "Duels only bring in titles you're likely to know. Log the rest in the";

export function showNicheHint(waiting: number, duels: number): boolean {
  return duels >= NICHE_MIN_DUELS && waiting < NICHE_MAX_WAITING;
}
