/**
 * Running score, and undo.
 *
 * Two things every drill needs, and both of them are places a trainer can quietly lie to
 * the user.
 *
 * **Rates with a zero denominator are `null`, never `0`.** A drill nobody has answered yet
 * has *no* accuracy, not 0% accuracy — the same rule `src/state/stats.ts` follows, and for
 * the same reason: "wrong math" is 21% of the category's low-star reviews, and a fresh
 * screen reading "0% correct" is wrong math on the very first frame.
 *
 * **Undo restores, it does not compensate.** A mis-tap must be undoable without silently
 * breaking a streak. The only way to be sure of that is to put the whole previous state
 * back rather than to subtract a point and hope, so `Undoable` keeps a stack of past
 * states and `undo` pops one. Streaks, per-cell tallies, the shoe, the round in progress
 * and the position in a question sequence all come back exactly, because they are the same
 * objects they were — every drill state in this module is immutable, so a snapshot costs a
 * pointer.
 *
 * An undo is counted, in `undone`. Rewinding is a legitimate part of using a trainer, but
 * it should be visible in the record rather than invisible in the statistics.
 */

import type { Verdict } from "./types";

/** A numerator, a denominator, and the rate — with the raw counts kept so a user can check it. */
export interface ScoreTally {
  readonly attempts: number;
  readonly correct: number;
  readonly incorrect: number;
  /** `correct / attempts`, or `null` when nothing has been attempted. */
  readonly accuracy: number | null;
  /** Consecutive correct answers ending at the most recent one. */
  readonly streak: number;
  /** The longest streak of the run so far. */
  readonly bestStreak: number;
}

export const EMPTY_TALLY: ScoreTally = {
  attempts: 0,
  correct: 0,
  incorrect: 0,
  accuracy: null,
  streak: 0,
  bestStreak: 0,
};

/** Adds one verdict to a tally. Pure; the tally handed in is untouched. */
export function recordVerdict(tally: ScoreTally, verdict: Verdict): ScoreTally {
  const correct = tally.correct + (verdict === "correct" ? 1 : 0);
  const incorrect = tally.incorrect + (verdict === "incorrect" ? 1 : 0);
  const attempts = tally.attempts + 1;
  const streak = verdict === "correct" ? tally.streak + 1 : 0;

  return {
    attempts,
    correct,
    incorrect,
    accuracy: rate(correct, attempts),
    streak,
    bestStreak: Math.max(tally.bestStreak, streak),
  };
}

/** A rate, or `null` when its denominator is zero. Never `0` for "nothing yet". */
export function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

/**
 * How many past states an `Undoable` keeps. Deep enough that a user rewinding a run of
 * mis-taps never hits the floor, bounded so a long session cannot grow without limit.
 */
export const DEFAULT_UNDO_DEPTH = 250;

/**
 * A value with its history, so a step can be taken back exactly.
 *
 * Every drill in this module is `Undoable<ItsOwnState>`, which means one `undo` serves all
 * four of them and no drill can get its own rewind subtly wrong.
 */
export interface Undoable<S> {
  readonly current: S;
  /** Previous states, oldest first. The last entry is the state before the last step. */
  readonly past: readonly S[];
  /** How many steps have been taken back over the life of this run. Reported, not hidden. */
  readonly undone: number;
  readonly depth: number;
}

export function beginUndoable<S>(initial: S, depth: number = DEFAULT_UNDO_DEPTH): Undoable<S> {
  if (!Number.isInteger(depth) || depth < 1) {
    throw new Error(`Undo depth must be a positive integer, got ${depth}.`);
  }
  return { current: initial, past: [], undone: 0, depth };
}

/** Moves to a new state, remembering the old one. */
export function step<S>(undoable: Undoable<S>, next: S): Undoable<S> {
  const past = [...undoable.past, undoable.current];
  return {
    ...undoable,
    current: next,
    past: past.length > undoable.depth ? past.slice(past.length - undoable.depth) : past,
  };
}

export function canUndo<S>(undoable: Undoable<S>): boolean {
  return undoable.past.length > 0;
}

/**
 * Takes the last step back. A no-op when there is nothing to undo, rather than an error:
 * a double-tapped undo button must not throw in the user's face.
 */
export function undo<S>(undoable: Undoable<S>): Undoable<S> {
  const previous = undoable.past[undoable.past.length - 1];
  if (previous === undefined) return undoable;
  return {
    ...undoable,
    current: previous,
    past: undoable.past.slice(0, -1),
    undone: undoable.undone + 1,
  };
}

/**
 * Replaces the current state without recording a step.
 *
 * For changes that are not answers and must not become undo points — revealing the count,
 * advancing the clock, dealing the next card. Undo takes back a *decision*, and a user who
 * taps it expects the last thing they were graded on to come back, not the last thing that
 * happened to move.
 */
export function replace<S>(undoable: Undoable<S>, next: S): Undoable<S> {
  return { ...undoable, current: next };
}
