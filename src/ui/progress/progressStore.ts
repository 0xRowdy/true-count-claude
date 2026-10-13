/**
 * The progress store, bound to AsyncStorage and React.
 *
 * The state machine and every selector are pure (`src/state/progress*.ts`, tested in Node).
 * This module owns one store instance, supplies the clock (`at`) and the player's local date
 * (`day`) to the reducers, and merges the recorded progress with the blackjack Session log
 * (Play and the drills) so blackjack progress is real without being recorded twice.
 *
 * Game screens record through the plain functions below:
 *
 * ```ts
 * startProgressSession({ id: makeSessionId("craps"), game: "craps", strategyName: "Iron Cross" });
 * recordDecision({ game: "craps", category: "odds", correct: true, coached: false });
 * recordHand({ game: "craps", net: 30 });
 * endProgressSession(id);
 * ```
 *
 * A programming error (an unknown game or category, a non-finite net) throws synchronously
 * from these calls and records nothing; the store keeps working.
 *
 * Hydration: the server snapshot is the fixed loading state and nothing here reads a clock
 * during render, so prerendered pages always show the loading layout.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createAsyncStorageStore } from "@/state/asyncStorage";
import { type GameId, localIsoDate } from "@/state/profile";
import {
  type DecisionInput,
  EMPTY_PROGRESS,
  type HandInput,
  INITIAL_PROGRESS_STATE,
  type ProgressState,
  type ProgressStoreState,
  type SessionInput,
  type When,
  blackjackProgress,
  createProgressRepository,
  createProgressStore,
  endProgressSession as endSessionIn,
  mergeProgress,
  recordDecision as recordDecisionIn,
  recordHand as recordHandIn,
  startProgressSession as startSessionIn,
} from "@/state/progress";
import { resetBankroll as resetBankrollIn } from "@/state/progressReset";
import { sampleProgress } from "@/state/progressSample";
import { chipBalance } from "@/state/progressSelectors";
import type { Session } from "@/state/types";
import { loadAllSessions } from "@/ui/session/sessionStore";

const store = createProgressStore(createProgressRepository(createAsyncStorageStore()));
const serverSnapshot = (): ProgressStoreState => INITIAL_PROGRESS_STATE;

function now(): When {
  const date = new Date();
  return { at: date.getTime(), day: localIsoDate(date) };
}

export const dayOf = (at: number): string => localIsoDate(new Date(at));

/** Records a graded decision (not for blackjack Play or drills: those come from the Session log). */
export function recordDecision(input: DecisionInput): void {
  const when = now();
  void store.apply((s) => recordDecisionIn(s, input, when));
}

/** Records a settled hand and its practice-chip net. */
export function recordHand(input: HandInput): void {
  const when = now();
  void store.apply((s) => recordHandIn(s, input, when));
}

export function startProgressSession(input: SessionInput): void {
  const when = now();
  void store.apply((s) => startSessionIn(s, input, when));
}

export function endProgressSession(id: string): void {
  const when = now();
  void store.apply((s) => endSessionIn(s, id, when));
}

let sessionCounter = 0;
/** A session id unique on this device. */
export function makeSessionId(game: string): string {
  sessionCounter += 1;
  return `${game}-${Date.now().toString(36)}-${sessionCounter}`;
}

/** Forgets every recorded (non-blackjack) progress record. */
export function clearProgress(): void {
  void store.clear();
}

// ---------------------------------------------------------------------------------------------
// Blackjack sessions, read from the Session repository.

interface BlackjackState {
  readonly sessions: readonly Session[] | null;
}
let blackjack: BlackjackState = { sessions: null };
const bjListeners = new Set<() => void>();
const bjSubscribe = (l: () => void) => {
  bjListeners.add(l);
  return () => {
    bjListeners.delete(l);
  };
};
const bjSnapshot = () => blackjack;
const bjServer = (): BlackjackState => ({ sessions: null });
const BJ_SERVER = bjServer();

/** Re-reads the blackjack Session log (cheap; called whenever a progress screen mounts). */
export function refreshBlackjack(): void {
  void loadAllSessions().then(
    (result) => {
      blackjack = { sessions: result.sessions };
      for (const l of bjListeners) l();
    },
    () => {
      blackjack = { sessions: [] };
      for (const l of bjListeners) l();
    },
  );
}

export interface ProgressView {
  /** False until storage (and the blackjack log) have answered and `today` is known. */
  readonly ready: boolean;
  /** The merged record, or the sample history in demo mode. */
  readonly data: ProgressState;
  /** The player's local date, read after mount; null before. */
  readonly today: string | null;
  /** The local hour, after mount (for greetings). */
  readonly hour: number | null;
  /** True when showing the sample history instead of the player's own. */
  readonly demo: boolean;
  /** Recorded progress could not be read or saved this launch. */
  readonly unavailable: boolean;
}

/**
 * The progress the Lobby and Progress screens render. `demo` swaps in the deterministic sample
 * history (nothing is written to storage).
 */
export function useProgressView(demo: boolean): ProgressView {
  const state = useSyncExternalStore(store.subscribe, store.snapshot, serverSnapshot);
  const bj = useSyncExternalStore(bjSubscribe, bjSnapshot, () => BJ_SERVER);
  const [clock, setClock] = useState<{ today: string; hour: number; at: number } | null>(null);

  useEffect(() => {
    void store.load();
    refreshBlackjack();
    const d = new Date();
    setClock({ today: localIsoDate(d), hour: d.getHours(), at: d.getTime() });
  }, []);

  const data = useMemo(() => {
    if (demo) return clock ? sampleProgress(clock.today, clock.at) : EMPTY_PROGRESS;
    if (!bj.sessions) return state.progress;
    return mergeProgress(state.progress, blackjackProgress(bj.sessions, dayOf));
  }, [demo, clock, state.progress, bj.sessions]);

  const ready = clock !== null && (demo || (state.ready && bj.sessions !== null));
  return {
    ready,
    data,
    today: clock?.today ?? null,
    hour: clock?.hour ?? null,
    // Only after mount: the prerendered page never knows the query string.
    demo: demo && clock !== null,
    unavailable: !demo && state.status === "unavailable",
  };
}

/** The header's practice-chip balance, or undefined until known. */
export function useChipBalance(view: ProgressView): number | undefined {
  return useMemo(() => (view.ready ? chipBalance(view.data) : undefined), [view.ready, view.data]);
}

/** Tops a game's practice bankroll back up to the start (invariant 6: never a dead end). */
export function resetBankroll(game: GameId): void {
  void store.apply((s) => resetBankrollIn(s, game));
}
