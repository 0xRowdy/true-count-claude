/**
 * Replay — reconstructing a Session from its seed plus its Decision log.
 *
 * ADR-0004 makes this possible: the Shoe owns all randomness and is built from a seed, so
 * a recorded seed and a card index are a complete, exact description of the cards. Nothing
 * here guesses. If a log and its seed disagree, `verifyReplay` says so rather than papering
 * over it — that discrepancy *is* the bug report.
 *
 * Two callers depend on this: replaying a Session to re-drill the decisions you lost, and
 * the Shoe Integrity Panel (#9), which rebuilds a Shoe after an app restart to show its
 * remaining composition without having kept the card array in storage.
 */

import { type Card, type Shoe, cardId, createShoe, deal, trueCount } from "@/engine";
import type { Decision, Session } from "./types";

export interface ReplayFrame {
  readonly decision: Decision;
  /** The Shoe rebuilt from its recorded seed, positioned exactly where it was. */
  readonly shoe: Shoe;
  /** Cards dealt from that Shoe before the Decision was taken. */
  readonly dealt: readonly Card[];
}

/**
 * Rebuilds one of the Session's Shoes, dealt to `dealtCount` cards. Omit `dealtCount` to
 * get the Shoe as it stood when the Session ended.
 */
export function rebuildShoe(session: Session, shoeIndex: number, dealtCount?: number): Shoe {
  const record = session.shoes[shoeIndex];
  if (!record) {
    throw new Error(
      `Session ${session.id} has no Shoe ${shoeIndex} (it recorded ${session.shoes.length}). ` +
        `The Decision log references a Shoe that was never opened.`,
    );
  }
  // Built from the *stored* seed, never a re-derived one, so replay survives any future
  // change to `deriveShoeSeed`.
  const base = createShoe(session.rules, record.seed);
  return advanceTo(base, dealtCount ?? record.dealtCount);
}

/**
 * One frame per Decision, in log order, each carrying the exact Shoe state at that moment.
 *
 * Linear in cards dealt: the Shoe for each index is built once and walked forward, because
 * Decisions within a Shoe are recorded in dealing order.
 */
export function replaySession(session: Session): ReplayFrame[] {
  const cursors = new Map<number, Shoe>();
  const frames: ReplayFrame[] = [];

  for (const decision of session.decisions) {
    let shoe = cursors.get(decision.shoeIndex);
    if (!shoe || shoe.dealtCount > decision.shoeDealtCount) {
      shoe = rebuildShoe(session, decision.shoeIndex, 0);
    }
    shoe = advanceTo(shoe, decision.shoeDealtCount);
    cursors.set(decision.shoeIndex, shoe);
    frames.push({ decision, shoe, dealt: shoe.cards.slice(0, shoe.dealtCount) });
  }

  return frames;
}

export interface ReplayVerification {
  readonly ok: boolean;
  /** Human-readable discrepancies, in the order they were found. Empty when `ok`. */
  readonly problems: readonly string[];
}

/**
 * Checks that a Session's log is internally consistent and consistent with the cards its
 * seeds actually produce. This is the proof behind "a Session replays from its seed plus
 * its Decision log" — and, exported, the substrate for the Shoe Integrity Panel.
 */
export function verifyReplay(session: Session): ReplayVerification {
  const problems: string[] = [];

  session.decisions.forEach((decision, position) => {
    if (decision.index !== position) {
      problems.push(`Decision at position ${position} carries index ${decision.index}`);
    }
  });

  session.rounds.forEach((round, position) => {
    if (round.index !== position) {
      problems.push(`Round at position ${position} carries index ${round.index}`);
    }
    const net = round.hands.reduce((sum, hand) => sum + hand.net, 0);
    if (net !== round.net) {
      problems.push(`Round ${round.index} stores net ${round.net} but its hands sum to ${net}`);
    }
  });

  // A Shoe only ever moves forward, so Decisions within one must be non-decreasing.
  const lastSeen = new Map<number, number>();
  for (const decision of session.decisions) {
    const previous = lastSeen.get(decision.shoeIndex);
    if (previous !== undefined && decision.shoeDealtCount < previous) {
      problems.push(
        `Decision ${decision.index} rewinds Shoe ${decision.shoeIndex} from ${previous} ` +
          `to ${decision.shoeDealtCount}`,
      );
    }
    lastSeen.set(decision.shoeIndex, decision.shoeDealtCount);
  }

  for (const round of session.rounds) {
    const shoe = session.shoes[round.shoeIndex];
    if (!shoe) {
      problems.push(`Round ${round.index} references Shoe ${round.shoeIndex}, which was never opened`);
      continue;
    }
    if (round.shoeEndIndex < round.shoeStartIndex) {
      problems.push(
        `Round ${round.index} spans backwards: ${round.shoeStartIndex}..${round.shoeEndIndex}`,
      );
      continue;
    }
    problems.push(...verifyRoundCards(session, round.index));
  }

  problems.push(...verifyConversionChecks(session));
  problems.push(...verifyIndexPlays(session));
  problems.push(...verifyCountingSystemChanges(session));

  return { ok: problems.length === 0, problems };
}

