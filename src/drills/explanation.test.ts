import { describe, expect, it } from "vitest";
import {
  type Card,
  type Rank,
  type RuleSet,
  DEFAULT_RULES,
  HI_LO,
  KO,
  OMEGA_II,
  RED_7,
  compositionWithout,
  createHand,
  fullShoeComposition,
  legalActions,
} from "@/engine";
import {
  INSURANCE_BREAK_EVEN_DENSITY,
  type DecisionSituation,
  buildCountContext,
  evLossFor,
  explainDecision,
  explainInsurance,
  snapshotHand,
  systemsWithIndexes,
} from "./explanation";

/** Dealer stands on soft 17 and there is no surrender — the game the I18 is quoted against. */
const S17_NO_SURRENDER: RuleSet = {
  ...DEFAULT_RULES,
  dealerSoft17: "stand",
  surrender: "none",
};

function card(rank: Rank, suit: Card["suit"] = "s"): Card {
  return { rank, suit };
}

interface SituationSpec {
  readonly player: readonly Rank[];
  readonly upcard: Rank;
  readonly rules?: RuleSet;
  readonly runningCount?: number;
  readonly cardsRemaining?: number;
  readonly system?: DecisionSituation["system"];
}

/**
 * A decision against an undealt shoe. The composition and the count are supplied
 * separately, exactly as a drill supplies them — see the note on `DecisionSituation`.
 */
function situation(spec: SituationSpec): DecisionSituation {
  const rules = spec.rules ?? DEFAULT_RULES;
  const system = spec.system ?? HI_LO;
  const cards = spec.player.map((rank) => card(rank));
  const upcard = card(spec.upcard, "h");
  const cardsRemaining = spec.cardsRemaining ?? rules.decks * 52 - cards.length - 1;

  return {
    rules,
    system,
    hand: createHand(cards, 10),
    handIndex: 0,
    handCount: 1,
    dealerUpcard: upcard,
    bankroll: 10_000,
    composition: compositionWithout(fullShoeComposition(rules.decks), [...cards, upcard]),
    count: buildCountContext({
      system,
      decks: rules.decks,
      runningCount: spec.runningCount ?? 0,
      cardsRemaining,
    }),
  };
}

describe("count context", () => {
  it("shows the division as well as its answer", () => {
    const count = buildCountContext({
      system: HI_LO,
      decks: 6,
      runningCount: 7,
      cardsRemaining: 156,
    });

    expect(count.decksRemaining).toBe(3);
    expect(count.exactTrueCount).toBeCloseTo(7 / 3);
    expect(count.trueCount).toBe(2);
    expect(count.trueCountNote).toBeNull();
  });

  it("truncates toward zero by default, in both directions", () => {
    const negative = buildCountContext({
      system: HI_LO,
      decks: 6,
      runningCount: -7,
      cardsRemaining: 104,
    });
    expect(negative.exactTrueCount).toBeCloseTo(-3.5);
    expect(negative.trueCount).toBe(-3);
  });

  it("declines to convert for an unbalanced system and says why", () => {
    const count = buildCountContext({
      system: KO,
      decks: 6,
      runningCount: -12,
      cardsRemaining: 156,
    });

    expect(count.trueCount).toBeNull();
    expect(count.exactTrueCount).toBeNull();
    expect(count.trueCountNote).toMatch(/unbalanced/i);
    // The Running Count still has to be right: KO's player holds the initial running count.
    expect(count.runningCount).toBe(-12);
  });

  // #25: under KO the play table shows the Key Count (-4 at six decks) beside this note. A bare
  // "pivot of 4" next to "-4" read as one number stated twice, wrongly. The note explains a
  // decision, so it names the pivot with what it means and carries no betting threshold.
  it("names an unbalanced system's pivot with its meaning, and no betting threshold", () => {
    for (const decks of [1, 2, 6, 8]) {
      const note = buildCountContext({ system: KO, decks, runningCount: 0, cardsRemaining: 104 })
        .trueCountNote as string;
      expect(note).toContain("Its pivot, +4, is the one Running Count that signals the same edge");
      expect(note).not.toMatch(/key count|raise|bet/i);
      // No Key Count leaks in: -4, +2, +1 and -6 are KO's published Key Counts.
      expect(note).not.toMatch(/-4|−4|\+2|\+1|-6/);
    }
  });

  it("checks Red 7 the same way: pivot named and explained, nothing else", () => {
    const note = buildCountContext({ system: RED_7, decks: 6, runningCount: -3, cardsRemaining: 208 })
      .trueCountNote as string;
    expect(note).toContain("Red 7 is unbalanced");
    expect(note).toContain("Its pivot, +0, is the one Running Count that signals the same edge");
    expect(note).not.toMatch(/key count|raise|bet/i);
  });

  it("returns null rather than throwing with no cards left to divide by", () => {
    const count = buildCountContext({
      system: HI_LO,
      decks: 6,
      runningCount: 5,
      cardsRemaining: 0,
    });

    expect(count.trueCount).toBeNull();
    expect(count.trueCountNote).toMatch(/no cards left/i);
  });
});

