import { describe, expect, it } from "vitest";
import type { Rank } from "./cards";
import { evaluate } from "./hand";
import { DEFAULT_RULES, type RuleSet } from "./rules";
import {
  type RoundAction,
  type RoundState,
  activeHand,
  applyAction,
  currentLegalActions,
  dealerUpcard,
  isRoundOver,
  replayRound,
  startRound,
  visibleDealerCards,
} from "./round";
import { type Shoe, createShoe } from "./shoe";

/**
 * A shoe stacked in a known order. The Shoe is plain data (ADR-0004), so a test can lay out
 * exactly the cards a scenario needs instead of hunting for a seed that happens to deal them.
 *
 * Cards leave the shoe in table order: player, dealer up, player, dealer hole, then draws.
 */
const stack = (...ranks: Rank[]): Shoe => ({
  seed: 0,
  decks: 6,
  cards: ranks.map((rank) => ({ rank, suit: "s" })),
  dealtCount: 0,
  cutIndex: 234,
});

const open = (shoe: Shoe, overrides: Partial<RuleSet> = {}, bet = 10, bankroll = 1000) =>
  startRound({ rules: { ...DEFAULT_RULES, ...overrides }, shoe, bet, bankroll });

const play = (state: RoundState, ...actions: RoundAction[]) =>
  actions.reduce<RoundState>(applyAction, state);

const hit: RoundAction = { type: "hit" };
const stand: RoundAction = { type: "stand" };
const double: RoundAction = { type: "double" };
const splitAction: RoundAction = { type: "split" };
const surrender: RoundAction = { type: "surrender" };
const takeInsurance: RoundAction = { type: "insurance", take: true };
const declineInsurance: RoundAction = { type: "insurance", take: false };

/** The ranks of a hand's cards, which is what the ordering assertions actually care about. */
const ranksOf = (state: RoundState, handIndex: number): Rank[] =>
  (state.playerHands[handIndex]?.cards ?? []).map((card) => card.rank);

describe("the deal", () => {
  it("deals two to the player and two to the dealer, one of them down", () => {
    const state = open(stack("K", "9", "7", "5", "K"));

    expect(ranksOf(state, 0)).toEqual(["K", "7"]);
    expect(state.dealerHand.cards.map((c) => c.rank)).toEqual(["9", "5"]);
    expect(state.shoe.dealtCount).toBe(4);
    expect(state.phase).toBe("player");
  });

  it("keeps the dealer's hole card hidden until it is turned up", () => {
    const state = open(stack("K", "9", "7", "5", "K"));

    expect(dealerUpcard(state).rank).toBe("9");
    expect(state.dealerHoleCardRevealed).toBe(false);
    expect(visibleDealerCards(state).map((c) => c.rank)).toEqual(["9"]);

    const settled = play(state, stand);
    expect(settled.dealerHoleCardRevealed).toBe(true);
    expect(visibleDealerCards(settled)).toEqual(settled.dealerHand.cards);
  });

  it("commits the bet to the table, leaving the rest of the bankroll free", () => {
    const state = open(stack("K", "9", "7", "5"), {}, 25, 1000);
    expect(state.bankroll).toBe(975);
    expect(state.playerHands[0]?.bet).toBe(25);
  });

  it("refuses a bet outside the table limits", () => {
    expect(() => open(stack("K", "9", "7", "5"), { minBet: 10 }, 5)).toThrow(/table limits/);
    expect(() => open(stack("K", "9", "7", "5"), { maxBet: 100 }, 500)).toThrow(/table limits/);
  });

  it("refuses a bet the bankroll cannot cover", () => {
    expect(() => open(stack("K", "9", "7", "5"), {}, 100, 50)).toThrow(/exceeds the bankroll/);
  });

  it("does not mutate the shoe it was handed", () => {
    const shoe = stack("K", "9", "7", "5", "K");
    open(shoe);
    expect(shoe.dealtCount).toBe(0);
  });
});

