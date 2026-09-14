/**
 * The configured Rule Set, shared by every screen that plays at it.
 *
 * A module-level store rather than a hook-per-screen, for the same reason `sessionStore.ts`
 * is one: the Rule Set screen, the Play table and the Shoe Integrity Panel are separate Expo
 * Router routes, and a route that mounts once and reads storage once would never notice that
 * the table changed on a screen it is sitting underneath. That is the exact failure this
 * whole issue is about — the chart saying one thing and the game dealing another — so the
 * fix has to survive navigation rather than depend on a remount.
 *
 * Two rules govern what leaves this module:
 *
 * **Only a valid Rule Set is ever published.** A half-typed maximum bet is a transient screen
 * state, not a table anyone plays at; letting one out of here would deal it. The editor holds
 * its own draft (`useRuleSet`) and only hands over rule sets `validateRules` accepts.
 *
 * **A user's own choice beats a slow read.** If someone picks a preset before storage answers,
 * the load result is discarded rather than allowed to overwrite them a moment later.
 */

import { useEffect, useSyncExternalStore } from "react";
import { DEFAULT_RULES, type RuleSet, validateRules } from "@/engine/rules";
import { createAsyncStorageStore } from "@/state/asyncStorage";
import { type RuleSetStore, createRuleSetStore } from "./storage";

export type RuleSetStatus = "loading" | "stored" | "default" | "unavailable";

export interface ConfiguredRules {
  readonly status: RuleSetStatus;
  /** The table in force. `DEFAULT_RULES` until storage says otherwise. */
  readonly rules: RuleSet;
  /**
   * False until storage has answered. Nothing may act on `rules` before this is true — the
   * default would otherwise briefly masquerade as the user's own choice, and a screen that
   * rebuilt its Shoe on it would rebuild it twice.
   */
  readonly ready: boolean;
}

const store: RuleSetStore = createRuleSetStore(createAsyncStorageStore());

let state: ConfiguredRules = { status: "loading", rules: DEFAULT_RULES, ready: false };
const listeners = new Set<() => void>();

/** Set once the user has chosen, so a load still in flight cannot overwrite the choice. */
let chosen = false;
let started = false;

/** Serialises writes so a later Rule Set can never be overwritten by an earlier one. */
let writes: Promise<unknown> = Promise.resolve();

function publish(next: ConfiguredRules): void {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): ConfiguredRules {
  return state;
}

/**
 * The configured Rule Set, subscribed.
 *
 * The server snapshot is the same object, which is correct rather than convenient: the web
 * build is prerendered, storage is only read in the browser, and the prerendered markup
 * should be the `loading` state the client then loads over.
 */
export function useConfiguredRules(): ConfiguredRules {
  const configured = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    loadStoredRules();
  }, []);
  return configured;
}

/** The Rule Set as it stands right now, for callers outside React. */
export function configuredRules(): ConfiguredRules {
  return state;
}

/** Reads the stored Rule Set once per app launch. Idempotent; safe from any screen. */
export function loadStoredRules(): void {
  if (started) return;
  started = true;
  void store.load().then(
    (stored) => {
      if (chosen) return;
      if (stored) publish({ status: "stored", rules: stored, ready: true });
      else publish({ status: "default", rules: DEFAULT_RULES, ready: true });
    },
    () =>
      // Storage being unreadable is not a reason to make the app unusable. The user plays
      // the default table and is told their choices will not survive a restart.
      publish({ status: "unavailable", rules: state.rules, ready: true }),
  );
}

/**
 * Publishes a Rule Set and persists it. Invalid rule sets are refused outright: the store
 * behind this refuses them too, but a refusal only at the storage end would still let one
 * reach the Play table for as long as the app stayed open.
 */
export function putStoredRules(rules: RuleSet): void {
  if (validateRules(rules).length > 0) return;
  chosen = true;
  publish({ status: state.status === "unavailable" ? "unavailable" : "stored", rules, ready: true });
  enqueue(() => store.save(rules));
}

/** Back to `DEFAULT_RULES`, and forget what was stored. */
export function clearStoredRules(): void {
  chosen = true;
  publish({
    status: state.status === "unavailable" ? "unavailable" : "default",
    rules: DEFAULT_RULES,
    ready: true,
  });
  enqueue(() => store.clear());
}

function enqueue(work: () => Promise<void>): void {
  writes = writes.then(work).catch(() => publish({ ...state, status: "unavailable" }));
}
