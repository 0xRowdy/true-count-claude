/** Test helpers: terse card notation ("5h 5s 9h Qh 2h"). Imported only by tests. */

import type { Card, Rank, Suit } from "../../engine/cards";

const RANK_TOKENS: Record<string, Rank> = {
  A: "A",
  K: "K",
  Q: "Q",
  J: "J",
  T: "10",
  "10": "10",
  "9": "9",
  "8": "8",
  "7": "7",
  "6": "6",
  "5": "5",
  "4": "4",
  "3": "3",
  "2": "2",
};

export function cards(text: string): Card[] {
  return text
    .trim()
    .split(/\s+/)
    .map((token) => {
      const rank = RANK_TOKENS[token.slice(0, -1)];
      const suit = token.slice(-1) as Suit;
      if (!rank || !"shdc".includes(suit)) throw new Error(`Bad card: ${token}`);
      return { rank, suit };
    });
}
