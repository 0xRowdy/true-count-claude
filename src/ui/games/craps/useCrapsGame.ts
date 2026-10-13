/**
 * Binds the craps view model (`model.ts`) to React, the profile (coach level) and the progress
 * store (practice bankroll, decisions, hands, the session).
 *
 * Hydration: the first render is the fixed initial table with no seed and no bankroll. The seed
 * (`?seed=<n>` or a random one) is drawn in an effect after mount, and the bankroll appears once
 * storage has answered.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TableAction } from "@/games/craps";
import { bankroll as gameBankroll } from "@/state/progressSelectors";
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
  type CoachLevel,
  type GameState,
  type Spot,
  afterReset,
  askCoach,
  breakageCheck,
  clearWindow,
  dismissNote,
  editBet,
  fixAmount,
  initialGame,
  onLayout,
  openBetting,
  placeChip,
  rebet,
  removeChip,
  showPayout,
  showResult,
  takeBack,
  takeMaxOdds,
  throwDice,
  undo,
  withSeed,
} from "./model";

/** How long the dice tumble, and how long the result shows before the payout. */
export const ROLL_MS = 650;
export const RESULT_MS = 1400;

export function useCrapsGame(seedParam: string | undefined) {
  const [state, setState] = useState<GameState>(initialGame);
  const ref = useRef(state);
  ref.current = state;
  const { profile } = useProfile();
  const coach: CoachLevel = profile.coach;
  const view = useProgressView(false);
  const stored = view.ready ? gameBankroll(view.data, "craps") : undefined;
  // The bankroll before the roll, held through the Roll and Result phases.
  const [frozen, setFrozen] = useState<number | null>(null);

  // Seed and session, after mount.
  useEffect(() => {
    const parsed = seedParam !== undefined ? Number.parseInt(seedParam, 10) : Number.NaN;
    const seed = Number.isFinite(parsed) ? parsed : Math.floor(Math.random() * 0xffffffff);
    setState((s) => withSeed(s, seed));
    const id = makeSessionId("craps");
    startProgressSession({ id, game: "craps" });
    return () => endProgressSession(id);
  }, [seedParam]);

  // Roll → Result → Payout, one timer per phase of each roll.
  const { phase } = state;
  const rolls = state.table.rollCount;
  useEffect(() => {
    if (phase !== "roll" && phase !== "result") return undefined;
    const t = setTimeout(
      () => setState(phase === "roll" ? showResult : showPayout),
      phase === "roll" ? ROLL_MS : RESULT_MS,
    );
    return () => clearTimeout(t);
  }, [phase, rolls]);

  // The held bankroll is released at the Payout.
  const settled = phase === "bet" || phase === "payout";
  useEffect(() => {
    if (settled) setFrozen(null);
  }, [settled]);

  const exposure = onLayout(state);
  const available = stored === undefined ? 0 : stored - exposure;
  const shownBankroll =
    frozen !== null && (state.phase === "roll" || state.phase === "result")
      ? frozen
      : stored === undefined
        ? undefined
        : available;

  const update = useCallback((next: GameState) => {
    ref.current = next;
    setState(next);
  }, []);

  const actions = useMemo(
    () => ({
      place(spot: Spot, chip: number) {
        if (stored === undefined) return;
        update(placeChip(ref.current, spot, chip, available, coach));
      },
      remove(spot: Spot, chip: number) {
        update(removeChip(ref.current, spot, chip));
      },
      undo: () => update(undo(ref.current)),
      clear: () => update(clearWindow(ref.current)),
      rebet: () => update(rebet(ref.current, available, coach)),
      edit: (action: TableAction) => update(editBet(ref.current, action, coach)),
      openBetting: () => update(openBetting(ref.current)),
      takeBack(spot: Spot) {
        update(takeBack(ref.current, spot));
      },
      maxOdds: () => update(takeMaxOdds(ref.current, coach)),
      dismiss: () => update(dismissNote(ref.current)),
      hint: () => update(askCoach(ref.current)),
      fix(spot: Spot, amount: number) {
        update(fixAmount(ref.current, spot, amount));
      },
      /** Rolls; a breaking place bet is caught first unless the player rolls anyway. */
      roll(anyway = false) {
        const s = ref.current;
        // Result and Payout always show: the next roll waits for the payout.
        if (s.seed === null || s.phase === "roll" || s.phase === "result") return;
        const caught = anyway ? null : breakageCheck(s, coach, available);
        if (caught) {
          update(caught);
          return;
        }
        const { state: next, effects } = throwDice(s, coach);
        setFrozen(stored === undefined ? null : available);
        for (const d of effects.decisions) recordDecision({ game: "craps", ...d });
        if (effects.hand !== null) recordHand({ game: "craps", net: effects.hand });
        update(next);
      },
      /** Invariant 6: a bankroll at zero always offers a one-tap reset in place. */
      resetBankroll() {
        resetBankroll("craps");
        update(afterReset(ref.current));
      },
    }),
    [available, coach, stored, update],
  );

  const broke = stored !== undefined && available < 1 && exposure === 0;
  return { state, coach, bankroll: shownBankroll, available, exposure, broke, ...actions };
}
