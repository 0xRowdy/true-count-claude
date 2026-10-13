/**
 * Binds the baccarat view model to React, the profile (coach level) and the progress store
 * (practice bankroll, decisions, hands, the session).
 *
 * Hydration: the prerendered page is a fixed table (seed 1, nothing on the felt, bankroll not
 * yet known). The real seed — `?seed=` or a random one — is applied in an effect, after mount.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_BACCARAT_RULES, type BaccaratRules, type BetKind } from "@/games/baccarat";
import { bankroll as gameBankroll } from "@/state/progressSelectors";
import { PRACTICE_BANKROLL_START } from "@/state/progress";
import { useProfile } from "@/ui/profile/profileStore";
import {
  endProgressSession,
  makeSessionId,
  recordDecision,
  recordHand,
  resetBankroll,
  startProgressSession,
  useProgressView,
} from "@/ui/progress/progressStore";
import {
  type BaccaratTable,
  type DecisionRecord,
  abandonedNet,
  hintVisible,
  clearBets,
  createBaccaratTable,
  deal,
  dealSequence,
  nextHand,
  placeChip,
  rebet,
  removeChip,
  revealNext,
  setRules,
  settle,
  takeBack,
  totalStaked,
  undoChip,
} from "./baccaratTable";

const PRERENDER_SEED = 1;
/** One card turned every … ms, P B P B, then the third cards. */
export const REVEAL_MS = 380;
/** How long the result sits before the dealer pays. */
export const RESULT_MS = 900;

function record(decisions: readonly DecisionRecord[]): void {
  for (const d of decisions) {
    recordDecision({
      game: "baccarat",
      category: d.category,
      correct: d.correct,
      coached: d.coached,
    });
  }
}

/** A seed from the query string, if it is a whole number. */
export function parseSeed(raw: string | undefined): number | null {
  if (!raw || !/^\d{1,10}$/.test(raw)) return null;
  return Number(raw) >>> 0;
}

export function useBaccaratTable(seedParam: string | undefined) {
  const [table, setTable] = useState<BaccaratTable>(() =>
    createBaccaratTable(DEFAULT_BACCARAT_RULES, PRERENDER_SEED),
  );
  const tableRef = useRef(table);
  tableRef.current = table;
  const [seeded, setSeeded] = useState(false);
  const [hintAsked, setHintAsked] = useState(false);
  const { profile, ready: profileReady } = useProfile();
  const view = useProgressView(false);
  const coach = profile.coach;

  // The session's seed, after mount (hydration); the table only ever replaces the prerendered one.
  useEffect(() => {
    const seed = parseSeed(seedParam) ?? (Math.floor(Math.random() * 0xffffffff) >>> 0 || 1);
    setTable(createBaccaratTable(DEFAULT_BACCARAT_RULES, seed));
    setSeeded(true);
  }, []);

  // The session ends after a mid-coup hand is settled (see the leave effect below).
  const sessionRef = useRef<string | null>(null);
  useEffect(() => {
    const id = makeSessionId("baccarat");
    sessionRef.current = id;
    startProgressSession({ id, game: "baccarat" });
  }, []);

  // The deal: turn one card at a time.
  useEffect(() => {
    if (table.phase !== "deal") return;
    const timer = setTimeout(() => setTable((t) => revealNext(t)), REVEAL_MS);
    return () => clearTimeout(timer);
  }, [table.phase, table.revealed]);

  // Each coup's hand is recorded exactly once: at the payout, or when the player leaves mid-coup
  // (the cards are already decided, so the stake is never refunded). The ref survives a
  // bfcache restore, so a coup settled on `pagehide` is not recorded again when it pays out.
  const recordedCoup = useRef<unknown>(null);
  const recordOnce = useCallback((coup: unknown, net: number) => {
    if (coup === null || recordedCoup.current === coup) return;
    recordedCoup.current = coup;
    recordHand({ game: "baccarat", net });
  }, []);

  // The result sits a moment, then the dealer pays.
  useEffect(() => {
    if (table.phase !== "result") return;
    const timer = setTimeout(() => {
      const current = tableRef.current;
      const out = settle(current);
      if (!out) return;
      setTable(out.table);
      recordOnce(current.coup, out.net);
    }, RESULT_MS);
    return () => clearTimeout(timer);
  }, [table.phase, recordOnce]);

  // Leaving during the deal or the result settles the coup as it falls.
  useEffect(() => {
    const settleAbandoned = () => {
      const current = tableRef.current;
      const net = abandonedNet(current);
      if (net !== null) recordOnce(current.coup, net);
    };
    if (typeof window !== "undefined") window.addEventListener("pagehide", settleAbandoned);
    return () => {
      if (typeof window !== "undefined") window.removeEventListener("pagehide", settleAbandoned);
      settleAbandoned();
      if (sessionRef.current) endProgressSession(sessionRef.current);
    };
  }, [recordOnce]);

  const stored = view.ready ? gameBankroll(view.data, "baccarat") : undefined;
  // Chips on the felt have left the bankroll until the coup is paid.
  const staked = table.phase === "payout" ? 0 : totalStaked(table.bets);
  const bankroll = stored === undefined ? undefined : Math.round((stored - staked) * 100) / 100;
  /** What can still be staked from the bankroll (the layout's chips included). */
  const available = stored;

  const update = useCallback((fn: (t: BaccaratTable) => BaccaratTable) => setTable(fn), []);

  const actions = useMemo(
    () => ({
      place: (bet: BetKind, value: number) => update((t) => placeChip(t, bet, value, available)),
      remove: (bet: BetKind) => update((t) => removeChip(t, bet)),
      undo: () => update(undoChip),
      clear: () => update(clearBets),
      rebet: () => update((t) => rebet(t, available)),
      setRules: (rules: BaccaratRules) => update((t) => setRules(t, rules)),
      deal: (force = false) => {
        const current = tableRef.current;
        const hintShown = hintVisible(current, coach, hintAsked);
        const out = deal(current, coach, { available, force, hintShown });
        record(out.decisions);
        setTable(out.table);
        setHintAsked(false);
      },
      takeBack: () => update(takeBack),
      next: () => {
        setHintAsked(false);
        update((t) => nextHand(t));
      },
      rebetAndDeal: () => {
        const cleared = nextHand(tableRef.current);
        const placed = rebet(cleared, available);
        setHintAsked(false);
        if (totalStaked(placed.bets) <= 0 || placed.error) {
          setTable(placed);
          return;
        }
        const out = deal(placed, coach, { available });
        record(out.decisions);
        setTable(out.table);
      },
      /** Turns the remaining cards at once (tap on the felt while dealing). */
      revealAll: () =>
        update((t) => {
          if (t.phase !== "deal" || !t.coup) return t;
          return { ...t, revealed: dealSequence(t.coup).length, phase: "result" };
        }),
      askHint: () => setHintAsked(true),
      resetBankroll: () => resetBankroll("baccarat"),
    }),
    [update, available, coach, hintAsked],
  );

  return {
    table,
    seeded,
    coach,
    profileReady,
    bankroll,
    storedBankroll: stored,
    startingBankroll: PRACTICE_BANKROLL_START,
    hintAsked,
    actions,
  };
}
