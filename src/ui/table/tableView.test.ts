import { describe, expect, it } from "vitest";
import type { Card, Rank, Suit } from "@/engine/cards";
import { createHand } from "@/engine/hand";
import { DEFAULT_RULES, type RuleSet } from "@/engine/rules";
import { type RoundState, currentLegalActions, isRoundOver } from "@/engine/round";
import type { RoundResult } from "@/state";
import {
  addChip,
  betSizing,
  chipStack,
  collectAmount,
  dealerTotal,
  feltRules,
  historyChips,
  outcomeSummary,
  playerTotal,
  rackChips,
  removeChip,
  shownBankroll,
  signedAmount,
  tablePhase,
  tableSubtitle,
} from "./tableView";
import {
  availableBankroll,
  chooseBet,
  createPlayTable,
  dealRound,
  playAction,
  takeInsurance,
} from "./usePlayTable";

const card = (rank: Rank, suit: Suit = "s"): Card => ({ rank, suit });
const S17: RuleSet = { ...DEFAULT_RULES, dealerSoft17: "stand", maxBet: 500 };

/** Plays rounds from a seed, standing on everything, until one settles. */
function settledRound(seed: number): { round: RoundState; before: number } {
  let table = chooseBet(createPlayTable(DEFAULT_RULES, seed), 50);
  const before = table.bankroll;
  table = dealRound(table);
  while (table.round && !isRoundOver(table.round)) {
    if (table.round.phase === "insurance") {
      table = takeInsurance(table, false);
      continue;
    }
    const legal = currentLegalActions(table.round);
    if (legal.length === 0) break;
    table = playAction(table, legal.includes("stand") ? "stand" : legal[0]!);
  }
  return { round: table.round!, before };
}

describe("the phase the stepper shows", () => {
  it("is Bet with no round, Deal while one is live, then Result and Payout", () => {
    const table = dealRound(chooseBet(createPlayTable(DEFAULT_RULES, 3), 10));
    expect(tablePhase(null, false)).toBe("bet");
    const live = table.round!;
    if (live.phase !== "settled") expect(tablePhase(live, false)).toBe("deal");
    const settled = { ...live, phase: "settled" as const };
    expect(tablePhase(settled, false)).toBe("result");
    expect(tablePhase(settled, true)).toBe("payout");
  });
});

describe("the rules printed on the table", () => {
  it("names decks, soft 17, payout and limits in the Top Bar", () => {
    expect(tableSubtitle({ ...S17, minBet: 10, maxBet: 500 })).toBe(
      "6 deck · S17 · 3:2 · $10–$500",
    );
    expect(tableSubtitle({ ...DEFAULT_RULES, decks: 2, blackjackPayout: "6:5" })).toBe(
      "2 deck · H17 · 6:5 · $10–$1,000",
    );
  });

  it("prints the felt from the actual Rule Set, never a fixed string", () => {
    expect(feltRules(S17)).toEqual({
      pays: "BLACKJACK PAYS 3 TO 2",
      dealer: "DEALER STANDS ON ALL 17s",
    });
    expect(feltRules({ ...DEFAULT_RULES, blackjackPayout: "6:5" })).toEqual({
      pays: "BLACKJACK PAYS 6 TO 5",
      dealer: "DEALER HITS SOFT 17",
    });
  });
});

describe("hand totals", () => {
  it("reads soft, doubled, bust and blackjack the way the design prints them", () => {
    expect(playerTotal(createHand([card("A", "h"), card("6", "c")], 50)).text).toBe("Soft 17");
    expect(playerTotal(createHand([card("10"), card("7")], 50)).text).toBe("17");
    expect(
      playerTotal({ ...createHand([card("A"), card("6"), card("4")], 50), doubled: true }).text,
    ).toBe("21 · doubled");
    expect(playerTotal(createHand([card("K"), card("Q"), card("5")], 50))).toEqual({
      text: "Bust · 25",
      tone: "bust",
    });
    expect(playerTotal(createHand([card("A"), card("K")], 50))).toEqual({
      text: "Blackjack",
      tone: "blackjack",
    });
    // A split ace and a ten is 21, not a blackjack.
    expect(playerTotal(createHand([card("A"), card("K")], 50, true)).text).toBe("21");
    expect(dealerTotal([card("K"), card("5"), card("9")])).toEqual({
      text: "Bust · 24",
      tone: "bust",
    });
    expect(dealerTotal([card("A"), card("Q")]).text).toBe("Blackjack");
  });
});

