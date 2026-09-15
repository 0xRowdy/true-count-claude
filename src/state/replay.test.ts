import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, type Card, cardId, remainingComposition } from "@/engine";
import { buildSession, buildSplitSession } from "./fixtures";
import { rebuildShoe, replaySession, verifyReplay } from "./replay";
import { changeCountingSystem, recordConversionCheck, recordIndexPlay } from "./session";
import type { Decision, RoundResult, Session } from "./types";

/** A Session as it comes back off disk: through JSON, with no live objects surviving. */
function roundTrip(session: Session): Session {
  return JSON.parse(JSON.stringify(session)) as Session;
}

describe("replaying a Session from its seed plus its Decision log", () => {
  it("produces one frame per Decision, positioned exactly where it was taken", () => {
    const session = buildSession({ rounds: 6, seed: 2024 });
    const frames = replaySession(session);

    expect(frames).toHaveLength(6);
    frames.forEach((frame, i) => {
      expect(frame.decision.index).toBe(i);
      expect(frame.shoe.dealtCount).toBe(frame.decision.shoeDealtCount);
      expect(frame.dealt).toHaveLength(frame.decision.shoeDealtCount);
    });
  });

  it("deals back the same cards the log recorded", () => {
    const session = buildSession({ rounds: 3, seed: 91 });
    const [first] = replaySession(session);

    // The fixture deals player, dealer, player, dealer.
    const player = first!.decision.hand.playerCards;
    expect(cardId(first!.dealt[0]!)).toBe(cardId(player[0]!));
    expect(cardId(first!.dealt[2]!)).toBe(cardId(player[1]!));
    expect(cardId(first!.dealt[1]!)).toBe(cardId(first!.decision.hand.dealerUpcard));
  });

  it("survives a round trip through storage — only the seed is needed", () => {
    const session = buildSession({ rounds: 5, seed: 8 });
    const restored = roundTrip(session);

    const before = replaySession(session).map((frame) => frame.dealt.map(cardId).join(","));
    const after = replaySession(restored).map((frame) => frame.dealt.map(cardId).join(","));

    expect(after).toEqual(before);
  });

  it("rebuilds a Shoe's remaining composition after a restart (Shoe Integrity Panel)", () => {
    const session = roundTrip(buildSession({ rounds: 8, seed: 5150 }));
    const shoe = rebuildShoe(session, 0);

    expect(shoe.dealtCount).toBe(session.shoes[0]!.dealtCount);
    const remaining = remainingComposition(shoe);
    const total = Object.values(remaining).reduce((sum, n) => sum + n, 0);
    expect(total).toBe(shoe.cards.length - shoe.dealtCount);
  });

  it("throws a diagnosable error for a Shoe the Session never opened", () => {
    const session = buildSession({ rounds: 2 });
    expect(() => rebuildShoe(session, 3)).toThrow(/has no Shoe 3/);
  });
});

describe("verifyReplay", () => {
  it("passes a log that agrees with its seed", () => {
    const verification = verifyReplay(buildSession({ rounds: 10, seed: 314 }));

    expect(verification.problems).toEqual([]);
    expect(verification.ok).toBe(true);
  });

  it("catches a log whose Shoe seed no longer produces its cards", () => {
    const session = buildSession({ rounds: 6, seed: 314 });
    const tampered: Session = {
      ...session,
      shoes: [{ ...session.shoes[0]!, seed: session.shoes[0]!.seed + 1 }],
    };

    const verification = verifyReplay(tampered);

    expect(verification.ok).toBe(false);
    expect(verification.problems.join(" ")).toMatch(/holds only/);
  });

  it("catches a round whose stored net disagrees with its hands", () => {
    const session = buildSession({ rounds: 3 });
    const rounds = session.rounds.slice();
    rounds[0] = { ...rounds[0]!, net: rounds[0]!.net + 500 };

    const verification = verifyReplay({ ...session, rounds });

    expect(verification.ok).toBe(false);
    expect(verification.problems.join(" ")).toMatch(/stores net .* but its hands sum to/);
  });

  it("catches a Decision log that has been reordered", () => {
    const session = buildSession({ rounds: 4 });
    const decisions = session.decisions.slice();
    const [a, b] = [decisions[1]!, decisions[2]!];
    decisions[1] = b;
    decisions[2] = a;

    const verification = verifyReplay({ ...session, decisions });

    expect(verification.ok).toBe(false);
    expect(verification.problems.join(" ")).toMatch(/carries index|rewinds Shoe/);
  });
});

