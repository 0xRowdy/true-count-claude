import { describe, expect, it } from "vitest";
import type { Card, Rank } from "./cards";
import { type Action, type Hand, createHand, legalActions } from "./hand";
import { DEFAULT_RULES, type RuleSet } from "./rules";
import {
  DEALER_UPCARDS,
  type ChartCode,
  type ChartRow,
  type DealerUpcard,
  type HardTotal,
  type PairRank,
  type SoftTotal,
  basicStrategy,
  governingCell,
  strategyChart,
} from "./strategy";
import { REFERENCE_CHARTS } from "./strategy.reference";

/**
 * Invariant 4 (CONTEXT.md): the strategy engine is auditable. "Wrong math" is 21% of
 * low-star reviews in this category and a single bad cell discredits the whole app
 * (ADR-0002), so the whole chart is asserted cell by cell against the published tables in
 * `strategy.reference.ts` on every commit.
 */

const card = (rank: Rank, suit: Card["suit"] = "s"): Card => ({ rank, suit });
const hand = (ranks: Rank[], fromSplit = false): Hand =>
  createHand(
    ranks.map((rank, index) => card(rank, index === 0 ? "s" : "h")),
    10,
    fromSplit,
  );

const upcardName = (upcard: DealerUpcard) => (upcard === 11 ? "A" : String(upcard));

/** Published-chart symbols, spelled out here so the test does not import the generator's map. */
const CODES: Readonly<Record<string, ChartCode>> = {
  H: "H",
  S: "S",
  D: "D",
  d: "Ds",
  P: "P",
  R: "Rh",
  r: "Rs",
  p: "Rp",
};

/**
 * Compares one chart row against its published counterpart, one cell at a time, labelling
 * each comparison so a failure names the exact cell rather than a diff of ten letters.
 */
function expectRow(actual: ChartRow, published: string, label: string): void {
  DEALER_UPCARDS.forEach((upcard, index) => {
    const cell = `${label} vs ${upcardName(upcard)}`;
    expect(`${cell}: ${actual[upcard]}`).toBe(`${cell}: ${CODES[published[index] ?? ""]}`);
  });
}

describe.each(REFERENCE_CHARTS)("$name — generated chart vs published table", (reference) => {
  const chart = strategyChart(reference.rules);

  describe("hard totals", () => {
    for (const [total, published] of Object.entries(reference.hard)) {
      it(`hard ${total}`, () => {
        expectRow(chart.hard[Number(total) as HardTotal], published, `hard ${total}`);
      });
    }

    it("stands on every hard total above 18 and hits an unsplittable hard 4", () => {
      for (const total of [19, 20, 21] as HardTotal[]) {
        expectRow(chart.hard[total], "SSSSSSSSSS", `hard ${total}`);
      }
      expect(chart.hard[4]).toEqual(chart.hard[5]);
    });
  });

  describe("soft totals", () => {
    for (const [total, published] of Object.entries(reference.soft)) {
      const label = `A,${Number(total) - 11}`;
      it(`soft ${total} (${label})`, () => {
        expectRow(chart.soft[Number(total) as SoftTotal], published, label);
      });
    }

    it("always draws an unsplittable soft 12 and stands on soft 21", () => {
      expectRow(chart.soft[12], "HHHHHHHHHH", "soft 12");
      expectRow(chart.soft[21], "SSSSSSSSSS", "soft 21");
    });
  });

  describe("pairs", () => {
    for (const [rank, published] of Object.entries(reference.pairs)) {
      it(`pair of ${rank}s`, () => {
        expectRow(chart.pairs[rank as PairRank], published, `${rank},${rank}`);
      });
    }
  });
});

/**
 * The four cells competitors have actually shipped wrong. Each of these is a real failure
 * documented in `docs/research/` or ADR-0002, kept here as a regression test so it can
 * never come back.
 */
