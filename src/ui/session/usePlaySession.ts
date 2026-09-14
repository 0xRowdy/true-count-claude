/**
 * The Play table's recording controller.
 *
 * Every transition the table offers is wrapped here exactly once, so recording cannot be
 * forgotten at a call site: the screen calls `play.deal()` rather than `update(dealRound)`,
 * and the Session is updated in the same breath. `usePlayTable` did not have to change shape
 * to allow this — its transitions are pure functions of the previous table, so the
 * controller can apply one, observe the result, and hand the same object to React.
 *
 * What ends a Session: `end()`, and nothing else. Running out of chips does not, a reshuffle
 * does not, navigating away does not, and closing the app does not (ADR-0003, and
 * `src/state/session.test.ts` asserts the first two). That is the whole point of #10.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { CountingSystemId } from "@/engine/counting";
import type { Action } from "@/engine/hand";
import { createShoe } from "@/engine/shoe";
import {
  type Session,
  type SessionEndReason,
  type SessionStats,
  computeStats,
  isActive,
  rebuildShoe,
  resetBankroll as resetSessionBankroll,
  currentShoe as currentSessionShoe,
} from "@/state";
import {
  type PlayTable,
  type PlayTableController,
  chooseBet,
  chooseSystem,
  createPlayTable,
  dealRound,
  nextRound,
  playAction,
  resetBankroll as resetTableBankroll,
  restorePlayTable,
  shuffleShoe,
  takeInsurance,
} from "@/ui/table/usePlayTable";
import {
  type PendingRound,
  beginSession,
  closeRound,
  observeDecision,
  openRound,
  sessionCountingSystem,
} from "./sessionRecorder";
import { EMPTY_SESSION } from "./sessionFormat";
import {
  type SessionStatus,
  clearSession,
  currentSession,
  endCurrentSession,
  loadActiveSession,
  putSession,
  useSessionState,
} from "./sessionStore";

export interface PlaySession {
  readonly status: SessionStatus;
  readonly session: Session | null;
  readonly stats: SessionStats;
  /** True while a Session is open and recording. */
  readonly recording: boolean;
  /** Set once an explicitly ended Session is still on screen, waiting to be replaced. */
  readonly ended: Session | null;
  readonly error: string | null;

  readonly deal: () => void;
  readonly act: (action: Action) => void;
  readonly insurance: (take: boolean) => void;
  readonly next: () => void;
  readonly shuffle: () => void;
  readonly setBet: (amount: number) => void;
  readonly setSystem: (id: CountingSystemId) => void;
  readonly resetBankroll: () => void;
  /** The explicit end. One tap, available wherever this controller is. */
  readonly end: (reason?: SessionEndReason) => void;
  /** Clears the ended Session off the screen and readies a fresh table. Never a dead end. */
  readonly startNew: () => void;
}

