/** Test fixtures. Not exported from the barrel. */

import type { Card, Rank, Suit } from "../../engine/cards";
import { type Coup, playCoupFrom, scoreCoup } from "./coup";

/** `card("4c")`, `card("10h")`, `card("Ks")`. */
export function card(id: string): Card {
  return { rank: id.slice(0, -1) as Rank, suit: id.slice(-1) as Suit };
}

export function cards(ids: string): Card[] {
  return ids.split(" ").filter(Boolean).map(card);
}

/** Scores a fixed coup: `fixed("4c 5d", "Ks 7h")`. */
export function fixed(player: string, banker: string): Coup {
  return scoreCoup(cards(player), cards(banker));
}

/** Deals a coup from cards in deal order (P B P B, then third cards), checking none are left. */
export function dealt(order: string): { coup: Coup; used: number } {
  const deck = cards(order);
  let used = 0;
  const coup = playCoupFrom(() => {
    const next = deck[used++];
    if (!next) throw new Error("fixture ran out of cards");
    return next;
  });
  return { coup, used };
}

/** A coup with only a winner that matters, for road tests. */
export function winnerCoup(letter: "P" | "B" | "T"): Coup {
  if (letter === "P") return fixed("9s 10s", "5s 2s");
  if (letter === "B") return fixed("5s 2s", "9s 10s");
  return fixed("4s 3s", "5s 2s");
}
