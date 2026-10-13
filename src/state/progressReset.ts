/**
 * Invariant 6 (CONTEXT.md): a practice bankroll at zero always offers a one-tap reset in place.
 *
 * The bankroll is derived (`PRACTICE_BANKROLL_START` + `bankrollBase` + every hand's net), so a
 * reset moves the game's `bankrollBase` by exactly what the hands have won or lost. No hand is
 * recorded: a top-up is not play, and must not move win rates or hand counts.
 */

import { type ProgressState } from "./progress";
import type { GameId } from "./profile";

/** Returns `state` with `game`'s practice bankroll back at the starting balance. */
export function resetBankroll(state: ProgressState, game: GameId): ProgressState {
  const base = state.bankrollBase[game] ?? 0;
  let net = base;
  for (const h of state.hands) if (h.game === game) net += h.net;
  if (net === 0) return state;
  return { ...state, bankrollBase: { ...state.bankrollBase, [game]: base - net } };
}
