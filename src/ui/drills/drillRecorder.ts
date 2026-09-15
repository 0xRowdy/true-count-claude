/**
 * The seam between a running drill and the Session it is recorded in.
 *
 * `src/drills` is UI-free and `src/state` owns the log; this module is the pure function
 * composition between them, exactly as `src/ui/session/sessionRecorder.ts` is for the Play
 * table. It reads no clock, generates no id and touches no storage — the screen supplies
 * those, and `drillSessionStore.ts` does the writing.
 *
 * Three decisions here are load-bearing.
 *
 * **A drill Session is derived from the run, not appended to as the run goes.** The engine's
 * undo restores whole state (`Undoable<S>`), so a withdrawn answer must leave no trace — and a
 * log that had already been appended to could not take one back, because `src/state`'s log is
 * append-only by design. So the screen keeps the records of *this run* alongside the drill,
 * undoes both together, and the Session is `base + fold(records)` recomputed from whatever
 * survives. A mis-tap taken back is a mis-tap that was never recorded.
 *
 * **A round's Decisions are held back until the round settles**, for the reason `sessionRecorder`
 * gives: a Decision whose round never finished would carry the next round's index and make
 * `verifyReplay` check the wrong cards. The fold buffers them and flushes on the round record.
 *
 * **A drill Session never becomes the "active" Session.** The repository's active pointer is
 * what the Play table resumes from after a restart, and a drill Session resumed onto the felt
 * would deal rounds into a log whose Shoes belong to a drill. `withoutActivePointer` keeps drill
 * Sessions out of that pointer entirely: they are saved, listed, exported and counted in the
 * lifetime statistics like any other Session, and the Play table never picks one up.
 */

import type { RoundState } from "@/engine/round";
import { type RuleSet } from "@/engine/rules";
import {
  type ConversionCheckInput,
  type CountCheckInput,
  type DecisionInput,
  type IndexPlayInput,
  type RoundInput,
  type Session,
  DEFAULT_KEY_PREFIX,
  type KeyValueStore,
  changeCountingSystem,
  currentShoe as currentSessionShoe,
  isActive,
  openShoe,
  recordConversionCheck,
  recordCountCheck,
  recordDecision,
  recordIndexPlay,
  recordRound,
  startSession,
  syncShoeProgress,
} from "@/state";
import type { BasicStrategyDrillState } from "@/drills/basicStrategy";
import type { CountCheckResult, CountingDrillState } from "@/drills/counting";
import type { DeviationDrillState, DeviationResult } from "@/drills/deviation";
import type { TrueCountDrillState, TrueCountResult } from "@/drills/trueCount";
import {
  type Undoable,
  beginUndoable,
  step as stepUndoable,
  replace as replaceUndoable,
  undo as undoUndoable,
} from "@/drills/progress";
import {
  toConversionCheckInput,
  toCountCheckInput,
  toDecisionInput,
  toIndexPlayInput,
  toRoundInput,
} from "@/drills/records";
import type { DrillDecisionResult } from "@/drills/scoring";
import type { DrillId } from "@/drills/types";
import { sameRules } from "@/ui/rules/presets";

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

/**
 * One thing that happened in a run, reduced to what a Session needs.
 *
 * The Shoe is carried by seed rather than by index: a run's position in the Session's Shoe
 * list is not known until the records are folded onto whatever the Session already held
 * (a resumed Session has Shoes of its own). `roundIndex` and `shoeIndex` inside the inputs
 * are placeholders, filled in by the fold.
 */
export type DrillRecord =
  | { readonly kind: "decision"; readonly shoeSeed: number; readonly input: DecisionInput }
  | { readonly kind: "round"; readonly shoeSeed: number; readonly input: RoundInput }
  | { readonly kind: "count-check"; readonly shoeSeed: number; readonly input: CountCheckInput }
  // The two below name no Shoe, on purpose: a conversion question is generated rather than
  // dealt, and a Deviation hand is placed at a shoe position rather than dealt from it. Neither
  // opens a Shoe on the Session, so neither claims a card came off one (ADR-0004).
  | { readonly kind: "conversion-check"; readonly input: ConversionCheckInput }
  | { readonly kind: "index-play"; readonly input: IndexPlayInput }
  /** A run that carries on its Session under another Counting System (#26). */
  | { readonly kind: "system-change"; readonly input: { readonly to: string; readonly at: number } };

