import { describe, expect, it } from "vitest";
import {
  coachHint,
  dealtLine,
  describeHand,
  describeHold,
  formatAverage,
  formatMoney,
  holdButtonLabel,
  instinctiveHold,
  judgeHold,
  rankPlural,
} from "./coach";
import type { VideoPokerGame } from "./evaluate";
import { analyzeHolds, optionForMask } from "./holds";
import { getPayTable, type PayTableId } from "./paytables";
import { cards } from "./test-helpers";

const analyze = (hand: string, id: PayTableId = "job-9-6", coins = 5) =>
  analyzeHolds(cards(hand), getPayTable(id), coins);

describe("the design's hint (frame xfJEh)", () => {
  // 5♥ 5♠ 9♥ Q♥ 2♥ on 9/6 Jacks or Better, 5 coins × $1.
  const analysis = analyze("5h 5s 9h Qh 2h");

  it("describes the deal", () => {
    expect(dealtLine(analysis.hand, "jacks-or-better")).toBe("Dealt: pair of 5s, four hearts");
  });

  it("says what to keep and what to let go, in dollars of this bet", () => {
    const hint = coachHint(analysis, 100);
    expect(hint.verdict).toBe("hint");
    expect(hint.tag).toBe("HINT · 9/6 JACKS OR BETTER");
    expect(hint.title).toBe("Keep the four hearts. Let the pair of 5s go.");
    expect(hint.body).toBe(
      "On average a low pair returns about $4.10 of your $5 bet. Four to a flush returns about $6.10.",
    );
    expect(hint.holdLabel).toBe("Hold these 4");
    expect(hint.best.indices).toEqual([0, 2, 3, 4]);
    expect(hint.compared?.indices).toEqual([0, 1]);
    expect(hint.costCents).toBeCloseTo(500 * (57 / 47) - 500 * hint.compared!.ev, 9);
  });
});

describe("judgeHold", () => {
  it("explains a mistake against the best hold", () => {
    const analysis = analyze("5h 5s 9h Qh 2h");
    const verdict = judgeHold(analysis, 0b00011, 100);
    expect(verdict.verdict).toBe("mistake");
    expect(verdict.tag).toBe("BETTER HOLD · 9/6 JACKS OR BETTER");
    expect(verdict.title).toBe("Keep the four hearts. Let the pair of 5s go.");
    expect(verdict.body).toBe(
      "On average a low pair returns about $4.10 of your $5 bet. Four to a flush returns about $6.10.",
    );
    expect(verdict.costCents).toBeGreaterThan(190);
    expect(verdict.costCents).toBeLessThan(200);
  });

  it("names only the extra card when the player kept a kicker", () => {
    const analysis = analyze("Jc Jd 5h 3s Ac");
    const verdict = judgeHold(analysis, 0b10011, 100);
    expect(verdict.title).toBe("Keep the pair of Jacks. Let the Ace go.");
    expect(verdict.body).toMatch(
      /^On average a high pair and a kicker returns about \$\d+\.\d0 of your \$5 bet\. A high pair returns about \$\d+\.\d0\.$/,
    );
  });

  it("has nothing to let go when the player held too little", () => {
    const analysis = analyze("Ah Kh Qh Jh 3c");
    const verdict = judgeHold(analysis, 0b00001, 100);
    expect(verdict.title).toBe("Keep the four hearts.");
    expect(verdict.body).toContain("Four to a royal flush returns about");
  });

  it("confirms a correct hold against the next best play", () => {
    const analysis = analyze("5h 5s 9h Qh 2h");
    const verdict = judgeHold(analysis, analysis.best.mask, 100);
    expect(verdict.verdict).toBe("correct");
    expect(verdict.costCents).toBe(0);
    expect(verdict.title).toBe("Right hold. Four to a flush is the best play here.");
    expect(verdict.body).toBe(
      "Four to a flush returns about $6.10 of your $5 bet on average. The next best play, a low pair, returns about $4.10.",
    );
  });

  it("uses plural verbs for plural holds", () => {
    const analysis = analyze("Kc Qd 7h 4s 2c");
    expect(judgeHold(analysis, analysis.best.mask, 100).title).toBe(
      "Right hold. Two high cards are the best play here.",
    );
  });

  it("drops to cents when two holds round to the same dime", () => {
    const analysis = analyze("Kc Qd 7h 4s 2c");
    const king = optionForMask(analysis, 0b00001);
    const verdict = judgeHold(analysis, king.mask, 25);
    expect(verdict.body).toMatch(/\$0\.\d[1-9]|\$0\.[1-9]\d/);
    const amounts = verdict.body.match(/\$\d+\.\d\d/g)!;
    expect(amounts[0]).not.toBe(amounts[2]);
  });

  it("tells the player to throw everything back when that is best", () => {
    const analysis = analyze("3c 7h 8d Jh Ks", "deuces-wild-full-pay");
    expect(analysis.best.indices).toEqual([]);
    const verdict = judgeHold(analysis, 0b00100, 100);
    expect(verdict.title).toBe("Throw all five back.");
    expect(verdict.holdLabel).toBe("Draw five new");
  });

  it("explains in the bet's own denomination", () => {
    const analysis = analyze("5h 5s 9h Qh 2h", "job-9-6", 3);
    expect(judgeHold(analysis, 0b00011, 25).body).toContain("of your $0.75 bet");
  });
});

