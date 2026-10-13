/**
 * Exact outcome probabilities and house edges, by full enumeration of the shoe.
 *
 * The trainer quotes "Banker 1.06%, Player 1.24%" to the user, so those numbers are not
 * copied from a table: they are computed here by walking every possible coup from a full
 * shoe's composition (cards drawn without replacement), and the tests check the result
 * against the published figures. "Wrong math" is a trust failure (CONTEXT.md), and this is
 * how a baccarat edge proves itself.
 *
 * Only point values matter to the tableau, so the walk runs over 10 values rather than 13
 * ranks: at most 10⁶ leaves, a few milliseconds. Pair bets depend on rank and are exact
 * closed forms instead.
 */

import { SIDE_BET_PAYS, type BaccaratRules, type BetKind, isBetOffered } from "./rules";
import { bankerDraws, playerDraws } from "./coup";

export interface OutcomeProbabilities {
  readonly decks: number;
  readonly player: number;
  readonly banker: number;
  readonly tie: number;
  /** Banker wins with a three-card 7. */
  readonly dragon7: number;
  /** Player wins with a three-card 8. */
  readonly panda8: number;
  /** First two cards of a given side share a rank. Same for both sides. */
  readonly pair: number;
}

const cache = new Map<number, OutcomeProbabilities>();

/** Exact probabilities for a freshly shuffled shoe of `decks` decks. Memoised per deck count. */
export function outcomeProbabilities(decks: number): OutcomeProbabilities {
  const cached = cache.get(decks);
  if (cached) return cached;
  const result = enumerate(decks);
  cache.set(decks, result);
  return result;
}

function enumerate(decks: number): OutcomeProbabilities {
  // counts[v] = cards of point value v. Tens and court cards are all worth 0.
  const counts = [
    16 * decks,
    4 * decks,
    4 * decks,
    4 * decks,
    4 * decks,
    4 * decks,
    4 * decks,
    4 * decks,
    4 * decks,
    4 * decks,
  ];
  let remaining = 52 * decks;
  let player = 0;
  let banker = 0;
  let tie = 0;
  let dragon7 = 0;
  let panda8 = 0;

  // Draws a value: calls `next` for each value with its probability, card removed.
  const each = (p: number, next: (value: number, prob: number) => void): void => {
    for (let v = 0; v < 10; v++) {
      const n = counts[v] as number;
      if (n === 0) continue;
      const prob = (p * n) / remaining;
      counts[v] = n - 1;
      remaining--;
      next(v, prob);
      counts[v] = n;
      remaining++;
    }
  };

  const record = (p: number, pt: number, bt: number, p3: boolean, b3: boolean): void => {
    if (pt > bt) {
      player += p;
      if (p3 && pt === 8) panda8 += p;
    } else if (bt > pt) {
      banker += p;
      if (b3 && bt === 7) dragon7 += p;
    } else {
      tie += p;
    }
  };

  each(1, (p1, q1) =>
    each(q1, (b1, q2) =>
      each(q2, (p2, q3) =>
        each(q3, (b2, q4) => {
          const pt = (p1 + p2) % 10;
          const bt = (b1 + b2) % 10;
          if (pt >= 8 || bt >= 8) return record(q4, pt, bt, false, false);
          if (playerDraws(pt)) {
            each(q4, (p3, q5) => {
              const pt3 = (pt + p3) % 10;
              if (bankerDraws(bt, p3)) {
                each(q5, (b3, q6) => record(q6, pt3, (bt + b3) % 10, true, true));
              } else {
                record(q5, pt3, bt, true, false);
              }
            });
          } else if (bankerDraws(bt, null)) {
            each(q4, (b3, q5) => record(q5, pt, (bt + b3) % 10, false, true));
          } else {
            record(q4, pt, bt, false, false);
          }
        }),
      ),
    ),
  );

  const perRank = 4 * decks;
  const total = 52 * decks;
  const pair = (13 * perRank * (perRank - 1)) / (total * (total - 1));
  return { decks, player, banker, tie, dragon7, panda8, pair };
}

/**
 * Expected value of a one-unit bet, per coup (ties count as coups, so a Player or Banker
 * bet that pushes contributes 0). Negative means the house has the edge.
 */
export function expectedValue(rules: BaccaratRules, bet: BetKind): number {
  const p = outcomeProbabilities(rules.decks);
  switch (bet) {
    case "player":
      return p.player - p.banker;
    case "banker":
      return rules.variant === "ez"
        ? p.banker - p.dragon7 - p.player
        : p.banker * (1 - rules.commission) - p.player;
    case "tie":
      return p.tie * rules.tiePays - (1 - p.tie);
    case "playerPair":
    case "bankerPair":
      return p.pair * SIDE_BET_PAYS[bet] - (1 - p.pair);
    case "dragon7":
      return p.dragon7 * SIDE_BET_PAYS.dragon7 - (1 - p.dragon7);
    case "panda8":
      return p.panda8 * SIDE_BET_PAYS.panda8 - (1 - p.panda8);
  }
}

/** House edge as a fraction of the stake (0.0106 = 1.06%). */
export function houseEdge(rules: BaccaratRules, bet: BetKind): number {
  return -expectedValue(rules, bet);
}

export interface HouseEdgeRow {
  readonly bet: BetKind;
  /** Fraction of the stake, e.g. 0.0106. */
  readonly edge: number;
  /** Rounded percent for display, e.g. "1.06%". */
  readonly label: string;
}

/** House edge of every bet the table offers, lowest edge first. */
export function houseEdgeTable(rules: BaccaratRules): HouseEdgeRow[] {
  const bets: BetKind[] = ["banker", "player", "tie", ...rules.sideBets];
  return bets
    .filter((bet) => isBetOffered(rules, bet))
    .map((bet) => {
      const edge = houseEdge(rules, bet);
      return { bet, edge, label: `${(edge * 100).toFixed(2)}%` };
    })
    .sort((a, b) => a.edge - b.edge);
}
