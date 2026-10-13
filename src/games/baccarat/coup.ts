/**
 * One coup (hand) of baccarat: card points, naturals, totals, and the third-card tableau.
 *
 * Nobody makes a decision in baccarat after the bets are down — every draw is fixed by the
 * tableau below. That makes the tableau the thing a trainer has to get exactly right, so it
 * is written out as data (`BANKER_DRAWS`) and asserted cell by cell in the tests.
 */

import type { Card, Rank } from "../../engine/cards";

export type Side = "player" | "banker";
export type Winner = Side | "tie";

/** Baccarat point value: A = 1, 2–9 face value, 10 and court cards = 0. */
export function pointValue(rank: Rank): number {
  if (rank === "A") return 1;
  if (rank === "10" || rank === "J" || rank === "Q" || rank === "K") return 0;
  return Number(rank);
}

/** Hand total: the last digit of the sum of point values. */
export function handTotal(cards: readonly Card[]): number {
  let sum = 0;
  for (const card of cards) sum += pointValue(card.rank);
  return sum % 10;
}

/** A natural is an 8 or 9 on the first two cards. Either side's natural ends the coup. */
export function isNatural(cards: readonly Card[]): boolean {
  return cards.length === 2 && handTotal(cards) >= 8;
}

/** Player draws a third card on 0–5 and stands on 6–7 (naturals are handled first). */
export function playerDraws(playerTotal: number): boolean {
  return playerTotal <= 5;
}

/**
 * The Banker's tableau when the Player drew a third card.
 *
 * Row = Banker's two-card total (0–7), column = point value of Player's third card (0–9).
 * `true` = Banker draws. Banker always draws on 0–2 and always stands on 7.
 *
 *   3: draws unless Player's third card is an 8
 *   4: draws on 2–7
 *   5: draws on 4–7
 *   6: draws on 6–7
 */
export const BANKER_DRAWS: readonly (readonly boolean[])[] = [0, 1, 2, 3, 4, 5, 6, 7].map(
  (bankerTotal) =>
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((third) => bankerDrawsAgainst(bankerTotal, third)),
);

function bankerDrawsAgainst(bankerTotal: number, third: number): boolean {
  switch (bankerTotal) {
    case 0:
    case 1:
    case 2:
      return true;
    case 3:
      return third !== 8;
    case 4:
      return third >= 2 && third <= 7;
    case 5:
      return third >= 4 && third <= 7;
    case 6:
      return third === 6 || third === 7;
    default:
      return false;
  }
}

/**
 * Whether the Banker draws a third card.
 *
 * @param bankerTotal Banker's two-card total.
 * @param playerThird Point value of the Player's third card, or `null` if the Player stood.
 *   When the Player stood, the Banker plays like the Player: draws on 0–5, stands on 6–7.
 */
export function bankerDraws(bankerTotal: number, playerThird: number | null): boolean {
  if (playerThird === null) return bankerTotal <= 5;
  return bankerDrawsAgainst(bankerTotal, playerThird);
}

export interface Coup {
  /** Player's cards in deal order (2 or 3). */
  readonly player: readonly Card[];
  /** Banker's cards in deal order (2 or 3). */
  readonly banker: readonly Card[];
  readonly playerTotal: number;
  readonly bankerTotal: number;
  readonly winner: Winner;
  readonly playerNatural: boolean;
  readonly bankerNatural: boolean;
  /** Player's first two cards share a rank (Player Pair side bet). */
  readonly playerPair: boolean;
  /** Banker's first two cards share a rank (Banker Pair side bet). */
  readonly bankerPair: boolean;
  /** Banker wins with a three-card 7. Pushes the Banker bet in EZ Baccarat. */
  readonly dragon7: boolean;
  /** Player wins with a three-card 8. */
  readonly panda8: boolean;
}

/**
 * Plays a coup from a card source, following the deal order P, B, P, B, then the Player's
 * third card and the Banker's third card. `draw` is called once per card actually dealt,
 * so a coup consumes exactly 4, 5 or 6 cards.
 */
