import { describe, expect, it } from "vitest";
import type { Card, Rank } from "./cards";
import {
  COUNTING_SYSTEMS,
  HI_LO,
  KO,
  RED_7,
  WONG_HALVES,
  ZEN,
  trueCount,
} from "./counting";
import {
  FAB_4,
  HI_LO_INDEXES,
  ILLUSTRIOUS_18,
  INDEX_SETS,
  type IndexEntry,
  deviation,
  deviationLookup,
  getIndexSet,
  insuranceDeviation,
  insuranceIndex,
  shouldTakeInsurance,
} from "./deviations";
import { type Hand, createHand } from "./hand";
import { DEFAULT_RULES, type RuleSet } from "./rules";
import { basicStrategy } from "./strategy";

const card = (rank: Rank, suit: Card["suit"] = "s"): Card => ({ rank, suit });
const hand = (...ranks: Rank[]): Hand => createHand(ranks.map((rank) => card(rank)), 10);

/** Dealer upcards as the published tables write them: 11 is an ace. */
const up = (upcard: number): Card => card(upcard === 11 ? "A" : (String(upcard) as Rank));

/**
 * The game the Illustrious 18 and Fab 4 are quoted against: a multi-deck shoe, dealer stands
 * on soft 17, DAS. Surrender is off here because the I18's own table has no surrender in it —
 * see `BASELINE_WITH_SURRENDER` for the Fab 4.
 */
const BASELINE: RuleSet = {
  ...DEFAULT_RULES,
  decks: 6,
  dealerSoft17: "stand",
  surrender: "none",
};

/** The same game with late surrender, which is what the Fab 4 requires to be playable. */
const BASELINE_WITH_SURRENDER: RuleSet = { ...BASELINE, surrender: "late" };

/**
 * Two cards making the hard total a published index row names. Chosen so none of them is a
 * pair (which would be read off the pairs chart instead) and none is soft.
 */
const HARD_HANDS: Readonly<Record<number, readonly Rank[]>> = {
  9: ["7", "2"],
  10: ["8", "2"],
  11: ["9", "2"],
  12: ["10", "2"],
  13: ["J", "3"],
  14: ["Q", "4"],
  15: ["K", "5"],
  16: ["10", "6"],
};

/** The hand an index entry is about, built from its own `hand` coordinate. */
function handFor(entry: IndexEntry): Hand {
  if (entry.hand.kind === "pair") return hand(entry.hand.rank as Rank, entry.hand.rank as Rank);
  if (entry.hand.kind === "hard") {
    const ranks = HARD_HANDS[entry.hand.total];
    if (!ranks) throw new Error(`no test hand for hard ${entry.hand.total}`);
    return hand(...ranks);
  }
  throw new Error(`no test hand for ${entry.hand.kind}`);
}

/** The rule set an entry can actually be played under: the Fab 4 needs surrender offered. */
function rulesFor(entry: IndexEntry): RuleSet {
  return entry.set === "fab-4" ? BASELINE_WITH_SURRENDER : BASELINE;
}

// ---------------------------------------------------------------------------
// The published numbers
// ---------------------------------------------------------------------------

/**
 * Invariant 4 (CONTEXT.md): the math is auditable, and CI asserts it rather than trusting it.
 * These two tables are transcribed independently of `deviations.ts`, from Wizard of Odds'
 * republication of Schlesinger's *Blackjack Attack* tables, and cross-checked against
 * CountingEdge and GamblingCalc. All three agree on all 22 values.
 *
 *   https://wizardofodds.com/games/blackjack/card-counting/high-low/
 *   https://www.countingedge.com/blackjack-players/don-schlesinger/the-illustrious-18-card-counting-indices/
 *   https://gamblingcalc.com/casino/blackjack-deviations-calculator/
 *
 * Written in published order, which is order of expected gain, so a reader with the table in
 * the other hand can walk this block top to bottom.
 */