describe("naturals", () => {
  it("pays the player's natural at 3:2 without the dealer drawing", () => {
    // Player A-K = 21, dealer 9-7 = 16. The dealer never draws to a hand that cannot win.
    const state = open(stack("A", "9", "K", "7", "5"));

    expect(isRoundOver(state)).toBe(true);
    expect(state.settlement?.outcomes[0]?.result).toBe("blackjack");
    expect(state.settlement?.outcomes[0]?.returned).toBe(25);
    expect(state.settlement?.net).toBe(15);
    expect(state.bankroll).toBe(1015);
    expect(state.shoe.dealtCount).toBe(4);
  });

  it("pays the player's natural at 6:5 when the table is that bad", () => {
    const state = open(stack("A", "9", "K", "7"), { blackjackPayout: "6:5" });

    expect(state.settlement?.outcomes[0]?.returned).toBe(22);
    expect(state.settlement?.net).toBe(12);
    expect(state.bankroll).toBe(1012);
  });

  it("takes the whole bet when the dealer turns over a natural", () => {
    // Player K-9 = 19, dealer A-K. The ace upcard offers insurance first.
    const state = play(open(stack("K", "A", "9", "K")), declineInsurance);

    expect(state.settlement?.outcomes[0]?.result).toBe("lose");
    expect(state.settlement?.net).toBe(-10);
    expect(state.bankroll).toBe(990);
  });

  it("pushes when both hands are naturals", () => {
    const state = play(open(stack("A", "A", "K", "K")), declineInsurance);

    expect(state.settlement?.outcomes[0]?.result).toBe("push");
    expect(state.settlement?.outcomes[0]?.returned).toBe(10);
    expect(state.settlement?.net).toBe(0);
    expect(state.bankroll).toBe(1000);
  });
});

describe("the dealer's peek", () => {
  it("ends the round on a ten upcard hiding an ace", () => {
    const state = open(stack("K", "K", "9", "A"));

    expect(state.phase).toBe("settled");
    expect(state.dealerHoleCardRevealed).toBe(true);
    expect(state.shoe.dealtCount).toBe(4);
    expect(state.bankroll).toBe(990);
  });

  it("lets the player act when the peek finds nothing", () => {
    const state = open(stack("K", "K", "9", "7"));

    expect(state.phase).toBe("player");
    expect(state.dealerHoleCardRevealed).toBe(false);
    expect(currentLegalActions(state)).toContain("hit");
  });

  it("does not peek at all when the rule set forbids it", () => {
    const state = open(stack("K", "K", "9", "A"), { dealerPeek: false });

    expect(state.phase).toBe("player");
    expect(state.dealerHoleCardRevealed).toBe(false);
  });
});

