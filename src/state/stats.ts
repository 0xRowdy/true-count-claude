/**
 * Aggregate statistics over a Session's Decision log and round results.
 *
 * Every rate here is defined explicitly in a comment and computed from raw counts that are
 * also exposed, so a user who doubts a number can check it themselves. "Wrong math" is 21%
 * of the category's low-star reviews (CONTEXT.md); a statistics panel that cannot show its
 * own working is the same failure in a different place.
 *
 * Rates are `null`, never `0`, when their denominator is zero. A fresh Session has *no*
 * accuracy, not 0% accuracy.
 */

import type { HandResult, Session } from "./types";

export interface SessionStats {
  readonly roundsPlayed: number;
  /** Hands resolved, counting each split hand separately. */
  readonly handsPlayed: number;

  readonly decisionsMade: number;
  readonly correctDecisions: number;
  /** correctDecisions / decisionsMade. Deviation-aware: an index play counts as correct. */
  readonly basicStrategyAccuracy: number | null;

  readonly countChecks: number;
  readonly correctCountChecks: number;
  /** correctCountChecks / countChecks. */
  readonly countingAccuracy: number | null;

  readonly wins: number;
  readonly blackjacks: number;
  readonly pushes: number;
  readonly losses: number;
  readonly surrenders: number;
  /** (wins + blackjacks) / handsPlayed. Pushes stay in the denominator — they are hands played. */
  readonly winRate: number | null;

  readonly busts: number;
  /** Player hands that busted / handsPlayed. Dealer busts are not the player's statistic. */
  readonly bustRate: number | null;

  /** Total staked across every hand, before any doubling is settled. */
  readonly wagered: number;
  /** Chips won minus chips lost. Negative is a losing run. */
  readonly netResult: number;
  /** netResult / handsPlayed — the per-hand result the expectation band is plotted against. */
  readonly netPerHand: number | null;
}

/** Mutable tallies; every rate in `SessionStats` is derived from these. */
interface Counters {
  rounds: number;
  hands: number;
  decisions: number;
  correctDecisions: number;
  countChecks: number;
  correctCountChecks: number;
  wins: number;
  blackjacks: number;
  pushes: number;
  losses: number;
  surrenders: number;
  busts: number;
  wagered: number;
  net: number;
}

export function computeStats(session: Session): SessionStats {
  const counters = emptyCounters();
  accumulate(counters, session);
  return derive(counters);
}

/**
 * Lifetime statistics across every Session. Summing the counters rather than averaging the
 * rates — averaging rates would weight a three-hand Session the same as a three-hour one.
 */
export function aggregateStats(sessions: readonly Session[]): SessionStats {
  const counters = emptyCounters();
  for (const session of sessions) accumulate(counters, session);
  return derive(counters);
}

/** A history-list row: enough to render a Session without loading its Decision log. */
export interface SessionSummary {
  readonly id: string;
  readonly mode: Session["mode"];
  readonly drillId: string | null;
  readonly countingSystem: string;
  readonly seed: number;
  readonly startedAt: number;
  readonly endedAt: number | null;
  readonly endReason: Session["endReason"];
  /** Null while the Session is still running. */
  readonly durationMs: number | null;
  readonly active: boolean;
  readonly stats: SessionStats;
}

export function summarize(session: Session): SessionSummary {
  return {
    id: session.id,
    mode: session.mode,
    drillId: session.drillId,
    countingSystem: session.countingSystem,
    seed: session.seed,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    endReason: session.endReason,
    durationMs: session.endedAt === null ? null : session.endedAt - session.startedAt,
    active: session.endedAt === null,
    stats: computeStats(session),
  };
}

function emptyCounters(): Counters {
  return {
    rounds: 0,
    hands: 0,
    decisions: 0,
    correctDecisions: 0,
    countChecks: 0,
    correctCountChecks: 0,
    wins: 0,
    blackjacks: 0,
    pushes: 0,
    losses: 0,
    surrenders: 0,
    busts: 0,
    wagered: 0,
    net: 0,
  };
}

function accumulate(counters: Counters, session: Session): void {
  counters.decisions += session.decisions.length;
  for (const decision of session.decisions) {
    if (decision.verdict === "correct") counters.correctDecisions++;
  }

  counters.countChecks += session.countChecks.length;
  for (const check of session.countChecks) {
    if (check.verdict === "correct") counters.correctCountChecks++;
  }

  counters.rounds += session.rounds.length;
  for (const round of session.rounds) {
    for (const hand of round.hands) tallyHand(counters, hand);
  }
}

function tallyHand(counters: Counters, hand: HandResult): void {
  counters.hands++;
  counters.wagered += hand.bet;
  counters.net += hand.net;
  if (hand.busted) counters.busts++;

  switch (hand.outcome) {
    case "win":
      counters.wins++;
      break;
    case "blackjack":
      counters.blackjacks++;
      break;
    case "push":
      counters.pushes++;
      break;
    case "loss":
      counters.losses++;
      break;
    case "surrender":
      counters.surrenders++;
      break;
  }
}

function derive(c: Counters): SessionStats {
  return {
    roundsPlayed: c.rounds,
    handsPlayed: c.hands,
    decisionsMade: c.decisions,
    correctDecisions: c.correctDecisions,
    basicStrategyAccuracy: rate(c.correctDecisions, c.decisions),
    countChecks: c.countChecks,
    correctCountChecks: c.correctCountChecks,
    countingAccuracy: rate(c.correctCountChecks, c.countChecks),
    wins: c.wins,
    blackjacks: c.blackjacks,
    pushes: c.pushes,
    losses: c.losses,
    surrenders: c.surrenders,
    winRate: rate(c.wins + c.blackjacks, c.hands),
    busts: c.busts,
    bustRate: rate(c.busts, c.hands),
    wagered: c.wagered,
    netResult: c.net,
    netPerHand: c.hands === 0 ? null : c.net / c.hands,
  };
}

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}