describe("the Illustrious 18, asserted against published values", () => {
  const published: ReadonlyArray<readonly [number, string, number, string]> = [
    // rank, play, index, action at or above the index
    [1, "Insurance", 3, "insurance"],
    [2, "16 vs 10", 0, "stand"],
    [3, "15 vs 10", 4, "stand"],
    [4, "10,10 vs 5", 5, "split"],
    [5, "10,10 vs 6", 4, "split"],
    [6, "10 vs 10", 4, "double"],
    [7, "12 vs 3", 2, "stand"],
    [8, "12 vs 2", 3, "stand"],
    [9, "11 vs A", 1, "double"],
    [10, "9 vs 2", 1, "double"],
    [11, "10 vs A", 4, "double"],
    [12, "9 vs 7", 3, "double"],
    [13, "16 vs 9", 5, "stand"],
    // 14-18 print the same way — "stand at or above the index" — but standing *is* Basic
    // Strategy here, so the departure is to hit below the index.
    [14, "13 vs 2", -1, "stand"],
    [15, "12 vs 4", 0, "stand"],
    [16, "12 vs 5", -2, "stand"],
    [17, "12 vs 6", -1, "stand"],
    [18, "13 vs 3", -2, "stand"],
  ];

  it("has exactly eighteen entries, in published order", () => {
    expect(ILLUSTRIOUS_18).toHaveLength(18);
    expect(ILLUSTRIOUS_18.map((entry) => entry.rank)).toEqual(published.map(([rank]) => rank));
    expect(ILLUSTRIOUS_18.map((entry) => entry.label)).toEqual(published.map(([, play]) => play));
  });

  it.each(published)("#%i %s has index %i", (rank, play, index, atOrAbove) => {
    const entry = ILLUSTRIOUS_18.find((candidate) => candidate.rank === rank);
    expect(entry).toBeDefined();
    expect(entry?.label).toBe(play);
    expect(entry?.index).toBe(index);
    // The published action is whichever side of the index is *not* the hit: entries 1-13
    // deviate to it, entries 14-18 deviate away from it.
    const published_action = entry?.direction === "at-or-above" ? entry?.deviate : entry?.from;
    expect(published_action).toBe(atOrAbove);
  });

  it("records the Basic Strategy play each index departs from", () => {
    // The deviation and the play it departs from must always be different, or the entry
    // would be describing a departure to the play the player was already making.
    for (const entry of ILLUSTRIOUS_18) {
      expect(entry.deviate).not.toBe(entry.from);
    }
  });

  it("puts the five negative-direction entries last, as published", () => {
    const below = ILLUSTRIOUS_18.filter((entry) => entry.direction === "below");
    expect(below.map((entry) => entry.label)).toEqual([
      "13 vs 2",
      "12 vs 4",
      "12 vs 5",
      "12 vs 6",
      "13 vs 3",
    ]);
    // Every one of them is "Basic Strategy stands; hit once the shoe goes low-card rich".
    for (const entry of below) {
      expect(entry.from).toBe("stand");
      expect(entry.deviate).toBe("hit");
    }
  });

  it("never publishes an index above +5, the set's documented ceiling", () => {
    for (const entry of ILLUSTRIOUS_18) {
      expect(entry.index).toBeLessThanOrEqual(5);
      expect(entry.index).toBeGreaterThanOrEqual(-2);
    }
  });
});

/**
 * The Fab 4 — Schlesinger's four late-surrender departures. Confirmed as a set (membership
 * and attribution) by the Encyclopedia of Blackjack, and the four index numbers by the same
 * three sources as the Illustrious 18.
 *
 *   https://www.blackjackreview.com/wp/encyclopedia/f/
 */
