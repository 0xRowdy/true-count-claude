import { describe, expect, it } from "vitest";
import {
  PAY_TABLES,
  PAY_TABLE_IDS,
  getPayTable,
  payTableColumn,
  payout,
  paysPerCoin,
} from "./paytables";

describe("pay tables", () => {
  it("shows the design's 9/6 Jacks or Better column at five coins", () => {
    // Frame xfJEh, "Pay Table".
    expect(payTableColumn(getPayTable("job-9-6"), 5).map((r) => [r.label, r.coins])).toEqual([
      ["Royal Flush", 4000],
      ["Straight Flush", 250],
      ["Four of a Kind", 125],
      ["Full House", 45],
      ["Flush", 30],
      ["Straight", 20],
      ["Three of a Kind", 15],
      ["Two Pair", 10],
      ["Jacks or Better", 5],
    ]);
  });

  it("pays the royal 250 per coin below five coins and 800 at five", () => {
    const table = getPayTable("job-9-6");
    expect([1, 2, 3, 4, 5].map((c) => payout(table, "royal-flush", c))).toEqual([
      250, 500, 750, 1000, 4000,
    ]);
    expect(paysPerCoin(table, "royal-flush", 4)).toBe(250);
    expect(paysPerCoin(table, "royal-flush", 5)).toBe(800);
  });

  it("names Jacks or Better tables by their full house and flush pays", () => {
    expect(PAY_TABLE_IDS.map((id) => PAY_TABLES[id].name)).toEqual([
      "9/6 Jacks or Better",
      "8/5 Jacks or Better",
      "7/5 Jacks or Better",
      "6/5 Jacks or Better",
      "Full Pay Deuces Wild",
      "9/6 Double Double Bonus",
    ]);
    for (const id of ["job-9-6", "job-8-5", "job-7-5", "job-6-5"] as const) {
      const table = getPayTable(id);
      const [fullHouse, flush] = table.name.split(" ")[0]!.split("/").map(Number);
      expect(paysPerCoin(table, "full-house", 1)).toBe(fullHouse);
      expect(paysPerCoin(table, "flush", 1)).toBe(flush);
    }
  });

  it("pays nothing for a hand the table does not list", () => {
    expect(payout(getPayTable("deuces-wild-full-pay"), "two-pair", 5)).toBe(0);
    expect(payout(getPayTable("job-9-6"), "nothing", 5)).toBe(0);
  });

  it("has full-pay Deuces Wild and 9/6 Double Double Bonus lines", () => {
    const deuces = getPayTable("deuces-wild-full-pay");
    expect(deuces.rows.map((r) => r.pays)).toEqual([250, 200, 25, 15, 9, 5, 3, 2, 2, 1]);
    const ddb = getPayTable("double-double-bonus-9-6");
    expect(ddb.rows.map((r) => r.pays)).toEqual([250, 400, 160, 160, 80, 50, 50, 9, 6, 4, 3, 1, 1]);
  });

  it("lists every table best line first", () => {
    for (const id of PAY_TABLE_IDS) {
      const pays = PAY_TABLES[id].rows.map((r) => r.paysAtMaxCoins ?? r.pays);
      expect([...pays].sort((a, b) => b - a)).toEqual(pays);
    }
  });

  it("rejects a bet outside 1–5 whole coins", () => {
    const table = getPayTable("job-9-6");
    expect(() => payout(table, "flush", 0)).toThrow(RangeError);
    expect(() => payout(table, "flush", 6)).toThrow(RangeError);
    expect(() => payout(table, "flush", 2.5)).toThrow(RangeError);
  });
});
