/**
 * The Rule Set screen's state: one Rule Set, edited here and published to the whole app.
 *
 * Three things here are deliberate rather than incidental.
 *
 * **The edit is a draft; only a sound table is published.** While a user is mid-edit with an
 * empty maximum bet, that is a transient screen state, not a table anyone plays at — and
 * since #19 the published Rule Set is the one the Play table deals from, so publishing a
 * half-typed one would deal it. The draft renders; `rulesStore` only ever receives rule sets
 * `validateRules` accepts.
 *
 * **It starts from `DEFAULT_RULES` and loads afterwards.** The web build is prerendered, so
 * first render has to produce the same markup on the server and in the browser; reading
 * storage during render would hand them two different tables. `status` says which phase we
 * are in so the screen can say "loading your table" rather than briefly asserting that the
 * user plays the default one.
 *
 * **It will not write before it has read** — and it cannot, because the store discards a load
 * that resolves after the user has chosen. Saving on the first render would overwrite the
 * stored Rule Set with the default, which is how a settings screen silently loses your
 * settings.
 */

import { useCallback, useState } from "react";
import { type RuleSet, validateRules } from "@/engine/rules";
import {
  type RuleSetStatus,
  clearStoredRules,
  putStoredRules,
  useConfiguredRules,
} from "./rulesStore";

export type { RuleSetStatus };

export interface UseRuleSet {
  readonly rules: RuleSet;
  readonly setRules: (next: RuleSet) => void;
  /** Back to `DEFAULT_RULES`, and forget what was stored. */
  readonly reset: () => void;
  readonly status: RuleSetStatus;
  /** `validateRules`, recomputed on every change. Empty means sound. */
  readonly problems: readonly string[];
}

export function useRuleSet(): UseRuleSet {
  const configured = useConfiguredRules();
  // `null` until the user touches a field: before that the screen simply renders whatever
  // the store holds, which is what lets the loaded table arrive underneath it.
  const [draft, setDraft] = useState<RuleSet | null>(null);

  const rules = draft ?? configured.rules;

  const setRules = useCallback((next: RuleSet) => {
    setDraft(next);
    if (validateRules(next).length > 0) return;
    putStoredRules(next);
  }, []);

  const reset = useCallback(() => {
    setDraft(null);
    clearStoredRules();
  }, []);

  return { rules, setRules, reset, status: configured.status, problems: validateRules(rules) };
}