const PLACEHOLDER = { roundIndex: 0, shoeIndex: 0 };

export function decisionRecord(
  result: DrillDecisionResult,
  shoe: { readonly seed: number; readonly dealtCount: number },
): DrillRecord {
  return {
    kind: "decision",
    shoeSeed: shoe.seed,
    input: toDecisionInput(result, { ...PLACEHOLDER, shoeDealtCount: shoe.dealtCount }),
  };
}

export function roundRecord(
  round: RoundState,
  options: { readonly shoeSeed: number; readonly shoeStartIndex: number; readonly at: number },
): DrillRecord {
  return {
    kind: "round",
    shoeSeed: options.shoeSeed,
    input: toRoundInput(round, {
      shoeIndex: PLACEHOLDER.shoeIndex,
      shoeStartIndex: options.shoeStartIndex,
      at: options.at,
    }),
  };
}

export function countCheckRecord(
  result: CountCheckResult,
  shoe: { readonly seed: number; readonly dealtCount: number },
): DrillRecord {
  return {
    kind: "count-check",
    shoeSeed: shoe.seed,
    input: toCountCheckInput(result, { ...PLACEHOLDER, shoeDealtCount: shoe.dealtCount }),
  };
}

export function conversionCheckRecord(result: TrueCountResult, runSeed: number): DrillRecord {
  return { kind: "conversion-check", input: toConversionCheckInput(result, runSeed) };
}

export function indexPlayRecord(result: DeviationResult, runSeed: number): DrillRecord {
  return { kind: "index-play", input: toIndexPlayInput(result, runSeed) };
}

/**
 * The first record of a run that carries an open Session on under another Counting System.
 *
 * `null` when there is nothing to record: no Session to carry on, or no change of system. It
 * sits at the bottom of the new run's log, below every undo point, so taking back every answer
 * of the run still leaves the Session in the system the drill is now showing.
 */
export function systemChangeRecord(
  session: Session | null,
  system: string,
  at: number,
): DrillRecord | null {
  if (!session || session.countingSystem === system) return null;
  return { kind: "system-change", input: { to: system, at } };
}

/** When a record happened. Used only to date a Session that opens on its first record. */
export function recordedAt(record: DrillRecord): number {
  return record.input.at;
}

// ---------------------------------------------------------------------------
// The records a drill transition produces
// ---------------------------------------------------------------------------

/**
 * What the Basic Strategy drill just did, as records.
 *
 * Takes the state either side of the transition, because both are needed and neither alone is
 * enough: the Shoe position a Decision was taken at is the one it was *taken* at, and the round
 * it belongs to is only settled afterwards.
 */
export function basicStrategyRecords(
  before: BasicStrategyDrillState,
  after: BasicStrategyDrillState,
): readonly DrillRecord[] {
  const records: DrillRecord[] = [];
  const result = after.lastResult;
  const beforeRound = before.round;

  if (result && beforeRound) {
    records.push(decisionRecord(result, beforeRound.shoe));
  }

  const round = after.round;
  if (round && round.phase === "settled" && round.settlement) {
    records.push(
      roundRecord(round, {
        shoeSeed: round.shoe.seed,
        // `state.shoe` is the between-rounds Shoe: where this round's first card came from.
        shoeStartIndex: after.shoe.dealtCount,
        at: result?.at ?? 0,
      }),
    );
  }

  return records;
}

/**
 * A round that settled on the deal — a natural, or a dealer blackjack — with no Decision in it.
 *
 * Recorded so the Session's hands, win rate and net result cover every hand the drill dealt.
 * A hand can finish with no Decision at all, which is precisely why `src/state` counts money
 * per round rather than per Decision.
 */
export function dealtRoundRecords(after: BasicStrategyDrillState, at: number): readonly DrillRecord[] {
  const round = after.round;
  if (!round || round.phase !== "settled" || !round.settlement) return [];
  return [
    roundRecord(round, { shoeSeed: round.shoe.seed, shoeStartIndex: after.shoe.dealtCount, at }),
  ];
}

/** What the Counting drill just did, as records. */
export function countingRecords(
  before: CountingDrillState,
  after: CountingDrillState,
): readonly DrillRecord[] {
  const result = after.lastResult;
  if (!result || result === before.lastResult) return [];
  return [countCheckRecord(result, before.shoe)];
}