/**
 * The version 3 records (#26, #27). Conversion checks and index plays have no dealt cards to
 * check, so what `verifyReplay` checks for them is their arithmetic and their verdicts — and,
 * for index plays, deliberately *not* their cards, which were placed rather than dealt.
 */
describe("verifyReplay on drill records and system changes", () => {
  const conversion = {
    system: "Hi-Lo",
    decks: 6,
    runningCount: -7,
    cardsRemaining: 104,
    decksRemaining: 2,
    rounding: "truncate",
    statedTrueCount: -4,
    actualTrueCount: -3,
    runSeed: 5,
    questionIndex: 0,
    at: 1,
  } as const;

  // A pair of aces of spades against an ace of spades: three identical cards, which a six-deck
  // Shoe could hold but which no card of this Session's Shoe was ever dealt as.
  const placed = {
    entryId: "fab4-ace-pair",
    entryLabel: "made up for the test",
    indexNumber: 1,
    system: "Hi-Lo",
    kind: "hand",
    placedCards: [
      { rank: "A", suit: "s" },
      { rank: "A", suit: "s" },
    ],
    dealerUpcard: { rank: "A", suit: "s" },
    runningCount: 5,
    cardsRemaining: 130,
    rounding: "floor",
    trueCount: 2,
    firing: true,
    actionTaken: "split",
    correctAction: "split",
    basicStrategyAction: "split",
    runSeed: 5,
    questionIndex: 0,
    cutShoeSeed: 77,
    cutPosition: 180,
    at: 2,
  } as const;

  const withDrillRecords = (): Session => {
    let session = buildSession({ rounds: 6, seed: 3 });
    session = recordConversionCheck(session, conversion);
    session = recordIndexPlay(session, placed);
    session = changeCountingSystem(session, { to: "KO", at: 3 });
    return changeCountingSystem(session, { to: "Omega II", at: 4 });
  };

  it("passes a Session holding every kind of record, through storage and back", () => {
    expect(verifyReplay(withDrillRecords())).toEqual({ ok: true, problems: [] });
    expect(verifyReplay(roundTrip(withDrillRecords()))).toEqual({ ok: true, problems: [] });
  });

  it("never looks for an index play's placed cards in a Shoe", () => {
    // 2.5 decks left at a Running Count of 5 floors to 2, so the count is right; the cards are
    // not in this Session's dealing history at all, and must not be demanded from it.
    const session = withDrillRecords();
    expect(verifyReplay(session).problems.join(" ")).not.toMatch(/Shoe|holds only/);

    // A Deviation drill Session has no Shoes at all. Any attempt to find the cards in one would
    // throw from `rebuildShoe`, so passing here is the proof that none is made.
    const deviationOnly: Session = {
      ...session,
      shoes: [],
      decisions: [],
      countChecks: [],
      rounds: [],
      conversionChecks: [],
    };
    expect(() => verifyReplay(deviationOnly)).not.toThrow();
    expect(verifyReplay(deviationOnly)).toEqual({ ok: true, problems: [] });
  });

  it("redoes a conversion check's division and catches a stored answer that is wrong", () => {
    const session = withDrillRecords();
    const tampered: Session = {
      ...session,
      conversionChecks: [{ ...session.conversionChecks[0]!, actualTrueCount: -4 }],
    };
    const verification = verifyReplay(tampered);

    expect(verification.ok).toBe(false);
    expect(verification.problems.join(" ")).toMatch(/Conversion check 0 stores -4 .* which is -3/);
    expect(verification.problems.join(" ")).toMatch(/marked incorrect but is correct/);
  });

  it("catches an index play posed at a True Count its own numbers do not give", () => {
    const session = withDrillRecords();
    const tampered: Session = {
      ...session,
      indexPlays: [{ ...session.indexPlays[0]!, runningCount: 9 }],
    };
    expect(verifyReplay(tampered).problems.join(" ")).toMatch(/posed at a True Count of 2/);
  });

  it("catches a system log that does not chain, or does not land on the Session's system", () => {
    const session = withDrillRecords();
    const [first, second] = session.countingSystemChanges;

    const broken = verifyReplay({ ...session, countingSystemChanges: [first!, { ...second!, from: "Zen Count" }] });
    expect(broken.problems.join(" ")).toMatch(/switches from Zen Count, but the Session was in KO/);

    const stale = verifyReplay({ ...session, countingSystem: "Hi-Lo" });
    expect(stale.problems.join(" ")).toMatch(/switched to Omega II, but the Session says Hi-Lo/);
  });
});

