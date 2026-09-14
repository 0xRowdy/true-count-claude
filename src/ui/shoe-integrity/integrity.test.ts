import { describe, expect, it } from "vitest";
import { RANKS } from "@/engine/cards";
import { COUNTING_SYSTEMS, HI_LO, KO, RED_7, WONG_HALVES } from "@/engine/counting";
import { DEFAULT_RULES, type RuleSet } from "@/engine/rules";
import { createShoe, deal, type Shoe } from "@/engine/shoe";
import {
  buildIntegrityReport,
  countTrace,
  dealtComposition,
  describeExpectation,
  expectationBand,
  formatSigned,
  formatUnits,
  integrityReportFileName,
  normalCdf,
  traceRange,
  zeroSumCheck,
} from "./integrity";

const DECK_COUNTS = [1, 2, 4, 6, 8];

function dealAll(shoe: Shoe): Shoe {
  let current = shoe;
  while (current.dealtCount < current.cards.length) current = deal(current).shoe;
  return current;
}

/**
 * These are the assertions the Shoe Integrity Panel shows the user. Running them in CI is
 * the point: a competitor shipped a count that did not return to zero and a user found it
 * first (ADR-0004).
 */
describe("the zero-sum check", () => {
  it.each(COUNTING_SYSTEMS.map((system) => [system.name, system] as const))(
    "reconciles at every point in the Shoe for %s",
    (_name, system) => {
      let shoe = createShoe(DEFAULT_RULES, 4242);

      while (shoe.dealtCount < shoe.cards.length) {
        const check = zeroSumCheck(shoe, system);
        expect(check.reconciled).toBe(check.finish);
        expect(check.holds).toBe(true);
        shoe = deal(shoe).shoe;
      }

      const final = zeroSumCheck(shoe, system);
      expect(final.shoeComplete).toBe(true);
      expect(final.cardsRemaining).toBe(0);
      expect(final.countRemaining).toBe(0);
      expect(final.countNow).toBe(final.finish);
      expect(final.holds).toBe(true);
    },
  );

  it.each(DECK_COUNTS)("finishes a balanced system on exactly zero over %i decks", (decks) => {
    const rules: RuleSet = { ...DEFAULT_RULES, decks };
    for (const system of COUNTING_SYSTEMS.filter((candidate) => candidate.balanced)) {
      const final = zeroSumCheck(dealAll(createShoe(rules, 7)), system);
      expect(final.finish).toBe(0);
      expect(final.countNow).toBe(0);
      // Not just zero-ish: exactly zero, including for Wong Halves' fractional tags.
      expect(Object.is(final.countNow, 0)).toBe(true);
    }
  });

  it("finishes an unbalanced system on its pivot, not on zero", () => {
    const koFinal = zeroSumCheck(dealAll(createShoe(DEFAULT_RULES, 7)), KO);
    expect(koFinal.balanced).toBe(false);
    expect(koFinal.start).toBe(-20); // published KO IRC for six decks
    expect(koFinal.finish).toBe(KO.pivot);
    expect(koFinal.countNow).toBe(4);

    const red7Final = zeroSumCheck(dealAll(createShoe(DEFAULT_RULES, 7)), RED_7);
    expect(red7Final.start).toBe(-12);
    expect(red7Final.countNow).toBe(0);
  });

  it("reports the count still sitting in the undealt cards", () => {
    let shoe = createShoe(DEFAULT_RULES, 99);
    for (let i = 0; i < 60; i++) shoe = deal(shoe).shoe;

    const check = zeroSumCheck(shoe, HI_LO);
    expect(check.cardsRemaining).toBe(shoe.cards.length - 60);
    // The claim the panel puts in front of the user, stated as a test.
    expect(check.countNow + check.countRemaining).toBe(0);
  });

  it("recomputes the balanced flag rather than trusting it", () => {
    for (const system of COUNTING_SYSTEMS) {
      expect(zeroSumCheck(createShoe(DEFAULT_RULES, 1), system).balanceClaimVerified).toBe(true);
    }
    expect(zeroSumCheck(createShoe(DEFAULT_RULES, 1), HI_LO).tagsPerDeck).toBe(0);
    expect(zeroSumCheck(createShoe(DEFAULT_RULES, 1), KO).tagsPerDeck).toBe(4);
    expect(zeroSumCheck(createShoe(DEFAULT_RULES, 1), RED_7).tagsPerDeck).toBe(2);
  });
});