/** What the True Count drill just did, as records: one conversion check per graded answer. */
export function trueCountRecords(
  before: TrueCountDrillState,
  after: TrueCountDrillState,
): readonly DrillRecord[] {
  const result = after.lastResult;
  if (!result || result === before.lastResult) return [];
  return [conversionCheckRecord(result, after.seed)];
}

/** What the Deviation drill just did, as records: one index play per graded answer. */
export function deviationRecords(
  before: DeviationDrillState,
  after: DeviationDrillState,
): readonly DrillRecord[] {
  const result = after.lastResult;
  if (!result || result === before.lastResult) return [];
  return [indexPlayRecord(result, after.seed)];
}

// ---------------------------------------------------------------------------
// Folding records onto a Session
// ---------------------------------------------------------------------------

export interface DrillSessionMeta {
  readonly id: string;
  readonly drillId: DrillId;
  readonly rules: RuleSet;
  /** The Counting System's published name, as `Session.countingSystem` stores it. */
  readonly countingSystem: string;
  readonly seed: number;
  readonly startingBankroll: number;
}

/**
 * The Session a run amounts to: what it started from, plus everything it has recorded since.
 *
 * `null` when there is nothing to record yet — a run with no answers has no Session, in the
 * same spirit as a Play Session opening on the first deal rather than at mount, so simply
 * opening a drill screen and walking away leaves nothing behind.
 */
export function drillSessionFrom(
  base: Session | null,
  meta: DrillSessionMeta,
  records: readonly DrillRecord[],
): Session | null {
  if (records.length === 0) return base;
  const first = records[0] as DrillRecord;

  const start =
    base ??
    startSession({
      id: meta.id,
      mode: "drill",
      drillId: meta.drillId,
      rules: meta.rules,
      countingSystem: meta.countingSystem,
      seed: meta.seed,
      startedAt: recordedAt(first),
      startingBankroll: meta.startingBankroll,
    });

  const session = applyRecords(start, records);
  return base === null && isEmptyLog(session) ? null : session;
}

function isEmptyLog(session: Session): boolean {
  return (
    session.decisions.length === 0 &&
    session.countChecks.length === 0 &&
    session.rounds.length === 0 &&
    session.conversionChecks.length === 0 &&
    session.indexPlays.length === 0
  );
}

/**
 * Folds a run's records onto a Session, opening a Shoe whenever the run moves to a new one and
 * flushing a round's buffered Decisions when the round itself arrives. Records that name no
 * Shoe — conversion checks, index plays, system changes — open none.
 */
export function applyRecords(session: Session, records: readonly DrillRecord[]): Session {
  let current = session;
  let pending: DecisionInput[] = [];

  const onShoe = (seed: number): number => {
    current = withShoe(current, seed);
    return Math.max(0, current.shoes.length - 1);
  };

  for (const record of records) {
    switch (record.kind) {
      case "decision":
        pending.push({ ...record.input, shoeIndex: onShoe(record.shoeSeed) });
        break;
      case "round": {
        const shoeIndex = onShoe(record.shoeSeed);
        const roundIndex = current.rounds.length;
        for (const decision of pending) {
          current = recordDecision(current, { ...decision, roundIndex });
        }
        pending = [];
        current = recordRound(current, { ...record.input, shoeIndex });
        break;
      }
      case "count-check": {
        // Opened first: `onShoe` replaces `current`, so it must not run inside the call below.
        const shoeIndex = onShoe(record.shoeSeed);
        current = recordCountCheck(current, {
          ...record.input,
          shoeIndex,
          roundIndex: current.rounds.length,
        });
        current = syncShoeProgress(current, record.input.shoeDealtCount);
        break;
      }
      case "conversion-check":
        current = recordConversionCheck(current, record.input);
        break;
      case "index-play":
        current = recordIndexPlay(current, record.input);
        break;
      case "system-change":
        current = changeCountingSystem(current, record.input);
        break;
    }
  }

  // Decisions of a round still being played are deliberately dropped: they are recorded the
  // moment the round settles, and never before.
  return current;
}