describe("breaking up a pair", () => {
  it("says 'break up' when the keep line names a card of the pair", () => {
    // J-10-9-8 with a pair of 9s in 9/6 Double Double Bonus: the best hold keeps one 9 for
    // the outside straight draw, so "let the pair of 9s go" would contradict the keep line.
    const analysis = analyze("9h Js 8d Ts 9s", "double-double-bonus-9-6");
    expect(analysis.best.indices).toEqual([0, 1, 2, 3]);
    const hint = coachHint(analysis, 100);
    expect(hint.compared?.indices).toEqual([0, 4]);
    expect(hint.title).toBe("Keep the Jack, 10, 9 and 8. Break up the pair of 9s.");
    expect(judgeHold(analysis, 0b10001, 100).title).toBe(hint.title);
  });

  it("keeps the design's 'let the pair go' when the keep line names a suit", () => {
    expect(coachHint(analyze("5h 5s 9h Qh 2h"), 100).title).toBe(
      "Keep the four hearts. Let the pair of 5s go.",
    );
  });
});

describe("coachHint", () => {
  it("argues against breaking a pat flush when four to a royal is better", () => {
    const hint = coachHint(analyze("Ah Kh Qh Jh 3h"), 100);
    expect(hint.title).toBe("Keep the four hearts. Let the 3 go.");
    expect(hint.body).toContain("On average a flush returns about $30.00 of your $5 bet.");
  });

  it("compares with the runner-up when instinct is already right", () => {
    const hint = coachHint(analyze("5c 5d 6h 7s 8c"), 100);
    expect(hint.title).toBe("Keep the pair of 5s. Let the 8, 7 and 6 go.");
    expect(hint.body).toBe(
      "On average four to an outside straight returns about $3.40 of your $5 bet. A low pair returns about $4.10.",
    );
  });

  it("keeps every deuce in Deuces Wild", () => {
    const hint = coachHint(analyze("2c 2d 7h Kc 9s", "deuces-wild-full-pay"), 100);
    expect(hint.tag).toBe("HINT · FULL PAY DEUCES WILD");
    expect(hint.title).toBe("Keep the two deuces. Let the King go.");
    expect(hint.body).toContain("Two deuces return about");
  });

  it("holds a pat royal", () => {
    const hint = coachHint(analyze("Ah Kh Qh Jh Th"), 100);
    expect(hint.title).toBe("Keep all five cards.");
    expect(hint.holdLabel).toBe("Hold all 5");
    expect(hint.body).toContain("A royal flush returns about $4,000.00.");
  });
});