export function usePlaySession(controller: PlayTableController): PlaySession {
  const { table, update } = controller;
  const store = useSessionState();
  const pending = useRef<PendingRound | null>(null);
  const restored = useRef(false);

  useEffect(() => {
    loadActiveSession();
  }, []);

  // One restore, on the first load that finds an unfinished Session. The table is rebuilt
  // between rounds, where the log left it.
  useEffect(() => {
    if (restored.current || store.status !== "ready") return;
    restored.current = true;
    const session = store.session;
    if (session && isActive(session)) update(() => tableFromSession(session));
  }, [store.status, store.session, update]);

  /** Applies a table transition and returns the result, so the recorder can observe it. */
  const advance = useCallback(
    (transition: (current: PlayTable) => PlayTable): PlayTable => {
      const next = transition(table);
      update(() => next);
      return next;
    },
    [table, update],
  );

  /** Closes the round on the Session the moment it settles — cards still on the table. */
  const settleIfDone = useCallback((next: PlayTable, at: number) => {
    const round = next.round;
    const buffered = pending.current;
    const session = currentSession();
    if (!round || round.phase !== "settled" || !buffered || !session || !isActive(session)) return;
    pending.current = null;
    putSession(closeRound(session, buffered, next, at));
  }, []);

  const deal = useCallback(() => {
    const at = Date.now();
    // Dealing settles the question of which table this is, so a restore that is still in
    // flight must not arrive later and rebuild the table underneath the hand.
    restored.current = true;
    const existing = currentSession();
    const session =
      existing && isActive(existing)
        ? existing
        : beginSession({ table, id: newSessionId(at), startedAt: at });

    const opened = openRound(session, table);
    pending.current = opened.pending;
    // A Session that gained nothing is not rewritten; a new one always has, so its first
    // write is also what sets the repository's active pointer.
    if (opened.session !== existing) putSession(opened.session);

    settleIfDone(advance(dealRound), at);
  }, [table, advance, settleIfDone]);

  const act = useCallback(
    (action: Action) => {
      const at = Date.now();
      if (pending.current) {
        pending.current = observeDecision(pending.current, table, { kind: "play", action }, at);
      }
      settleIfDone(advance((current) => playAction(current, action)), at);
    },
    [table, advance, settleIfDone],
  );

  const insurance = useCallback(
    (take: boolean) => {
      const at = Date.now();
      if (pending.current) {
        pending.current = observeDecision(pending.current, table, { kind: "insurance", take }, at);
      }
      settleIfDone(advance((current) => takeInsurance(current, take)), at);
    },
    [table, advance, settleIfDone],
  );

  // The round was recorded when it settled, so moving on is a table-only transition. A
  // reshuffle here changes which Shoe the *next* round is dealt from, and `openRound` picks
  // that up by seed — a reshuffle has never ended a Session and does not start one either.
  const next = useCallback(() => advance(nextRound), [advance]);
  const shuffle = useCallback(() => advance(shuffleShoe), [advance]);
  const setBet = useCallback(
    (amount: number) => advance((current) => chooseBet(current, amount)),
    [advance],
  );
  const setSystem = useCallback(
    (id: CountingSystemId) => advance((current) => chooseSystem(current, id)),
    [advance],
  );

  /**
   * Invariant 6: the top-up happens in place and the Session stays open. The chips that were
   * lost stay in `netResult`, because a ruin is the most instructive thing in the log.
   */
  const resetBankroll = useCallback(() => {
    const next = advance(resetTableBankroll);
    const session = currentSession();
    if (session && isActive(session)) putSession(resetSessionBankroll(session, next.bankroll));
  }, [advance]);

  const end = useCallback((reason: SessionEndReason = "user") => {
    // A round in flight is discarded rather than half-recorded: it never settled, so it has
    // no result, and a Decision without its round would break the replay check.
    pending.current = null;
    endCurrentSession(reason);
  }, []);

  const startNew = useCallback(() => {
    pending.current = null;
    clearSession();
    update(() => createPlayTable(table.rules, freshSeed()));
  }, [table.rules, update]);

  const session = store.session;
  const stats = useMemo(() => computeStats(session ?? EMPTY_SESSION), [session]);

  return useMemo(
    () => ({
      status: store.status,
      session,
      stats,
      recording: session !== null && isActive(session),
      ended: session !== null && !isActive(session) ? session : null,
      error: store.error,
      deal,
      act,
      insurance,
      next,
      shuffle,
      setBet,
      setSystem,
      resetBankroll,
      end,
      startNew,
    }),
    [
      store.status,
      store.error,
      session,
      stats,
      deal,
      act,
      insurance,
      next,
      shuffle,
      setBet,
      setSystem,
      resetBankroll,
      end,
      startNew,
    ],
  );
}

export interface SessionOverview {
  readonly status: SessionStatus;
  readonly session: Session | null;
  readonly stats: SessionStats;
  readonly recording: boolean;
  readonly error: string | null;
  readonly end: (reason?: SessionEndReason) => void;
  readonly dismiss: () => void;
}

/**
 * The Session as seen from a screen with no table — the Statistics route.
 *
 * It carries the same explicit end control, which is what makes ending reachable from
 * anywhere in the Session rather than only from the felt.
 */
export function useSessionOverview(): SessionOverview {
  const store = useSessionState();

  useEffect(() => {
    loadActiveSession();
  }, []);

  const session = store.session;
  const stats = useMemo(() => computeStats(session ?? EMPTY_SESSION), [session]);

  return useMemo(
    () => ({
      status: store.status,
      session,
      stats,
      recording: session !== null && isActive(session),
      error: store.error,
      end: (reason: SessionEndReason = "user") => endCurrentSession(reason),
      dismiss: clearSession,
    }),
    [store.status, store.error, session, stats],
  );
}

/**
 * Rebuilds the table a Session was last seen on.
 *
 * Only the seed is needed for the cards (ADR-0004): `rebuildShoe` regenerates the Shoe from
 * its recorded seed and deals it forward to exactly where the log says it stood, so the
 * Running Count the user comes back to is the one they left.
 */
export function tableFromSession(session: Session): PlayTable {
  const record = currentSessionShoe(session);
  const stats = computeStats(session);
  // A Session always opens a Shoe as it starts, so the fallback is unreachable in practice;
  // it is here so a hand-edited or imported record cannot crash the screen.
  const shoe = record ? rebuildShoe(session, record.index) : createShoe(session.rules, session.seed);

  return restorePlayTable({
    rules: session.rules,
    system: sessionCountingSystem(session),
    sessionSeed: session.seed,
    shoeIndex: record?.index ?? 0,
    shoe,
    bankroll: session.bankroll,
    handsPlayed: stats.roundsPlayed,
    sessionNet: stats.netResult,
  });
}

/** Sortable by time and unique enough for one device — there is no server to collide with. */
function newSessionId(at: number): string {
  return `${at.toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(36)}`;
}

/**
 * `Math.random()` is banned in `src/engine` so the Shoe stays reproducible (ADR-0004). Here
 * it picks *which* reproducible Shoe to deal, and the seed is shown to the user immediately.
 */
function freshSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
