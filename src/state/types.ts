/**
 * Session, Decision, and the records that make a Session replayable.
 *
 * These are plain data with no behaviour, so a Session is exactly what gets persisted and
 * exactly what gets exported. Nothing here reads a clock or generates an id — timestamps
 * and ids are passed in, which keeps the whole lifecycle pure and testable in plain Node
 * with no mocking (see `store.ts` for the one I/O seam).
 *
 * Vocabulary is CONTEXT.md's, used exactly: Session, Decision, Shoe, Drill, Play.
 */

import type { Action, Card, RuleSet } from "@/engine";

/**
 * A Session is a bounded run of Play (unscored) or Drill (scored, per-decision feedback).
 * Both log Decisions; only a Drill carries a `drillId`.
 */
export type SessionMode = "play" | "drill";

/**
 * Why a Session ended. Every one of these is an *explicit* caller action — no function in
 * this module ends a Session as a side effect of anything else (ADR-0003: the incumbent's
 * worst verified failure is sessions that would not close reliably).
 *
 * - `user` — the always-available "End Session" button. The normal case.
 * - `drill-complete` — the Drill reached its last hand and the UI closed the Session.
 * - `bankroll-exhausted` — the user chose to stop rather than take the one-tap reset that
 *   invariant 6 always offers. Reaching zero does *not* end a Session by itself.
 * - `discarded` — the user threw the run away without keeping its statistics.
 */
export type SessionEndReason = "user" | "drill-complete" | "bankroll-exhausted" | "discarded";

/**
 * The Running Count and True Count at the instant a Decision was taken.
 *
 * Stored rather than recomputed: a Decision must be explainable years later even if the
 * Counting System's tag table is corrected, and the user's Explanation showed *these*
 * numbers. `decksRemaining` is kept because it is the divisor behind `trueCount`, and
 * showing the division is part of proving the math (invariant 4).
 */
export interface CountSnapshot {
  /** Counting System name — "Hi-Lo", "KO", "Omega II", "Wong Halves", "Zen Count", "Red 7". */
  readonly system: string;
  readonly runningCount: number;
  /**
   * `null` when there is no True Count to record: an unbalanced system (KO, Red 7) does not
   * convert, and the conversion is undefined with no decks remaining. Never a stand-in 0 —
   * a stored 0 is a real True Count of 0.
   */
  readonly trueCount: number | null;
  readonly decksRemaining: number;
}

/**
 * Player actions the Decision log scores. This is the engine's `Action` plus insurance,
 * which the glossary counts as a Decision but which the engine's `legalActions` does not
 * return because it is not a play on the hand.
 */
export type DecisionAction = Action | "insurance" | "decline-insurance";

export type Verdict = "correct" | "incorrect";

/** The hand state that produced a Decision — enough to re-render it in a replay. */
export interface DecisionHand {
  /** Which of the player's hands this is, after any splits. */
  readonly handIndex: number;
  readonly playerCards: readonly Card[];
  readonly dealerUpcard: Card;
  readonly total: number;
  readonly soft: boolean;
  readonly fromSplit: boolean;
  readonly bet: number;
}

/**
 * One Decision: the unit of scoring and of explanation.
 *
 * `correctAction` is deviation-aware — it is the right play given the Rule Set *and* the
 * count, so an index play that departs from Basic Strategy is scored as the correct answer.
 * `basicStrategyAction` keeps the count-independent play alongside it so an Explanation can
 * show both, and so a missed deviation reads differently from a missed chart cell.
 */
export interface Decision {
  /** Position in the Session's log. A seed plus this index is a complete repro (ADR-0004). */
  readonly index: number;
  /** Which round of the Session this Decision belongs to. */
  readonly roundIndex: number;
  /** Which Shoe of the Session — a Session reshuffles at the cut card and starts a new one. */
  readonly shoeIndex: number;
  /** The Shoe's `dealtCount` when the Decision was taken. The replay anchor. */
  readonly shoeDealtCount: number;
  readonly hand: DecisionHand;
  readonly actionTaken: DecisionAction;
  readonly correctAction: DecisionAction;
  readonly basicStrategyAction: DecisionAction;
  readonly verdict: Verdict;
  readonly count: CountSnapshot;
  /** Epoch milliseconds, supplied by the caller. */
  readonly at: number;
}

/**
 * A count check: the user states the Running Count and the app compares it to the truth.
 *
 * Kept separate from the Decision log because a Decision is a *play*, per the glossary.
 * Counting accuracy is measured here; Basic Strategy accuracy is measured in `decisions`.
 */
export interface CountCheck {
  readonly index: number;
  readonly roundIndex: number;
  readonly shoeIndex: number;
  readonly shoeDealtCount: number;
  /** What the user said the Running Count was. */
  readonly statedRunningCount: number;
  /** What it actually was, per the Session's Counting System. */
  readonly actualRunningCount: number;
  readonly verdict: Verdict;
  readonly at: number;
}

/** How a single player hand finished. `blackjack` is a win, broken out for the payout. */
export type HandOutcome = "win" | "blackjack" | "push" | "loss" | "surrender";

export interface HandResult {
  readonly handIndex: number;
  readonly outcome: HandOutcome;
  readonly busted: boolean;
  readonly bet: number;
  /** Chips won (positive) or lost (negative) on this hand, insurance included. */
  readonly net: number;
  readonly finalTotal: number;
}

/**
 * One completed round. Rounds, not Decisions, carry money and outcomes: a single round can
 * produce several hands through splitting, and a hand can finish with no Decision at all
 * (a natural). Win rate, bust rate, and net result are therefore counted here.
 */
export interface RoundResult {
  readonly index: number;
  readonly shoeIndex: number;
  /** The Shoe's `dealtCount` before the round's first card. */
  readonly shoeStartIndex: number;
  /** The Shoe's `dealtCount` after the round's last card. */
  readonly shoeEndIndex: number;
  readonly hands: readonly HandResult[];
  readonly dealerCards: readonly Card[];
  /** Sum of the hands' `net`. Stored so an export is self-checking. */
  readonly net: number;
  readonly at: number;
}

/**
 * A Shoe used during the Session, recorded by seed.
 *
 * The seed is stored rather than derived so that replay never depends on the derivation
 * function staying the same across versions — the log is self-sufficient (ADR-0004).
 */
export interface ShoeRecord {
  readonly index: number;
  readonly seed: number;
  readonly decks: number;
  readonly cutIndex: number;
  /** Cards dealt from this Shoe by the time it was retired or the Session ended. */
  readonly dealtCount: number;
}

/**
 * A bounded run of Play or Drill, with its own stats and a replayable Decision log.
 *
 * Every field is serializable as-is: what you see here is what lands in AsyncStorage and
 * what an export contains. `endedAt === null` means the Session is still running.
 */
export interface Session {
  readonly id: string;
  readonly mode: SessionMode;
  /** Set only for `mode: "drill"`. */
  readonly drillId: string | null;
  readonly rules: RuleSet;
  /** Counting System name in force for the whole Session. */
  readonly countingSystem: string;
  /** Root seed. Every Shoe seed in `shoes` derives from it, and is also recorded outright. */
  readonly seed: number;
  readonly startedAt: number;
  readonly endedAt: number | null;
  readonly endReason: SessionEndReason | null;
  readonly startingBankroll: number;
  readonly bankroll: number;
  readonly shoes: readonly ShoeRecord[];
  readonly decisions: readonly Decision[];
  readonly countChecks: readonly CountCheck[];
  readonly rounds: readonly RoundResult[];
}