describe("the Fab 4, asserted against published values", () => {
  const published: ReadonlyArray<readonly [number, string, number]> = [
    [1, "14 vs 10", 3],
    [2, "15 vs 10", 0],
    [3, "15 vs 9", 2],
    [4, "15 vs A", 1],
  ];

  it("has exactly four entries, in published order", () => {
    expect(FAB_4).toHaveLength(4);
    expect(FAB_4.map((entry) => entry.label)).toEqual(published.map(([, play]) => play));
  });

  it.each(published)("#%i %s surrenders at %i or higher", (rank, play, index) => {
    const entry = FAB_4.find((candidate) => candidate.rank === rank);
    expect(entry?.label).toBe(play);
    expect(entry?.index).toBe(index);
    expect(entry?.deviate).toBe("surrender");
    expect(entry?.direction).toBe("at-or-above");
    expect(entry?.from).toBe("hit");
  });

  it("does not include 16 vs 8, which one source adds and no other counts as a Fab 4 play", () => {
    expect(FAB_4.map((entry) => entry.label)).not.toContain("16 vs 8");
  });
});

describe("the index set as data", () => {
  it("carries all 22 published entries with unique ids", () => {
    expect(HI_LO_INDEXES.entries).toHaveLength(22);
    expect(new Set(HI_LO_INDEXES.entries.map((entry) => entry.id)).size).toBe(22);
  });

  it("cites a source and names the baseline game", () => {
    for (const set of INDEX_SETS) {
      expect(set.source.length).toBeGreaterThan(0);
      expect(set.baseline.length).toBeGreaterThan(0);
    }
    expect(HI_LO_INDEXES.source).toMatch(/Schlesinger/);
  });

  it("belongs to Hi-Lo, and is not lent to any other system", () => {
    // An index is quoted against one system's true-count scale. Hi-Lo's +3 insurance index
    // means nothing in Zen, so the lookup returns nothing rather than a plausible wrong
    // answer — the same refusal `aceSideCount` makes in counting.ts.
    expect(getIndexSet(HI_LO)).toBe(HI_LO_INDEXES);
    for (const system of COUNTING_SYSTEMS) {
      if (system.id === "hi-lo") continue;
      expect(getIndexSet(system)).toBeUndefined();
    }
  });

  it("keeps the lookup generic: nothing reads the system id but the set registry", () => {
    // Adding a seventh system's indices is one entry in INDEX_SETS. Proven by the fact that
    // a set registered for another system is found by the same call.
    expect(INDEX_SETS.map((set) => set.system)).toEqual(["hi-lo"]);
    expect(getIndexSet(ZEN)).toBeUndefined();
    expect(deviation(hand("10", "6"), up(10), 5, BASELINE, ZEN)).toBeNull();
    expect(deviationLookup(hand("10", "6"), up(10), 5, BASELINE, ZEN).skipped).toBe(
      "no-index-set",
    );
  });
});

// ---------------------------------------------------------------------------
// Insurance
// ---------------------------------------------------------------------------

/**
 * Insurance is Illustrious 18 entry #1 and the single most valuable deviation in the game,
 * which is why it gets a block of its own. Hi-Lo insures at a true count of +3 or higher.
 */
