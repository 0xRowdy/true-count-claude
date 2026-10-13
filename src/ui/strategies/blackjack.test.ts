import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, type RuleSet } from "@/engine";
import type { BlackjackDraft } from "@/state/strategies";
import {
  cellGlyph,
  cellTitle,
  chartChanges,
  checkCell,
  checkChart,
  codeForMove,
  draftCode,
  isFlagged,
  parseCellKey,
  resetToBasic,
  rulesCheckTarget,
  rulesShort,
  setCell,
  testDraft,
} from "./blackjack";

const H17: RuleSet = DEFAULT_RULES;
const S17: RuleSet = { ...DEFAULT_RULES, dealerSoft17: "stand" };

const fork = (rules: RuleSet): BlackjackDraft => ({
  id: "t",
  game: "blackjack",
  title: "T",
  forkedFrom: null,
  notes: {},
  savedAt: null,
  rules,
  base: { rules: S17, cells: {} },
  cells: {},
});

describe("the RYP9O example: S17 basic strategy re-made for H17", () => {
  const draft = resetToBasic(fork(H17));

  it("has exactly the six H17 changes, in reading order", () => {
    expect(chartChanges(draft).map((c) => `${cellTitle(c.ref)}: ${c.from}→${c.to}`)).toEqual([
      "Hard 11 vs dealer A: H→D",
      "Hard 15 vs dealer A: H→Rh",
      "Hard 17 vs dealer A: S→Rs",
      "Soft 18 (A,7) vs dealer 2: S→Ds",
      "Soft 19 (A,8) vs dealer 6: S→Ds",
      "Pair of 8s vs dealer A: P→Rp",
    ]);
  });

  it("rules-checks soft 19 vs 6 for H17, 6 decks: doubling beats standing", () => {
    const ref = { section: "soft", row: "19", upcard: 6 } as const;
    const check = checkCell(H17, ref, draftCode(draft, ref), "S");
    expect(check.verdict).toBe("best");
    expect(check.title).toBe("Rules-checked for H17, 6 decks");
    expect(check.body).toMatch(/doubling earns slightly more on average than standing/);
    expect(checkChart(draft).ok).toBe(true);
  });

  it("labels the rules the way the step rail does", () => {
    expect(rulesShort(H17)).toBe("6D · H17 · DAS · LS");
    expect(rulesCheckTarget(H17)).toBe("H17, 6 decks");
  });
});

describe("flags cells that lose EV", () => {
  it("an unchanged S17 chart played at an H17 table flags the cells H17 moves", () => {
    const draft = fork(H17);
    expect(chartChanges(draft)).toHaveLength(0);
    const check = checkChart(draft);
    expect(check.ok).toBe(false);
    expect(check.flagged.map((f) => cellTitle(f.ref))).toContain("Hard 11 vs dealer A");
  });

  it("standing on hard 12 vs 2 is fine-grained, but standing on 16 vs 7 is flagged", () => {
    const ref = { section: "hard", row: "16", upcard: 7 } as const;
    const draft = setCell(fork(S17), ref, "S");
    expect(isFlagged(draft, ref)).toBe(true);
    expect(checkCell(S17, ref, "S").title).toMatch(/^Costs .* of the bet under S17, 6 decks$/);
    expect(chartChanges(draft)).toHaveLength(1);
    // Setting it back removes the override.
    expect(setCell(draft, ref, "H").cells).toEqual({});
  });
});

describe("helpers", () => {
  it("maps moves to codes and glyphs", () => {
    expect(codeForMove("R", { section: "hard", row: "16", upcard: 10 })).toBe("Rh");
    expect(codeForMove("R", { section: "hard", row: "17", upcard: 11 })).toBe("Rs");
    expect(codeForMove("R", { section: "pairs", row: "8", upcard: 11 })).toBe("Rp");
    expect(cellGlyph("Rp")).toBe("R");
    expect(parseCellKey("soft:19:6")).toEqual({ section: "soft", row: "19", upcard: 6 });
    expect(parseCellKey("nope")).toBeUndefined();
  });

  it("plays 50 seeded hands identically for identical charts", () => {
    const draft = resetToBasic(fork(H17));
    const a = testDraft(draft, 7);
    expect(a).toEqual(testDraft(draft, 7));
    expect(a.yours).toEqual(a.basic);
    expect(a.yours.wins + a.yours.losses + a.yours.pushes).toBe(50);
  });
});
