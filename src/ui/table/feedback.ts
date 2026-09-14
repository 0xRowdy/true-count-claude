/**
 * Dealing feedback — sound and haptics.
 *
 * "Add sound" and "the deal has no feedback" are recurring asks in the category's reviews, so
 * the table calls these at every moment that would make a noise at a real table. The
 * implementations are deliberately empty until the assets land: wiring the call sites now
 * means shipping audio is a change to this one file rather than a pass over the whole table,
 * and it keeps the cue points under review while the interaction design is still fresh.
 *
 * Every cue is fire-and-forget and must never throw — feedback is decoration, and a missing
 * asset may not be allowed to interrupt a hand.
 */

import { useMemo } from "react";

/** The moments the table reports. One entry per distinct sound a real table makes. */
export type FeedbackCue =
  /** A card leaves the shoe. Fired once per card. */
  | "card"
  /** The opening deal of a round. */
  | "deal"
  /** Chips pushed out — a bet, a double, or a split. */
  | "chips"
  /** The hand settled in the player's favour. */
  | "win"
  /** The hand settled against the player. */
  | "lose"
  /** The hand pushed. */
  | "push"
  /** The cut card came out and the shoe was replaced. */
  | "shuffle";

export interface TableFeedback {
  play: (cue: FeedbackCue) => void;
}

/**
 * The table's feedback channel.
 *
 * Silent for now. When audio lands, load the clips here and keep `play` synchronous and
 * non-throwing; callers treat it as a no-op and never await it.
 */
export function useTableFeedback(enabled = true): TableFeedback {
  return useMemo<TableFeedback>(
    () => ({
      play: (_cue: FeedbackCue) => {
        if (!enabled) return;
        // Intentionally silent: see the module comment. Assets pending.
      },
    }),
    [enabled],
  );
}