describe("decision explanation", () => {
  it("prices every legal action and nothing else", () => {
    const spot = situation({ player: ["8", "8"], upcard: "6" });
    const explanation = explainDecision(spot);

    const legal = legalActions({
      hand: spot.hand,
      rules: spot.rules,
      handCount: 1,
      bankroll: spot.bankroll,
    });
    expect(explanation.legalActions).toEqual(legal);
    expect(Object.keys(explanation.evs).sort()).toEqual([...legal].sort());
    expect(explanation.ranked).toHaveLength(legal.length);
  });

  it("ranks the actions best first and names the winner", () => {
    const explanation = explainDecision(situation({ player: ["10", "6"], upcard: "10" }));
    const evs = explanation.ranked.map((entry) => entry.ev);

    expect([...evs].sort((a, b) => b - a)).toEqual(evs);
    expect(explanation.bestByEv).toBe(explanation.ranked[0]?.action);
  });

  it("carries the governing chart cell, so the panel has something to highlight", () => {
    const explanation = explainDecision(
      situation({ player: ["A", "7"], upcard: "9", rules: S17_NO_SURRENDER }),
    );

    expect(explanation.cell.section).toBe("soft");
    expect(explanation.cell.row).toBe("A,7");
    expect(explanation.cell.upcard).toBe(9);
    expect(explanation.cell.code).toBe("H");
    expect(explanation.basicStrategyAction).toBe("hit");
  });

  it("carries the dealer's own odds, which is what justifies standing", () => {
    const explanation = explainDecision(
      situation({ player: ["10", "6"], upcard: "6", rules: S17_NO_SURRENDER }),
    );
    const dealer = explanation.dealer;
    expect(dealer).not.toBeNull();

    const total =
      dealer!.bust +
      dealer!.blackjack +
      Object.values(dealer!.totals).reduce((sum, probability) => sum + probability, 0);
    expect(total).toBeCloseTo(1, 8);
    // A six up busts far more often than it makes a hand — the reason hard 16 stands here.
    expect(dealer!.bust).toBeGreaterThan(0.4);
  });

  it("is built from the situation alone, so a correct answer is explained too", () => {
    const spot = situation({ player: ["10", "6"], upcard: "10", rules: S17_NO_SURRENDER });
    const explanation = explainDecision(spot);

    expect(evLossFor(explanation, "hit")).toBe(0);
    expect(evLossFor(explanation, "stand")).toBeGreaterThan(0);
    // The same numbers back the right answer and the wrong one.
    expect(explanation.evs.hit).toBeGreaterThan(explanation.evs.stand as number);
  });

  it("omits the EVs and says why when there is no shoe behind the question", () => {
    const explanation = explainDecision({
      ...situation({ player: ["10", "6"], upcard: "10", rules: S17_NO_SURRENDER }),
      composition: null,
    });

    expect(explanation.evs).toEqual({});
    expect(explanation.ranked).toEqual([]);
    expect(explanation.bestByEv).toBeNull();
    expect(explanation.dealer).toBeNull();
    expect(explanation.evNote).toMatch(/without a shoe/i);
    // The chart cell survives: it does not need a composition.
    expect(explanation.basicStrategyAction).toBe("hit");
  });

  it("snapshots the hand so feedback survives whatever the round does next", () => {
    const spot = situation({ player: ["A", "7"], upcard: "9" });
    const snapshot = explainDecision(spot).hand;

    expect(snapshot.playerCards.map((c) => c.rank)).toEqual(["A", "7"]);
    expect(snapshot.total).toBe(18);
    expect(snapshot.soft).toBe(true);
    expect(snapshot.dealerUpcard.rank).toBe("9");
    expect(snapshot).toEqual(snapshotHand(spot.hand, spot.dealerUpcard, 0, 1));
  });
});