describe("player actions", () => {
  it("busts a hand that draws past 21, and the dealer then does not draw", () => {
    // Player K-9 = 19, hits a 5. With nothing left to beat, the dealer only reveals.
    const state = play(open(stack("K", "6", "9", "7", "5", "K")), hit);

    expect(state.phase).toBe("settled");
    expect(state.settlement?.outcomes[0]?.result).toBe("bust");
    expect(state.settlement?.net).toBe(-10);
    expect(state.bankroll).toBe(990);
    expect(state.dealerHand.cards).toHaveLength(2);
    expect(state.shoe.dealtCount).toBe(5);
  });

  it("pays double the stake on a winning double", () => {
    // Player 6-5 = 11, doubles into a K for 21. Dealer 9-7 draws a 2 for 18.
    const state = play(open(stack("6", "9", "5", "7", "K", "2")), double);

    const outcome = state.settlement?.outcomes[0];
    expect(outcome?.result).toBe("win");
    expect(outcome?.wagered).toBe(20);
    expect(outcome?.returned).toBe(40);
    expect(state.bankroll).toBe(1020);
    expect(state.playerHands[0]?.doubled).toBe(true);
  });

  it("ends the hand after a double, taking exactly one card", () => {
    const state = play(open(stack("6", "9", "5", "7", "2", "2", "2")), double);

    expect(ranksOf(state, 0)).toEqual(["6", "5", "2"]);
    expect(state.phase).toBe("settled");
  });

  it("returns half the bet on surrender and stops the dealer drawing", () => {
    const state = play(open(stack("K", "9", "6", "7", "5")), surrender);

    const outcome = state.settlement?.outcomes[0];
    expect(outcome?.result).toBe("surrender");
    expect(outcome?.returned).toBe(5);
    expect(outcome?.net).toBe(-5);
    expect(state.bankroll).toBe(995);
    expect(state.shoe.dealtCount).toBe(4);
  });

  it("refuses an action the hand does not permit", () => {
    const state = open(stack("K", "9", "7", "5"));
    expect(() => applyAction(state, splitAction)).toThrow(/Illegal action "split"/);
  });

  it("refuses any action once the round has settled", () => {
    const state = play(open(stack("K", "9", "7", "5", "2", "K")), stand);
    expect(() => applyAction(state, hit)).toThrow(/already settled/);
  });

  it("reports no legal actions once the round has settled", () => {
    const state = play(open(stack("K", "9", "7", "5", "2", "K")), stand);
    expect(currentLegalActions(state)).toEqual([]);
    expect(activeHand(state)).toBeNull();
  });

  it("returns a new state and leaves the previous one untouched", () => {
    const before = open(stack("K", "9", "7", "5", "2", "K"));
    const snapshot = JSON.stringify(before);

    const after = applyAction(before, hit);

    expect(after).not.toBe(before);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("dealer play", () => {
  it("hits soft 17 when the rule set says so", () => {
    // Dealer A-6 = soft 17, draws a 3 for 20 and beats the player's 19.
    const shoe = stack("K", "A", "9", "6", "3");
    const state = play(open(shoe, { dealerSoft17: "hit" }), declineInsurance, stand);

    expect(state.dealerHand.cards.map((c) => c.rank)).toEqual(["A", "6", "3"]);
    expect(state.settlement?.outcomes[0]?.result).toBe("lose");
    expect(state.shoe.dealtCount).toBe(5);
  });

  it("stands on soft 17 when the rule set says so", () => {
    const shoe = stack("K", "A", "9", "6", "3");
    const state = play(open(shoe, { dealerSoft17: "stand" }), declineInsurance, stand);

    expect(state.dealerHand.cards.map((c) => c.rank)).toEqual(["A", "6"]);
    expect(state.settlement?.outcomes[0]?.result).toBe("win");
    // The S17 dealer never draws the 3, so the shoe is one card further behind.
    expect(state.shoe.dealtCount).toBe(4);
  });

  it("pays every live hand when the dealer busts", () => {
    const state = play(open(stack("K", "6", "9", "7", "K")), stand);

    expect(evaluate(state.dealerHand.cards).busted).toBe(true);
    expect(state.settlement?.outcomes[0]?.result).toBe("win");
    expect(state.bankroll).toBe(1010);
  });

  it("pushes on an equal total", () => {
    const state = play(open(stack("K", "K", "9", "9")), stand);

    expect(state.settlement?.outcomes[0]?.result).toBe("push");
    expect(state.settlement?.net).toBe(0);
    expect(state.bankroll).toBe(1000);
  });
});

describe("insurance", () => {
  it("is offered only on an ace upcard", () => {
    expect(open(stack("K", "A", "9", "7")).phase).toBe("insurance");
    expect(open(stack("K", "K", "9", "7")).phase).toBe("player");
  });

  it("refuses a hand action while the insurance decision is outstanding", () => {
    const state = open(stack("K", "A", "9", "7"));
    expect(() => applyAction(state, hit)).toThrow(/"insurance" phase/);
  });

  it("refuses an insurance decision when none was offered", () => {
    const state = open(stack("K", "K", "9", "7"));
    expect(() => applyAction(state, takeInsurance)).toThrow(/not on offer/);
  });

  it("pays insurance 2:1 when the dealer has a natural", () => {
    // Player K-9 = 19 loses the 10, insurance stakes 5 and returns 15. Exactly break-even.
    const state = play(open(stack("K", "A", "9", "K")), takeInsurance);

    expect(state.insurance.bet).toBe(5);
    expect(state.insurance.returned).toBe(15);
    expect(state.settlement?.insuranceNet).toBe(10);
    expect(state.settlement?.net).toBe(0);
    expect(state.bankroll).toBe(1000);
  });

  it("loses the insurance stake when the dealer has no natural", () => {
    // Dealer A-9 = soft 20 beats the player's 19; the side bet is gone too.
    const state = play(open(stack("K", "A", "9", "9")), takeInsurance, stand);

    expect(state.insurance.returned).toBe(0);
    expect(state.settlement?.insuranceNet).toBe(-5);
    expect(state.settlement?.net).toBe(-15);
    expect(state.bankroll).toBe(985);
  });

  it("makes even money on a natural either way", () => {
    // The textbook result: insuring a natural against an ace is a flat one unit, win or lose.
    const againstNatural = play(open(stack("A", "A", "K", "K")), takeInsurance);
    const againstNothing = play(open(stack("A", "A", "K", "9")), takeInsurance);

    expect(againstNatural.settlement?.net).toBe(10);
    expect(againstNothing.settlement?.net).toBe(10);
    expect(againstNatural.bankroll).toBe(1010);
    expect(againstNothing.bankroll).toBe(1010);
  });

  it("does not offer a side bet the bankroll cannot cover", () => {
    const state = open(stack("K", "A", "9", "7"), {}, 10, 12);
    expect(state.phase).toBe("player");
    expect(state.insurance.offered).toBe(false);
  });
});

describe("splitting", () => {
  /**
   * Player 8-8 against a dealer 9. The left half draws another 8 and is split again; the
   * three hands that result are 8-2, 8-4 and 8-3, in that order on the table. The dealer's
   * 9-7 then draws the K and busts.
   */
  const resplit = () => stack("8", "9", "8", "7", "8", "3", "2", "4", "K");

  it("deals one card to each half, left to right", () => {
    const state = play(open(stack("8", "9", "8", "7", "3", "4", "K")), splitAction);

    expect(ranksOf(state, 0)).toEqual(["8", "3"]);
    expect(ranksOf(state, 1)).toEqual(["8", "4"]);
    expect(state.playerHands.every((hand) => hand.fromSplit)).toBe(true);
    expect(state.bankroll).toBe(980);
  });

  it("inserts a resplit hand beside the hand it came from, not at the end", () => {
    // 8-8 splits; the left half draws another 8 and splits again. The two hands born of that
    // resplit must sit at positions 0 and 1, with the original right half pushed to 2.
    // Appending instead would settle them out of table order — the incumbent's bug.
    const state = play(open(resplit()), splitAction, splitAction);

    expect(state.playerHands).toHaveLength(3);
    expect(ranksOf(state, 0)).toEqual(["8", "2"]);
    expect(ranksOf(state, 1)).toEqual(["8", "4"]);
    expect(ranksOf(state, 2)).toEqual(["8", "3"]);
  });

  it("keeps the player on the left half after a split", () => {
    const state = play(open(resplit()), splitAction, splitAction);

    expect(state.activeHandIndex).toBe(0);
    expect(activeHand(state)?.cards.map((c) => c.rank)).toEqual(["8", "2"]);
  });

  it("resolves split hands strictly left to right", () => {
    let state = play(open(resplit()), splitAction, splitAction);

    const visited: Rank[][] = [];
    while (!isRoundOver(state)) {
      visited.push((activeHand(state)?.cards ?? []).map((card) => card.rank));
      state = applyAction(state, stand);
    }

    expect(visited).toEqual([
      ["8", "2"],
      ["8", "4"],
      ["8", "3"],
    ]);
    // Dealer 9-7 = 16 draws the K and busts, so all three hands are paid.
    expect(state.settlement?.outcomes.map((o) => o.result)).toEqual(["win", "win", "win"]);
    expect(state.bankroll).toBe(1030);
  });

  it("settles outcomes in the same order the hands sit on the table", () => {
    // Left half draws a 5 onto 18 and busts; the right half stands on 18 and beats the
    // dealer's 17. The outcomes must line up with the hands, not with the order they finished.
    const state = play(open(stack("8", "9", "8", "8", "K", "Q", "5")), splitAction, hit, stand);

    expect(state.settlement?.outcomes.map((o) => o.handIndex)).toEqual([0, 1]);
    expect(state.settlement?.outcomes.map((o) => o.result)).toEqual(["bust", "win"]);
    expect(state.settlement?.net).toBe(0);
  });

  it("gives split aces exactly one card each and ends the player's turn", () => {
    const state = play(open(stack("A", "9", "A", "7", "5", "6", "K")), splitAction);

    expect(state.phase).toBe("settled");
    expect(ranksOf(state, 0)).toEqual(["A", "5"]);
    expect(ranksOf(state, 1)).toEqual(["A", "6"]);
    // Neither 16 nor 17 is a natural, so the dealer still plays out and busts on the K.
    expect(state.settlement?.outcomes.map((o) => o.result)).toEqual(["win", "win"]);
    expect(state.bankroll).toBe(1020);
  });

  it("never treats 21 made from a split as a natural", () => {
    // A-K from a split pays even money, not 3:2, and loses to the dealer's own natural.
    const state = play(open(stack("A", "9", "A", "7", "K", "6", "K")), splitAction);

    expect(state.settlement?.outcomes[0]?.result).toBe("win");
    expect(state.settlement?.outcomes[0]?.returned).toBe(20);
  });

  it("splits up to the rule set's hand limit and then stops offering it", () => {
    let state = open(stack("8", "9", "8", "7", "8", "8", "8", "2", "3", "4", "K"));
    state = play(state, splitAction, splitAction, splitAction);

    expect(state.playerHands).toHaveLength(4);
    expect(ranksOf(state, 0)).toEqual(["8", "3"]);
    expect(ranksOf(state, 1)).toEqual(["8", "4"]);
    expect(ranksOf(state, 2)).toEqual(["8", "2"]);
    expect(ranksOf(state, 3)).toEqual(["8", "8"]);

    // The fourth hand is still a pair, but the table is out of boxes.
    state = play(state, stand, stand, stand);
    expect(state.activeHandIndex).toBe(3);
    expect(currentLegalActions(state)).not.toContain("split");
    expect(currentLegalActions(state)).toEqual(expect.arrayContaining(["hit", "stand"]));

    state = play(state, stand);
    expect(state.bankroll).toBe(1040);
  });

  /**
   * Re-splitting aces at a table that also gives split aces one card each. The two rules are
   * independent (`oneCardToSplitAces` and `resplitAces`), and running both is common — the
   * engine used to freeze the hand before it ever considered the re-split.
   */
  describe("re-splitting aces", () => {
    const rsa: Partial<RuleSet> = { oneCardToSplitAces: true, resplitAces: true };

    it("offers the split when a split ace draws another ace", () => {
      // A-A against a dealer 9. The left half draws an ace, the right half an 8.
      const shoe = stack("A", "9", "A", "7", "A", "8", "K", "5", "Q");
      const state = play(open(shoe, rsa), splitAction);

      expect(state.phase).toBe("player");
      expect(ranksOf(state, 0)).toEqual(["A", "A"]);
      expect(ranksOf(state, 1)).toEqual(["A", "8"]);
      // The hand has had its one card, so only the re-split and declining it are on offer.
      expect(currentLegalActions(state)).toEqual(["stand", "split"]);
    });

    it("plays the re-split out and freezes each new ace on its one card", () => {
      const state = play(
        open(stack("A", "9", "A", "7", "A", "8", "K", "5", "Q"), rsa),
        splitAction,
        splitAction,
      );

      // The re-split hands sit at 0 and 1; the original right half is pushed to 2.
      expect(state.playerHands).toHaveLength(3);
      expect(ranksOf(state, 0)).toEqual(["A", "K"]);
      expect(ranksOf(state, 1)).toEqual(["A", "5"]);
      expect(ranksOf(state, 2)).toEqual(["A", "8"]);

      // Every hand is frozen on two cards, so the player's turn is over without another
      // decision and the dealer's 16 draws the Q and busts.
      expect(state.phase).toBe("settled");
      expect(state.settlement?.outcomes.map((o) => o.result)).toEqual(["win", "win", "win"]);
      expect(state.settlement?.outcomes.map((o) => o.wagered)).toEqual([10, 10, 10]);
      expect(state.bankroll).toBe(1030);
    });

    it("lets the player decline the re-split, which stands the hand", () => {
      const state = play(open(stack("A", "9", "A", "7", "A", "8", "K"), rsa), splitAction, stand);

      expect(state.phase).toBe("settled");
      expect(state.playerHands).toHaveLength(2);
      expect(ranksOf(state, 0)).toEqual(["A", "A"]);
      expect(state.bankroll).toBe(1020);
    });

    it("stops re-splitting aces at the rule set's hand limit", () => {
      const shoe = stack("A", "9", "A", "7", "A", "A", "A", "2", "3", "4", "K");
      const limit = { ...rsa, maxSplitHands: 4 };
      const state = play(open(shoe, limit), splitAction, splitAction, splitAction);

      expect(state.playerHands).toHaveLength(4);
      expect(ranksOf(state, 0)).toEqual(["A", "3"]);
      expect(ranksOf(state, 1)).toEqual(["A", "4"]);
      expect(ranksOf(state, 2)).toEqual(["A", "2"]);
      // The fourth hand is another pair of aces, but the table is out of boxes — so it is
      // never offered a split and the round settles without asking.
      expect(ranksOf(state, 3)).toEqual(["A", "A"]);
      expect(state.phase).toBe("settled");
      expect(state.bankroll).toBe(1040);
    });

    it("refuses the re-split outright when the table does not allow it", () => {
      // The same cards under the default rule set: the second ace freezes like any other card.
      const state = play(open(stack("A", "9", "A", "7", "A", "8", "K")), splitAction);

      expect(state.phase).toBe("settled");
      expect(ranksOf(state, 0)).toEqual(["A", "A"]);
      expect(state.bankroll).toBe(1020);
    });

    it("replays a re-split of aces exactly", () => {
      const options = {
        rules: { ...DEFAULT_RULES, ...rsa },
        shoe: stack("A", "9", "A", "7", "A", "8", "K", "5", "Q"),
        bet: 10,
        bankroll: 1000,
      };
      const actions = [splitAction, splitAction];

      const played = play(startRound(options), ...actions);
      expect(JSON.stringify(replayRound(options, actions))).toBe(JSON.stringify(played));
    });
  });

  it("stakes one bet per hand and pays each one separately", () => {
    const state = play(open(stack("8", "9", "8", "7", "3", "4", "K")), splitAction, stand, stand);

    expect(state.settlement?.outcomes.map((o) => o.wagered)).toEqual([10, 10]);
    expect(state.settlement?.net).toBe(20);
  });
});

describe("no-peek settlement", () => {
  it("returns everything staked beyond the opening bet when a double meets a natural", () => {
    // European no-peek: the player doubles into an unseen natural and loses one bet, not two.
    const shoe = stack("6", "A", "5", "K", "9");
    const state = play(open(shoe, { dealerPeek: false }), declineInsurance, double);

    const outcome = state.settlement?.outcomes[0];
    expect(outcome?.wagered).toBe(20);
    expect(outcome?.returned).toBe(10);
    expect(state.settlement?.net).toBe(-10);
    expect(state.bankroll).toBe(990);
  });

  it("returns the extra split wagers when a split meets a natural", () => {
    const state = play(
      open(stack("8", "A", "8", "K", "3", "4"), { dealerPeek: false }),
      declineInsurance,
      splitAction,
      stand,
      stand,
    );

    expect(state.settlement?.outcomes.map((o) => o.returned)).toEqual([0, 10]);
    expect(state.settlement?.net).toBe(-10);
    expect(state.bankroll).toBe(990);
  });

  it("keeps half the bet on early surrender against a natural", () => {
    const state = play(
      open(stack("K", "A", "6", "K"), { dealerPeek: false, surrender: "early" }),
      declineInsurance,
      surrender,
    );

    expect(state.settlement?.outcomes[0]?.returned).toBe(5);
    expect(state.settlement?.net).toBe(-5);
  });

  it("forfeits the whole bet on late surrender against a natural", () => {
    const state = play(
      open(stack("K", "A", "6", "K"), { dealerPeek: false, surrender: "late" }),
      declineInsurance,
      surrender,
    );

    expect(state.settlement?.outcomes[0]?.returned).toBe(0);
    expect(state.settlement?.net).toBe(-10);
  });
});

/**
 * ADR-0004: a seed plus a decision index is a complete bug report. That is only true if a
 * recorded action list, replayed against a shoe rebuilt from the same seed, lands on exactly
 * the same state.
 */
describe("replay", () => {
  /** A fixed policy, so the recorded action list is a function of the shoe alone. */
  const chooseAction = (state: RoundState, seed: number): RoundAction => {
    if (state.phase === "insurance") return { type: "insurance", take: seed % 2 === 0 };

    const hand = activeHand(state);
    if (!hand) throw new Error("player phase with no active hand");
    const legal = currentLegalActions(state);
    const value = evaluate(hand.cards);

    if (legal.includes("split")) return splitAction;
    if (legal.includes("double") && (value.total === 10 || value.total === 11)) return double;
    if (legal.includes("surrender") && value.total === 16) return surrender;
    if (value.total < 17 && legal.includes("hit")) return hit;
    return stand;
  };

  const record = (rules: RuleSet, seed: number) => {
    const options = { rules, shoe: createShoe(rules, seed), bet: 10, bankroll: 1000 };
    let state = startRound(options);
    const actions: RoundAction[] = [];

    // A round cannot need more decisions than this; the cap turns a logic bug into a
    // failing test rather than a hung suite.
    for (let step = 0; step < 100 && !isRoundOver(state); step++) {
      const action = chooseAction(state, seed);
      actions.push(action);
      state = applyAction(state, action);
    }
    expect(isRoundOver(state)).toBe(true);

    return { final: state, actions };
  };

  it("reproduces a round exactly from its seed and action list", () => {
    const rules = DEFAULT_RULES;
    let splits = 0;
    let doubles = 0;
    let insured = 0;
    let surrenders = 0;

    for (let seed = 0; seed < 250; seed++) {
      const { final, actions } = record(rules, seed);

      const replayed = replayRound(
        { rules, shoe: createShoe(rules, seed), bet: 10, bankroll: 1000 },
        actions,
      );

      expect(replayed).toEqual(final);
      // Structural equality is not quite the promise; the serialised state must match too.
      expect(JSON.stringify(replayed)).toBe(JSON.stringify(final));

      if (actions.some((a) => a.type === "split")) splits++;
      if (actions.some((a) => a.type === "double")) doubles++;
      if (actions.some((a) => a.type === "insurance" && a.take)) insured++;
      if (actions.some((a) => a.type === "surrender")) surrenders++;
    }

    // Guard against a vacuous pass: the sample has to exercise the interesting transitions.
    expect(splits).toBeGreaterThan(0);
    expect(doubles).toBeGreaterThan(0);
    expect(insured).toBeGreaterThan(0);
    expect(surrenders).toBeGreaterThan(0);
  });

  it("records every action in order, insurance included", () => {
    const shoe = stack("8", "A", "8", "9", "3", "4", "K", "K");
    const state = play(open(shoe), declineInsurance, splitAction, stand, stand);

    expect(state.actionLog).toEqual([declineInsurance, splitAction, stand, stand]);
  });

  it("lands somewhere else on a different seed", () => {
    const rules = DEFAULT_RULES;
    const a = record(rules, 11);
    const b = record(rules, 12);

    expect(a.final.shoe.cards).not.toEqual(b.final.shoe.cards);
  });

  it("replays identically under a rule set that changes dealer behaviour", () => {
    const rules: RuleSet = { ...DEFAULT_RULES, dealerSoft17: "stand", blackjackPayout: "6:5" };

    for (let seed = 500; seed < 560; seed++) {
      const { final, actions } = record(rules, seed);
      const replayed = replayRound(
        { rules, shoe: createShoe(rules, seed), bet: 10, bankroll: 1000 },
        actions,
      );
      expect(JSON.stringify(replayed)).toBe(JSON.stringify(final));
    }
  });
});

describe("bankroll accounting", () => {
  /** Every round must conserve chips: the bankroll moves by exactly the settled net. */
  const seeds = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];

  it.each(seeds)("moves the bankroll by exactly the settled net (seed %i)", (seed) => {
    const rules = DEFAULT_RULES;
    let state = startRound({ rules, shoe: createShoe(rules, seed), bet: 10, bankroll: 1000 });

    for (let step = 0; step < 100 && !isRoundOver(state); step++) {
      if (state.phase === "insurance") {
        state = applyAction(state, takeInsurance);
        continue;
      }
      const hand = activeHand(state);
      if (!hand) throw new Error("player phase with no active hand");
      const legal = currentLegalActions(state);
      const wantsCard = evaluate(hand.cards).total < 17 && legal.includes("hit");
      state = applyAction(state, wantsCard ? hit : stand);
    }

    expect(isRoundOver(state)).toBe(true);
    expect(state.bankroll).toBe(1000 + (state.settlement?.net ?? 0));
  });

  it("never lets a settled outcome disagree with its own arithmetic", () => {
    const rules = DEFAULT_RULES;
    for (let seed = 0; seed < 120; seed++) {
      let state = startRound({ rules, shoe: createShoe(rules, seed), bet: 10, bankroll: 1000 });
      for (let step = 0; step < 100 && !isRoundOver(state); step++) {
        state = applyAction(state, state.phase === "insurance" ? declineInsurance : stand);
      }

      const outcomes = state.settlement?.outcomes ?? [];
      for (const outcome of outcomes) {
        expect(outcome.net).toBe(outcome.returned - outcome.wagered);
      }
      const hands = outcomes.reduce((sum, o) => sum + o.net, 0);
      expect(state.settlement?.net).toBe(hands + (state.settlement?.insuranceNet ?? 0));
    }
  });
});
