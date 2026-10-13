import { describe, expect, it } from "vitest";
import { encodeHand, decodeCard, encodeCard, choose } from "./cards";
import { HAND_RANKS, evaluateCodes, evaluateHand, type HandRank } from "./evaluate";
import { cards } from "./test-helpers";

describe("card codes", () => {
  it("round-trips every card of the deck", () => {
    for (let code = 0; code < 52; code++) {
      expect(encodeCard(decodeCard(code))).toBe(code);
    }
  });

  it("orders ranks the poker way: 2 lowest, Ace highest", () => {
    expect(encodeCard({ rank: "2", suit: "s" })).toBe(0);
    expect(encodeCard({ rank: "A", suit: "c" })).toBe(51);
  });

  it("rejects a hand that is not five distinct cards", () => {
    expect(() => encodeHand(cards("5h 5s 9h Qh"))).toThrow(/5 cards/);
    expect(() => encodeHand(cards("5h 5h 9h Qh 2h"))).toThrow(/same card/);
    expect(() => decodeCard(52)).toThrow(RangeError);
  });

  it("knows its binomials", () => {
    expect(choose(52, 5)).toBe(2_598_960);
    expect(choose(47, 5)).toBe(1_533_939);
    expect(choose(47, 0)).toBe(1);
    expect(choose(3, 4)).toBe(0);
  });
});

const JOB: [string, HandRank][] = [
  ["Ah Kh Qh Jh Th", "royal-flush"],
  ["9s Ks Qs Js Ts", "straight-flush"],
  ["As 2s 3s 4s 5s", "straight-flush"],
  ["7c 7d 7h 7s 2c", "four-of-a-kind"],
  ["7c 7d 7h 2s 2c", "full-house"],
  ["2h 7h 9h Jh Kh", "flush"],
  ["Ah 2c 3d 4s 5h", "straight"],
  ["Th Jc Qd Ks Ah", "straight"],
  ["Qh Kc Ad 2s 3h", "nothing"],
  ["9c 9d 9h 2s 5c", "three-of-a-kind"],
  ["9c 9d 5h 5s Ac", "two-pair"],
  ["Jc Jd 5h 3s 2c", "jacks-or-better"],
  ["Ac Ad 5h 3s 2c", "jacks-or-better"],
  ["Tc Td 5h 3s 2c", "nothing"],
  ["5h 5s 9h Qh 2h", "nothing"],
];

const DEUCES: [string, HandRank][] = [
  ["Ah Kh Qh Jh Th", "royal-flush"],
  ["2h 2c 2d 2s 9h", "four-deuces"],
  ["2h Kh Qh Jh Th", "wild-royal-flush"],
  ["2h 2c Qs Js Ts", "wild-royal-flush"],
  ["2h 2c 2d Js As", "wild-royal-flush"],
  ["2h 9c 9d 9s 9h", "five-of-a-kind"],
  ["2h 2c 2d 9s 9h", "five-of-a-kind"],
  ["2h 6h 7h 8h 9h", "straight-flush"],
  ["2h 2s 3h 4h 7h", "straight-flush"],
  ["2h Ah 3h 4h 5h", "straight-flush"],
  ["2h 2s 2c 9h 7c", "four-of-a-kind"],
  ["2h 9c 9d 9h 7c", "four-of-a-kind"],
  ["9c 9d 9h 7c 7d", "full-house"],
  ["2s 9c 9d 7h 7c", "full-house"],
  ["2s 3h 8h Jh Kh", "flush"],
  ["3h 8h Jh Kh 5h", "flush"],
  ["2s 3h 4c 6d 7h", "straight"],
  ["2s Ac Kd Qh Jh", "straight"],
  ["2s 9c 9d Jh Kh", "three-of-a-kind"],
  ["2s 9c 4d Jh Kh", "nothing"],
  ["9s 9c 4d Jh Kh", "nothing"],
  ["9s 9c 4d 4h Kh", "nothing"],
  ["3s 9c 4d Jh Kh", "nothing"],
];

