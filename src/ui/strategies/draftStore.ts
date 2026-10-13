/**
 * Strategy drafts, shared by the library and the three builders.
 *
 * The state machine lives in `src/state/strategies.ts` (`createDraftStore`), tested in Node.
 * This module binds one instance to AsyncStorage and React, as the player profile store does.
 * The server snapshot is the fixed initial state, so prerendered markup never holds a draft.
 */

import { useEffect, useSyncExternalStore } from "react";
import { createAsyncStorageStore } from "@/state/asyncStorage";
import {
  INITIAL_DRAFTS_STATE,
  type DraftsState,
  type StrategyDraft,
  createDraftRepository,
  createDraftStore,
} from "@/state/strategies";

const store = createDraftStore(createDraftRepository(createAsyncStorageStore()));
const serverSnapshot = (): DraftsState => INITIAL_DRAFTS_STATE;

/** The stored drafts, subscribed. `ready` is false until storage answers. */
export function useDrafts(): DraftsState {
  const current = useSyncExternalStore(store.subscribe, store.snapshot, serverSnapshot);
  useEffect(() => {
    void store.load();
  }, []);
  return current;
}

/** Autosaves a draft, stamping the save time (called from event handlers, never render). */
export function saveDraft(draft: StrategyDraft): StrategyDraft {
  const saved = { ...draft, savedAt: new Date().toISOString() };
  void store.save(saved);
  return saved;
}

export function deleteDraft(id: string): void {
  void store.remove(id);
}