describe("instinctiveHold", () => {
  it.each<[string, VideoPokerGame, number]>([
    ["5h 5s 9h Qh 2h", "jacks-or-better", 0b00011],
    ["Ah Kh Qh Jh 3h", "jacks-or-better", 0b11111],
    ["9c 9d 5h 5s Ac", "jacks-or-better", 0b01111],
    ["2c 2d 7h Kc 9s", "deuces-wild", 0b00011],
    ["3c 7h 8d Jh Ks", "deuces-wild", 0],
  ])("%s (%s) → %i", (hand, game, mask) => {
    expect(instinctiveHold(cards(hand), game)).toBe(mask);
  });
});

describe("describeHand", () => {
  it.each<[string, VideoPokerGame, string]>([
    ["5h 5s 9h Qh 2h", "jacks-or-better", "pair of 5s, four hearts"],
    ["Jc Jd 5h 3s 2c", "jacks-or-better", "pair of Jacks"],
    ["9c 9d 5h 5s Ac", "jacks-or-better", "two pair, 9s and 5s"],
    ["9c 9d 9h 5s Ac", "jacks-or-better", "three 9s"],
    ["Ah Kh Qh Jh Th", "jacks-or-better", "a royal flush"],
    ["Ah Kh Qh Jh 3h", "jacks-or-better", "a flush"],
    ["7c 7d 7h 2s 2c", "jacks-or-better", "a full house"],
    ["Ah Kh Qh Jh 3c", "jacks-or-better", "four to a royal"],
    ["9h Th Jh Qh 3c", "jacks-or-better", "four to a straight flush"],
    ["Ah Kh Qh 4c 3d", "jacks-or-better", "three to a royal"],
    ["5c 6d 7h 8s Kc", "jacks-or-better", "four to a straight"],
    ["Kc Qd 7h 4s 2c", "jacks-or-better", "no pair, two high cards"],
    ["3c 7h 8d 4h 9s", "jacks-or-better", "no pair"],
    ["Ac Ad Ah As 2c", "double-double-bonus", "four Aces with a kicker"],
    ["2c 2d 7h Kc 9s", "deuces-wild", "two deuces"],
    ["2c Kh 8h 9h Ks", "deuces-wild", "one deuce, pair of Kings, four to a flush"],
    ["2c 7h 8h 9h Ks", "deuces-wild", "one deuce, four to a straight flush"],
    ["2c 2d 2h 2s 9s", "deuces-wild", "four deuces"],
    ["2c 9d 9h 9s Kc", "deuces-wild", "one deuce, four of a kind"],
    ["3c 7h 8d Jh Ks", "deuces-wild", "no pair"],
    ["Qc Ac 4d 2c 5h", "deuces-wild", "one deuce, four to a straight"],
    ["Qc Ac 4d 9c 5h", "jacks-or-better", "no pair, two high cards"],
  ])("%s (%s) → %s", (hand, game, expected) => {
    expect(describeHand(cards(hand), game)).toBe(expected);
  });
});