describe("chips", () => {
  it("builds a stack from the design's denominations, largest first", () => {
    expect(chipStack(50)).toEqual([25, 25]);
    expect(chipStack(10)).toEqual([5, 5]);
    expect(chipStack(1130)).toEqual([1000, 100, 25, 5]);
    expect(chipStack(0)).toEqual([]);
    expect(chipStack(1000 * 9)).toHaveLength(6);
  });

  it("offers only chips the table and the bankroll could take", () => {
    expect(rackChips(S17, 2450)).toEqual([1, 5, 25, 100, 500]);
    expect(rackChips(DEFAULT_RULES, 30)).toEqual([1, 5, 25]);
  });

  it("adds a chip up to the table maximum or the bankroll, and says which stopped it", () => {
    expect(addChip(25, 25, S17, 2450)).toEqual({ amount: 50, capped: null });
    expect(addChip(450, 100, S17, 2450)).toEqual({
      amount: 500,
      capped: "Table maximum is $500",
    });
    expect(addChip(25, 100, S17, 60).capped).toBe("That is your whole bankroll ($60)");
    expect(addChip(25, 100, S17, 60).amount).toBe(60);
  });

  it("takes a chip off on a long-press, never below an empty spot", () => {
    expect(removeChip(50, 25)).toBe(25);
    expect(removeChip(10, 25)).toBe(0);
  });
});

describe("the LAST strip", () => {
  const round = (index: number, net: number, outcome: RoundResult["hands"][number]["outcome"]) =>
    ({
      index,
      net,
      hands: [{ handIndex: 0, outcome, busted: false, bet: 25, net, finalTotal: 20 }],
    }) as unknown as RoundResult;

  it("lists the latest rounds newest first, with the design's labels", () => {
    const chips = historyChips([
      round(0, 25, "win"),
      round(1, 0, "push"),
      round(2, -25, "loss"),
      round(3, 50, "win"),
      round(4, 75, "blackjack"),
    ]);
    expect(chips.map((chip) => chip.label)).toEqual(["BJ +75", "W +50", "L −25", "P 0", "W +25"]);
    expect(chips.map((chip) => chip.tone)).toEqual(["blackjack", "win", "loss", "push", "win"]);
  });

  it("keeps only the last five", () => {
    const many = Array.from({ length: 9 }, (_, i) => round(i, 10, "win"));
    expect(historyChips(many).map((chip) => chip.key)).toEqual(["r8", "r7", "r6", "r5", "r4"]);
  });

  it("signs amounts with a true minus sign and fractions to the cent", () => {
    expect(signedAmount(-12.5)).toBe("−12.50");
    expect(signedAmount(0)).toBe("0");
  });
});

describe("settling and collecting", () => {
  it("shows the chips arriving on Collect: Result bankroll + collect = the settled bankroll", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { round, before } = settledRound(seed);
      const table = { ...createPlayTable(DEFAULT_RULES, seed), round };
      const available = availableBankroll(table);
      const result = shownBankroll(available, round, "result");
      // While the result is up, the stake is still off the bankroll.
      expect(result + collectAmount(round)).toBe(available);
      expect(shownBankroll(available, round, "payout")).toBe(available);
      expect(available - before).toBe(round.settlement!.net);
    }
  });

  it("returns nothing to collect on a loss", () => {
    const lost = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
      .map((seed) => settledRound(seed).round)
      .find((round) => (round.settlement?.net ?? 0) < 0 && round.insurance.bet === 0);
    expect(lost, "no losing round in twelve seeds").toBeDefined();
    expect(collectAmount(lost!)).toBe(0);
  });

  it("headlines a win, a loss and a push in the design's words", () => {
    const rounds = Array.from({ length: 40 }, (_, i) => settledRound(i + 1).round);
    const win = rounds.find((r) => r.settlement!.outcomes[0]!.result === "win");
    const loss = rounds.find((r) => (r.settlement?.net ?? 0) < 0);
    const push = rounds.find((r) => r.settlement!.outcomes[0]!.result === "push");
    expect(outcomeSummary(win!).headline).toBe(`You win $${win!.settlement!.net}`);
    expect(outcomeSummary(win!).paid).toBe("paid 1:1");
    expect(outcomeSummary(loss!).headline).toBe(`You lose $${-loss!.settlement!.net}`);
    if (push) expect(outcomeSummary(push).headline).toBe("Push");
  });

  it("says a doubled win and a dealer bust as the design does", () => {
    const round: RoundState = {
      ...settledRound(1).round,
      playerHands: [
        { ...createHand([card("A", "h"), card("6", "c"), card("4", "d")], 50), doubled: true },
      ],
      dealerHand: createHand([card("K", "c"), card("5"), card("9", "h")], 0),
      settlement: {
        outcomes: [{ handIndex: 0, result: "win", wagered: 100, returned: 200, net: 100 }],
        insuranceNet: 0,
        net: 100,
      },
      insurance: { offered: false, taken: false, bet: 0, returned: 0 },
    };
    expect(outcomeSummary(round)).toEqual({
      tone: "win",
      headline: "You win $100",
      detail: "Dealer drew to 24 and busted. Doubled bet pays 1 to 1.",
      paid: "paid 1:1",
    });
    expect(collectAmount(round)).toBe(200);
  });
});

describe("bet sizing", () => {
  it("is on plan near 2% of the bankroll and called out above 5%", () => {
    expect(betSizing(50, 2500)).toMatchObject({
      percent: 2,
      onPlan: true,
      title: "Bet sizing: $50 = 2% of bankroll",
      detail: "On plan.",
    });
    expect(betSizing(100, 500).onPlan).toBe(false);
    expect(betSizing(100, 500).percent).toBe(20);
  });
});
