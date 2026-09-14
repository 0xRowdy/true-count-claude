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
 * `src/state/session.test.ts` asserts the first two). Changing your Rule Set does not either —
 * see `switchTable`, which offers the end as a button rather than performing one behind the
 * user's back. That is the whole point of #10.
 *
 * This is also where the configured Rule Set meets the table (#19). It has to be here: the
 * table knows whether a Shoe is part-dealt and the Session store knows whether a run is being
 * recorded, and a rules change is only safe when neither of them objects.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { CountingSystemId } from "@/engine/counting";
import type { Action } from "@/engine/hand";
import type { RuleSet } from "@/engine/rules";
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
import type { ConfiguredRules } from "@/ui/rules/rulesStore";
import {
  type PlayTable,
  type PlayTableController,
  type RulesHold,
  chooseBet,
  chooseSystem,
  configureRules,
  createPlayTable,
  dealRound,
  nextRound,
  playAction,
  resetBankroll as resetTableBankroll,
  restorePlayTable,
  rulesHold,
  shuffleShoe,
  takeInsurance,
  takeUpRules,
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

  /** The table the user has configured but which is not being dealt yet, or `null`. */
  readonly pendingRules: RuleSet | null;
  /** What is holding `pendingRules` back. `null` whenever nothing is pending. */
  readonly rulesHold: RulesHold | null;
  /**
   * Takes up the configured table now, doing whatever that costs: a Session in the way is
   * ended and a fresh one opens on the next deal. Offered as a button, never inferred.
   */
  readonly switchTable: () => void;

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

export function usePlaySession(
  controller: PlayTableController,
  configured: ConfiguredRules,
): PlaySession {
  const { table, update } = controller;
  const store = useSessionState();
  const pending = useRef<PendingRound | null>(null);
  const restored = useRef(false);

  useEffect(() => {
    loadActiveSession();
  }, []);

  // One restore, on the first load that finds an unfinished Session. The table is rebuilt
  // between rounds, where the log left it — under the Rule Set that Session was played at,
  // which is why a configured change already noted survives the rebuild as a pending one.
  useEffect(() => {
    if (restored.current || store.status !== "ready") return;
    restored.current = true;
    const session = store.session;
    if (!session || !isActive(session)) return;
    update((current) => {
      const resumed = tableFromSession(session);
      return current.pendingRules === null
        ? resumed
        : configureRules(resumed, current.pendingRules);
    });
  }, [store.status, store.session, update]);

  // The configured Rule Set, noted on the table. This never changes the game being dealt;
  // `takeUp` below is the only thing that does, and only when nothing objects.
  useEffect(() => {
    if (!configured.ready) return;
    update((current) => configureRules(current, configured.rules));
  }, [configured.ready, configured.rules, update]);

  /**
   * Takes up a pending Rule Set the moment it is free to be taken up.
   *
   * Read through `currentSession()` rather than the rendered `store.session` so the check is
   * made against the Session as it stands at the instant of the update, not as it stood when
   * this render began — a deal and a rules change landing in the same tick would otherwise
   * rebuild the Shoe the round was dealt from.
   */
  const takeUp = useCallback(() => {
    update((current) => {
      const session = currentSession();
      const recording = session !== null && isActive(session);
      return rulesHold(current, recording) === null ? takeUpRules(current) : current;
    });
  }, [update]);

  useEffect(() => {
    if (table.pendingRules === null) return;
    takeUp();
  }, [table, store.session, takeUp]);

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

  // A fresh table is the one moment nothing is in the way, so it opens at the configured Rule
  // Set rather than repeating the one the last run happened to be played at.
  const startNew = useCallback(() => {
    pending.current = null;
    clearSession();
    update((current) => createPlayTable(current.pendingRules ?? current.rules, freshSeed()));
  }, [update]);

  const session = store.session;
  const recording = session !== null && isActive(session);
  const hold = rulesHold(table, recording);

  /**
   * Invariant 6 in a different costume: a pending table the user cannot reach is a dead end.
   * A Session in the way is ended here — but by this button, which says so, and never by the
   * rules change itself.
   */
  const switchTable = useCallback(() => {
    switch (hold) {
      case "session":
        // The Session keeps every hand it recorded; it simply stops being the open one, and
        // the fresh table that replaces it opens at the configured Rule Set.
        end();
        startNew();
        return;
      case "shoe":
        // Nothing is recording, so a new Shoe is all that is wanted — and the effect above
        // takes the new rules up the moment it exists.
        update(shuffleShoe);
        return;
      case "round":
        // A hand is being played under the rules that settle it. Nothing to offer but "finish
        // it", and the panel renders no button here rather than one that does nothing.
        return;
      case null:
        takeUp();
        return;
    }
  }, [hold, end, startNew, update, takeUp]);

  const stats = useMemo(() => computeStats(session ?? EMPTY_SESSION), [session]);

  return useMemo(
    () => ({
      status: store.status,
      session,
      stats,
      recording,
      ended: session !== null && !isActive(session) ? session : null,
      error: store.error,
      pendingRules: table.pendingRules,
      rulesHold: hold,
      switchTable,
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
      recording,
      table.pendingRules,
      hold,
      switchTable,
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
