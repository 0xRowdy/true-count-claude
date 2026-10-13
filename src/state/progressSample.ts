/**
 * A deterministic sample training history, for demos, screenshots and the e2e flows
 * (`/lobby?demo=1`, `/progress?demo=1`). It is shown in place of the player's own record and
 * never written to storage.
 *
 * Twelve weeks of practice at blackjack, craps and video poker, with blackjack accuracy
 * climbing from the low 70s to the 90s. Everything derives from a fixed seed and the
 * caller's `today`/`now`, so the same day always produces the same history.
 */

import { createRng } from "@/engine/rng";
import type { GameId } from "./profile";
import {
  type ProgressDecision,
  type ProgressHand,
  type ProgressSession,
  type ProgressState,
} from "./progress";
import { addDays } from "./progressSelectors";

const SEED = 20261013;
const DAYS = 84;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

interface GamePlan {
  readonly game: GameId;
  readonly strategy: string;
  readonly from: number;
  readonly to: number;
  /** Category, share of decisions, accuracy offset. */
  readonly categories: ReadonlyArray<readonly [string, number, number]>;
  readonly hands: readonly [number, number];
  readonly bet: number;
  readonly winP: number;
}

const PLANS: Record<"blackjack" | "craps" | "video-poker", GamePlan> = {
  blackjack: {
    game: "blackjack",
    strategy: "Basic Strategy · 6D S17",
    from: 0.71,
    to: 0.95,
    categories: [
      ["hard", 0.45, 0.035],
      ["soft", 0.2, -0.09],
      ["doubles", 0.15, -0.045],
      ["pairs", 0.12, 0],
      ["insurance-surrender", 0.08, 0.06],
    ],
    hands: [30, 56],
    bet: 25,
    winP: 0.505,
  },
  craps: {
    game: "craps",
    strategy: "Iron Cross, explained",
    from: 0.62,
    to: 0.82,
    categories: [
      ["line", 0.3, 0.08],
      ["odds", 0.25, 0.02],
      ["come", 0.15, -0.08],
      ["place", 0.15, 0],
      ["payouts", 0.15, -0.05],
    ],
    hands: [14, 24],
    bet: 10,
    winP: 0.5,
  },
  "video-poker": {
    game: "video-poker",
    strategy: "9/6 JoB optimal holds",
    from: 0.6,
    to: 0.78,
    categories: [
      ["made-hands", 0.25, 0.12],
      ["pairs", 0.25, 0.05],
      ["flush-draws", 0.2, -0.1],
      ["straight-draws", 0.15, -0.12],
      ["high-cards", 0.15, -0.04],
    ],
    hands: [40, 64],
    bet: 5,
    winP: 0.46,
  },
};

/** The sample history as of `today` (local ISO date) and `now` (epoch ms). */
export function sampleProgress(today: string, now: number): ProgressState {
  const rng = createRng(SEED);
  const decisions: ProgressDecision[] = [];
  const hands: ProgressHand[] = [];
  const sessions: ProgressSession[] = [];
  let lastCrapsSession: string | null = null;

  for (let ago = DAYS - 1; ago >= 0; ago--) {
    // The last four days are practised (a 4-day streak, after a day off); before that, about
    // three days in five.
    const roll = rng.next();
    const practised = ago <= 3 || (ago !== 4 && roll < 0.6);
    if (!practised) continue;
    const day = addDays(today, -ago);
    const trend = (DAYS - 1 - ago) / (DAYS - 1);
    const count = ago === 0 ? 2 : rng.next() < 0.35 ? 2 : 1;
    for (let s = 0; s < count; s++) {
      const r = rng.next();
      // Today: blackjack, then craps — matching the design's "Recent sessions".
      const plan =
        ago === 0
          ? s === 0
            ? PLANS.blackjack
            : PLANS.craps
          : r < 0.6
            ? PLANS.blackjack
            : r < 0.85
              ? PLANS.craps
              : PLANS["video-poker"];
      const id = `sample-${sessions.length + 1}`;
      const startedAt = now - ago * DAY - (count - s) * 2 * HOUR - HOUR;
      const nHands = plan.hands[0] + rng.nextInt(plan.hands[1] - plan.hands[0]);
      const base = plan.from + (plan.to - plan.from) * trend;
      let at = startedAt;
      for (let h = 0; h < nHands; h++) {
        const decisionsThisHand = rng.next() < 0.3 ? 2 : 1;
        for (let k = 0; k < decisionsThisHand; k++) {
          at += 7_000 + rng.nextInt(9_000);
          const pick = rng.next();
          let acc = 0;
          let cat = plan.categories[0]!;
          for (const c of plan.categories) {
            acc += c[1];
            if (pick < acc) {
              cat = c;
              break;
            }
          }
          const p = Math.min(0.995, base + cat[2]);
          const correct = rng.next() < p;
          decisions.push({
            game: plan.game,
            category: cat[0],
            correct,
            coached: !correct,
            at,
            day,
            sessionId: id,
          });
        }
        at += 5_000 + rng.nextInt(6_000);
        const outcome = rng.next();
        const push = plan.game === "blackjack" && outcome > 0.92;
        const win = !push && rng.next() < plan.winP;
        const size = plan.bet * (rng.next() < 0.1 ? 2 : 1);
        hands.push({
          game: plan.game,
          net: push ? 0 : win ? size : -size,
          strategyName: plan.strategy,
          at,
          day,
          sessionId: id,
        });
      }
      sessions.push({
        id,
        game: plan.game,
        strategyName: plan.strategy,
        startedAt,
        endedAt: at + 30_000,
        day,
      });
      if (plan.game === "craps") lastCrapsSession = id;
    }
  }

  // The most recent craps session took full odds on every point ("Hard way").
  const finalDecisions = decisions.map((d) =>
    d.sessionId === lastCrapsSession && d.category === "odds"
      ? { ...d, correct: true, coached: false }
      : d,
  );
  return { decisions: finalDecisions, hands, sessions, bankrollBase: {} };
}