describe("describeHold", () => {
  const table = getPayTable("job-9-6");
  const deuces = getPayTable("deuces-wild-full-pay");
  it.each<[string, PayTableId, string, string]>([
    ["", "job-9-6", "a full redraw", "nothing"],
    ["5h 9h Qh 2h", "job-9-6", "four to a flush", "the four hearts"],
    ["5h 5s", "job-9-6", "a low pair", "the pair of 5s"],
    ["Jh Js", "job-9-6", "a high pair", "the pair of Jacks"],
    ["Jh Js Ac", "job-9-6", "a high pair and a kicker", "the pair of Jacks and the Ace"],
    ["9c 9d 9h", "job-9-6", "three of a kind", "the three 9s"],
    ["9c 9d 5h 5s", "job-9-6", "two pair", "the 9s and 5s"],
    ["Ah Kh Qh Jh", "job-9-6", "four to a royal flush", "the four hearts"],
    ["Qh Jh", "job-9-6", "two to a royal flush", "the Queen and Jack of hearts"],
    ["9h Th Jh", "job-9-6", "three to a straight flush", "the three hearts"],
    ["5c 6d 7h 8s", "job-9-6", "four to an outside straight", "the 8, 7, 6 and 5"],
    ["5c 6d 7h 9s", "job-9-6", "four to an inside straight", "the 9, 7, 6 and 5"],
    ["2h 3d 4c 5s", "job-9-6", "four to an outside straight", "the 5, 4, 3 and 2"],
    ["Ts Jc Qd Kh", "job-9-6", "four to an outside straight", "the King, Queen, Jack and 10"],
    ["Ah 2d 3c 4s", "job-9-6", "four to an inside straight", "the Ace, 4, 3 and 2"],
    ["Jc Qd Kh As", "job-9-6", "four to an inside straight", "the Ace, King, Queen and Jack"],
    ["Kc Qd", "job-9-6", "two high cards", "the King and Queen"],
    ["Qd", "job-9-6", "a single high card", "the Queen"],
    ["7d", "job-9-6", "a single low card", "the 7"],
    ["Ah Kh Qh Jh Th", "job-9-6", "a royal flush", "all five cards"],
    ["9c 9d 5h 5s Ac", "job-9-6", "two pair and a kicker", "all five cards"],
    ["2c 2d", "deuces-wild-full-pay", "two deuces", "the two deuces"],
    ["2c", "deuces-wild-full-pay", "a lone deuce", "the deuce"],
    ["2c Kh Ks", "deuces-wild-full-pay", "three of a kind", "the deuce and the pair of Kings"],
    [
      "2c 7h 8h 9h",
      "deuces-wild-full-pay",
      "four to a straight flush",
      "the deuce and the 9, 8 and 7 of hearts",
    ],
    [
      "2c Kh Qh",
      "deuces-wild-full-pay",
      "three to a wild royal flush",
      "the deuce and the King and Queen of hearts",
    ],
    ["9c 9d", "deuces-wild-full-pay", "a pair", "the pair of 9s"],
  ])("%s (%s) → %s / %s", (held, id, concept, phrase) => {
    const text = describeHold(held ? cards(held) : [], id === "job-9-6" ? table : deuces);
    expect([text.concept, text.phrase]).toEqual([concept, phrase]);
  });

  it("flags plural concepts for verb agreement", () => {
    expect(describeHold(cards("Kc Qd"), table).plural).toBe(true);
    expect(describeHold(cards("2c 2d"), deuces).plural).toBe(true);
    expect(describeHold(cards("5h 5s"), table).plural).toBe(false);
  });
});

describe("formatting", () => {
  it("formats money without locale APIs", () => {
    expect(formatMoney(500)).toBe("$5");
    expect(formatMoney(125)).toBe("$1.25");
    expect(formatMoney(400_000)).toBe("$4,000");
    expect(formatMoney(259_100)).toBe("$2,591");
    expect(formatMoney(-75)).toBe("-$0.75");
    expect(formatMoney(1_234_567_89)).toBe("$1,234,567.89");
  });

  it("rounds averages to the dime on dollar bets and to the cent below", () => {
    expect(formatAverage(606.38, 500)).toBe("$6.10");
    expect(formatAverage(411.84, 500)).toBe("$4.10");
    expect(formatAverage(600, 500)).toBe("$6.00");
    expect(formatAverage(41.18, 50)).toBe("$0.41");
  });

  it("labels the coach's hold button by count", () => {
    const analysis = analyze("5h 5s 9h Qh 2h");
    expect(holdButtonLabel(optionForMask(analysis, 0))).toBe("Draw five new");
    expect(holdButtonLabel(optionForMask(analysis, 1))).toBe("Hold this 1");
    expect(holdButtonLabel(optionForMask(analysis, 3))).toBe("Hold these 2");
    expect(holdButtonLabel(optionForMask(analysis, 31))).toBe("Hold all 5");
  });

  it("pluralises ranks, with deuces in Deuces Wild", () => {
    expect(rankPlural("5", "jacks-or-better")).toBe("5s");
    expect(rankPlural("Q", "jacks-or-better")).toBe("Queens");
    expect(rankPlural("2", "deuces-wild")).toBe("deuces");
    expect(rankPlural("2", "jacks-or-better")).toBe("2s");
  });
});