describe("known competitor failures", () => {
  const sixDeckH17 = DEFAULT_RULES; // 6D H17 DAS LS
  const sixDeckS17: RuleSet = { ...DEFAULT_RULES, dealerSoft17: "stand" };

  it("does not treat a pair of 9s as always stand", () => {
    // A shipped competitor advises standing on 9,9 in all cases (ADR-0002). The published
    // rule is: split vs 2-6 and vs 8-9, stand vs 7, 10 and ace.
    const nines = hand(["9", "9"]);
    for (const upcard of [2, 3, 4, 5, 6, 8, 9] as const) {
      expect(`9,9 vs ${upcard}: ${basicStrategy(nines, card(rankFor(upcard)), sixDeckH17)}`).toBe(
        `9,9 vs ${upcard}: split`,
      );
    }
    for (const upcard of [7, 10, 11] as const) {
      const label = `9,9 vs ${upcardName(upcard)}`;
      expect(`${label}: ${basicStrategy(nines, card(rankFor(upcard)), sixDeckH17)}`).toBe(
        `${label}: stand`,
      );
    }
  });

  it("plays hard 16 vs 10 correctly under every surrender rule", () => {
    const sixteen = hand(["10", "6"]);
    const ten = card("10");

    // Six decks with late surrender: give it up. Without surrender: hit — never stand.
    expect(basicStrategy(sixteen, ten, sixDeckH17)).toBe("surrender");
    expect(basicStrategy(sixteen, ten, { ...sixDeckH17, surrender: "none" })).toBe("hit");
    expect(basicStrategy(sixteen, ten, { ...sixDeckH17, decks: 1, surrender: "none" })).toBe("hit");

    // A three-card 16 can no longer surrender, so the published fallback applies: hit.
    const threeCardSixteen = hand(["5", "5", "6"]);
    const cell = governingCell(threeCardSixteen, ten, sixDeckH17);
    expect(cell.code).toBe("Rh");
    expect(cell.action).toBe("hit");
    expect(cell.usedFallback).toBe(true);
  });

  it("plays soft 18 correctly against 9, 10 and an ace", () => {
    // Soft 18 is not a stand against the three strongest upcards; it draws.
    const softEighteen = hand(["A", "7"]);
    for (const rules of [sixDeckH17, sixDeckS17]) {
      for (const upcard of [9, 10, 11] as const) {
        const label = `A,7 vs ${upcardName(upcard)} (${rules.dealerSoft17 === "hit" ? "H17" : "S17"})`;
        expect(`${label}: ${basicStrategy(softEighteen, card(rankFor(upcard)), rules)}`).toBe(
          `${label}: hit`,
        );
      }
    }

    // The single published exception: single-deck S17 stands on soft 18 vs an ace.
    const singleDeckS17: RuleSet = { ...sixDeckS17, decks: 1, surrender: "none" };
    expect(basicStrategy(softEighteen, card("A"), singleDeckS17)).toBe("stand");

    // And it is still a double-or-stand against the weak upcards, never a plain stand.
    expect(basicStrategy(softEighteen, card("4"), sixDeckH17)).toBe("double");
    expect(basicStrategy(softEighteen, card("2"), sixDeckH17)).toBe("double"); // H17 only
    expect(basicStrategy(softEighteen, card("2"), sixDeckS17)).toBe("stand");
  });

  it("always splits aces in a game where the dealer peeks", () => {
    const aces = hand(["A", "A"]);
    for (const rules of peekedPermutations()) {
      for (const upcard of DEALER_UPCARDS) {
        const label = `A,A vs ${upcardName(upcard)} (${ruleLabel(rules)})`;
        expect(`${label}: ${basicStrategy(aces, card(rankFor(upcard)), rules)}`).toBe(
          `${label}: split`,
        );
      }
    }
  });

  it("never plays a pair of eights as a hard 16 in a game where the dealer peeks", () => {
    // Hard 16 is the worst total in blackjack; a competitor that hits or stands 8,8 is
    // the failure this guards. Splitting or giving it up are the only correct answers.
    const eights = hand(["8", "8"]);
    for (const rules of peekedPermutations()) {
      for (const upcard of DEALER_UPCARDS) {
        const action = basicStrategy(eights, card(rankFor(upcard)), rules);
        const label = `8,8 vs ${upcardName(upcard)} (${ruleLabel(rules)})`;
        expect(`${label}: ${action === "split" || action === "surrender"}`).toBe(`${label}: true`);
      }
    }
  });

  it("always splits eights when surrender is not on offer", () => {
    const eights = hand(["8", "8"]);
    const withoutSurrender = peekedPermutations().filter((rules) => rules.surrender === "none");
    for (const rules of withoutSurrender) {
      for (const upcard of DEALER_UPCARDS) {
        const label = `8,8 vs ${upcardName(upcard)} (${ruleLabel(rules)})`;
        expect(`${label}: ${basicStrategy(eights, card(rankFor(upcard)), rules)}`).toBe(
          `${label}: split`,
        );
      }
    }
  });

  it("gives up a pair of eights only where the published tables do", () => {
    const eights = hand(["8", "8"]);
    const sixDeck: RuleSet = { ...DEFAULT_RULES, decks: 6 };

    // Wizard of Odds, 4-8 decks, dealer stands on soft 17: "Surrender hard 16 (but not a
    // pair of 8s) vs. dealer 9, 10, or A".
    for (const upcard of [9, 10, 11] as const) {
      const rules: RuleSet = { ...sixDeck, dealerSoft17: "stand", surrender: "late" };
      const label = `8,8 vs ${upcardName(upcard)} (6D S17 LS)`;
      expect(`${label}: ${basicStrategy(eights, card(rankFor(upcard)), rules)}`).toBe(
        `${label}: split`,
      );
    }

    // Wizard of Odds, dealer hits on soft 17: "Surrender 15, a pair of 8s, and 17 vs.
    // dealer A." Against anything but an ace it still splits.
    const h17Late: RuleSet = { ...sixDeck, dealerSoft17: "hit", surrender: "late" };
    expect(basicStrategy(eights, card("A"), h17Late)).toBe("surrender");
    expect(basicStrategy(eights, card("10"), h17Late)).toBe("split");
    // The short-shoe exceptions to that exception: single deck, and two decks with DAS.
    expect(basicStrategy(eights, card("A"), { ...h17Late, decks: 1 })).toBe("split");
    expect(
      basicStrategy(eights, card("A"), { ...h17Late, decks: 2, doubleAfterSplit: true }),
    ).toBe("split");

    // Early surrender is settled before the dealer checks the hole card, which is worth
    // far more, so it takes the 8s back against both a ten and an ace.
    const early: RuleSet = { ...sixDeck, surrender: "early" };
    expect(basicStrategy(eights, card("10"), early)).toBe("surrender");
    expect(basicStrategy(eights, card("A"), early)).toBe("surrender");
    expect(basicStrategy(eights, card("9"), early)).toBe("split");
  });
});

