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

import { type Card, type Shoe, cardId, createShoe, deal } from "@/engine";
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

  return { ok: problems.length === 0, problems };
}

/**
 * Confirms that every card the log says was on the table during a round really does come
 * out of the seeded Shoe within that round's span. A mismatch means the log and the seed
 * describe different games, which is exactly the "rigged shoe" accusation made checkable.
 */
function verifyRoundCards(session: Session, roundIndex: number): string[] {
  const round = session.rounds[roundIndex];
  if (!round) return [];

  const shoe = rebuildShoe(session, round.shoeIndex, round.shoeEndIndex);
  const available = tally(shoe.cards.slice(round.shoeStartIndex, round.shoeEndIndex));

  const required = tally(round.dealerCards);
  // The longest recorded view of each hand is its most complete one; earlier Decisions on
  // the same hand are prefixes of it.
  const fullest = new Map<number, readonly Card[]>();
  for (const decision of session.decisions) {
    if (decision.roundIndex !== roundIndex) continue;
    const current = fullest.get(decision.hand.handIndex);
    if (!current || decision.hand.playerCards.length > current.length) {
      fullest.set(decision.hand.handIndex, decision.hand.playerCards);
    }
  }
  for (const cards of fullest.values()) {
    for (const card of cards) required.set(cardId(card), (required.get(cardId(card)) ?? 0) + 1);
  }

  const problems: string[] = [];
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