/**
 * A conversion check has no cards to check — its question is generated, not dealt — but it
 * does have arithmetic, and arithmetic is checkable: the stored True Count is redone from the
 * stored Running Count, remnant and rounding mode, and the verdict from the two numbers.
 */
function verifyConversionChecks(session: Session): string[] {
  const problems: string[] = [];
  session.conversionChecks.forEach((check, position) => {
    if (check.index !== position) {
      problems.push(`Conversion check at position ${position} carries index ${check.index}`);
    }
    if (check.cardsRemaining <= 0) {
      problems.push(`Conversion check ${check.index} divides by ${check.cardsRemaining} cards`);
      return;
    }
    const redone = trueCount(check.runningCount, check.cardsRemaining / 52, check.rounding);
    if (redone !== check.actualTrueCount) {
      problems.push(
        `Conversion check ${check.index} stores ${check.actualTrueCount} for ` +
          `${check.runningCount} over ${check.cardsRemaining} cards (${check.rounding}), which is ${redone}`,
      );
    }
    problems.push(...verdictProblem("Conversion check", check.index, check.verdict, check.statedTrueCount === check.actualTrueCount));
  });
  return problems;
}

/**
 * An index play is checked for what it claims, and only that.
 *
 * Its cards were *placed* at a shoe position, never dealt from one, so it names no Shoe of the
 * Session and nothing here looks for its cards in one — doing so would test a dealing history
 * the record deliberately does not assert (ADR-0004). What it does claim is a count and a
 * verdict: the True Count it was posed at must be the conversion of its Running Count and
 * remnant, and the verdict must follow from the two actions.
 */
function verifyIndexPlays(session: Session): string[] {
  const problems: string[] = [];
  session.indexPlays.forEach((play, position) => {
    if (play.index !== position) {
      problems.push(`Index play at position ${position} carries index ${play.index}`);
    }
    if (play.cardsRemaining <= 0) {
      problems.push(`Index play ${play.index} divides by ${play.cardsRemaining} cards`);
    } else {
      const redone = trueCount(play.runningCount, play.cardsRemaining / 52, play.rounding);
      if (redone !== play.trueCount) {
        problems.push(
          `Index play ${play.index} was posed at a True Count of ${play.trueCount}, but ` +
            `${play.runningCount} over ${play.cardsRemaining} cards (${play.rounding}) is ${redone}`,
        );
      }
    }
    problems.push(...verdictProblem("Index play", play.index, play.verdict, play.actionTaken === play.correctAction));
  });
  return problems;
}

/**
 * The system log must be a chain that ends where the Session says it is: each change starts
 * from the system the previous one switched to, and the last one lands on
 * `Session.countingSystem`. A break is a Session and a table that disagreed (#26).
 */
function verifyCountingSystemChanges(session: Session): string[] {
  const problems: string[] = [];
  let previous: string | null = null;
  session.countingSystemChanges.forEach((change, position) => {
    if (change.index !== position) {
      problems.push(`Counting System change at position ${position} carries index ${change.index}`);
    }
    if (previous !== null && change.from !== previous) {
      problems.push(
        `Counting System change ${change.index} switches from ${change.from}, but the Session ` +
          `was in ${previous}`,
      );
    }
    previous = change.to;
  });
  if (previous !== null && previous !== session.countingSystem) {
    problems.push(
      `The last Counting System change switched to ${previous}, but the Session says ` +
        `${session.countingSystem}`,
    );
  }
  return problems;
}

function verdictProblem(what: string, index: number, verdict: string, correct: boolean): string[] {
  const expected = correct ? "correct" : "incorrect";
  return verdict === expected ? [] : [`${what} ${index} is marked ${verdict} but is ${expected}`];
}