const DDB: [string, HandRank][] = [
  ["Ah Ac Ad As 2c", "four-aces-with-kicker"],
  ["Ah Ac Ad As 4c", "four-aces-with-kicker"],
  ["Ah Ac Ad As 5c", "four-aces"],
  ["3h 3c 3d 3s Ac", "four-2-4-with-kicker"],
  ["2h 2c 2d 2s 4c", "four-2-4-with-kicker"],
  ["4h 4c 4d 4s 2c", "four-2-4-with-kicker"],
  ["4h 4c 4d 4s 5c", "four-2-4"],
  ["5h 5c 5d 5s Ac", "four-5-k"],
  ["Kh Kc Kd Ks 2c", "four-5-k"],
  ["Ah Kh Qh Jh Th", "royal-flush"],
  ["9c 9d 5h 5s Ac", "two-pair"],
  ["Jc Jd 5h 3s 2c", "jacks-or-better"],
];

describe("evaluateHand", () => {
  it.each(JOB)("Jacks or Better: %s is %s", (hand, expected) => {
    expect(evaluateHand(cards(hand), "jacks-or-better")).toBe(expected);
  });

  it.each(DEUCES)("Deuces Wild: %s is %s", (hand, expected) => {
    expect(evaluateHand(cards(hand), "deuces-wild")).toBe(expected);
  });

  it.each(DDB)("Double Double Bonus: %s is %s", (hand, expected) => {
    expect(evaluateHand(cards(hand), "double-double-bonus")).toBe(expected);
  });

  it("does not care about card order", () => {
    expect(evaluateHand(cards("Th Ah Jh Kh Qh"), "jacks-or-better")).toBe("royal-flush");
    expect(evaluateHand(cards("Kh 2h Jh Th Qh"), "deuces-wild")).toBe("wild-royal-flush");
  });
});

/**
 * The frequency of every final hand over all 2,598,960 five-card hands. These are the
 * textbook counts (Wizard of Odds, "5-card poker probabilities" and the Deuces Wild and
 * Double Double Bonus analysis pages); getting any one wrong would bias every EV.
 */
const FREQUENCIES: Record<string, Partial<Record<HandRank, number>>> = {
  "jacks-or-better": {
    "royal-flush": 4,
    "straight-flush": 36,
    "four-of-a-kind": 624,
    "full-house": 3744,
    flush: 5108,
    straight: 10200,
    "three-of-a-kind": 54912,
    "two-pair": 123552,
    "jacks-or-better": 337920,
    nothing: 2062860,
  },
  "deuces-wild": {
    "royal-flush": 4,
    "four-deuces": 48,
    "wild-royal-flush": 480,
    "five-of-a-kind": 624,
    "straight-flush": 2068,
    "four-of-a-kind": 31552,
    "full-house": 12672,
    flush: 14472,
    straight: 62232,
    "three-of-a-kind": 355080,
    nothing: 2119728,
  },
  "double-double-bonus": {
    "royal-flush": 4,
    "four-aces-with-kicker": 12,
    "four-2-4-with-kicker": 36,
    "four-aces": 36,
    "four-2-4": 108,
    "four-5-k": 432,
    "straight-flush": 36,
    "full-house": 3744,
    flush: 5108,
    straight: 10200,
    "three-of-a-kind": 54912,
    "two-pair": 123552,
    "jacks-or-better": 337920,
    nothing: 2062860,
  },
};

describe("hand frequencies over the whole deck", () => {
  it.each(Object.keys(FREQUENCIES))(
    "%s matches the textbook counts",
    (game) => {
      const counts = new Array<number>(HAND_RANKS.length).fill(0);
      const hand = [0, 0, 0, 0, 0];
      for (let a = 0; a < 52; a++)
        for (let b = a + 1; b < 52; b++)
          for (let c = b + 1; c < 52; c++)
            for (let d = c + 1; d < 52; d++)
              for (let e = d + 1; e < 52; e++) {
                hand[0] = a;
                hand[1] = b;
                hand[2] = c;
                hand[3] = d;
                hand[4] = e;
                const code = evaluateCodes(game as "jacks-or-better", hand);
                counts[code] = (counts[code] as number) + 1;
              }
      const actual = Object.fromEntries(
        HAND_RANKS.map((h, i) => [h, counts[i]]).filter(([, n]) => n !== 0),
      );
      expect(actual).toEqual(FREQUENCIES[game]);
    },
    180_000,
  );
});