function withShoe(session: Session, seed: number): Session {
  const recorded = currentSessionShoe(session);
  if (recorded && recorded.seed === seed) return session;
  return openShoe(session, seed).session;
}

/**
 * Whether an open Session can take this run's records.
 *
 * A Session records one table for its whole length, and its Shoes are rebuilt from
 * `session.rules` — so a run at a different Rule Set needs a Session of its own. The Counting
 * System matters for a drill whose records do not carry one: a count check stores the stated
 * and actual Running Counts and nothing about the system they were kept in.
 */
export function sessionAccepts(
  session: Session,
  rules: RuleSet,
  countingSystem?: string,
): boolean {
  if (!isActive(session)) return false;
  if (!sameRules(session.rules, rules)) return false;
  return countingSystem === undefined || session.countingSystem === countingSystem;
}

// ---------------------------------------------------------------------------
// A run: a drill and its records, undone together
// ---------------------------------------------------------------------------

/**
 * A drill alongside the records it has produced, each in its own undo stack.
 *
 * The two move in lockstep — a step on one is a step on the other — so `undo` takes back the
 * answer *and* its record. Keeping them as two `Undoable`s rather than one object lets the
 * engine's own transitions stay untouched: they take and return `Undoable<DrillState>`.
 */
export interface RecordedRun<S> {
  readonly drill: Undoable<S>;
  readonly log: Undoable<readonly DrillRecord[]>;
}

/**
 * Starts a run. `records` seed the bottom of its log — below every undo point, so no undo can
 * take them back. The one use is a `systemChangeRecord` for a run that carries its Session on.
 */
export function beginRun<S>(drill: Undoable<S>, records: readonly DrillRecord[] = []): RecordedRun<S> {
  return { drill, log: beginUndoable<readonly DrillRecord[]>(records) };
}

/** An answer: an undo point on both stacks. */
export function stepRun<S>(
  run: RecordedRun<S>,
  drill: Undoable<S>,
  records: readonly DrillRecord[],
): RecordedRun<S> {
  return { drill, log: stepUndoable(run.log, [...run.log.current, ...records]) };
}

/** Anything that is not an answer — dealing, advancing the clock, moving to the next question. */
export function replaceRun<S>(
  run: RecordedRun<S>,
  drill: Undoable<S>,
  records: readonly DrillRecord[] = [],
): RecordedRun<S> {
  return {
    drill,
    log:
      records.length === 0
        ? run.log
        : replaceUndoable(run.log, [...run.log.current, ...records]),
  };
}

export function undoRun<S>(run: RecordedRun<S>): RecordedRun<S> {
  return { drill: undoUndoable(run.drill), log: undoUndoable(run.log) };
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/**
 * The same store with the repository's active-Session pointer made unwritable.
 *
 * The pointer is what the Play table resumes after a restart. A drill Session must never be
 * that — the Play table would rebuild a felt from a Shoe list belonging to a Counting drill —
 * so drill Sessions are written and read like any other Session and simply never claim it.
 * Reads pass through untouched, so nothing here can hide a Play Session either.
 */
export function withoutActivePointer(
  store: KeyValueStore,
  keyPrefix: string = DEFAULT_KEY_PREFIX,
): KeyValueStore {
  const activeKey = `${keyPrefix}/active`;
  return {
    getItem: (key) => store.getItem(key),
    getAllKeys: () => store.getAllKeys(),
    setItem: (key, value) => (key === activeKey ? Promise.resolve() : store.setItem(key, value)),
    removeItem: (key) => (key === activeKey ? Promise.resolve() : store.removeItem(key)),
  };
}

export type OpenDrillSessions = Partial<Record<DrillId, Session>>;

/**
 * The still-open Session for each drill, newest first, out of everything stored.
 *
 * A drill Session stays open across navigation and restarts — only the user's "End session"
 * closes one (ADR-0003) — so this is how a run picks its record back up.
 */
export function openDrillSessions(sessions: readonly Session[]): OpenDrillSessions {
  const open: OpenDrillSessions = {};
  const newestFirst = [...sessions].sort((a, b) => b.startedAt - a.startedAt);
  for (const session of newestFirst) {
    if (session.mode !== "drill" || !isActive(session)) continue;
    const id = session.drillId as DrillId | null;
    if (!id || open[id]) continue;
    open[id] = session;
  }
  return open;
}
