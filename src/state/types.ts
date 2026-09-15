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

import type { Action, Card, RuleSet, TrueCountRounding } from "@/engine";

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

/**
 * A True Count conversion check: the user is given a Running Count and a shoe remnant, states
 * the True Count, and the app compares it to the conversion under a named rounding mode (#27).
 *
 * Neither a Decision (it is not a play) nor a count check (the Running Count is given, not
 * kept), so it has a log of its own. No Shoe is involved — the question is generated from a
 * seed, not dealt — so it carries no Shoe index and no Shoe position, and claims no cards.
 * Every number the verdict was divided from is stored, so `verifyReplay` can redo the division.
 */
export interface ConversionCheck {
  readonly index: number;
  /** Counting System name the Running Count is kept in. Always a balanced system. */
  readonly system: string;
  /** Decks the shoe was built from. The remnant below is a part of it. */
  readonly decks: number;
  readonly runningCount: number;
  readonly cardsRemaining: number;
  /** `cardsRemaining / 52`, the divisor, stored because showing the division is the proof. */
  readonly decksRemaining: number;
  /** The rounding mode the answer was graded under — "truncate", "floor", "round" or "exact". */
  readonly rounding: TrueCountRounding;
  readonly statedTrueCount: number;
  /** The conversion under `rounding`. */
  readonly actualTrueCount: number;
  readonly verdict: Verdict;
  /**
   * The drill run's seed and the question's position in it. Together with the system, decks
   * and rounding they regenerate the question exactly (`trueCountQuestion` in `src/drills`).
   */
  readonly runSeed: number;
  readonly questionIndex: number;
  readonly at: number;
}

/**
 * An index play: one answer to a Deviation question, graded against the published index at
 * the question's count (#27).
 *
 * **Its cards were placed, not dealt.** A Deviation question puts a hand on the table at a
 * real shoe position whose True Count is the one being drilled; the cards never came off that
 * shoe. A `Decision` asserts that every card it shows was dealt from its Shoe, and
 * `verifyReplay` checks that assertion against the seed — so an index play is deliberately not
 * a Decision, has no Shoe index or round, and is never checked against a Shoe's cards
 * (ADR-0004). What it records instead is where the question came from: the run seed and
 * question index that regenerate it, and the seed and position of the shoe it was cut from.
 */
export interface IndexPlay {
  readonly index: number;
  /** The published entry's id, label and index number — "I18 #1 16 vs 10", 0. */
  readonly entryId: string;
  readonly entryLabel: string;
  readonly indexNumber: number;
  readonly system: string;
  /** `"insurance"` for the insurance index, which has no player hand. */
  readonly kind: "hand" | "insurance";
  /** The player's cards as placed on the table. Empty for insurance. Never dealt. */
  readonly placedCards: readonly Card[];
  /** The dealer's upcard as placed on the table. Never dealt. */
  readonly dealerUpcard: Card;
  readonly runningCount: number;
  readonly cardsRemaining: number;
  readonly rounding: TrueCountRounding;
  /** The rounded True Count the question was posed at. */
  readonly trueCount: number;
  /** True when that count is on the departing side of the index. */
  readonly firing: boolean;
  readonly actionTaken: DecisionAction;
  /** Index-aware: the departure when the index has fired, the chart play when it has not. */
  readonly correctAction: DecisionAction;
  readonly basicStrategyAction: DecisionAction;
  readonly verdict: Verdict;
  /** The drill run's seed and the question's position in it — the question's own repro. */
  readonly runSeed: number;
  readonly questionIndex: number;
  /**
   * The seed of the shoe the question's count was cut from, and the position it was cut at.
   * Both `null` when no position in the shoes tried produced the count and the question was
   * posed with a stated count alone. A position, not a dealt count: nothing was dealt.
   */
  readonly cutShoeSeed: number | null;
  readonly cutPosition: number | null;
  readonly at: number;
}

/**
 * A change of Counting System during a Session (#26).
 *
 * The table lets a user switch systems at any moment, and a system does not change a single
 * card that is dealt — so, unlike a Rule Set change, a switch cannot corrupt replay, and it is
 * recorded rather than deferred. `Session.countingSystem` always names the system in force
 * *now*, and this log says when each one took over.
 */
export interface CountingSystemChange {
  readonly index: number;
  readonly from: string;
  readonly to: string;
  /** The round in progress, or the next one to be dealt — `rounds.length` at the change. */
  readonly roundIndex: number;
  /** The Shoe in play at the change, or `null` when the Session had opened none. */
  readonly shoeIndex: number | null;
  /** That Shoe's `dealtCount` at the change, or `null` with no Shoe. */
  readonly shoeDealtCount: number | null;
  readonly at: number;
  /**
   * `null` for a change recorded as it happened. A version 2 build changed systems without
   * recording the moment, so the 2→3 migration infers each change from the first Decision
   * taken under the new system and names that Decision here: the change happened no later
   * than it, and its position and time are that Decision's.
   */
  readonly inferredFromDecision: number | null;
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
 *
 * Schema version 3 (#26, #27) added `conversionChecks`, `indexPlays` and
 * `countingSystemChanges`, and made `countingSystem` the system in force now rather than the
 * one the Session opened with.
 */
export interface Session {
  readonly id: string;
  readonly mode: SessionMode;
  /** Set only for `mode: "drill"`. */
  readonly drillId: string | null;
  readonly rules: RuleSet;
  /**
   * Counting System name in force *now* — the table's, always. A change mid-Session updates it
   * and appends to `countingSystemChanges`; the system the Session opened with is the first
   * change's `from`, or this field when there has been no change.
   */
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
  /** True Count drill answers. Generated questions: no Shoe, no cards. */
  readonly conversionChecks: readonly ConversionCheck[];
  /** Deviation drill answers. Placed hands: never checked against a Shoe as dealt. */
  readonly indexPlays: readonly IndexPlay[];
  readonly countingSystemChanges: readonly CountingSystemChange[];
}
