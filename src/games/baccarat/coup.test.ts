import { describe, expect, it } from "vitest";
import { RANKS } from "../../engine/cards";
import {
  BANKER_DRAWS,
  bankerDraws,
  describeHand,
  describeResult,
  explainDraws,
  handTotal,
  isNatural,
  playerDraws,
  pointValue,
} from "./coup";
import { cards, dealt, fixed } from "./test-helpers";

describe("pointValue", () => {
  it("scores A as 1, 2–9 at face value, and tens and court cards as 0", () => {
    const expected = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 0, 0, 0];
    expect(RANKS.map(pointValue)).toEqual(expected);
  });
});

describe("handTotal", () => {
  it.each([
    ["4c 5d", 9],
    ["Ks 7h", 7],
    ["9c 9d", 8],
    ["10c Kd", 0],
    ["Ac Kd Qh", 1],
    ["7c 8d 9h", 4],
    ["5c 5d", 0],
  ])("%s totals %i", (hand, total) => {
    expect(handTotal(cards(hand))).toBe(total);
  });
});

describe("isNatural", () => {
  it("is an 8 or 9 on the first two cards only", () => {
    expect(isNatural(cards("4c 5d"))).toBe(true);
    expect(isNatural(cards("Kc 8d"))).toBe(true);
    expect(isNatural(cards("Kc 7d"))).toBe(false);
    expect(isNatural(cards("2c 3d 4h"))).toBe(false); // three-card 9 is not a natural
  });
});

describe("playerDraws", () => {
  it("draws on 0–5 and stands on 6–7", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(playerDraws)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
  });
});

/**
 * The published Banker tableau. Row = Banker's two-card total, column = point value of the
 * Player's third card, 0 through 9. D = Banker draws, S = Banker stands.
 */
const REFERENCE_TABLEAU: Record<number, string> = {
  0: "DDDDDDDDDD",
  1: "DDDDDDDDDD",
  2: "DDDDDDDDDD",
  3: "DDDDDDDDSD",
  4: "SSDDDDDDSS",
  5: "SSSSDDDDSS",
  6: "SSSSSSDDSS",
  7: "SSSSSSSSSS",
};

describe("Banker third-card tableau", () => {
  for (let bankerTotal = 0; bankerTotal <= 7; bankerTotal++) {
    const row = REFERENCE_TABLEAU[bankerTotal] as string;
    for (let third = 0; third <= 9; third++) {
      const draws = row[third] === "D";
      it(`Banker ${bankerTotal} vs Player third card ${third}: ${draws ? "draws" : "stands"}`, () => {
        expect(bankerDraws(bankerTotal, third)).toBe(draws);
        expect(BANKER_DRAWS[bankerTotal]?.[third]).toBe(draws);
      });
    }
  }

  it("when the Player stands, Banker draws on 0–5 and stands on 6–7", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((t) => bankerDraws(t, null))).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  it("has 8 rows of 10 columns", () => {
    expect(BANKER_DRAWS).toHaveLength(8);
    for (const row of BANKER_DRAWS) expect(row).toHaveLength(10);
  });
});

