/**
 * "Test in trainer": a strategy builder sends the player to the game's table with
 * `?strategy=<id>` (`testInTrainerHref`). This finds that strategy again, wherever it lives:
 * the player's own drafts on this device, the design's example draft for the game (shown by a
 * builder before it is first saved), or a library strategy opened read-only.
 *
 * React-free, so it runs under vitest.
 */

import type { StrategyDraft, StrategyGame } from "@/state/strategies";
import { EXAMPLE_IDS, LIBRARY, exampleDraft } from "./library";

export type GameDraft<G extends StrategyGame> = Extract<StrategyDraft, { game: G }>;

/** The strategy `id` names for `game`, or null when this device has no such strategy. */
export function findTestedStrategy<G extends StrategyGame>(
  game: G,
  id: string,
  drafts: readonly StrategyDraft[],
): GameDraft<G> | null {
  const isGame = (d: StrategyDraft | undefined): d is GameDraft<G> => d?.game === game;
  const own = drafts.find((d) => d.id === id);
  if (own) return isGame(own) ? own : null;
  if (id === EXAMPLE_IDS[game]) {
    const example = exampleDraft(game);
    return isGame(example) ? example : null;
  }
  const published = LIBRARY.find((s) => s.id === id || s.draft.id === id)?.draft;
  return isGame(published) ? published : null;
}

/** Reads `?strategy=` from a query string ("?strategy=abc&seed=4"); null when absent or empty. */
export function strategyParam(search: string): string | null {
  const id = new URLSearchParams(search).get("strategy");
  return id && id.trim() ? id : null;
}
