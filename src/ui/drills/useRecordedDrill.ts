/**
 * A drill run that records into a Session: the configured Rule Set, the open Session, undo.
 *
 * All four drills produce records a Session can hold — Decisions and rounds, count checks,
 * conversion checks, index plays (#27) — and all four face the same three questions the Play
 * table answers in `usePlaySession`:
 *
 *  1. **Which table?** The configured Rule Set (#19) — except that a Session records one table
 *     for its whole length, so a run that is recording keeps its Session's table, and a table
 *     changed on the Rule Set screen waits, *said out loud*, until the user takes it up with a
 *     button. A run that has recorded nothing takes it up at once, because nothing objects.
 *  2. **Which Session?** The drill's open one, if it can take this run's records, so a drill
 *     picks its record back up after navigation or a restart. A Session ends only when the user
 *     presses "End session" (ADR-0003); nothing here ends one as a side effect.
 *  3. **Undo.** The drill and its records are undone together (`RecordedRun`), and the Session
 *     is derived from what survives, so a mis-tap taken back leaves no trace in the statistics.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  COUNTING_SYSTEMS,
  type CountingSystem,
  DEFAULT_COUNTING_SYSTEM,
} from "@/engine/counting";
import type { RuleSet } from "@/engine/rules";
import type { Session } from "@/state";
import { type Undoable, canUndo } from "@/drills/progress";
import type { DrillId } from "@/drills/types";
import { sameRules } from "@/ui/rules/presets";
import { useConfiguredRules } from "@/ui/rules/rulesStore";
import {
  type DrillSessionMeta,
  type RecordedRun,
  beginRun,
  drillSessionFrom,
  systemChangeRecord,
  undoRun,
} from "./drillRecorder";
import {
  discardDrillSession,
  endDrillSession,
  saveDrillSession,
  useDrillSessions,
} from "./drillSessionStore";

export interface RunConfig {
  readonly rules: RuleSet;
  readonly system: CountingSystem;
  readonly seed: number;
}

interface RunState<S> {
  /** `null` when `start` declined this configuration — see `RecordedDrillOptions.start`. */
  readonly run: RecordedRun<S> | null;
  readonly config: RunConfig;
  /** The Session this run adds to — a resumed open one, or `null` until the first record. */
  readonly base: Session | null;
  readonly meta: DrillSessionMeta;
}

export interface RecordedDrill<S> {
  /** False until the configured Rule Set and the stored drill Sessions have both answered. */
  readonly ready: boolean;
  readonly run: RecordedRun<S> | null;
  readonly config: RunConfig | null;
  /** The Session this run is recording into, as it stands. `null` before the first answer. */
  readonly session: Session | null;
  /** The Session the user most recently ended here, kept on screen for its summary. */
  readonly ended: Session | null;
  /** A configured table this run has not taken up, because its Session is on another one. */
  readonly pendingRules: RuleSet | null;
  readonly storageError: string | null;
  readonly canUndo: boolean;

  /** Applies a transition to the run. Transitions are pure, so this is safe to call repeatedly. */
  readonly update: (transition: (run: RecordedRun<S>) => RecordedRun<S>) => void;
  readonly undo: () => void;
  /** Closes the open Session (keeping it) and starts a fresh run at the configured table. */
  readonly endSession: () => void;
  /** Starts a new run with another system. Closes the Session first when the system binds it. */
  readonly changeSystem: (system: CountingSystem) => void;
  /** Takes up the configured table, closing the Session that holds the old one. */
  readonly takeUpRules: () => void;
  /** Starts the run again on the same table and system — the Session carries on. */
  readonly restart: () => void;
}

export interface RecordedDrillOptions<S> {
  readonly drillId: DrillId;
  /**
   * Opens the drill at a configuration, or returns `null` when the drill declines it — the True
   * Count drill for an unbalanced system, the Deviation drill for a table no index applies at.
   * A declined run records nothing, and the Session it would have added to is left as it was.
   */
  readonly start: (config: RunConfig) => Undoable<S> | null;
  /**
   * True when a Session's records do not name their Counting System — a count check does not —
   * so a system change needs a Session of its own.
   */
  readonly systemBindsSession: boolean;
  readonly startingBankroll: number;
}

