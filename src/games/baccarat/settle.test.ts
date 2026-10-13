import { describe, expect, it } from "vitest";
import { EZ_BACCARAT, PUNTO_BANCO } from "./rules";
import { settleBet, settleBets, validateBets } from "./settle";
import { dealt, fixed } from "./test-helpers";

const playerWin = dealt("4c Ks 5d 7h").coup; // Player wins 9 over 7, natural
const bankerWin = dealt("7c 2d Kh 3s 4h").coup; // Banker draws to 9 over 7
const tie = dealt("6c 3d Kh 3s").coup; // tie at 6
const dragon = dealt("Kc Kd 4h 2s Kh 5c").coup; // Banker three-card 7
const panda = dealt("Kc Kd 5h 2s 3h 5c").coup; // Player three-card 8
const pairs = dealt("8c 3d 8h 3s").coup; // both pairs, tie at 6

describe("main bets — Punto Banco", () => {
  it("Player pays 1:1, pushes on a tie, loses to Banker (the design's +$50)", () => {
    expect(settleBet(PUNTO_BANCO, playerWin, "player", 50)).toMatchObject({
      outcome: "win",
      net: 50,
      returned: 100,
      reason: "Player wins — pays 1:1",
    });
    expect(settleBet(PUNTO_BANCO, tie, "player", 50)).toMatchObject({
      outcome: "push",
      net: 0,
      returned: 50,
    });
    expect(settleBet(PUNTO_BANCO, bankerWin, "player", 50)).toMatchObject({
      outcome: "lose",
      net: -50,
      returned: 0,
    });
  });

  it("Banker pays 0.95:1 after the 5% commission", () => {
    expect(settleBet(PUNTO_BANCO, bankerWin, "banker", 25)).toEqual({
      bet: "banker",
      stake: 25,
      outcome: "win",
      net: 23.75,
      returned: 48.75,
      reason: "Banker wins — pays 0.95:1 after the 5% commission",
    });
    expect(settleBet(PUNTO_BANCO, bankerWin, "banker", 100).net).toBe(95);
    expect(settleBet(PUNTO_BANCO, tie, "banker", 25).outcome).toBe("push");
    expect(settleBet(PUNTO_BANCO, playerWin, "banker", 25).outcome).toBe("lose");
  });

  it("a Punto Banco Banker win with a three-card 7 still pays 0.95:1", () => {
    expect(settleBet(PUNTO_BANCO, dragon, "banker", 20).net).toBe(19);
  });

  it("Tie pays 8:1, or 9:1 where configured, and loses otherwise", () => {
    expect(settleBet(PUNTO_BANCO, tie, "tie", 10)).toMatchObject({
      outcome: "win",
      net: 80,
      returned: 90,
    });
    expect(settleBet({ ...PUNTO_BANCO, tiePays: 9 }, tie, "tie", 10).net).toBe(90);
    expect(settleBet(PUNTO_BANCO, playerWin, "tie", 10)).toMatchObject({
      outcome: "lose",
      net: -10,
    });
  });
});

describe("main bets — EZ Baccarat", () => {
  it("Banker pays 1:1 with no commission", () => {
    expect(settleBet(EZ_BACCARAT, bankerWin, "banker", 25)).toMatchObject({
      outcome: "win",
      net: 25,
      reason: "Banker wins — pays 1:1, no commission",
    });
  });

  it("a Banker win with a three-card 7 pushes", () => {
    expect(settleBet(EZ_BACCARAT, dragon, "banker", 25)).toMatchObject({
      outcome: "push",
      net: 0,
      returned: 25,
    });
    expect(settleBet(EZ_BACCARAT, dragon, "player", 25).outcome).toBe("lose");
  });
});

describe("side bets", () => {
  it("Player and Banker Pair pay 11:1 regardless of who wins", () => {
    const rules = { ...PUNTO_BANCO, sideBets: ["playerPair", "bankerPair"] as const };
    expect(settleBet(rules, pairs, "playerPair", 5)).toMatchObject({ outcome: "win", net: 55 });
    expect(settleBet(rules, pairs, "bankerPair", 5)).toMatchObject({ outcome: "win", net: 55 });
    expect(settleBet(rules, playerWin, "playerPair", 5)).toMatchObject({
      outcome: "lose",
      net: -5,
    });
  });

  it("Dragon 7 pays 40:1 and loses on any other result, ties included", () => {
    expect(settleBet(EZ_BACCARAT, dragon, "dragon7", 10)).toMatchObject({
      outcome: "win",
      net: 400,
    });
    expect(settleBet(EZ_BACCARAT, bankerWin, "dragon7", 10).outcome).toBe("lose");
    expect(settleBet(EZ_BACCARAT, tie, "dragon7", 10).outcome).toBe("lose");
  });

  it("Panda 8 pays 25:1", () => {
    expect(settleBet(EZ_BACCARAT, panda, "panda8", 10)).toMatchObject({ outcome: "win", net: 250 });
    expect(settleBet(EZ_BACCARAT, playerWin, "panda8", 10).outcome).toBe("lose");
  });

  it("an 8 on two cards is never a Panda 8", () => {
    expect(fixed("Kc 8d", "2c 3d").panda8).toBe(false);
  });
});

describe("settleBets", () => {
  it("settles the whole layout and totals it", () => {
    const rules = { ...EZ_BACCARAT, minBet: 1 };
    const s = settleBets(rules, dragon, { banker: 25, tie: 5, dragon7: 1, panda8: 1, player: 0 });
    expect(s.bets.map((b) => [b.bet, b.outcome])).toEqual([
      ["banker", "push"],
      ["tie", "lose"],
      ["dragon7", "win"],
      ["panda8", "lose"],
    ]);
    expect(s.totalStaked).toBe(32);
    expect(s.totalReturned).toBe(25 + 41);
    expect(s.net).toBe(34);
  });

  it("an empty layout settles to nothing", () => {
    expect(settleBets(PUNTO_BANCO, tie, {})).toEqual({
      bets: [],
      totalStaked: 0,
      totalReturned: 0,
      net: 0,
    });
  });

  it("refuses bets the table does not offer or outside the limits", () => {
    expect(validateBets(PUNTO_BANCO, { dragon7: 10 })).toEqual([
      "Dragon 7 is not offered at this table",
    ]);
    expect(validateBets(PUNTO_BANCO, { player: 5 })).toEqual([
      "Player must be between 10 and 5000",
    ]);
    expect(validateBets(PUNTO_BANCO, { player: -10 })).toEqual([
      "Player stake must be a positive amount",
    ]);
    expect(validateBets(PUNTO_BANCO, { player: 10, banker: 5000 })).toEqual([]);
    expect(() => settleBets(PUNTO_BANCO, tie, { panda8: 10 })).toThrow(/Panda 8 is not offered/);
  });
});
