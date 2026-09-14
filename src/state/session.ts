/**
 * Session lifecycle and the Decision log.
 *
 * Pure and immutable: every function takes a Session and returns a new one, and nothing
 * here reads a clock, generates an id, or touches storage. That is what lets the whole
 * lifecycle be tested in plain Node without mocking AsyncStorage.
 *
 * The rule this module exists to enforce: **a Session ends only when `endSession` is
 * called.** No other function in the codebase may set `endedAt`. Ending is always
 * available, never fails, and never happens as a side effect of anything else — bankroll
 * hitting zero, a Shoe running out, a Drill finishing, or the app backgrounding. ADR-0003
 * records why: the incumbent's most detailed negative review is about game sessions that
 * would not close reliably.
 */

import { type RuleSet, type Shoe, createShoe } from "@/engine";
import type {
  CountCheck,
  Decision,
  HandResult,
  RoundResult,
  Session,
  SessionEndReason,
  SessionMode,
  ShoeRecord,
} from "./types";

export interface StartSessionInput {
  readonly id: string;
  readonly mode: SessionMode;
  readonly rules: RuleSet;
  readonly countingSystem: string;
  /** Root seed for the Session. Every Shoe derives from it (ADR-0004). */
  readonly seed: number;
  readonly startedAt: number;
  readonly startingBankroll: number;
  /** Required for `mode: "drill"`, ignored for Play. */
  readonly drillId?: string;
}

/**
 * Opens a Session. It begins with no Shoe: `openShoe` deals the first one, so the Shoe
 * index recorded on every Decision always points at a real `ShoeRecord`.
 */
export function startSession(input: StartSessionInput): Session {
  return {
    id: input.id,
    mode: input.mode,
    drillId: input.mode === "drill" ? (input.drillId ?? null) : null,
    rules: input.rules,
    countingSystem: input.countingSystem,
    seed: input.seed,
    startedAt: input.startedAt,
    endedAt: null,
    endReason: null,
    startingBankroll: input.startingBankroll,
    bankroll: input.startingBankroll,
    shoes: [],
    decisions: [],
    countChecks: [],
    rounds: [],
  };
}

export function isActive(session: Session): boolean {
  return session.endedAt === null;
}

/**
 * Ends a Session. Explicit, idempotent, and total: it is safe to call from anywhere in the
 * Session — mid-round, mid-hand, with an exhausted Shoe, with a zero bankroll — and it
 * never throws. A second call is a no-op rather than an error, so a double-tapped "End
 * Session" button cannot rewrite a closed record.
 */
export function endSession(
  session: Session,
  reason: SessionEndReason,
  endedAt: number,
): Session {
  if (!isActive(session)) return session;
  return { ...session, endedAt, endReason: reason };
}

/** The Shoe currently in play, or `null` before the first `openShoe`. */
export function currentShoe(session: Session): ShoeRecord | null {
  return session.shoes[session.shoes.length - 1] ?? null;
}

/** The index the next recorded round will take. */
export function nextRoundIndex(session: Session): number {
  return session.rounds.length;
}

/**
 * Derives the seed for the nth Shoe of a Session.
 *
 * A mixing function rather than a counter so that neighbouring Sessions do not produce
 * overlapping Shoes. The result is also written into the `ShoeRecord`, so replay reads the
 * stored seed and never depends on this function staying unchanged.
 */
