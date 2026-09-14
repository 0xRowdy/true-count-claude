/**
 * The one place in the UI that knows a Session is stored anywhere.
 *
 * A module-level store rather than React context, for a reason the user can feel: the Play
 * table and the Statistics screen are separate Expo Router routes, so a context provider
 * would have to live in `app/_layout.tsx`, and moving between the two screens would unmount
 * and remount whichever provider held the run. Here the Session outlives navigation.
 *
 * Persistence goes through `src/state`'s injected `KeyValueStore` and its AsyncStorage
 * adapter — never AsyncStorage directly, and never past the repository (ADR-0003, and the
 * reason every test in `src/state` runs in plain Node). Writes are queued so two rapid
 * transitions cannot land out of order and leave storage holding the older Session.
 */

import { useSyncExternalStore } from "react";
import {
  type Session,
  type SessionEndReason,
  type SessionRepository,
  type SessionSummary,
  createSessionRepository,
  endSession,
  isActive,
} from "@/state";
import { createAsyncStorageStore } from "@/state/asyncStorage";

export type SessionStatus = "idle" | "loading" | "ready" | "failed";

export interface SessionStoreState {
  readonly status: SessionStatus;
  /** The Session in hand — running, or just ended and still on screen. */
  readonly session: Session | null;
  /** A storage failure, surfaced rather than swallowed. Play continues regardless. */
  readonly error: string | null;
}

const repository: SessionRepository = createSessionRepository({
  store: createAsyncStorageStore(),
});

let state: SessionStoreState = { status: "idle", session: null, error: null };
const listeners = new Set<() => void>();

/** Serialises writes so a later Session can never be overwritten by an earlier one. */
let writes: Promise<unknown> = Promise.resolve();

function publish(next: SessionStoreState): void {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): SessionStoreState {
  return state;
}

/**
 * Subscribes a component to the Session in hand.
 *
 * The server snapshot is the same object, which is correct rather than convenient: the web
 * build is prerendered, storage is only read in the browser, and the prerendered markup
 * should be the `idle` state that the client then loads over.
 */
export function useSessionState(): SessionStoreState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function currentSession(): Session | null {
  return state.session;
}

/**
 * Restores the Session that was still running when the app last closed. Idempotent, and a
 * no-op once a Session is in hand — the repository's active pointer is the only thing that
 * decides there is one to resume, and it follows `endedAt` rather than deciding it.
 */
export function loadActiveSession(): void {
  if (state.status !== "idle") return;
  publish({ ...state, status: "loading" });
  void repository
    .loadActiveSession()
    .then((session) => {
      // A user who dealt before the read came back has already opened a Session, and that
      // one wins: replacing it here would sweep away a hand they are in the middle of. The
      // stored Session keeps its record; it simply stops being the active one.
      if (state.session !== null) publish({ ...state, status: "ready" });
      else publish({ status: "ready", session, error: null });
    })
    .catch((error: unknown) =>
      // A failed read must not cost the user their table. The run continues unrecorded and
      // says so, which is the honest half of "never a dead end".
      publish({ status: "failed", session: null, error: describe(error) }),
    );
}

/** Publishes a Session and persists it. The active pointer follows `endedAt` in the repository. */
export function putSession(session: Session): void {
  publish({ status: "ready", session, error: null });
  enqueue(() => repository.save(session));
}

/**
 * The explicit end, from wherever the user happens to be.
 *
 * The only function in the UI that closes a Session. It is idempotent because `endSession`
 * is, so a double-tapped button cannot rewrite a closed record, and it works mid-round, with
 * an exhausted Shoe, or with a zero bankroll.
 */
export function endCurrentSession(reason: SessionEndReason = "user"): void {
  const session = state.session;
  if (!session || !isActive(session)) return;
  putSession(endSession(session, reason, Date.now()));
}

/**
 * Drops the Session from the screen without touching storage.
 *
 * Used after an explicitly ended Session has been read — it is already saved, and its
 * statistics live in the history from here on.
 */
export function clearSession(): void {
  publish({ status: "ready", session: null, error: null });
}

/** Every Session ever recorded on this device, newest first. Drives the history list. */
export function listSessionSummaries(): Promise<readonly SessionSummary[]> {
  return repository.listSummaries();
}

/** Every Session, for the lifetime aggregate. Unreadable records are reported, not hidden. */
export function loadAllSessions(): ReturnType<SessionRepository["loadAll"]> {
  return repository.loadAll();
}

function enqueue(work: () => Promise<void>): void {
  writes = writes
    .then(work)
    .catch((error: unknown) => publish({ ...state, error: describe(error) }));
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