export function playCoupFrom(draw: () => Card): Coup {
  const player: Card[] = [];
  const banker: Card[] = [];
  player.push(draw());
  banker.push(draw());
  player.push(draw());
  banker.push(draw());

  const naturalDealt = isNatural(player) || isNatural(banker);
  if (!naturalDealt) {
    let playerThird: number | null = null;
    if (playerDraws(handTotal(player))) {
      const card = draw();
      player.push(card);
      playerThird = pointValue(card.rank);
    }
    if (bankerDraws(handTotal(banker), playerThird)) banker.push(draw());
  }
  return scoreCoup(player, banker);
}

/** Scores a finished coup. Exposed so tests and the coach can score fixed hands. */
export function scoreCoup(player: readonly Card[], banker: readonly Card[]): Coup {
  const playerTotal = handTotal(player);
  const bankerTotal = handTotal(banker);
  const winner: Winner =
    playerTotal > bankerTotal ? "player" : bankerTotal > playerTotal ? "banker" : "tie";
  return {
    player,
    banker,
    playerTotal,
    bankerTotal,
    winner,
    playerNatural: isNatural(player),
    bankerNatural: isNatural(banker),
    playerPair: player[0]?.rank === player[1]?.rank,
    bankerPair: banker[0]?.rank === banker[1]?.rank,
    dragon7: winner === "banker" && banker.length === 3 && bankerTotal === 7,
    panda8: winner === "player" && player.length === 3 && playerTotal === 8,
  };
}

/**
 * The caption under a hand: "Natural 9", "Stands on 7", "Draws to 5".
 */
export function describeHand(coup: Coup, side: Side): string {
  const cards = side === "player" ? coup.player : coup.banker;
  const total = side === "player" ? coup.playerTotal : coup.bankerTotal;
  if (isNatural(cards)) return `Natural ${total}`;
  if (cards.length === 3) return `Draws to ${total}`;
  return `Stands on ${total}`;
}

/** The headline result: "Player wins 9 over 7", "Banker wins 6 over 5", "Tie at 6". */
export function describeResult(coup: Coup): string {
  if (coup.winner === "tie") return `Tie at ${coup.playerTotal}`;
  if (coup.winner === "player") return `Player wins ${coup.playerTotal} over ${coup.bankerTotal}`;
  return `Banker wins ${coup.bankerTotal} over ${coup.playerTotal}`;
}

/**
 * Why each side drew or stood, in the order the dealer applies the rules. This is the
 * Explanation for a coup: baccarat has no player decisions, so the teaching is the tableau.
 */
export function explainDraws(coup: Coup): string[] {
  const p2 = handTotal(coup.player.slice(0, 2));
  const b2 = handTotal(coup.banker.slice(0, 2));
  const lines: string[] = [];

  if (coup.playerNatural || coup.bankerNatural) {
    const who =
      coup.playerNatural && coup.bankerNatural
        ? "Both hands have a natural"
        : coup.playerNatural
          ? `Player has a natural ${p2}`
          : `Banker has a natural ${b2}`;
    lines.push(`${who}, so neither side draws.`);
    return lines;
  }

  const playerThirdCard = coup.player[2];
  if (playerThirdCard) {
    lines.push(`Player has ${p2}, and Player always draws on 0–5.`);
  } else {
    lines.push(`Player has ${p2}, and Player stands on 6 or 7.`);
  }

  const bankerDrew = coup.banker.length === 3;
  if (!playerThirdCard) {
    lines.push(
      bankerDrew
        ? `Player stood, so Banker draws on ${b2} like the Player would (0–5).`
        : `Player stood, so Banker stands on ${b2} (6 or 7).`,
    );
    return lines;
  }

  const third = pointValue(playerThirdCard.rank);
  const verb = bankerDrew ? "draws" : "stands";
  lines.push(
    `Banker has ${b2} against a Player third card worth ${third}, so Banker ${verb}: ${bankerRule(b2)}.`,
  );
  return lines;
}

function bankerRule(bankerTotal: number): string {
  switch (bankerTotal) {
    case 0:
    case 1:
    case 2:
      return "Banker always draws on 0–2";
    case 3:
      return "on 3, Banker draws unless the Player's third card is an 8";
    case 4:
      return "on 4, Banker draws when the Player's third card is 2–7";
    case 5:
      return "on 5, Banker draws when the Player's third card is 4–7";
    case 6:
      return "on 6, Banker draws only when the Player's third card is 6 or 7";
    default:
      return "Banker always stands on 7";
  }
}