describe("the count trace", () => {
  it("starts at the system's initial Running Count", () => {
    expect(countTrace(createShoe(DEFAULT_RULES, 5), HI_LO)).toEqual([{ index: 0, count: 0 }]);
    expect(countTrace(createShoe(DEFAULT_RULES, 5), KO)).toEqual([{ index: 0, count: -20 }]);
  });

  it("downsamples a long Shoe but keeps the endpoints exact", () => {
    const shoe = dealAll(createShoe({ ...DEFAULT_RULES, decks: 8 }, 11));
    const points = countTrace(shoe, WONG_HALVES, 96);

    expect(points.length).toBeLessThanOrEqual(97);
    expect(points[0]).toEqual({ index: 0, count: 0 });

    const last = points[points.length - 1]!;
    expect(last.index).toBe(shoe.cards.length);
    // The final plotted point is the finish the user is being asked to watch for.
    expect(last.count).toBe(0);
  });

  it("agrees with the Running Count at the point it is plotted", () => {
    let shoe = createShoe(DEFAULT_RULES, 3);
    for (let i = 0; i < 40; i++) shoe = deal(shoe).shoe;

    const points = countTrace(shoe, KO, 8);
    const last = points[points.length - 1]!;
    expect(last.index).toBe(40);
    expect(last.count).toBe(zeroSumCheck(shoe, KO).countNow);
  });

  it("centres the plot on the finish, not on zero", () => {
    const shoe = createShoe(DEFAULT_RULES, 5);
    const range = traceRange(countTrace(shoe, KO), KO.pivot);
    expect(range.home).toBe(4);
    // The KO trace starts 24 below its pivot, so the window has to reach that far.
    expect(range.span).toBeGreaterThanOrEqual(24);
  });

  it("never collapses to a zero-height window", () => {
    expect(traceRange([{ index: 0, count: 0 }], 0).span).toBe(4);
  });
});

describe("results vs. expectation", () => {
  it("places a flat, ordinary downswing inside the band", () => {
    // 500 hands, 40 units down: about 1.5 standard deviations. Ordinary.
    const band = expectationBand({ hands: 500, netUnits: -40 });
    expect(band.expected).toBeCloseTo(-2.75, 5);
    expect(band.sd).toBeCloseTo(25.49, 1);
    expect(band.z).toBeCloseTo(-1.46, 1);
    expect(band.verdict).toBe("ordinary");
    expect(describeExpectation(band)).toContain("ordinary variance");
  });

  it("flags a result far enough out to be worth reporting", () => {
    const band = expectationBand({ hands: 500, netUnits: -200 });
    expect(band.verdict).toBe("report-it");
    expect(describeExpectation(band)).toContain("export this report");
  });

  it("does not divide by zero on an empty Session", () => {
    const band = expectationBand({ hands: 0, netUnits: 0 });
    expect(band.sd).toBe(0);
    expect(band.z).toBe(0);
    expect(Number.isFinite(band.tailProbability)).toBe(true);
    expect(describeExpectation(band)).toContain("Enter a Session");
  });

  it("computes the normal CDF accurately enough for the tails it quotes", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(-1)).toBeCloseTo(0.158655, 5);
    expect(normalCdf(-2)).toBeCloseTo(0.02275, 5);
    expect(normalCdf(3)).toBeCloseTo(0.99865, 5);
  });
});

describe("the exportable report", () => {
  it("captures enough to reproduce the Shoe exactly", () => {
    let shoe = createShoe(DEFAULT_RULES, 20260914);
    for (let i = 0; i < 25; i++) shoe = deal(shoe).shoe;

    const report = buildIntegrityReport({
      shoe,
      rules: DEFAULT_RULES,
      system: HI_LO,
      generatedAt: "2026-09-14T00:00:00.000Z",
      appVersion: "0.1.0",
      session: { hands: 120, netUnits: -18 },
    });

    // Seed plus Rule Set is a complete repro (ADR-0004).
    const replayed = createShoe(DEFAULT_RULES, report.shoe.seed);
    expect(replayed.cards.slice(0, 25).map((c) => `${c.rank}${c.suit}`)).toEqual(report.dealtCards);

    expect(report.dealtCards).toHaveLength(25);
    expect(report.checks.compositionIntact).toBe(true);
    expect(report.checks.zeroSum.holds).toBe(true);
    expect(report.session?.expectation.hands).toBe(120);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  it("omits the Session block when there is no Session", () => {
    const shoe = createShoe(DEFAULT_RULES, 1);
    const report = buildIntegrityReport({
      shoe,
      rules: DEFAULT_RULES,
      system: HI_LO,
      generatedAt: "2026-09-14T00:00:00.000Z",
      appVersion: "0.1.0",
    });
    expect(report.session).toBeUndefined();
    expect(integrityReportFileName(shoe)).toBe("true-count-shoe-1-0of312.json");
  });

  it("conserves every rank across dealt and remaining", () => {
    let shoe = createShoe(DEFAULT_RULES, 77);
    for (let i = 0; i < 137; i++) shoe = deal(shoe).shoe;

    const report = buildIntegrityReport({
      shoe,
      rules: DEFAULT_RULES,
      system: HI_LO,
      generatedAt: "2026-09-14T00:00:00.000Z",
      appVersion: "0.1.0",
    });

    for (const rank of RANKS) {
      expect(report.dealtByRank[rank] + report.remainingByRank[rank]).toBe(report.checks.expectedPerRank);
    }
    expect(dealtComposition(shoe)).toEqual(report.dealtByRank);
  });
});

describe("display formatting", () => {
  it("signs counts and never renders a negative zero", () => {
    expect(formatSigned(3)).toBe("+3");
    expect(formatSigned(-3)).toBe("−3");
    expect(formatSigned(0)).toBe("0");
    expect(formatSigned(-0)).toBe("0");
    expect(formatSigned(-2.5)).toBe("−2.5");
  });

  it("formats unit results to one decimal", () => {
    expect(formatUnits(-40)).toBe("−40.0");
    expect(formatUnits(0)).toBe("0.0");
    expect(formatUnits(-0.01)).toBe("0.0");
  });
});