/**
 * Splits, from real dealt cards (#21).
 *
 * A split is the case where two recorded hands hold the same card: `Decision.hand` is the
 * hand state that produced the Decision, so the split Decision records the *pair*, and each
 * card of that pair then becomes the first card of one of the hands the split produces.
 * Tallying every recorded hand demanded one card twice from a Shoe that dealt it once, and
 * so reported a shortage on every split round that never happened.
 *
 * These rounds are dealt by `buildSplitSession` through the engine's own round state
 * machine rather than written by hand, because a hand-written split round would encode what
 * the author believed a split records — which is exactly the assumption that was wrong.
 */
describe("verifyReplay on rounds that split", () => {
  /** Seed 8 deals, within one Shoe: plain splits, a resplit to three, one to four, and split aces. */
  const session = buildSplitSession({ seed: 8, rounds: 60 });

  it("passes a whole run of split-every-pair play", () => {
    expect(session.rounds.filter((round) => round.hands.length > 1).length).toBeGreaterThan(4);
    expect(verifyReplay(session)).toEqual({ ok: true, problems: [] });
  });

  it("counts a split pair's cards once, though two hands record them", () => {
    const round = splitRound(session, 2);
    const decisions = decisionsIn(session, round);
    const split = decisions.find((decision) => decision.actionTaken === "split") as Decision;
    const sibling = decisions.find(
      (decision) => decision.hand.handIndex === split.hand.handIndex + 1,
    ) as Decision;

    // One card, two recorded views: the second card of the pair *is* the second hand's first.
    expect(cardId(sibling.hand.playerCards[0] as Card)).toBe(
      cardId(split.hand.playerCards[1] as Card),
    );
    expect(verifyReplay(session).problems).toEqual([]);
  });

  it("follows a resplit into three hands, where the sibling is inserted, not appended", () => {
    const round = splitRound(session, 3);
    const decisions = decisionsIn(session, round);
    const splits = decisions.filter((decision) => decision.actionTaken === "split");
    expect(splits).toHaveLength(2);

    // The resplit is of the hand the first split produced, and its sibling lands at index 2.
    expect((splits[1] as Decision).hand.fromSplit).toBe(true);
    expect(decisions.some((decision) => decision.hand.handIndex === 2)).toBe(true);
    expect(verifyReplay(session).problems).toEqual([]);
  });

  it("follows a resplit into four hands, tracking the indices the siblings shift to", () => {
    const round = splitRound(session, 4);
    const decisions = decisionsIn(session, round);
    const splits = decisions.filter((decision) => decision.actionTaken === "split");
    expect(splits).toHaveLength(3);

    // Every split here is of hand 0, and `src/engine/round` inserts each new hand directly
    // after the hand it came from — so the first pair's right-hand card has been pushed out
    // to hand 3 by the time the round is played out. Reading it as hand 1 would tally the
    // wrong hand's cards.
    const opening = splits[0] as Decision;
    const last = decisions.find((decision) => decision.hand.handIndex === 3) as Decision;
    expect(cardId(last.hand.playerCards[0] as Card)).toBe(
      cardId(opening.hand.playerCards[1] as Card),
    );
    expect(verifyReplay(session).problems).toEqual([]);
  });

  it("accepts split aces, which are frozen after one card and so record nothing further", () => {
    const round = session.rounds.find((candidate) => {
      const split = decisionsIn(session, candidate).find((d) => d.actionTaken === "split");
      return split?.hand.playerCards.every((card) => card.rank === "A") ?? false;
    });
    expect(round, "the fixture dealt no split aces").toBeDefined();

    // Two hands on the table, one Decision in the log, and the two cards dealt onto the aces
    // never recorded. A card the log does not claim is not a card it has to account for.
    expect(round?.hands).toHaveLength(2);
    expect(decisionsIn(session, round as RoundResult)).toHaveLength(1);
    expect(verifyReplay(session).problems).toEqual([]);
  });

  it("accepts an ace resplit at a table that allows one", () => {
    const resplitAces = buildSplitSession({
      seed: 30,
      rounds: 60,
      rules: { ...DEFAULT_RULES, resplitAces: true },
    });
    const aceResplit = resplitAces.decisions.filter(
      (decision) =>
        decision.actionTaken === "split" &&
        decision.hand.fromSplit &&
        decision.hand.playerCards.every((card) => card.rank === "A"),
    );

    expect(aceResplit.length, "the fixture resplit no aces").toBeGreaterThan(0);
    expect(verifyReplay(resplitAces)).toEqual({ ok: true, problems: [] });
  });

  it("survives a round trip through storage", () => {
    expect(verifyReplay(roundTrip(session))).toEqual({ ok: true, problems: [] });
  });
});

