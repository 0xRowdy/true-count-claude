/**
 * The screen's state: one Rule Set, loaded from storage and written back as it changes.
 *
 * Three things here are deliberate rather than incidental.
 *
 * **It starts from `DEFAULT_RULES` and loads afterwards.** The web build is prerendered,
 * so first render has to produce the same markup on the server and in the browser; reading
 * storage during render would hand them two different tables. `status` says which phase we
 * are in so the screen can say "loading your table" rather than briefly asserting that the
 * user plays the default one.
 *
 * **It will not write before it has read.** Saving on the first render would overwrite the
 * stored Rule Set with the default before the load resolves — which is how a settings
 * screen silently loses your settings.
 *
 * **It never persists an invalid Rule Set.** The store refuses those too, but the refusal
 * belongs at both ends: while a user is mid-edit with an empty maximum bet, that is a
 * transient screen state, not a table anyone plays at.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_RULES, type RuleSet, validateRules } from "@/engine/rules";
import { createAsyncStorageStore } from "@/state/asyncStorage";
import { type RuleSetStore, createRuleSetStore } from "./storage";

export type RuleSetStatus = "loading" | "stored" | "default" | "unavailable";

export interface UseRuleSet {
  readonly rules: RuleSet;
  readonly setRules: (next: RuleSet) => void;
  /** Back to `DEFAULT_RULES`, and forget what was stored. */
  readonly reset: () => void;
  readonly status: RuleSetStatus;
  /** `validateRules`, recomputed on every change. Empty means sound. */
  readonly problems: readonly string[];
}

export function useRuleSet(storeFactory: () => RuleSetStore = defaultStoreFactory): UseRuleSet {
  const [rules, setRulesState] = useState<RuleSet>(DEFAULT_RULES);
  const [status, setStatus] = useState<RuleSetStatus>("loading");

  // The store is created once, lazily, and never during render — constructing it is
  // cheap and side-effect-free, but keeping it out of the render path keeps the
  // prerendered web build honest.
  const storeRef = useRef<RuleSetStore | undefined>(undefined);
  const getStore = useCallback((): RuleSetStore => {
    storeRef.current ??= storeFactory();
    return storeRef.current;
  }, [storeFactory]);

  const loaded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await getStore().load();
        if (cancelled) return;
        if (stored) {
          setRulesState(stored);
          setStatus("stored");
        } else {
          setStatus("default");
        }
      } catch {
        // Storage being unavailable is not a reason to make the screen unusable — the
        // user can still configure a table and train, they just start fresh next launch.
        if (!cancelled) setStatus("unavailable");
      } finally {
        loaded.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getStore]);

  const setRules = useCallback(
    (next: RuleSet) => {
      setRulesState(next);
      if (!loaded.current) return;
      if (validateRules(next).length > 0) return;
      void getStore()
        .save(next)
        .then(
          () => setStatus((current) => (current === "unavailable" ? current : "stored")),
          () => setStatus("unavailable"),
        );
    },
    [getStore],
  );

  const reset = useCallback(() => {
    setRulesState(DEFAULT_RULES);
    if (!loaded.current) return;
    void getStore()
      .clear()
      .then(
        () => setStatus((current) => (current === "unavailable" ? current : "default")),
        () => setStatus("unavailable"),
      );
  }, [getStore]);

  return { rules, setRules, reset, status, problems: validateRules(rules) };
}

function defaultStoreFactory(): RuleSetStore {
  return createRuleSetStore(createAsyncStorageStore());
}
