import { describe, expect, it } from "vitest";
import {
  COUNTING_SYSTEMS,
  HI_LO,
  KO,
  RED_7,
  currentRunningCount,
  deckTagSum,
  keyCount,
  runningCount,
} from "@/engine/counting";
import { DEFAULT_RULES } from "@/engine/rules";
import { createShoe } from "@/engine/shoe";
import { unbalancedCountRows, unbalancedCountRowsFromReadout } from "./unbalancedCount";

describe("#25 — KO's two betting-adjacent numbers, each labelled", () => {
  it("labels the Key Count and the pivot as different things at six decks", () => {
    const rows = unbalancedCountRows(KO, 6);
    expect(rows.map((row) => [row.kind, row.value])).toEqual([
      ["key-count", -4],
      ["pivot", 4],
    ]);
    expect(rows[0]?.label).toMatch(/key count/i);
    expect(rows[0]?.label).toMatch(/raise bets/i);
    expect(rows[1]?.label).toMatch(/pivot/i);
    expect(rows[1]?.label).not.toMatch(/raise|bet/i);
  });

  it("never invents a Key Count for a deck count the authors did not publish", () => {
    const rows = unbalancedCountRows(KO, 4);
    expect(rows[0]).toMatchObject({ kind: "key-count", value: null });
    expect(rows[0]?.meaning).toMatch(/no Key Count for 4 decks/);
    // The pivot is still shown, and still labelled as the pivot — not promoted to a bet trigger.
    expect(rows[1]).toMatchObject({ kind: "pivot", value: 4 });
  });

  it("recovers the same rows from the play table's readout, including its pivot fallback", () => {
    for (const decks of [1, 2, 4, 6, 8]) {
      const readoutPivot = keyCount(KO, decks) ?? KO.pivot;
      expect(unbalancedCountRowsFromReadout(KO, readoutPivot).map((row) => row.value)).toEqual(
        unbalancedCountRows(KO, decks).map((row) => row.value),
      );
    }
  });

  it("relies on a published Key Count never equalling the pivot", () => {
    for (const system of COUNTING_SYSTEMS) {
      for (const value of Object.values(system.keyCounts ?? {})) {
        expect(value).toBeLessThan(system.pivot);
      }
    }
  });

  it("checks Red 7: one number, the pivot, which is also where its bets go up", () => {
    const rows = unbalancedCountRows(RED_7, 6);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "pivot", value: 0 });
    expect(rows[0]?.label).toMatch(/pivot/i);
    expect(rows[0]?.meaning).toMatch(/no separate Key Count/);
    expect(unbalancedCountRowsFromReadout(RED_7, 0)).toEqual(rows.map((row) => ({ ...row })));
  });

  it("shows nothing for a balanced system", () => {
    expect(unbalancedCountRows(HI_LO, 6)).toEqual([]);
    expect(unbalancedCountRowsFromReadout(HI_LO, null)).toEqual([]);
  });

  // The label's claim, checked against real shoes rather than taken on trust: wherever the
  // Running Count stands at the pivot, the balanced-equivalent true count — tags seen, less what
  // a neutral shoe would have shown by then, per deck left — is the system's per-deck tag sum.
  it("says something true: the pivot signals the same edge at every depth", () => {
    for (const system of [KO, RED_7]) {
      const perDeck = deckTagSum(system);
      let checked = 0;
      for (const seed of [1, 2, 3]) {
        const shoe = createShoe(DEFAULT_RULES, seed);
        for (let seen = 1; seen < shoe.cards.length - 26; seen++) {
          const cards = shoe.cards.slice(0, seen);
          if (currentRunningCount(cards, system, shoe.decks) !== system.pivot) continue;
          const excess = runningCount(cards, system) - (perDeck * seen) / 52;
          const decksLeft = (shoe.cards.length - seen) / 52;
          expect(excess / decksLeft).toBeCloseTo(perDeck, 9);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(0);
    }
    expect(deckTagSum(KO)).toBe(4);
    expect(deckTagSum(RED_7)).toBe(2);
  });
});
