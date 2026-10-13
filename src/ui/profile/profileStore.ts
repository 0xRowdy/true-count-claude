/**
 * The player profile, shared by every screen that tailors itself to it (onboarding writes it;
 * the lobby, the coach and the game tables read it).
 *
 * The state machine lives in `src/state/profile.ts` (`createProfileStore`), tested in Node.
 * This module binds one instance to AsyncStorage and React. The server snapshot is the fixed
 * initial state, so the prerendered markup is always the `loading` profile.
 */

import { useEffect, useSyncExternalStore } from "react";
import { createAsyncStorageStore } from "@/state/asyncStorage";
import {
  INITIAL_PROFILE_STATE,
  type PlayerProfile,
  type ProfileState,
  createProfileRepository,
  createProfileStore,
} from "@/state/profile";

export type { ProfileState };

const store = createProfileStore(createProfileRepository(createAsyncStorageStore()));
const serverSnapshot = (): ProfileState => INITIAL_PROFILE_STATE;

/** The player profile, subscribed. Wait for `ready` before acting on `onboarded` or the name. */
export function useProfile(): ProfileState {
  const current = useSyncExternalStore(store.subscribe, store.snapshot, serverSnapshot);
  useEffect(() => {
    void store.load();
  }, []);
  return current;
}

/** The profile as it stands right now, for callers outside React (e.g. the coach). */
export function currentProfile(): ProfileState {
  return store.snapshot();
}

/** Reads the stored profile once per app launch. Idempotent. */
export function loadProfile(): void {
  void store.load();
}

/** Merges a change into the profile and persists it (safe before storage has answered). */
export function updateProfile(change: Partial<PlayerProfile>): void {
  void store.update(change);
}

/** Forgets the profile (e.g. "start over" in onboarding). */
export function resetProfile(): void {
  void store.reset();
}