describe("insurance at +3", () => {
  it("publishes +3 for Hi-Lo and nothing for a system with no index set", () => {
    expect(insuranceIndex(HI_LO)).toBe(3);
    expect(insuranceIndex(ZEN)).toBeUndefined();
    expect(insuranceIndex(KO)).toBeUndefined();
  });

  it("does not insure below +3", () => {
    for (const count of [-5, -1, 0, 1, 2]) {
      expect(shouldTakeInsurance(count, HI_LO)).toBe(false);
      expect(insuranceDeviation(count, HI_LO)).toBeNull();
    }
  });

  it("insures at exactly +3 — the index is inclusive", () => {
    expect(shouldTakeInsurance(3, HI_LO)).toBe(true);
    expect(insuranceDeviation(3, HI_LO)?.index).toBe(3);
  });

  it("insures above +3", () => {
    for (const count of [4, 5, 12]) {
      expect(shouldTakeInsurance(count, HI_LO)).toBe(true);
    }
  });

  it("reports the index that triggered it, and says so in words", () => {
    const insure = insuranceDeviation(4, HI_LO);
    expect(insure?.action).toBe("insurance");
    expect(insure?.index).toBe(3);
    expect(insure?.trueCount).toBe(4);
    expect(insure?.basicStrategy).toBe("decline-insurance");
    expect(insure?.entry.rank).toBe(1);
    expect(insure?.explanation).toBe("take insurance at +3 or higher; the count is +4");
  });

  it("never insures on a system with no published insurance index", () => {
    for (const system of [ZEN, KO, RED_7, WONG_HALVES]) {
      expect(shouldTakeInsurance(10, system)).toBe(false);
    }
  });

  it("fires off a real converted count, not a hand-written number", () => {
    // +18 running count with six decks left is a true count of exactly +3: insure.
    expect(shouldTakeInsurance(trueCount(18, 6), HI_LO)).toBe(true);
    // +17 with six decks left truncates to +2: do not.
    expect(shouldTakeInsurance(trueCount(17, 6), HI_LO)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The lookup
// ---------------------------------------------------------------------------

/**
 * Every playing index, exercised end to end against the game it was published for. This is
 * the block that would fail if a number in the data table were wrong *and* the data-table
 * assertions above were wrong with it, because it drives the real `governingCell` path.
 */
describe("every published playing index fires at its own index", () => {
  const playing = [...ILLUSTRIOUS_18, ...FAB_4].filter(
    (entry) => entry.hand.kind !== "insurance",
  );

  /**
   * The Fab 4's 15 vs 10 is the one index with no rule set it can fire in, and that is the
   * published table telling the truth rather than a defect: its index is 0, which is the
   * average count, so in a game that offers surrender Basic Strategy already surrenders the
   * hand. It is asserted on its own below rather than swept with the rest.
   */
  const playable = playing.filter((entry) => entry.id !== "15v10R");

  it("covers 21 playing indices — the 22nd is insurance", () => {
    expect(playing).toHaveLength(21);
    expect(playable).toHaveLength(20);
  });

  it("15 vs 10 surrender is Basic Strategy at every count, which is what its index of 0 says", () => {
    const fifteen = hand("K", "5");
    const entry = FAB_4.find((candidate) => candidate.id === "15v10R");
    expect(entry?.index).toBe(0);
    // Wherever surrender is offered the play is already made, so there is no departure to
    // indicate at or above the index...
    for (const count of [0, 2, 6]) {
      expect(basicStrategy(fifteen, up(10), BASELINE_WITH_SURRENDER)).toBe("surrender");
      expect(deviation(fifteen, up(10), count, BASELINE_WITH_SURRENDER, HI_LO)).toBeNull();
    }
    // ...and the reverse departure below the index — hit instead of surrendering — is the
    // one this engine deliberately does not make. See "What this deliberately does not do"
    // in deviations.ts: the same mechanism would make a disputed call on 15 vs A under H17.
    expect(deviation(fifteen, up(10), -3, BASELINE_WITH_SURRENDER, HI_LO)).toBeNull();
  });

  it.each(playable.map((entry) => [entry.label, entry] as const))(
    "%s: Basic Strategy is the play the index departs from",
    (_label, entry) => {
      const rules = rulesFor(entry);
      expect(basicStrategy(handFor(entry), up(entry.upcard), rules)).toBe(entry.from);
    },
  );

  it.each(playable.map((entry) => [entry.label, entry] as const))(
    "%s: deviates on the firing side of its index",
    (_label, entry) => {
      const rules = rulesFor(entry);
      const firing = entry.direction === "at-or-above" ? entry.index : entry.index - 1;
      const found = deviation(handFor(entry), up(entry.upcard), firing, rules, HI_LO);
      expect(found?.action).toBe(entry.deviate);
      expect(found?.index).toBe(entry.index);
    },
  );

  it.each(playable.map((entry) => [entry.label, entry] as const))(
    "%s: does not deviate on the Basic Strategy side of its index",
    (_label, entry) => {
      const rules = rulesFor(entry);
      const quiet = entry.direction === "at-or-above" ? entry.index - 1 : entry.index;
      expect(deviation(handFor(entry), up(entry.upcard), quiet, rules, HI_LO)).toBeNull();
    },
  );

  it.each(playable.map((entry) => [entry.label, entry] as const))(
    "%s: stays deviated as the count runs further past the index",
    (_label, entry) => {
      const rules = rulesFor(entry);
      const far = entry.direction === "at-or-above" ? entry.index + 6 : entry.index - 6;
      expect(deviation(handFor(entry), up(entry.upcard), far, rules, HI_LO)?.action).toBe(
        entry.deviate,
      );
    },
  );
});

/**
 * The boundary is the part a trainer has to get exactly right: "stand at 0" and "stand above
 * 0" are different strategies, and a user who has learned one and is graded by the other will
 * report the app as having wrong math. The convention is stated in `deviations.ts`: the index
 * value belongs to the "at or above" side, in both directions.
 */
describe("the index is inclusive on the at-or-above side", () => {
  it("stands 16 vs 10 at exactly 0, and hits at -1", () => {
    const sixteen = hand("10", "6");
    expect(deviation(sixteen, up(10), 0, BASELINE, HI_LO)?.action).toBe("stand");
    expect(deviation(sixteen, up(10), -1, BASELINE, HI_LO)).toBeNull();
    expect(basicStrategy(sixteen, up(10), BASELINE)).toBe("hit");
  });

  it("stands 13 vs 2 at exactly -1, and hits at -2", () => {
    // The mirror case: the index is -1, standing is Basic Strategy, and the departure is
    // below the index. -1 itself is still a stand.
    const thirteen = hand("J", "3");
    expect(deviation(thirteen, up(2), -1, BASELINE, HI_LO)).toBeNull();
    expect(deviation(thirteen, up(2), -2, BASELINE, HI_LO)?.action).toBe("hit");
    expect(basicStrategy(thirteen, up(2), BASELINE)).toBe("stand");
  });

  it("stands 12 vs 4 at exactly 0, and hits at -1", () => {
    const twelve = hand("10", "2");
    expect(deviation(twelve, up(4), 0, BASELINE, HI_LO)).toBeNull();
    expect(deviation(twelve, up(4), -1, BASELINE, HI_LO)?.action).toBe("hit");
  });

  it("splits 10,10 vs 5 at exactly +5 and not at +4", () => {
    const tens = hand("10", "10");
    expect(deviation(tens, up(5), 4, BASELINE, HI_LO)).toBeNull();
    expect(deviation(tens, up(5), 5, BASELINE, HI_LO)?.action).toBe("split");
    // vs 6 the index is one lower, so +4 is enough there and not here.
    expect(deviation(tens, up(6), 4, BASELINE, HI_LO)?.action).toBe("split");
  });

  it("reports the near miss rather than silently returning nothing", () => {
    const lookup = deviationLookup(hand("10", "6"), up(10), -1, BASELINE, HI_LO);
    expect(lookup.deviation).toBeNull();
    expect(lookup.skipped).toBe("count-on-basic-side");
    expect(lookup.entry?.label).toBe("16 vs 10");
    expect(lookup.entry?.index).toBe(0);
    expect(lookup.basicStrategy).toBe("hit");
  });
});

/**
 * Invariant 2: every verdict carries an Explanation. A deviation that reports only "stand" is
 * not shippable — the panel has to be able to say *why*, and the index number is the why.
 */
describe("a deviation reports the index that triggered it", () => {
  it("says 'stand at +0 or higher; the count is +2'", () => {
    const found = deviation(hand("10", "6"), up(10), 2, BASELINE, HI_LO);
    expect(found?.explanation).toBe("stand at +0 or higher; the count is +2");
    expect(found?.index).toBe(0);
    expect(found?.trueCount).toBe(2);
    expect(found?.direction).toBe("at-or-above");
    expect(found?.basicStrategy).toBe("hit");
  });

  it("says 'hit below -1; the count is -3' for the other direction", () => {
    const found = deviation(hand("J", "3"), up(2), -3, BASELINE, HI_LO);
    expect(found?.explanation).toBe("hit below -1; the count is -3");
    expect(found?.direction).toBe("below");
    expect(found?.basicStrategy).toBe("stand");
  });

  it("writes zero with an explicit sign, so +0 never reads as a missing value", () => {
    expect(deviation(hand("10", "2"), up(4), -1, BASELINE, HI_LO)?.explanation).toBe(
      "hit below +0; the count is -1",
    );
  });

  it("carries the published entry, so the panel can name the set and the rank", () => {
    const found = deviation(hand("K", "5"), up(9), 2, BASELINE_WITH_SURRENDER, HI_LO);
    expect(found?.action).toBe("surrender");
    expect(found?.entry.set).toBe("fab-4");
    expect(found?.entry.rank).toBe(3);
    expect(found?.entry.label).toBe("15 vs 9");
    expect(found?.explanation).toBe("surrender at +2 or higher; the count is +2");
  });
});

// ---------------------------------------------------------------------------
// Rule sensitivity
// ---------------------------------------------------------------------------

/**
 * A published index departs from a specific Basic Strategy play. When a Rule Set moves that
 * cell, the index has nothing to depart from, and guessing a replacement is exactly the
 * "wrong math" failure that is 21% of category low-star reviews. These are the cells where
 * that actually happens.
 */
describe("an index is declined when the Rule Set has moved the cell it departs from", () => {
  const H17 = { ...BASELINE, dealerSoft17: "hit" } as const;
  const S17_LS = BASELINE_WITH_SURRENDER;

  it("does not deviate on 11 vs A under H17, where doubling is already Basic Strategy", () => {
    // Three sources publish +1 with no rule qualifier; under H17 Basic Strategy already
    // doubles, so the index has nothing to depart from. (The one source that publishes an
    // H17 column gives -1 here, and is not corroborated.)
    const eleven = hand("9", "2");
    expect(basicStrategy(eleven, up(11), H17)).toBe("double");
    expect(deviation(eleven, up(11), 3, H17, HI_LO)).toBeNull();
    expect(deviationLookup(eleven, up(11), 3, H17, HI_LO).skipped).toBe("outside-published-rules");

    // Under S17 it is the published departure it was written to be.
    expect(basicStrategy(eleven, up(11), BASELINE)).toBe("hit");
    expect(deviation(eleven, up(11), 1, BASELINE, HI_LO)?.action).toBe("double");
  });

  it("does not stand 16 vs 10 in a surrender game, where Basic Strategy gives the hand up", () => {
    // No source consulted publishes a Hi-Lo index for standing rather than surrendering a
    // two-card 16 vs 10, so the engine leaves the player on Basic Strategy instead.
    const sixteen = hand("10", "6");
    expect(basicStrategy(sixteen, up(10), S17_LS)).toBe("surrender");
    expect(deviation(sixteen, up(10), 2, S17_LS, HI_LO)).toBeNull();
    expect(deviationLookup(sixteen, up(10), 2, S17_LS, HI_LO).skipped).toBe(
      "outside-published-rules",
    );
  });

  it("does stand a three-card 16 vs 10 in a surrender game, where surrender is no longer legal", () => {
    // The same 16, one card later: surrender is off the table, Basic Strategy is back to
    // hitting, and the index applies exactly as published.
    const sixteen = hand("5", "6", "5");
    expect(basicStrategy(sixteen, up(10), S17_LS)).toBe("hit");
    expect(deviation(sixteen, up(10), 0, S17_LS, HI_LO)?.action).toBe("stand");
  });

  it("does not apply the 16 vs 10 index to a pair of 8s, as published", () => {
    // The table is printed "16 vs 10, but not a pair of 8s". Nothing in the data says so —
    // Basic Strategy splits 8,8, the index departs from hitting, and the guard does the rest.
    const eights = hand("8", "8");
    expect(basicStrategy(eights, up(10), BASELINE)).toBe("split");
    expect(deviation(eights, up(10), 5, BASELINE, HI_LO)).toBeNull();
    expect(deviationLookup(eights, up(10), 5, BASELINE, HI_LO).skipped).toBe(
      "outside-published-rules",
    );
  });

  it("does not surrender 15 vs A under H17, where the index is disputed", () => {
    // Basic Strategy already surrenders 15 vs A under H17 with late surrender. The one
    // source that publishes an H17 column gives -1 rather than +1, and it is not
    // corroborated, so the engine declines rather than picking a side.
    const fifteen = hand("K", "5");
    const h17ls: RuleSet = { ...BASELINE, dealerSoft17: "hit", surrender: "late" };
    expect(basicStrategy(fifteen, up(11), h17ls)).toBe("surrender");
    expect(deviation(fifteen, up(11), 0, h17ls, HI_LO)).toBeNull();
    expect(deviation(fifteen, up(11), 4, h17ls, HI_LO)).toBeNull();

    // Under S17 the published +1 index is the departure, and it fires.
    expect(basicStrategy(fifteen, up(11), S17_LS)).toBe("hit");
    expect(deviation(fifteen, up(11), 1, S17_LS, HI_LO)?.action).toBe("surrender");
  });

  it("does not double 9 vs 2 in a double-deck game, where Basic Strategy already doubles", () => {
    // The set is quoted against a multi-deck shoe. In one and two deck games Basic Strategy
    // doubles 9 vs 2 at every count, and the multi-deck +1 index does not describe that cell.
    const nine = hand("7", "2");
    const twoDeck: RuleSet = { ...BASELINE, decks: 2 };
    expect(basicStrategy(nine, up(2), twoDeck)).toBe("double");
    expect(deviation(nine, up(2), 3, twoDeck, HI_LO)).toBeNull();
  });
});

/**
 * Invariant 7: the engine never names an action the player may not take. A deviation is a
 * play, so it is subject to `legalActions` like any other.
 */
describe("a deviation is never an action the player may not take", () => {
  it("does not double a three-card 10 vs 10", () => {
    const ten = hand("5", "3", "2");
    expect(deviation(ten, up(10), 5, BASELINE, HI_LO)).toBeNull();
    expect(deviationLookup(ten, up(10), 5, BASELINE, HI_LO).skipped).toBe("action-not-legal");
  });

  it("does not surrender 14 vs 10 in a game that does not offer surrender", () => {
    const fourteen = hand("Q", "4");
    expect(deviation(fourteen, up(10), 5, BASELINE, HI_LO)).toBeNull();
    expect(deviation(fourteen, up(10), 5, BASELINE_WITH_SURRENDER, HI_LO)?.action).toBe(
      "surrender",
    );
  });

  it("does not split 10,10 vs 5 once the resplit limit is reached", () => {
    const tens = hand("10", "10");
    expect(deviation(tens, up(5), 6, BASELINE, HI_LO, { handCount: 4 })).toBeNull();
  });

  it("names no deviation for a hand with nothing left to decide", () => {
    const busted = hand("10", "6", "10");
    expect(deviation(busted, up(10), 6, BASELINE, HI_LO)).toBeNull();
    const natural = hand("A", "K");
    expect(deviation(natural, up(10), 6, BASELINE, HI_LO)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Matching the right row
// ---------------------------------------------------------------------------

describe("a hand is matched to the row published tables would put it in", () => {
  it("reads 10,10 as the pair row, not as hard 20", () => {
    const tens = hand("10", "10");
    const lookup = deviationLookup(tens, up(6), 4, BASELINE, HI_LO);
    expect(lookup.entry?.hand).toEqual({ kind: "pair", rank: "10" });
    expect(lookup.deviation?.action).toBe("split");
    // A ten and a face card is the same pair.
    expect(deviation(hand("K", "Q"), up(6), 4, BASELINE, HI_LO)?.action).toBe("split");
  });

  it("reads 5,5 as hard 10, because there is no 5,5 index", () => {
    // Published tables say "10 vs 10", and a pair of fives is a hard ten. Falling through
    // from the pairs row to the total is what gets this right.
    const fives = hand("5", "5");
    const lookup = deviationLookup(fives, up(10), 4, BASELINE, HI_LO);
    expect(lookup.entry?.label).toBe("10 vs 10");
    expect(lookup.deviation?.action).toBe("double");
  });

  it("does not apply a hard index to the same soft total", () => {
    // Soft 16 is A,5 and is nothing like a hard 16. There is no soft index in either set.
    expect(deviation(hand("A", "5"), up(10), 5, BASELINE, HI_LO)).toBeNull();
    expect(deviationLookup(hand("A", "5"), up(10), 5, BASELINE, HI_LO).skipped).toBe("no-entry");
    expect(deviation(hand("A", "2"), up(4), -4, BASELINE, HI_LO)).toBeNull();
  });

  it("reads a three-card total off the hard row", () => {
    // 4 + 3 + 5 is a hard 12; vs 6 the index says hit below -1.
    expect(deviation(hand("4", "3", "5"), up(6), -2, BASELINE, HI_LO)?.action).toBe("hit");
    expect(deviation(hand("4", "3", "5"), up(6), -1, BASELINE, HI_LO)).toBeNull();
  });

  it("has no index for a hand the published sets do not cover", () => {
    // 17 vs 7, 8 vs 6, 20 vs 10 — all Basic Strategy at every count.
    expect(deviation(hand("10", "7"), up(7), 8, BASELINE, HI_LO)).toBeNull();
    expect(deviation(hand("5", "3"), up(6), 8, BASELINE, HI_LO)).toBeNull();
    expect(deviation(hand("10", "10"), up(10), 8, BASELINE, HI_LO)).toBeNull();
    expect(deviationLookup(hand("10", "7"), up(7), 8, BASELINE, HI_LO).skipped).toBe("no-entry");
  });

  it("resolves hard 15 vs 10, which both sets cover, surrender first", () => {
    // Illustrious 18 #3 says stand at +4; Fab 4 #2 says surrender at 0. Where surrender is
    // offered, Basic Strategy already surrenders and neither index has a departure to make.
    const fifteen = hand("K", "5");
    expect(basicStrategy(fifteen, up(10), BASELINE_WITH_SURRENDER)).toBe("surrender");
    expect(deviation(fifteen, up(10), 4, BASELINE_WITH_SURRENDER, HI_LO)).toBeNull();
    // Where it is not offered, the Illustrious 18 index is the one that applies.
    expect(deviation(fifteen, up(10), 4, BASELINE, HI_LO)?.action).toBe("stand");
    expect(deviation(fifteen, up(10), 3, BASELINE, HI_LO)).toBeNull();
  });
});

describe("the lookup does not mutate its inputs", () => {
  it("leaves the hand and the published data untouched", () => {
    const sixteen = hand("10", "6");
    const handSnapshot = JSON.stringify(sixteen);
    const dataSnapshot = JSON.stringify(HI_LO_INDEXES);
    deviation(sixteen, up(10), 3, BASELINE, HI_LO);
    deviationLookup(sixteen, up(10), 3, BASELINE, HI_LO);
    expect(JSON.stringify(sixteen)).toBe(handSnapshot);
    expect(JSON.stringify(HI_LO_INDEXES)).toBe(dataSnapshot);
  });
});