describe("index explanation", () => {
  it("reports the index, the distance to it, and that it fired", () => {
    // Illustrious 18 #2: 16 vs 10 stands at a True Count of 0 or higher.
    const explanation = explainDecision(
      situation({
        player: ["10", "6"],
        upcard: "10",
        rules: S17_NO_SURRENDER,
        runningCount: 6,
        cardsRemaining: 156,
      }),
    );

    expect(explanation.count.trueCount).toBe(2);
    expect(explanation.index.entry?.id).toBe("16v10");
    expect(explanation.index.index).toBe(0);
    expect(explanation.index.direction).toBe("at-or-above");
    expect(explanation.index.distanceToIndex).toBe(2);
    expect(explanation.index.fired).toBe(true);
    expect(explanation.index.flipsAt).toBe(0);
    expect(explanation.countAwareAction).toBe("stand");
    expect(explanation.basicStrategyAction).toBe("hit");
  });

  it("stands at exactly the index — the value belongs to the 'at or above' side", () => {
    const explanation = explainDecision(
      situation({
        player: ["10", "6"],
        upcard: "10",
        rules: S17_NO_SURRENDER,
        runningCount: 0,
        cardsRemaining: 156,
      }),
    );

    expect(explanation.count.trueCount).toBe(0);
    expect(explanation.index.distanceToIndex).toBe(0);
    expect(explanation.index.fired).toBe(true);
    expect(explanation.countAwareAction).toBe("stand");
  });

  it("keeps the distance signed for an index that fires below itself", () => {
    // Illustrious 18 #14: 13 vs 2 hits *below* -1, and stands at exactly -1.
    const atIndex = explainDecision(
      situation({
        player: ["10", "3"],
        upcard: "2",
        rules: S17_NO_SURRENDER,
        runningCount: -3,
        cardsRemaining: 156,
      }),
    );
    expect(atIndex.count.trueCount).toBe(-1);
    expect(atIndex.index.entry?.id).toBe("13v2");
    expect(atIndex.index.direction).toBe("below");
    expect(atIndex.index.distanceToIndex).toBe(0);
    expect(atIndex.index.fired).toBe(false);
    expect(atIndex.countAwareAction).toBe("stand");

    const below = explainDecision(
      situation({
        player: ["10", "3"],
        upcard: "2",
        rules: S17_NO_SURRENDER,
        runningCount: -6,
        cardsRemaining: 156,
      }),
    );
    expect(below.count.trueCount).toBe(-2);
    expect(below.index.distanceToIndex).toBe(-1);
    expect(below.index.fired).toBe(true);
    expect(below.countAwareAction).toBe("hit");
  });

  it("declines for a system with no published indices, and names Hi-Lo as the one that has them", () => {
    for (const system of [KO, OMEGA_II, RED_7]) {
      const explanation = explainDecision(
        situation({ player: ["10", "6"], upcard: "10", rules: S17_NO_SURRENDER, system }),
      );

      expect(explanation.index.entry).toBeNull();
      expect(explanation.index.fired).toBe(false);
      expect(explanation.index.skipped).toBe("no-index-set");
      expect(explanation.index.systemNote).toContain(system.name);
      // Basic Strategy is unaffected: the chart does not need an index set.
      expect(explanation.countAwareAction).toBe(explanation.basicStrategyAction);
    }

    expect(systemsWithIndexes()).toEqual(["hi-lo"]);
  });

  it("declines when this Rule Set has already moved the cell the index departs from", () => {
    // Under late surrender, Basic Strategy surrenders 16 vs 10, so the I18's "stand instead
    // of hitting" has nothing left to depart from. The engine declines rather than guessing.
    const explanation = explainDecision(
      situation({
        player: ["10", "6"],
        upcard: "10",
        rules: { ...DEFAULT_RULES, surrender: "late" },
        runningCount: 12,
        cardsRemaining: 156,
      }),
    );

    expect(explanation.basicStrategyAction).toBe("surrender");
    expect(explanation.index.fired).toBe(false);
    expect(explanation.index.skipped).toBe("outside-published-rules");
    expect(explanation.countAwareAction).toBe("surrender");
  });
});

describe("insurance explanation", () => {
  const upcard = card("A", "h");

  function insuranceSpot(runningCount: number, cardsRemaining = 156) {
    return {
      system: HI_LO,
      dealerUpcard: upcard,
      composition: compositionWithout(fullShoeComposition(6), [upcard]),
      count: buildCountContext({ system: HI_LO, decks: 6, runningCount, cardsRemaining }),
    };
  }

  it("prices the bet off the ten density and breaks even at one in three", () => {
    const explanation = explainInsurance(insuranceSpot(0));

    // A fresh six-deck shoe less the ace: 96 tens in 311 cards.
    expect(explanation.tenDensity).toBeCloseTo(96 / 311);
    expect(explanation.breakEvenDensity).toBeCloseTo(INSURANCE_BREAK_EVEN_DENSITY);
    expect(explanation.ev).toBeCloseTo(1.5 * (96 / 311) - 0.5);
    expect(explanation.ev).toBeLessThan(0);
  });

  it("never makes insurance a Basic Strategy play", () => {
    expect(explainInsurance(insuranceSpot(30)).basicStrategyAction).toBe("decline-insurance");
  });

  it("takes the bet at the published Hi-Lo index of +3 and not below it", () => {
    const below = explainInsurance(insuranceSpot(5, 156));
    expect(below.count.trueCount).toBe(1);
    expect(below.index.index).toBe(3);
    expect(below.index.distanceToIndex).toBe(-2);
    expect(below.index.fired).toBe(false);
    expect(below.countAwareAction).toBe("decline-insurance");

    const at = explainInsurance(insuranceSpot(9, 156));
    expect(at.count.trueCount).toBe(3);
    expect(at.index.distanceToIndex).toBe(0);
    expect(at.index.fired).toBe(true);
    expect(at.countAwareAction).toBe("insurance");
  });

  it("declines an index for a system that publishes none", () => {
    const explanation = explainInsurance({
      ...insuranceSpot(9),
      system: RED_7,
      count: buildCountContext({ system: RED_7, decks: 6, runningCount: 9, cardsRemaining: 156 }),
    });

    expect(explanation.index.skipped).toBe("no-index-set");
    expect(explanation.countAwareAction).toBe("decline-insurance");
  });
});
