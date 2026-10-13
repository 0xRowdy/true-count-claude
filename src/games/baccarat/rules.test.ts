import { describe, expect, it } from "vitest";
import {
  BET_KINDS,
  DEFAULT_BACCARAT_RULES,
  EZ_BACCARAT,
  PUNTO_BANCO,
  describeRules,
  isBetOffered,
  payLabel,
  validateBaccaratRules,
} from "./rules";

describe("baccarat rules", () => {
  it("the defaults are valid", () => {
    expect(validateBaccaratRules(PUNTO_BANCO)).toEqual([]);
    expect(validateBaccaratRules(EZ_BACCARAT)).toEqual([]);
    expect(DEFAULT_BACCARAT_RULES).toBe(PUNTO_BANCO);
  });

  it("describes the table as the design's header does", () => {
    expect(describeRules(PUNTO_BANCO)).toBe("Punto Banco · 8 decks · 5% commission");
    expect(describeRules(EZ_BACCARAT)).toBe("EZ Baccarat · 8 decks · no commission");
    expect(describeRules({ ...PUNTO_BANCO, decks: 1 })).toBe(
      "Punto Banco · 1 deck · 5% commission",
    );
  });

  it("labels each bet spot's pay odds", () => {
    expect(payLabel(PUNTO_BANCO, "player")).toBe("pays 1:1");
    expect(payLabel(PUNTO_BANCO, "tie")).toBe("pays 8:1");
    expect(payLabel(PUNTO_BANCO, "banker")).toBe("pays 0.95:1");
    expect(payLabel({ ...PUNTO_BANCO, tiePays: 9 }, "tie")).toBe("pays 9:1");
    expect(payLabel(EZ_BACCARAT, "banker")).toBe("pays 1:1");
    expect(payLabel(EZ_BACCARAT, "dragon7")).toBe("pays 40:1");
    expect(payLabel(EZ_BACCARAT, "panda8")).toBe("pays 25:1");
    expect(payLabel(PUNTO_BANCO, "playerPair")).toBe("pays 11:1");
  });

  it("offers main bets everywhere and side bets only where configured", () => {
    expect(BET_KINDS.filter((b) => isBetOffered(PUNTO_BANCO, b))).toEqual([
      "player",
      "banker",
      "tie",
    ]);
    expect(BET_KINDS.filter((b) => isBetOffered(EZ_BACCARAT, b))).toEqual([
      "player",
      "banker",
      "tie",
      "dragon7",
      "panda8",
    ]);
  });

  it("rejects unsound rules", () => {
    expect(validateBaccaratRules({ ...PUNTO_BANCO, decks: 0 })).toContain(
      "decks must be an integer from 1 to 8",
    );
    expect(validateBaccaratRules({ ...PUNTO_BANCO, tiePays: 7 as 8 })).toContain(
      "tie must pay 8:1 or 9:1",
    );
    expect(validateBaccaratRules({ ...EZ_BACCARAT, commission: 0.05 })).toContain(
      "EZ Baccarat takes no commission",
    );
    expect(validateBaccaratRules({ ...PUNTO_BANCO, commission: 0 })).toContain(
      "Punto Banco commission must be between 0 and 1",
    );
    expect(validateBaccaratRules({ ...PUNTO_BANCO, sideBets: ["dragon7"] })).toContain(
      "dragon7 is only offered on EZ Baccarat",
    );
    expect(validateBaccaratRules({ ...EZ_BACCARAT, sideBets: ["panda8", "panda8"] })).toContain(
      "side bets must not repeat",
    );
    expect(validateBaccaratRules({ ...PUNTO_BANCO, cardsBehindCut: 6 })).toContain(
      "at least 12 cards must sit behind the cut card",
    );
    expect(validateBaccaratRules({ ...PUNTO_BANCO, decks: 1, cardsBehindCut: 52 })).toContain(
      "the cut card must sit inside the shoe",
    );
    expect(validateBaccaratRules({ ...PUNTO_BANCO, minBet: 0 })).toContain(
      "table limits must satisfy 0 < min ≤ max",
    );
  });
});