describe("playCoupFrom — the deal", () => {
  it("plays the design's coup: Player 4♣ 5♦ (Natural 9) beats Banker K♠ 7♥ (Stands on 7)", () => {
    const { coup, used } = dealt("4c Ks 5d 7h");
    expect(used).toBe(4);
    expect(coup.player).toEqual(cards("4c 5d"));
    expect(coup.banker).toEqual(cards("Ks 7h"));
    expect(coup.winner).toBe("player");
    expect(coup.playerNatural).toBe(true);
    expect(describeHand(coup, "player")).toBe("Natural 9");
    expect(describeHand(coup, "banker")).toBe("Stands on 7");
    expect(describeResult(coup)).toBe("Player wins 9 over 7");
  });

  it("stops on a Banker natural even when the Player would draw", () => {
    const { coup, used } = dealt("2c 8d 3h Kd");
    expect(used).toBe(4);
    expect(coup.bankerNatural).toBe(true);
    expect(coup.winner).toBe("banker");
    expect(describeResult(coup)).toBe("Banker wins 8 over 5");
  });

  it("both stand on 6: a tie", () => {
    const { coup, used } = dealt("6c 3d Kh 3s");
    expect(used).toBe(4);
    expect(coup.winner).toBe("tie");
    expect(describeResult(coup)).toBe("Tie at 6");
    expect(describeHand(coup, "banker")).toBe("Stands on 6");
  });

  it("Player stands on 7, so Banker draws on 5 like the Player would", () => {
    const { coup, used } = dealt("7c 2d Kh 3s 4h");
    expect(used).toBe(5);
    expect(coup.banker).toHaveLength(3);
    expect(coup.bankerTotal).toBe(9);
    expect(describeHand(coup, "banker")).toBe("Draws to 9");
    expect(describeResult(coup)).toBe("Banker wins 9 over 7");
  });

  it("Banker stands on 3 when the Player's third card is an 8", () => {
    const { coup, used } = dealt("2c 3d 3h Ks 8h");
    expect(used).toBe(5);
    expect(coup.player).toHaveLength(3);
    expect(coup.banker).toHaveLength(2);
    expect(coup.winner).toBe("tie");
  });

  it("Banker draws on 6 when the Player's third card is a 7", () => {
    const { coup, used } = dealt("Ac 6d 4h Ks 7h 3c");
    expect(used).toBe(6);
    expect(coup.playerTotal).toBe(2);
    expect(coup.bankerTotal).toBe(9);
    expect(coup.winner).toBe("banker");
  });

  it("flags a Dragon 7: Banker wins with a three-card 7", () => {
    const { coup } = dealt("Kc Kd 4h 2s Kh 5c");
    expect(coup.winner).toBe("banker");
    expect(coup.bankerTotal).toBe(7);
    expect(coup.dragon7).toBe(true);
    expect(coup.panda8).toBe(false);
  });

  it("flags a Panda 8: Player wins with a three-card 8", () => {
    const { coup } = dealt("Kc Kd 5h 2s 3h 5c");
    expect(coup.winner).toBe("player");
    expect(coup.playerTotal).toBe(8);
    expect(coup.panda8).toBe(true);
    expect(coup.dragon7).toBe(false);
  });

  it("a two-card Banker 7 is not a Dragon 7, and a natural 8 is not a Panda 8", () => {
    expect(fixed("3c 3d", "Ks 7h").dragon7).toBe(false);
    expect(fixed("Kc 8d", "Ks 7h").panda8).toBe(false);
  });

  it("pairs are by rank: 8–8 is a pair, 10–J is not", () => {
    const pairs = dealt("8c 3d 8h 3s").coup;
    expect(pairs.playerPair).toBe(true);
    expect(pairs.bankerPair).toBe(true);
    const noPair = fixed("10c Jd", "Qc Kd");
    expect(noPair.playerPair).toBe(false);
    expect(noPair.bankerPair).toBe(false);
  });
});

describe("explainDraws", () => {
  it("explains a natural", () => {
    expect(explainDraws(dealt("4c Ks 5d 7h").coup)).toEqual([
      "Player has a natural 9, so neither side draws.",
    ]);
    expect(explainDraws(fixed("4c 5d", "9h Ks"))).toEqual([
      "Both hands have a natural, so neither side draws.",
    ]);
  });

  it("explains the Banker playing like the Player after a Player stand", () => {
    expect(explainDraws(dealt("7c 2d Kh 3s 4h").coup)).toEqual([
      "Player has 7, and Player stands on 6 or 7.",
      "Player stood, so Banker draws on 5 like the Player would (0–5).",
    ]);
    expect(explainDraws(dealt("6c 3d Kh 3s").coup)[1]).toBe(
      "Player stood, so Banker stands on 6 (6 or 7).",
    );
  });

  it("cites the tableau row when the Player drew", () => {
    expect(explainDraws(dealt("2c 3d 3h Ks 8h").coup)).toEqual([
      "Player has 5, and Player always draws on 0–5.",
      "Banker has 3 against a Player third card worth 8, so Banker stands: on 3, Banker draws unless the Player's third card is an 8.",
    ]);
    expect(explainDraws(dealt("Ac 6d 4h Ks 7h 3c").coup)[1]).toBe(
      "Banker has 6 against a Player third card worth 7, so Banker draws: on 6, Banker draws only when the Player's third card is 6 or 7.",
    );
  });
});