export function deriveShoeSeed(sessionSeed: number, shoeIndex: number): number {
  let h = (sessionSeed ^ Math.imul(shoeIndex + 1, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export interface OpenShoeResult {
  readonly session: Session;
  readonly shoe: Shoe;
}

/**
 * Starts the next Shoe and returns it alongside the updated Session. Called once at the
 * start of a Session and again after the cut card is reached.
 */
export function openShoe(session: Session, seed?: number): OpenShoeResult {
  assertActive(session, "open a Shoe");

  const index = session.shoes.length;
  const shoeSeed = seed ?? deriveShoeSeed(session.seed, index);
  const shoe = createShoe(session.rules, shoeSeed);
  const record: ShoeRecord = {
    index,
    seed: shoeSeed,
    decks: shoe.decks,
    cutIndex: shoe.cutIndex,
    dealtCount: 0,
  };

  return { session: { ...session, shoes: [...session.shoes, record] }, shoe };
}

/**
 * Records how far the current Shoe has been dealt. Keeping this on the Session means the
 * Shoe Integrity Panel can show remaining composition after a restart without replaying.
 */
export function syncShoeProgress(session: Session, dealtCount: number): Session {
  const shoes = session.shoes.slice();
  const last = shoes[shoes.length - 1];
  if (!last) return session;
  shoes[shoes.length - 1] = { ...last, dealtCount };
  return { ...session, shoes };
}

/** A Decision as the caller supplies it; the log assigns `index`. */
export type DecisionInput = Omit<Decision, "index">;

/**
 * Appends a Decision. The index it receives is its position in the log, which together
 * with the Session seed is a complete, replayable bug report (ADR-0004).
 */
export function recordDecision(session: Session, decision: DecisionInput): Session {
  assertActive(session, "record a Decision");
  const entry: Decision = { ...decision, index: session.decisions.length };
  return {
    ...session,
    decisions: [...session.decisions, entry],
    shoes: withShoeProgress(session.shoes, entry.shoeIndex, entry.shoeDealtCount),
  };
}

export type CountCheckInput = Omit<CountCheck, "index" | "verdict">;

/** Appends a count check. The verdict is derived here so it can never disagree with the numbers. */
export function recordCountCheck(session: Session, check: CountCheckInput): Session {
  assertActive(session, "record a count check");
  const entry: CountCheck = {
    ...check,
    index: session.countChecks.length,
    verdict: check.statedRunningCount === check.actualRunningCount ? "correct" : "incorrect",
  };
  return { ...session, countChecks: [...session.countChecks, entry] };
}

/** A round as the caller supplies it; the log assigns `index` and sums `net`. */
export type RoundInput = Omit<RoundResult, "index" | "net">;

/**
 * Appends a completed round and settles its money against the bankroll.
 *
 * A bankroll of zero is not an ending — invariant 6 requires a one-tap reset in place, so
 * `resetBankroll` handles that case and the Session stays open.
 */
export function recordRound(session: Session, round: RoundInput): Session {
  assertActive(session, "record a round");
  const net = round.hands.reduce((sum, hand) => sum + hand.net, 0);
  const entry: RoundResult = { ...round, index: session.rounds.length, net };

  return {
    ...session,
    rounds: [...session.rounds, entry],
    bankroll: session.bankroll + net,
    shoes: withShoeProgress(session.shoes, entry.shoeIndex, entry.shoeEndIndex),
  };
}

/**
 * Tops the bankroll back up without ending or restarting the Session (invariant 6: never a
 * dead end, and the top-up lives here rather than on a separate website — see ADR-0003).
 */
export function resetBankroll(session: Session, to: number): Session {
  assertActive(session, "reset the bankroll");
  return { ...session, bankroll: to };
}

/** Total hands resolved across every round. Splits make this larger than the round count. */
export function handsPlayed(session: Session): number {
  return session.rounds.reduce((sum, round) => sum + round.hands.length, 0);
}

/** Every hand of the Session, flattened, in the order they were resolved. */
export function allHands(session: Session): readonly HandResult[] {
  return session.rounds.flatMap((round) => round.hands);
}

function withShoeProgress(
  shoes: readonly ShoeRecord[],
  shoeIndex: number,
  dealtCount: number,
): readonly ShoeRecord[] {
  const target = shoes[shoeIndex];
  // A Shoe can only ever move forward; an out-of-order write is a caller bug, not a rewind.
  if (!target || dealtCount <= target.dealtCount) return shoes;
  const next = shoes.slice();
  next[shoeIndex] = { ...target, dealtCount };
  return next;
}

function assertActive(session: Session, attempt: string): void {
  if (isActive(session)) return;
  throw new Error(
    `Cannot ${attempt}: Session ${session.id} ended at ${session.endedAt} ` +
      `(${session.endReason}). Start a new Session instead of reopening a closed one.`,
  );
}