/**
 * Confirms that every card the log says was on the table during a round really does come
 * out of the seeded Shoe within that round's span. A mismatch means the log and the seed
 * describe different games, which is exactly the "rigged shoe" accusation made checkable.
 *
 * The count is of *distinct* cards, not of recorded views. A card can appear in several
 * Decisions — a hand is re-recorded every time it acts — and the same card can appear under
 * two different hand indices once a pair is split, because the two cards of the pair go on
 * to be the first card of the two hands the split produces. Demanding one card per recorded
 * view would report a shortage on every split round that the Shoe never actually had (#21).
 */
function verifyRoundCards(session: Session, roundIndex: number): string[] {
  const round = session.rounds[roundIndex];
  if (!round) return [];

  const problems: string[] = [];
  const shoe = rebuildShoe(session, round.shoeIndex, round.shoeEndIndex);
  const available = tally(shoe.cards.slice(round.shoeStartIndex, round.shoeEndIndex));

  const required = tally(round.dealerCards);
  for (const card of playerCardsDealt(session, roundIndex, problems)) {
    const id = cardId(card);
    required.set(id, (required.get(id) ?? 0) + 1);
  }

  for (const [id, needed] of required) {
    const have = available.get(id) ?? 0;
    if (have < needed) {
      problems.push(
        `Round ${roundIndex} used ${needed}x ${id} but its Shoe span ` +
          `${round.shoeStartIndex}..${round.shoeEndIndex} holds only ${have}`,
      );
    }
  }
  return problems;
}

/**
 * Every card the Decision log shows in the player's hands during a round, each counted once
 * however many Decisions it appears in.
 *
 * The log is walked in order, carrying the cards already counted for each hand position. A
 * Decision on a hand can only extend what is known of it, so only the cards it adds are
 * new. A `split` is the one Decision that does not extend a hand — it *replaces* it with
 * the two the table deals, each keeping one card of the pair (already counted) and drawing
 * a card that stays unknown until a later Decision records it. The second hand is inserted
 * immediately after the hand it came from, which is where `src/engine/round` puts it, so
 * resplits into three and four hands line up as well as a single split does.
 *
 * Split aces need no special case: they are frozen after one card, so they simply produce
 * no further Decision and the card drawn onto them is never recorded here. A card the log
 * does not mention is not a card the log has to account for.
 *
 * A Decision that contradicts what its hand already held is reported and then counted in
 * full, so a substituted card is still demanded from the Shoe rather than quietly dropped.
 */
function playerCardsDealt(session: Session, roundIndex: number, problems: string[]): Card[] {
  const dealt: Card[] = [];
  /** Cards already counted, per hand position, left to right across the table. */
  const counted: Card[][] = [];

  for (const decision of session.decisions) {
    if (decision.roundIndex !== roundIndex) continue;
    const { handIndex, playerCards } = decision.hand;
    while (counted.length <= handIndex) counted.push([]);
    const known = counted[handIndex] as Card[];

    if (startsWith(playerCards, known)) {
      dealt.push(...playerCards.slice(known.length));
      counted[handIndex] = [...playerCards];
    } else if (!startsWith(known, playerCards)) {
      problems.push(
        `Round ${roundIndex}: Decision ${decision.index} shows hand ${handIndex} holding ` +
          `${describe(playerCards)}, which does not continue the ${describe(known)} ` +
          `already recorded`,
      );
      dealt.push(...playerCards);
      counted[handIndex] = [...playerCards];
    }

    if (decision.actionTaken !== "split") continue;
    const [first, second] = playerCards;
    if (playerCards.length !== 2 || !first || !second) {
      problems.push(
        `Round ${roundIndex}: Decision ${decision.index} splits hand ${handIndex}, which ` +
          `holds ${playerCards.length} cards rather than a pair`,
      );
      continue;
    }
    counted[handIndex] = [first];
    counted.splice(handIndex + 1, 0, [second]);
  }

  return dealt;
}

/** True when `cards` opens with every card of `prefix`, in order. */
function startsWith(cards: readonly Card[], prefix: readonly Card[]): boolean {
  if (cards.length < prefix.length) return false;
  return prefix.every((card, index) => cardId(card) === cardId(cards[index] as Card));
}

function describe(cards: readonly Card[]): string {
  return cards.length === 0 ? "no cards" : cards.map(cardId).join(" ");
}

function tally(cards: readonly Card[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const card of cards) {
    const id = cardId(card);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

function advanceTo(shoe: Shoe, dealtCount: number): Shoe {
  let current = shoe;
  while (current.dealtCount < dealtCount) current = deal(current).shoe;
  return current;
}
