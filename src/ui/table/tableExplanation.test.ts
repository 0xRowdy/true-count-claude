/**
 * The Play table's Explanations, checked against the Play table's own record.
 *
 * The promise is narrow and it matters: the *why* on screen explains the verdict the Session
 * log stores. If the panel graded against one standard and the recorder against another, a
 * user would be told "correct" by the explanation and find "incorrect" in their statistics —
 * the "wrong math" failure in its most corrosive form. So hundreds of real seeded decisions
 * are played here, and every one is graded both ways and compared.
 */

import { describe, expect, it } from "vitest";
import { RANKS } from "@/engine/cards";
import type { CountingSystemId } from "@/engine/counting";
import type { RankComposition } from "@/engine/shoe";
import type { Action } from "@/engine/hand";
import { DEFAULT_RULES } from "@/engine/rules";
import { currentLegalActions } from "@/engine/round";
import { cardsRemaining } from "@/engine/shoe";
import { observeDecision } from "@/ui/session/sessionRecorder";
import {
  type PlayTable,
  chooseSystem,
  countReadout,
  createPlayTable,
  dealRound,
  nextRound,
  playAction,
  takeInsurance,
} from "./usePlayTable";
import {
  gradeTableInsurance,
  gradeTablePlay,
  tableDecisionSituation,
  tableInsuranceSituation,
} from "./tableExplanation";

/** A tiny deterministic generator, so the actions taken vary without the test being flaky. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function compositionSize(composition: RankComposition): number {
  return RANKS.reduce((total, rank) => total + composition[rank], 0);
}

const PENDING = { roundIndex: 0, shoeIndex: 0, shoeStartIndex: 0, decisions: [] } as const;

interface Observed {
  readonly plays: number;
  readonly insurance: number;
}

/**
 * Plays `rounds` rounds, choosing among the legal buttons at random, and runs `check` on the
 * table as it stands before every Decision.
 */
function playRounds(
  system: CountingSystemId,
  rounds: number,
  check: (table: PlayTable, decision: { kind: "play"; action: Action } | { kind: "insurance"; take: boolean }) => void,
): Observed {
  const random = lcg(7 + rounds);
  let table = chooseSystem(createPlayTable(DEFAULT_RULES, 424242), system);
  let plays = 0;
  let insurance = 0;

  for (let round = 0; round < rounds; round += 1) {
    table = dealRound({ ...table, bankroll: 10_000 });
    let guard = 0;
    while (table.round && table.round.phase !== "settled") {
      if (table.round.phase === "insurance") {
        const take = random() < 0.5;
        check(table, { kind: "insurance", take });
        insurance += 1;
        table = takeInsurance(table, take);
      } else {
        const legal = currentLegalActions(table.round);
        const action = legal[Math.floor(random() * legal.length)] as Action;
        check(table, { kind: "play", action });
        plays += 1;
        table = playAction(table, action);
      }
      if (++guard > 60) throw new Error("round did not settle");
    }
    table = nextRound(table);
  }
  return { plays, insurance };
}

describe("the Play table's explanations", () => {
  it("explain the same verdict the Session log records, for every decision", () => {
    const seen = playRounds("hi-lo", 250, (table, decision) => {
      const recorded = observeDecision(PENDING, table, decision, 0).decisions[0];
      const graded =
        decision.kind === "play"
          ? gradeTablePlay(table, decision.action, 0)
          : gradeTableInsurance(table, decision.take, 0);

      expect(recorded).toBeDefined();
      expect(graded).not.toBeNull();
      expect(graded?.actionTaken).toBe(recorded?.actionTaken);
      expect(graded?.correctAction).toBe(recorded?.correctAction);
      expect(graded?.basicStrategyAction).toBe(recorded?.basicStrategyAction);
      expect(graded?.verdict).toBe(recorded?.verdict);
    });
    expect(seen.plays).toBeGreaterThan(250);
    expect(seen.insurance).toBeGreaterThan(5);
  });

  it("agree with the recorder for a system with no index set and for an unbalanced one", () => {
    for (const system of ["omega-ii", "ko"] as const) {
      playRounds(system, 60, (table, decision) => {
        const recorded = observeDecision(PENDING, table, decision, 0).decisions[0];
        const graded =
          decision.kind === "play"
            ? gradeTablePlay(table, decision.action, 0)
            : gradeTableInsurance(table, decision.take, 0);
        expect(graded?.correctAction).toBe(recorded?.correctAction);
      });
    }
  });

  it("offer exactly the buttons on the table, and snapshot the hand being played", () => {
    playRounds("hi-lo", 80, (table, decision) => {
      if (decision.kind !== "play" || !table.round) return;
      const result = gradeTablePlay(table, decision.action, 0);
      const explanation = result?.explanation;
      const round = table.round;
      const hand = round.playerHands[round.activeHandIndex];

      // Invariant 7: the explanation prices the buttons the player had, no more and no fewer.
      expect([...(explanation?.legalActions ?? [])].sort()).toEqual(
        [...currentLegalActions(round)].sort(),
      );
      expect(Object.keys(explanation?.evs ?? {}).sort()).toEqual(
        [...currentLegalActions(round)].sort(),
      );
      expect(explanation?.hand.playerCards).toEqual(hand?.cards);
      expect(explanation?.hand.handIndex).toBe(round.activeHandIndex);
      expect(explanation?.hand.handCount).toBe(round.playerHands.length);
    });
  });

  it("read the count the player holds and price against the cards the player has not seen", () => {
    playRounds("hi-lo", 40, (table, decision) => {
      const situation =
        decision.kind === "play" ? tableDecisionSituation(table) : tableInsuranceSituation(table);
      const round = table.round;
      if (!situation || !round || !situation.composition) throw new Error("no situation");

      expect(situation.count.runningCount).toBe(countReadout(table).running);
      expect(situation.count.trueCount).toBe(countReadout(table).trueCount);
      // Still face down, so the hole card is unseen — in the composition, not in the count.
      const holeHidden = !round.dealerHoleCardRevealed;
      expect(compositionSize(situation.composition)).toBe(
        cardsRemaining(round.shoe) + (holeHidden ? 1 : 0),
      );
    });
  });

  it("refuse a tap that is not a button on the table", () => {
    const table = createPlayTable(DEFAULT_RULES, 1);
    expect(gradeTablePlay(table, "hit", 0)).toBeNull();
    expect(gradeTableInsurance(table, true, 0)).toBeNull();
  });
});
