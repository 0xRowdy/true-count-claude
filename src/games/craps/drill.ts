/**
 * Payout drill — the lobby's "20 craps payouts: place 6 and 8, odds on 4 and 10. Fast payout
 * math is what dealers notice first."
 *
 * Questions are drawn from a seed (ADR-0004), so a drill can be replayed and a bug report
 * reproduces the exact questions. Every answer comes from the payout functions in `bets.ts`.
 */

import { createRng } from "../../engine/rng";
import {
  exactStep,
  hardPayout,
  layOddsPayout,
  oddsPayout,
  oddsRatio,
  placePayout,
  placeRatio,
  layRatio,
  ratioLabel,
  hardRatio,
} from "./bets";
import type { HardNumber, PointNumber } from "./dice";
import { formatDollars } from "./money";

export type PayoutTopic = "place" | "odds" | "layOdds" | "hard" | "field";

export interface PayoutQuestion {
  readonly topic: PayoutTopic;
  /** "Place 6 for $30. What does it pay?" */
  readonly prompt: string;
  /** Profit paid, whole dollars. */
  readonly answer: number;
  /** "7:6 — $30 is 5 units of $6, each paying $7: $35." */
  readonly explanation: string;
}

/** The lobby drill: place 6 and 8, and odds on 4 and 10. */
export const LOBBY_DRILL_TOPICS: readonly PayoutTopic[] = ["place", "odds"];

function pick<T>(items: readonly T[], next: (n: number) => number): T {
  return items[next(items.length)] as T;
}

/**
 * Builds `count` payout questions from a seed. Amounts are always in exact-payout units, so
 * every answer is a whole dollar with no breakage.
 */
export function createPayoutDrill(
  seed: number,
  count = 20,
  topics: readonly PayoutTopic[] = LOBBY_DRILL_TOPICS,
): PayoutQuestion[] {
  const rng = createRng(seed);
  const next = (n: number) => rng.nextInt(n);
  const out: PayoutQuestion[] = [];
  for (let i = 0; i < count; i++) {
    const topic = pick(topics, next);
    const units = 1 + next(10);
    switch (topic) {
      case "place": {
        const n = pick<PointNumber>([6, 8], next);
        const step = exactStep("place", n);
        const amount = step * units;
        const r = placeRatio(n);
        out.push({
          topic,
          prompt: `Place ${n} for ${formatDollars(amount)}. What does it pay?`,
          answer: placePayout(n, amount),
          explanation: `${ratioLabel(r)}: ${formatDollars(amount)} is ${units} ${units === 1 ? "unit" : "units"} of ${formatDollars(step)}, each paying ${formatDollars(r.wins)}.`,
        });
        break;
      }
      case "odds": {
        const n = pick<PointNumber>([4, 10], next);
        const r = oddsRatio(n);
        const amount = 5 * units * r.per;
        out.push({
          topic,
          prompt: `${formatDollars(amount)} odds behind the line, point is ${n}. What do the odds pay?`,
          answer: oddsPayout(n, amount),
          explanation: `Odds on ${n} pay true odds, ${ratioLabel(r)}: ${formatDollars(amount)} pays ${formatDollars(oddsPayout(n, amount))}.`,
        });
        break;
      }
      case "layOdds": {
        const n = pick<PointNumber>([4, 5, 6, 8, 9, 10], next);
        const r = layRatio(n);
        const amount = r.per * units * 5;
        out.push({
          topic,
          prompt: `${formatDollars(amount)} laid against the ${n}. A seven rolls. What does the lay pay?`,
          answer: layOddsPayout(n, amount),
          explanation: `Lay odds on ${n} pay ${ratioLabel(r)}: ${formatDollars(amount)} wins ${formatDollars(layOddsPayout(n, amount))}.`,
        });
        break;
      }
      case "hard": {
        const n = pick<HardNumber>([4, 6, 8, 10], next);
        const amount = units * 5;
        out.push({
          topic,
          prompt: `Hard ${n} for ${formatDollars(amount)}. It hits. What does it pay?`,
          answer: hardPayout(n, amount),
          explanation: `Hard ${n} pays ${ratioLabel(hardRatio(n))}.`,
        });
        break;
      }
      case "field": {
        const total = pick([2, 3, 4, 9, 10, 11, 12], next);
        const amount = units * 5;
        const mult = total === 2 || total === 12 ? 2 : 1;
        out.push({
          topic,
          prompt: `${formatDollars(amount)} in the field. The dice show ${total}. What does it pay?`,
          answer: amount * mult,
          explanation:
            mult === 2
              ? "2 and 12 pay double in the field."
              : "The field pays even money on 3, 4, 9, 10 and 11.",
        });
        break;
      }
    }
  }
  return out;
}

/** Whether an answer is right, and the explanation either way (invariant 2). */
export function checkPayoutAnswer(
  q: PayoutQuestion,
  answer: number,
): { correct: boolean; message: string } {
  const correct = answer === q.answer;
  return {
    correct,
    message: correct
      ? `Right: ${formatDollars(q.answer)}. ${q.explanation}`
      : `It pays ${formatDollars(q.answer)}. ${q.explanation}`,
  };
}
