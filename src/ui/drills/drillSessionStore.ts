/**
 * Where drill Sessions live between screens and across restarts.
 *
 * A module-level store, for the reason `sessionStore.ts` gives: drill screens are separate
 * routes, and a record that lived in a component would be gone the moment the user stepped
 * back to the hub. Each drill has at most one open Session at a time.
 *
 * Drill Sessions are written through the same repository shape and the same storage keys as
 * Play Sessions, so they appear in the Statistics screen's history and lifetime totals and in
 * every export — but through `withoutActivePointer`, so they never become the Session the Play
 * table resumes (see `drillRecorder.ts`). Writes are queued so two rapid answers cannot land
 * out of order and leave storage holding the older Session.
 *
 * Nothing here ends a Session except `endDrillSession`, which only a button calls (ADR-0003).
 */

import { useEffect, useSyncExternalStore } from "react";
import {
  type Session,
  type SessionRepository,
  createSessionRepository,
  endSession,
} from "@/state";
import { createAsyncStorageStore } from "@/state/asyncStorage";
import type { DrillId } from "@/drills/types";
import { type OpenDrillSessions, openDrillSessions, withoutActivePointer } from "./drillRecorder";

export type DrillSessionStatus = "idle" | "loading" | "ready" | "failed";

export interface DrillSessionState {
  readonly status: DrillSessionStatus;
  readonly open: OpenDrillSessions;
  /** A storage failure, said out loud. Drilling carries on regardless. */
  readonly error: string | null;
}

const repository: SessionRepository = createSessionRepository({
  store: withoutActivePointer(createAsyncStorageStore()),
});

let state: DrillSessionState = { status: "idle", open: {}, error: null };
const listeners = new Set<() => void>();
let writes: Promise<unknown> = Promise.resolve();

function publish(next: DrillSessionState): void {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): DrillSessionState {
  return state;
}

export function useDrillSessions(): DrillSessionState {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    loadOpenDrillSessions();
  }, []);
  return current;
}

/** Reads the open drill Sessions once per launch. A failed read never blocks a drill. */
export function loadOpenDrillSessions(): void {
  if (state.status !== "idle") return;
  publish({ ...state, status: "loading" });
  void repository.loadAll().then(
    (result) => {
      // Anything written while the read was in flight wins over what the read found.
      publish({ status: "ready", open: { ...openDrillSessions(result.sessions), ...state.open }, error: null });
    },
    (error: unknown) => publish({ status: "failed", open: state.open, error: describe(error) }),
  );
}

/** Publishes a drill's open Session and persists it. */
export function saveDrillSession(drillId: DrillId, session: Session): void {
  publish({ ...state, open: { ...state.open, [drillId]: session } });
  enqueue(() => repository.save(session));
}

/** Forgets a Session that has lost every record it held — an undo back to nothing. */
export function discardDrillSession(drillId: DrillId, id: string): void {
  if (state.open[drillId]?.id === id) {
    const open = { ...state.open };
    delete open[drillId];
    publish({ ...state, open });
  }
  enqueue(() => repository.remove(id));
}

/** The explicit end. Returns the closed Session so the screen can show what it kept. */
export function endDrillSession(drillId: DrillId, session: Session): Session {
  const ended = endSession(session, "user", Date.now());
  const open = { ...state.open };
  delete open[drillId];
  publish({ ...state, open });
  enqueue(() => repository.save(ended));
  return ended;
}

function enqueue(work: () => Promise<void>): void {
  writes = writes.then(work).catch((error: unknown) => publish({ ...state, error: describe(error) }));
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
