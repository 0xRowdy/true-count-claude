/**
 * The baccarat shoe: eight seeded decks, the burn, the cut card and the last-hand rule.
 *
 * The cards live in the engine's own `Shoe` (src/engine/shoe.ts), so the dealing, the
 * remaining-composition proof and the composition check are the blackjack engine's, not a
 * second implementation. What baccarat adds is the table procedure around it:
 *
 * - **Burn.** The first card is turned face up and that many cards (court cards and tens
 *   count as ten) are burned face down.
 * - **Cut card.** The cut card sits `cardsBehindCut` cards from the back, just before card
 *   `shoe.cutIndex`. It comes out when that card is drawn; the coup in progress is finished
 *   and exactly one more coup is dealt. A coup that ends on the card just before the cut
 *   card has not brought it out.
 *
 * Every shoe is reproducible from its seed (ADR-0004). Randomness comes only from the
 * seeded `Rng`.
 */

import { type Card, freshDeck } from "../../engine/cards";
import { createRng, shuffleInPlace } from "../../engine/rng";
import { type Shoe, deal } from "../../engine/shoe";
import { type Coup, playCoupFrom, pointValue } from "./coup";
import { type BaccaratRules, validateBaccaratRules } from "./rules";

export interface BaccaratShoe {
  readonly rules: BaccaratRules;
  /** The underlying engine shoe — seed, cards in dealt order, deal position, cut index. */
  readonly shoe: Shoe;
  /** The burn: the card turned face up, then the cards burned beneath it. */
  readonly burn: { readonly exposed: Card; readonly burned: readonly Card[] } | null;
  /** Coups dealt from this shoe, oldest first. Feeds the scoreboard roads. */
  readonly coups: readonly Coup[];
  /** Index into `coups` of the coup during which the cut card came out, if it has. */
  readonly cutCardCoup: number | null;
}

/** Builds and shuffles a new shoe, then performs the burn if the rules call for one. */
export function createBaccaratShoe(rules: BaccaratRules, seed: number): BaccaratShoe {
  const problems = validateBaccaratRules(rules);
  if (problems.length > 0) throw new Error(`Invalid baccarat rules: ${problems.join("; ")}`);

  const cards: Card[] = [];
  for (let i = 0; i < rules.decks; i++) cards.push(...freshDeck());
  shuffleInPlace(cards, createRng(seed));

  let shoe: Shoe = {
    seed,
    decks: rules.decks,
    cards,
    dealtCount: 0,
    cutIndex: cards.length - rules.cardsBehindCut,
  };

  let burn: BaccaratShoe["burn"] = null;
  if (rules.burn) {
    const first = deal(shoe);
    shoe = first.shoe;
    const count = pointValue(first.card.rank) || 10;
    const burned: Card[] = [];
    for (let i = 0; i < count; i++) {
      const next = deal(shoe);
      burned.push(next.card);
      shoe = next.shoe;
    }
    burn = { exposed: first.card, burned };
  }

  return { rules, shoe, burn, coups: [], cutCardCoup: null };
}

/** True when the cut card has come out during the current (just-finished) coup or earlier. */
export function isCutCardOut(state: BaccaratShoe): boolean {
  return state.cutCardCoup !== null;
}

/**
 * True when the shoe is finished: the cut card came out and the one extra coup after it
 * has been dealt. The caller starts a new shoe (new seed) from here.
 */
export function isShoeComplete(state: BaccaratShoe): boolean {
  return state.cutCardCoup !== null && state.coups.length >= state.cutCardCoup + 2;
}

/** True when the next coup is the last of the shoe ("last hand" call). */
export function isLastCoup(state: BaccaratShoe): boolean {
  return state.cutCardCoup !== null && !isShoeComplete(state);
}

export interface CoupDeal {
  readonly coup: Coup;
  readonly state: BaccaratShoe;
}

/** Deals one coup. Returns a new shoe state rather than mutating. */
export function dealCoup(state: BaccaratShoe): CoupDeal {
  if (isShoeComplete(state)) {
    throw new Error("Shoe complete: the coup after the cut card has been dealt. Start a new shoe.");
  }
  let shoe = state.shoe;
  const coup = playCoupFrom(() => {
    const next = deal(shoe);
    shoe = next.shoe;
    return next.card;
  });
  const coups = [...state.coups, coup];
  // The cut card comes out with card `cutIndex`, i.e. once more than `cutIndex` cards are dealt.
  const cutCardCoup =
    state.cutCardCoup ?? (shoe.dealtCount > shoe.cutIndex ? coups.length - 1 : null);
  return { coup, state: { ...state, shoe, coups, cutCardCoup } };
}

/** Deals every coup in the shoe. Handy for simulations and for filling a road. */
export function dealWholeShoe(state: BaccaratShoe): BaccaratShoe {
  let current = state;
  while (!isShoeComplete(current)) current = dealCoup(current).state;
  return current;
}