/**
 * The charts have to move with the Rule Set, not just with the deck count. Each case here
 * pins one rule to one cell it is known to govern.
 */
describe("rule sensitivity", () => {
  const base = DEFAULT_RULES;

  it("moves hard 9 vs 2 with the deck count", () => {
    expect(basicStrategy(hand(["2", "7"]), card("2"), { ...base, decks: 1 })).toBe("double");
    expect(basicStrategy(hand(["2", "7"]), card("2"), { ...base, decks: 2 })).toBe("double");
    expect(basicStrategy(hand(["2", "7"]), card("2"), { ...base, decks: 6 })).toBe("hit");
  });

  it("moves hard 11 vs A and soft 19 vs 6 with S17 / H17", () => {
    const h17: RuleSet = { ...base, dealerSoft17: "hit" };
    const s17: RuleSet = { ...base, dealerSoft17: "stand" };
    expect(basicStrategy(hand(["2", "9"]), card("A"), h17)).toBe("double");
    expect(basicStrategy(hand(["2", "9"]), card("A"), s17)).toBe("hit");
    expect(basicStrategy(hand(["A", "8"]), card("6"), h17)).toBe("double");
    expect(basicStrategy(hand(["A", "8"]), card("6"), s17)).toBe("stand");
  });

  it("moves 4,4 and 6,6 with double-after-split", () => {
    const das: RuleSet = { ...base, doubleAfterSplit: true };
    const ndas: RuleSet = { ...base, doubleAfterSplit: false };
    expect(basicStrategy(hand(["4", "4"]), card("5"), das)).toBe("split");
    expect(basicStrategy(hand(["4", "4"]), card("5"), ndas)).toBe("hit");
    expect(basicStrategy(hand(["6", "6"]), card("2"), das)).toBe("split");
    expect(basicStrategy(hand(["6", "6"]), card("2"), ndas)).toBe("hit");
  });

  it("moves hard 15 and 16 with surrender availability", () => {
    expect(basicStrategy(hand(["10", "6"]), card("9"), { ...base, surrender: "late" })).toBe(
      "surrender",
    );
    expect(basicStrategy(hand(["10", "6"]), card("9"), { ...base, surrender: "none" })).toBe("hit");
    // Hard 16 vs 9 only surrenders from four decks up.
    expect(
      basicStrategy(hand(["10", "6"]), card("9"), { ...base, decks: 2, surrender: "late" }),
    ).toBe("hit");
    // Hard 17 vs an ace is given up only under H17 with late surrender.
    expect(basicStrategy(hand(["10", "7"]), card("A"), base)).toBe("surrender");
    expect(
      basicStrategy(hand(["10", "7"]), card("A"), { ...base, dealerSoft17: "stand" }),
    ).toBe("stand");
  });

  it("withdraws doubles the rule set forbids", () => {
    const nineToEleven: RuleSet = { ...base, doubleRule: "9-11" };
    const tenToEleven: RuleSet = { ...base, doubleRule: "10-11" };

    // Hard 9 is inside the 9-11 range but outside 10-11.
    expect(basicStrategy(hand(["2", "7"]), card("4"), nineToEleven)).toBe("double");
    expect(basicStrategy(hand(["2", "7"]), card("4"), tenToEleven)).toBe("hit");

    // Soft doubles need unrestricted doubling. Soft 17 falls back to hit, soft 18 to stand.
    expect(basicStrategy(hand(["A", "6"]), card("4"), nineToEleven)).toBe("hit");
    expect(basicStrategy(hand(["A", "7"]), card("4"), nineToEleven)).toBe("stand");

    // Hard 10 and 11 are inside every range.
    expect(basicStrategy(hand(["2", "8"]), card("4"), tenToEleven)).toBe("double");
    expect(basicStrategy(hand(["2", "9"]), card("4"), tenToEleven)).toBe("double");
  });

  it("stops splitting aces and eights when the dealer does not peek", () => {
    // Without a peek the split money is exposed to a dealer blackjack, so the published
    // no-peek tables play the hand instead of putting a second bet out.
    const noPeek: RuleSet = { ...base, dealerPeek: false, surrender: "none" };
    expect(basicStrategy(hand(["A", "A"]), card("A"), noPeek)).toBe("hit");
    expect(basicStrategy(hand(["8", "8"]), card("A"), noPeek)).toBe("hit");
    expect(basicStrategy(hand(["A", "A"]), card("10"), noPeek)).toBe("split");
  });
});