/**
 * The other half of the fix: a verifier that accepted every split round by being permissive
 * would be worse than the bug. Sharing a card is forgiven *only* where a split accounts for
 * it, and nowhere else.
 */
describe("verifyReplay still catches a card the Shoe never dealt", () => {
  const session = buildSplitSession({ seed: 8, rounds: 60 });

  it("catches a card substituted into a hand that was dealt from a split", () => {
    const round = splitRound(session, 2);
    const target = decisionsIn(session, round)
      .filter((decision) => decision.actionTaken !== "split")
      .pop() as Decision;
    const intruder = cardOutsideSpan(session, round);

    const cards = target.hand.playerCards.slice();
    cards[cards.length - 1] = intruder;
    const verification = verifyReplay(
      replaceDecision(session, { ...target, hand: { ...target.hand, playerCards: cards } }),
    );

    expect(verification.ok).toBe(false);
    expect(verification.problems.join(" ")).toMatch(
      new RegExp(`used 1x ${cardId(intruder)} but its Shoe span .* holds only 0`),
    );
  });

  it("catches a card claimed by two hands when no split accounts for it", () => {
    const round = splitRound(session, 2);
    const split = decisionsIn(session, round).find(
      (decision) => decision.actionTaken === "split",
    ) as Decision;

    // The same log, with the split recorded as a stand. The pair's cards then have no reason
    // to reappear under the second hand — and the Shoe span holds them once.
    const verification = verifyReplay(
      replaceDecision(session, { ...split, actionTaken: "stand", correctAction: "stand" }),
    );

    expect(verification.ok).toBe(false);
    expect(verification.problems.join(" ")).toMatch(/holds only 1/);
  });

  it("catches a split pair whose cards were altered after the fact", () => {
    const round = splitRound(session, 2);
    const split = decisionsIn(session, round).find(
      (decision) => decision.actionTaken === "split",
    ) as Decision;
    const intruder = cardOutsideSpan(session, round);

    const verification = verifyReplay(
      replaceDecision(session, {
        ...split,
        hand: { ...split.hand, playerCards: [split.hand.playerCards[0] as Card, intruder] },
      }),
    );

    expect(verification.ok).toBe(false);
    // Two ways of seeing the same tamper: the smuggled card is not in the span, and the hand
    // the split produced no longer starts with the card the pair says it was dealt.
    expect(verification.problems.join(" ")).toMatch(new RegExp(`1x ${cardId(intruder)}`));
    expect(verification.problems.join(" ")).toMatch(/does not continue/);
  });

  it("catches a Shoe seed that no longer deals a split round's cards", () => {
    const tampered: Session = {
      ...session,
      shoes: [{ ...(session.shoes[0] as Session["shoes"][number]), seed: 1 }],
    };

    expect(verifyReplay(tampered).ok).toBe(false);
    expect(verifyReplay(tampered).problems.join(" ")).toMatch(/holds only/);
  });
});

/** The first round of the Session that finished with exactly `hands` hands on the table. */
function splitRound(session: Session, hands: number): RoundResult {
  const round = session.rounds.find((candidate) => candidate.hands.length === hands);
  expect(round, `the fixture dealt no round of ${hands} hands`).toBeDefined();
  return round as RoundResult;
}

function decisionsIn(session: Session, round: RoundResult): Decision[] {
  return session.decisions.filter((decision) => decision.roundIndex === round.index);
}

/** The Session with one Decision swapped out, in place, keeping every index intact. */
function replaceDecision(session: Session, decision: Decision): Session {
  const decisions = session.decisions.slice();
  decisions[decision.index] = decision;
  return { ...session, decisions };
}

/** A card the round's Shoe span does not hold — what a tampered log would have to smuggle in. */
function cardOutsideSpan(session: Session, round: RoundResult): Card {
  const shoe = rebuildShoe(session, round.shoeIndex, round.shoeEndIndex);
  const span = new Set(shoe.cards.slice(round.shoeStartIndex, round.shoeEndIndex).map(cardId));
  const intruder = shoe.cards.find((card) => !span.has(cardId(card)));
  expect(intruder, "every card in the deck appears in this round's span").toBeDefined();
  return intruder as Card;
}
