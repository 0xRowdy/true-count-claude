import { describe, expect, it } from "vitest";
import { exampleCraps } from "./library";
import {
  addRule,
  allRows,
  changeCount,
  checkRule,
  moveRule,
  planChanges,
  planPhases,
  planStats,
  previewLabel,
  removeRule,
  ruleShort,
  ruleTitle,
  setHitKind,
  stepHelp,
  stepHitAmount,
  templatesFor,
  testPlan,
} from "./craps";

const draft = exampleCraps();

describe("the GYRRl example: Pass, Odds & Press the 6/8", () => {
  it("reproduces the design's stat cards: $78, −$78, ≈ 0.6%", () => {
    const stats = planStats(draft.plan, { point: 6, hits: 2 });
    expect(previewLabel({ point: 6, hits: 2 })).toBe("Point is 6, after 2 hits");
    expect(stats.onTable).toBe("$78");
    expect(stats.breakdown).toBe("Pass $10 · odds $50 · place 8 $18");
    expect(stats.worst).toBe("−$78");
    expect(stats.worstNote).toBe("A seven ends it all");
    expect(stats.blended).toBe("≈ 0.6%");
    expect(stats.felt.place[8]).toEqual({ amount: 18, pressed: true });
    expect(stats.felt.place[6]).toBeUndefined();
    expect(stats.felt.oddsLabel).toBe("$10 + 5x ODDS");
  });

  it("tags the three changed rules against @rail_rita's original", () => {
    const rows = allRows(planPhases(draft.plan, draft.original));
    expect(rows.map((r) => `${r.number} ${r.edgeText}${r.changed ? " changed" : ""}`)).toEqual([
      "1.1 1.41%",
      "2.1 0%",
      "2.2 1.52% changed",
      "3.1 —",
      "3.2 1.52% changed",
      "3.3 — changed",
      "4.1 —",
    ]);
    expect(changeCount(draft.plan, draft.original)).toBe(3);
    expect(planChanges(draft.plan, draft.original).rows[1]?.id).toBe("hit.2");
  });

  it("describes the selected rule 3.2 as the design does", () => {
    const key = { kind: "hit", hit: 2 } as const;
    expect(ruleTitle(draft.plan, key)).toBe("Second hit on a place 6 or 8");
    expect(ruleShort(draft.original, key)).toBe("Collect");
    expect(ruleShort(draft.plan, key)).toBe("Press to $18");
    expect(stepHelp(draft.plan)).toBe("Steps of $6 so the 7:6 payout comes out exact.");
    expect(checkRule(draft.plan, key)).toEqual({
      ok: true,
      title: "Rules-checked for 3-4-5x craps",
      body: "$18 pays $21 on the next hit. Pressing uses $6 of the $14 win and pockets $8.",
    });
  });
});

describe("editing", () => {
  it("steps a press by exact units and updates the stats", () => {
    const plan = stepHitAmount(draft.plan, 2, 1);
    expect(ruleShort(plan, { kind: "hit", hit: 2 })).toBe("Press to $24");
    expect(planStats(plan, { point: 6, hits: 2 }).onTable).toBe("$84");
    expect(setHitKind(plan, 2, "collect").placeWins?.second).toEqual({ kind: "collect" });
    expect(setHitKind(plan, 2, "regress").placeWins?.second).toEqual({ kind: "regress", to: 6 });
  });

  it("adds, moves and removes rules", () => {
    expect(templatesFor(draft.plan, "come-out").map((t) => t.label)).toEqual([
      "Don't pass",
      "Field",
    ]);
    const added = addRule(draft.plan, { label: "Field every roll", section: "point" });
    expect(added.key).toEqual({ kind: "point", index: 2 });
    const moved = moveRule(added.plan, added.key, -1);
    expect(moved.key).toEqual({ kind: "point", index: 1 });
    expect(moved.plan.pointOn[1]).toEqual({ kind: "bet", spec: { kind: "field", amount: 10 } });
    expect(removeRule(moved.plan, moved.key).pointOn).toEqual(draft.plan.pointOn);
  });

  it("flags broken payouts", () => {
    const plan = stepHitAmount(draft.plan, 2, 1);
    const broken = {
      ...plan,
      placeWins: { ...plan.placeWins!, second: { kind: "press" as const, to: 20 } },
    };
    expect(checkRule(broken, { kind: "hit", hit: 2 }).ok).toBe(false);
  });

  it("plays 10 seeded shooters reproducibly", () => {
    expect(testPlan(draft.plan, 3)).toEqual(testPlan(draft.plan, 3));
  });
});