/**
 * Invariant 7 (CONTEXT.md) makes `legalActions` the single source of truth for what the
 * player may do. Basic Strategy must therefore never name something outside it.
 */
describe("basicStrategy never names an illegal action", () => {
  const ruleSets = rulePermutations();

  // The sweep is exhaustive on purpose (#17 chose deduplication over sampling), so it is the
  // one test in the suite that does real work for seconds rather than milliseconds: ~3.2 s
  // on a developer machine, ~5.2 s on a GitHub Actions runner. Vitest's 5 s default made
  // CI fail intermittently on it with no defect in the code. The limit is raised for this
  // test alone so a genuine hang anywhere else still trips the default.
  const SWEEP_TIMEOUT_MS = 60_000;

  it(`holds across ${ruleSets.length} rule sets and every chart row`, () => {
    // Every violation is collected rather than asserted in place: this is roughly 760,000
    // decisions, and a per-decision matcher is slower than the engine it is checking.
    const violations: string[] = [];

    for (const rules of ruleSets) {
      const chartKey = chartIdentity(rules);
      for (const probe of probeHands(rules)) {
        for (const upcard of DEALER_UPCARDS) {
          const context = { handCount: probe.handCount, bankroll: probe.bankroll };
          const legal = legalActions({ hand: probe.hand, rules, ...context });
          if (alreadyChecked(chartKey, probe, upcard, legal)) continue;

          const action = basicStrategy(probe.hand, card(rankFor(upcard)), rules, context);
          const label = `${probe.label} vs ${upcardName(upcard)} (${ruleLabel(rules)})`;

          if (legal.length === 0) {
            // Nothing left to decide: busted, a natural, or a closed split ace.
            if (action !== "stand") violations.push(`${label}: ${action} on a finished hand`);
          } else if (!legal.includes(action)) {
            violations.push(`${label}: ${action} not in [${legal.join(", ")}]`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  }, SWEEP_TIMEOUT_MS);

  it("falls back when the resplit limit closes a split off", () => {
    // At four hands the pairs chart no longer applies, so 8,8 is read as hard 16.
    const cell = governingCell(hand(["8", "8"]), card("10"), DEFAULT_RULES, { handCount: 4 });
    expect(cell.section).toBe("hard");
    expect(cell.row).toBe("16");
    expect(cell.action).toBe("surrender");

    // And an unsplittable A,A is soft 12, which always draws.
    const aces = governingCell(hand(["A", "A"]), card("6"), DEFAULT_RULES, { handCount: 4 });
    expect(aces.section).toBe("soft");
    expect(aces.action).toBe("hit");
  });

  it("falls back when double-after-split is forbidden", () => {
    const rules: RuleSet = { ...DEFAULT_RULES, doubleAfterSplit: false };
    const cell = governingCell(hand(["5", "6"], true), card("6"), rules);
    expect(cell.code).toBe("D");
    expect(cell.action).toBe("hit");
    expect(cell.usedFallback).toBe(true);
  });

  it("falls back when surrender is not available on a split hand", () => {
    const cell = governingCell(hand(["10", "7"], true), card("A"), DEFAULT_RULES);
    expect(cell.code).toBe("Rs");
    expect(cell.action).toBe("stand");
    expect(cell.usedFallback).toBe(true);
  });

  it("falls back when a frozen split ace cannot take the cell's only play (#17)", () => {
    // The cell that has no published fallback. A no-peek table prints "H" for A,A vs an
    // ace, but with `resplitAces` on top of `oneCardToSplitAces` a split ace holding a
    // second ace may only stand or split — hitting is not on offer, and "H" names no
    // second choice. The chart is still right; the hand just cannot play it.
    const rules: RuleSet = {
      ...DEFAULT_RULES,
      dealerPeek: false,
      resplitAces: true,
      oneCardToSplitAces: true,
    };
    const splitAces = hand(["A", "A"], true);
    const legal = legalActions({ hand: splitAces, rules, handCount: 1, bankroll: 1000 });
    expect(legal).toEqual(["stand", "split"]);

    const cell = governingCell(splitAces, card("A"), rules);
    // The Explanation panel still gets the cell that governs (#8, ADR-0005): the pairs
    // row, the published code, and the flag saying the printed play was unavailable.
    expect(cell.section).toBe("pairs");
    expect(cell.row).toBe("A,A");
    expect(cell.code).toBe("H");
    expect(cell.usedFallback).toBe(true);
    // Standing is the play: the no-peek cell declines to put a second bet out, so the
    // fallback must not reach for the split.
    expect(cell.action).toBe("stand");
    expect(legal).toContain(cell.action);
  });
});

/** The chart cell is the payload the Explanation panel highlights (ADR-0005). */
describe("governingCell", () => {
  it("names the published row for each chart", () => {
    expect(governingCell(hand(["10", "6"]), card("9"), DEFAULT_RULES)).toMatchObject({
      section: "hard",
      row: "16",
      upcard: 9,
      code: "Rh",
      action: "surrender",
      usedFallback: false,
    });
    expect(governingCell(hand(["A", "7"]), card("4"), DEFAULT_RULES)).toMatchObject({
      section: "soft",
      row: "A,7",
      upcard: 4,
      code: "Ds",
      action: "double",
    });
    expect(governingCell(hand(["K", "Q"]), card("4"), DEFAULT_RULES)).toMatchObject({
      section: "pairs",
      row: "10,10",
      code: "S",
      action: "stand",
    });
    expect(governingCell(hand(["A", "A"]), card("4"), DEFAULT_RULES)).toMatchObject({
      section: "pairs",
      row: "A,A",
      code: "P",
      action: "split",
    });
  });

  it("reads an ace upcard as column 11 and every ten-rank as column 10", () => {
    expect(governingCell(hand(["10", "6"]), card("A"), DEFAULT_RULES).upcard).toBe(11);
    for (const rank of ["10", "J", "Q", "K"] as const) {
      expect(governingCell(hand(["10", "6"]), card(rank), DEFAULT_RULES).upcard).toBe(10);
    }
  });

  it("stands on a hand that has nothing left to decide", () => {
    expect(basicStrategy(hand(["K", "Q", "5"]), card("6"), DEFAULT_RULES)).toBe("stand");
    expect(basicStrategy(hand(["A", "K"]), card("6"), DEFAULT_RULES)).toBe("stand");
  });
});

// ---------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------

function rankFor(upcard: DealerUpcard): Rank {
  if (upcard === 11) return "A";
  return String(upcard) as Rank;
}

/** Short rule-set label, used so a failure message says which table it came from. */
function ruleLabel(rules: RuleSet): string {
  return [
    `${rules.decks}D`,
    rules.dealerSoft17 === "hit" ? "H17" : "S17",
    rules.doubleAfterSplit ? "DAS" : "NDAS",
    rules.doubleRule,
    rules.surrender,
    rules.dealerPeek ? "peek" : "no-peek",
    rules.resplitAces ? "RSA" : "NRSA",
    rules.oneCardToSplitAces ? "1-card-aces" : "draw-to-aces",
  ].join(" ");
}

/**
 * Every rule set the sweep checks.
 *
 * The split-ace rules are in here because they change `legalActions` without changing a
 * single chart cell, which is exactly the shape of bug the sweep exists to catch: a
 * no-peek table publishes `"H"` for A,A vs an ace, and `resplitAces` plus
 * `oneCardToSplitAces` together leave a split ace holding only stand and split (#17).
 */
function rulePermutations(): RuleSet[] {
  const out: RuleSet[] = [];
  for (const decks of [1, 2, 6, 8]) {
    for (const dealerSoft17 of ["stand", "hit"] as const) {
      for (const doubleAfterSplit of [true, false]) {
        for (const doubleRule of ["any", "9-11", "10-11"] as const) {
          for (const surrender of ["none", "late", "early"] as const) {
            for (const dealerPeek of [true, false]) {
              for (const resplitAces of [true, false]) {
                for (const oneCardToSplitAces of [true, false]) {
                  out.push({
                    ...DEFAULT_RULES,
                    decks,
                    dealerSoft17,
                    doubleAfterSplit,
                    doubleRule,
                    surrender,
                    dealerPeek,
                    resplitAces,
                    oneCardToSplitAces,
                  });
                }
              }
            }
          }
        }
      }
    }
  }
  return out;
}

/** Peeked games only — the no-peek tables deliberately stop splitting against an ace. */
function peekedPermutations(): RuleSet[] {
  return rulePermutations().filter((rules) => rules.dealerPeek);
}

// ---------------------------------------------------------------------------
// Sweep de-duplication
// ---------------------------------------------------------------------------

/**
 * The generated chart itself, serialised, as a rule set's identity for sweep purposes.
 *
 * Adding the two split-ace rules multiplied the sweep fourfold, and essentially all of
 * its cost is `strategyChart` re-deriving the same chart for every decision — the chart
 * is rebuilt once per `basicStrategy` call by design (it is pure and cheap, and ADR-0002
 * leaves caching to callers), so 1152 rule sets times 54 probes times 10 upcards is over
 * 600,000 rebuilds of a few hundred distinct charts.
 *
 * Rather than sample the rule space and give up coverage, the sweep skips decisions it
 * has provably already made. This is the exact chart, not a guess at which rules feed it,
 * so two rule sets share a key only when their charts are genuinely identical.
 */
const CHART_IDS = new Map<string, number>();

/**
 * Interns the three chart sections to a small integer, so the per-decision key stays short.
 *
 * `StrategyChart` carries its `RuleSet` alongside the sections, and that field is
 * deliberately left out here: including it would make all 1152 identities distinct and
 * defeat the whole exercise. The 1152 rule sets publish 204 distinct charts between them.
 */
function chartIdentity(rules: RuleSet): number {
  const chart = strategyChart(rules);
  const serialised = JSON.stringify([chart.hard, chart.soft, chart.pairs]);
  let id = CHART_IDS.get(serialised);
  if (id === undefined) {
    id = CHART_IDS.size;
    CHART_IDS.set(serialised, id);
  }
  return id;
}

const CHECKED = new Set<string>();

/**
 * True when this decision has already been swept.
 *
 * `governingCell` reads exactly two things: the chart, and `legalActions` for the hand.
 * So its verdict is fully determined by the chart, the hand and its context, the upcard,
 * and the resulting legal set — every one of which is in this key. A repeat can only
 * produce the repeat of an answer already checked, which keeps the coverage of all 1152
 * rule sets intact while doing the work of roughly the original 288.
 */
function alreadyChecked(
  chartKey: number,
  probe: Probe,
  upcard: DealerUpcard,
  legal: readonly Action[],
): boolean {
  const key = `${chartKey}|${probe.label}|${probe.handCount}|${probe.bankroll}|${upcard}|${legal.join(",")}`;
  if (CHECKED.has(key)) return true;
  CHECKED.add(key);
  return false;
}

interface Probe {
  readonly label: string;
  readonly hand: Hand;
  readonly handCount: number;
  readonly bankroll: number;
}

/** Two-card hard totals that are not pairs, so the hard chart is what gets read. */
const HARD_PROBES: Readonly<Record<number, Rank[]>> = {
  5: ["2", "3"],
  6: ["2", "4"],
  7: ["2", "5"],
  8: ["3", "5"],
  9: ["2", "7"],
  10: ["2", "8"],
  11: ["2", "9"],
  12: ["2", "10"],
  13: ["3", "10"],
  14: ["4", "10"],
  15: ["5", "10"],
  16: ["6", "10"],
  17: ["7", "10"],
  18: ["8", "10"],
  19: ["9", "10"],
  20: ["4", "6", "10"],
  21: ["5", "6", "10"],
};

function probeHands(rules: RuleSet): Probe[] {
  const probes: Probe[] = [];
  const add = (label: string, cards: Hand, handCount = 1, bankroll = 1000) =>
    probes.push({ label, hand: cards, handCount, bankroll });

  for (const [total, ranks] of Object.entries(HARD_PROBES)) {
    add(`hard ${total}`, hand(ranks));
  }
  for (const other of ["2", "3", "4", "5", "6", "7", "8", "9"] as const) {
    add(`A,${other}`, hand(["A", other]));
  }
  for (const rank of ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"] as const) {
    add(`${rank},${rank}`, hand([rank, rank]));
    add(`${rank},${rank} from split`, hand([rank, rank], true));
    add(`${rank},${rank} at the resplit limit`, hand([rank, rank]), rules.maxSplitHands);
    add(`${rank},${rank} on a short bankroll`, hand([rank, rank]), 1, 5);
  }
  // Hands whose chart cell prescribes a play the hand can no longer make.
  add("three-card 16", hand(["5", "5", "6"]));
  add("three-card 11", hand(["3", "3", "5"]));
  add("three-card soft 18", hand(["A", "3", "4"]));
  add("split 5,6", hand(["5", "6"], true));
  add("split 10,6", hand(["10", "6"], true));
  add("busted", hand(["K", "Q", "5"]));
  add("natural", hand(["A", "K"]));
  return probes;
}