export function useRecordedDrill<S>(options: RecordedDrillOptions<S>): RecordedDrill<S> {
  const { drillId, systemBindsSession, startingBankroll } = options;
  const startRef = useRef(options.start);
  startRef.current = options.start;

  const [state, setState] = useState<RunState<S> | null>(null);
  const [ended, setEnded] = useState<Session | null>(null);

  // Only the slices this hook shows or decides on, so saving an answer — which publishes the
  // store when the Session is handed over and again when the write lands — renders nothing more.
  const configured = useConfiguredRules();
  const status = useDrillSessions((sessions) => sessions.status);
  const storageError = useDrillSessions((sessions) => sessions.error);
  // The open Session matters only until the first run picks it up. After that it is this run's
  // own Session coming back from every save, so it is no longer read.
  const unstarted = state === null;
  const open = useDrillSessions((sessions) => (unstarted ? (sessions.open[drillId] ?? null) : null));
  const storesReady = configured.ready && (status === "ready" || status === "failed");

  const newState = useCallback(
    (config: RunConfig, base: Session | null): RunState<S> => {
      const drill = startRef.current(config);
      // A run that carries a Session on under another system starts by saying so (#26), so the
      // Session never names a system the drill is not showing. A declined run records nothing.
      const change = drill ? systemChangeRecord(base, config.system.name, Date.now()) : null;
      return {
        run: drill ? beginRun(drill, change ? [change] : []) : null,
        config,
        base,
        meta: {
          id: base?.id ?? newSessionId(),
          drillId,
          rules: config.rules,
          countingSystem: config.system.name,
          seed: config.seed,
          startingBankroll,
        },
      };
    },
    [drillId, startingBankroll],
  );

  // First run: pick the open Session back up, at its own table, or start at the configured one.
  useEffect(() => {
    if (!storesReady || state !== null) return;
    if (open) {
      setState(newState({ rules: open.rules, system: systemNamed(open), seed: freshSeed() }, open));
    } else {
      setState(newState({ rules: configured.rules, system: DEFAULT_COUNTING_SYSTEM, seed: freshSeed() }, null));
    }
  }, [storesReady, state, open, configured.rules, newState]);

  // Derived from the records alone — not from the whole run — so the clock ticking a Counting
  // drill forward, which replaces the drill but not its records, derives and writes nothing.
  // A declined run has no records, and its Session is the one it would have added to, untouched.
  const records = state?.run?.log.current ?? null;
  const base = state?.base ?? null;
  const meta = state?.meta ?? null;
  const session = useMemo(
    () => (meta && records ? drillSessionFrom(base, meta, records) : base),
    [base, meta, records],
  );

  // Persist whenever the derived Session changes identity.
  const saved = useRef<{ id: string; session: Session } | null>(null);
  const metaId = meta?.id ?? null;
  useEffect(() => {
    if (metaId === null) return;
    if (session && session !== base) {
      if (saved.current?.session !== session) {
        saveDrillSession(drillId, session);
        saved.current = { id: session.id, session };
      }
    } else if (!session && saved.current?.id === metaId) {
      discardDrillSession(drillId, metaId);
      saved.current = null;
    }
  }, [session, base, metaId, drillId]);

  const hasRecords = (state?.run?.log.current.length ?? 0) > 0;
  const rulesDiffer = state !== null && configured.ready && !sameRules(state.config.rules, configured.rules);

  // A run that has recorded nothing takes a new table up immediately: nothing is in the way.
  useEffect(() => {
    if (!state || !rulesDiffer || session !== null || hasRecords) return;
    setState(newState({ ...state.config, rules: configured.rules, seed: freshSeed() }, null));
  }, [state, rulesDiffer, session, hasRecords, configured.rules, newState]);

  const update = useCallback((transition: (run: RecordedRun<S>) => RecordedRun<S>) => {
    setState((current) =>
      current?.run ? { ...current, run: transition(current.run) } : current,
    );
  }, []);

  const undo = useCallback(() => {
    setState((current) => (current?.run ? { ...current, run: undoRun(current.run) } : current));
  }, []);

  const close = useCallback((): void => {
    if (session) setEnded(endDrillSession(drillId, session));
    saved.current = null;
  }, [session, drillId]);

  const endCurrent = useCallback(() => {
    if (!state) return;
    close();
    setState(newState({ ...state.config, rules: configured.rules, seed: freshSeed() }, null));
  }, [state, close, newState, configured.rules]);

  const changeSystem = useCallback(
    (system: CountingSystem) => {
      if (!state || system.id === state.config.system.id) return;
      if (systemBindsSession) {
        close();
        const rules = session ? configured.rules : state.config.rules;
        setState(newState({ rules, system, seed: freshSeed() }, null));
        return;
      }
      // The records name their own system, so the Session carries on under the new one.
      setState(newState({ ...state.config, system, seed: freshSeed() }, session));
    },
    [state, systemBindsSession, close, session, configured.rules, newState],
  );

  const takeUpRules = useCallback(() => {
    if (!state) return;
    close();
    setState(newState({ ...state.config, rules: configured.rules, seed: freshSeed() }, null));
  }, [state, close, newState, configured.rules]);

  const restart = useCallback(() => {
    if (!state) return;
    setState(newState({ ...state.config, seed: freshSeed() }, session));
  }, [state, session, newState]);

  return {
    ready: state !== null,
    run: state?.run ?? null,
    config: state?.config ?? null,
    session,
    ended,
    pendingRules: rulesDiffer && (session !== null || hasRecords) ? configured.rules : null,
    storageError,
    canUndo: state?.run ? canUndo(state.run.drill) : false,
    update,
    undo,
    endSession: endCurrent,
    changeSystem,
    takeUpRules,
    restart,
  };
}

/** The system a Session is recording in — always its own field since schema version 3 (#26). */
function systemNamed(session: Session): CountingSystem {
  const name = session.countingSystem;
  return COUNTING_SYSTEMS.find((system) => system.name === name) ?? DEFAULT_COUNTING_SYSTEM;
}

/**
 * `Math.random()` is banned in `src/engine` so a Shoe stays reproducible (ADR-0004). Here it
 * only picks *which* reproducible Shoe to deal, and the seed is recorded on the Session.
 */
export function freshSeed(): number {
  return (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
}

function newSessionId(): string {
  return `drill-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(36)}`;
}
