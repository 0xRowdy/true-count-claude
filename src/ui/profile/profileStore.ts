/**
 * The player profile, shared by every screen that tailors itself to it (onboarding writes it;
 * the lobby, the coach and the game tables read it).
 *
 * A module-level store for the same reasons as `rulesStore.ts`: separate routes must see one
 * profile without remounting, the prerendered snapshot is the `loading` state, and a choice
 * the player makes before storage answers is never overwritten by the late read.
 */

import { useEffect, useSyncExternalStore } from "react";
import { createAsyncStorageStore } from "@/state/asyncStorage";
import { DEFAULT_PROFILE, type PlayerProfile, createProfileRepository } from "@/state/profile";

export interface ProfileState {
  /** `DEFAULT_PROFILE` until storage answers. */
  readonly profile: PlayerProfile;
  /** False until storage has answered; nothing should redirect or persist before then. */
  readonly ready: boolean;
}

const repo = createProfileRepository(createAsyncStorageStore());

let state: ProfileState = { profile: DEFAULT_PROFILE, ready: false };
const listeners = new Set<() => void>();
let started = false;
let chosen = false;
let writes: Promise<unknown> = Promise.resolve();

function publish(next: ProfileState): void {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = (): ProfileState => state;

/** The player profile, subscribed. */
export function useProfile(): ProfileState {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    loadProfile();
  }, []);
  return current;
}

/** Reads the stored profile once per app launch. Idempotent. */
export function loadProfile(): void {
  if (started) return;
  started = true;
  void repo.load().then(
    (stored) => {
      if (!chosen) publish({ profile: stored ?? DEFAULT_PROFILE, ready: true });
    },
    () => publish({ profile: state.profile, ready: true }),
  );
}

/** Merges a change into the profile, publishes it and persists it. */
export function updateProfile(change: Partial<PlayerProfile>): void {
  chosen = true;
  const profile = { ...state.profile, ...change };
  publish({ profile, ready: true });
  writes = writes.then(() => repo.save(profile)).catch(() => undefined);
}

/** Forgets the profile (e.g. "start over" in onboarding). */
export function resetProfile(): void {
  chosen = true;
  publish({ profile: DEFAULT_PROFILE, ready: true });
  writes = writes.then(() => repo.clear()).catch(() => undefined);
}
