import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "@/engine";
import { normalizeDraft } from "@/state/strategies";
import { exampleBlackjack } from "./library";
import { checkRamp, defaultRamp, rampRows, spreadLabel, stepUnit, stepUnits } from "./betRamp";

const rules = DEFAULT_RULES; // 6D, $10–$1,000

describe("bet ramp", () => {
  it("starts at one table minimum per unit, a 1–8 spread", () => {
    const ramp = defaultRamp(rules);
    expect(spreadLabel(ramp)).toBe("1–8 spread");
    expect(rampRows(ramp).map((r) => `${r.label}: ${r.units} · ${r.dollars}`)).toEqual([
      "≤ 0: 1 · $10",
      "+1: 1 · $10",
      "+2: 2 · $20",
      "+3: 4 · $40",
      "+4: 6 · $60",
      "+5 or more: 8 · $80",
    ]);
    expect(checkRamp(ramp, rules)).toMatchObject({
      level: "ok",
      title: "Rules-checked for $10–$1,000 tables",
    });
  });

  it("warns on an aggressive spread for the shoe", () => {
    let ramp = defaultRamp(rules);
    for (let i = 0; i < 8; i++) ramp = stepUnits(ramp, 5, 1);
    expect(spreadLabel(ramp)).toBe("1–16 spread");
    const check = checkRamp(ramp, rules);
    expect(check.level).toBe("warn");
    expect(check.title).toBe("Aggressive for a 6-deck shoe");
    // A single deck is stricter still: even the default ramp is aggressive there.
    expect(checkRamp(defaultRamp(rules), { ...rules, decks: 1 }).level).toBe("warn");
  });

  it("flags bets outside the table limits and a ramp that shrinks", () => {
    const small = stepUnit(defaultRamp(rules), -1); // $5 units
    expect(checkRamp(small, rules)).toMatchObject({ level: "problem" });
    expect(checkRamp(small, rules).body).toMatch(/\$5, is under the \$10 table minimum/);
    const big = { unit: 200, units: [1, 1, 2, 4, 6, 8] };
    expect(checkRamp(big, rules).body).toMatch(/\$1,600, is over the \$1,000 table maximum/);
    const shrinking = stepUnits(stepUnits(defaultRamp(rules), 4, -1), 4, -1);
    expect(checkRamp({ ...shrinking, units: [1, 2, 1, 4, 6, 8] }, rules).body).toMatch(/shrinks/);
  });

  it("persists in the draft", () => {
    const d = { ...exampleBlackjack(), ramp: { unit: 25, units: [1, 2, 3, 4, 5, 6] } };
    expect(normalizeDraft(JSON.parse(JSON.stringify(d)))).toEqual(d);
    const bad = { ...d, ramp: { unit: 25, units: [1, 2] } };
    expect(normalizeDraft(JSON.parse(JSON.stringify(bad)))).not.toHaveProperty("ramp");
  });
});
