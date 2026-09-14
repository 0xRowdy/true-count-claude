/**
 * Per-action Expected Value — the arithmetic behind every Explanation.
 *
 * Invariant 2 (CONTEXT.md): every wrong verdict carries an Explanation, and ADR-0005 says
 * what that Explanation holds — first among its contents, "the expected value of *each*
 * legal action for this exact hand, rule set, and count". This module produces those
 * numbers. They are the justification the user is shown, so they have to be right.
 *
 * ## How it works
 *
 * Everything is computed against the **remaining shoe composition**, never an infinite
 * deck. `remainingComposition` in `shoe.ts` supplies it. That single choice is what makes
 * the count's effect on a decision fall out of the arithmetic rather than being bolted on
 * afterwards: a ten-rich shoe *is* a composition with more tens in it, and the EV of
 * standing on 16 rises because the dealer busts more often, not because a table said so.
 *
 * The dealer's final-total probabilities come from recursive enumeration over that
 * composition, respecting `rules.dealerSoft17` and `rules.dealerPeek`. The player's side
 * is the same enumeration: draw every card that is left, weight it by how many of them
 * remain, and take the better of standing and drawing again.
 *
 * ## Sources
 *
 * `ev.test.ts` asserts this module cell by cell against two long-standing published
 * tables, the way `strategy.reference.ts` does for the chart (invariant 4):
 *
 *  1. **Wizard of Odds — "Blackjack Appendix 1: Expected Values for Infinite Deck"**:
 *     the expected return of standing, hitting, doubling and splitting every hand, under
 *     an infinite deck, dealer stands on soft 17, DAS, split to four hands, one card to
 *     split aces. https://wizardofodds.com/games/blackjack/appendix/1/
 *  2. **Wizard of Odds — "Blackjack Appendix 2A / 2B: Dealer Final Hand Probabilities"**,
 *     one through eight decks, S17 and H17. 2A is the U.S. game where the dealer has
 *     already peeked; 2B is the European game where the dealer has not.
 *     https://wizardofodds.com/games/blackjack/appendix/2a/
 *     https://wizardofodds.com/games/blackjack/appendix/2b/
 *
 * Appendix 1 is an infinite-deck table, which is exactly why it is the right yardstick
 * for the combinatorics: hand this module an effectively infinite composition and
 * depletion stops mattering, so a disagreement is a bug in the enumeration rather than a
 * difference of modelling. Appendix 2A/2B then pins down the finite-deck dealer play-out,
 * the peek conditioning and the no-peek blackjack probability at six decks.
 *
 * ## The one place this approximates
 *
 * The dealer's probabilities are worked out once, from the composition sitting in front
 * of the player when the decision is made. Cards the player then draws are removed from
 * the player's own draw pool — that part is exact, and it is where nearly all of the
 * composition sensitivity lives — but they are not removed a second time from the
 * dealer's. `dealerComposition: "after-each-draw"` turns that off and re-enumerates the
 * dealer at every node; measured across a six-deck shoe it moves an EV by at most 0.0022,
 * never changes which action wins, and costs ten to a hundred and fifty times the time —
 * 360ms for a pair of aces against an ace, against 2.9ms. That is why it is not the
 * default. `ev.test.ts` measures both the gap and the cost, so the size of the
 * approximation is a fact in CI rather than a claim in a comment.
 *
 * Pure and synchronous: no React, no I/O, no clock, no `Math.random()` (ADR-0002).
 */

import { type Card, type Rank, RANKS, isAce, rankValue } from "./cards";
import { type Action, type Hand, evaluate, isSplittablePair, legalActions } from "./hand";
import type { RuleSet } from "./rules";
import { type RankComposition, type Shoe, remainingComposition } from "./shoe";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * The expected value of each legal action, in units of the opening bet.
 *
 * Only actions `legalActions` offers are present. The Explanation panel shows exactly the
 * buttons the player had (invariant 7), so an EV for an action they were never offered
 * would be an explanation of a decision that did not exist.
 *
 * Values are net profit: 0 breaks even, -1 loses the opening bet outright. Doubling
 * stakes two units so it ranges over [-2, +2]; every other action ranges over [-1, +1].
 */
export type ActionEvs = Readonly<Partial<Record<Action, number>>>;

/** One action and its EV. `rankActions` returns these best first. */
export interface RankedAction {
  readonly action: Action;
  readonly ev: number;
}

/** The totals a dealer can stand on. Anything else is a bust. */
export type DealerTotal = 17 | 18 | 19 | 20 | 21;

export const DEALER_TOTALS: readonly DealerTotal[] = [17, 18, 19, 20, 21];

/**
 * What the dealer ends up with, as probabilities that sum to 1.
 *
 * The Explanation panel shows these beside the EVs: "standing was right because the
 * dealer busts 42% of the time with a 6 up" is the sentence a bare verdict never gives
 * the user (ADR-0005).
 *
 * In a peeking game with a ten or an ace showing, the dealer has already checked and does
 * not hold a natural, so `blackjack` is 0 and the rest is the distribution *given* that.
 * Conditioning is not an approximation here — it is what the peek does — and it is why
 * these numbers differ from the same dealer's odds in a no-peek game.
 */
export interface DealerOutcomes {
  /** Probability of each final standing total. */
  readonly totals: Readonly<Record<DealerTotal, number>>;
  readonly bust: number;
  /** Probability the dealer's first two cards are a natural. Zero once the dealer peeks. */
  readonly blackjack: number;
}

/**
 * How the dealer's probabilities respond to cards the player draws *after* this decision.
 * See "The one place this approximates" at the top of this file.
 *
 * - `"at-decision"` — worked out once, from the composition in front of the player. The
 *   default, and the one that is fast enough for a hint while the cards are still on
 *   screen (invariant 3).
 * - `"after-each-draw"` — re-enumerated after every card the player takes. Exact, slow.
 */
export type DealerCompositionModel = "at-decision" | "after-each-draw";

/** Everything the EV computation needs that a `Hand` does not carry itself. */
export interface EvContext {
  /** How many hands the player currently holds, for the resplit limit. Defaults to 1. */
  readonly handCount?: number;
  /** Defaults to unlimited, so an EV is not quietly changed by a short bankroll. */
  readonly bankroll?: number;
  /** Defaults to `"at-decision"`. */
  readonly dealerComposition?: DealerCompositionModel;
}

// ---------------------------------------------------------------------------
// Compositions
// ---------------------------------------------------------------------------

/** An undealt shoe: four of every rank per deck. The neutral count, as a composition. */
export function fullShoeComposition(decks: number): RankComposition {
  if (!Number.isInteger(decks) || decks < 1) {
    throw new Error(`fullShoeComposition needs a positive integer deck count, got ${decks}.`);
  }
  return Object.fromEntries(RANKS.map((rank) => [rank, decks * 4])) as Record<Rank, number>;
}

/**
 * The cards the player cannot see: everything still in the shoe, plus the dealer's hole
 * card and anything else dealt face down.
 *
 * This is the composition an EV wants. `remainingComposition(shoe)` alone is one card
 * short during a live round, because the hole card has left the shoe but nobody has seen
 * it — name it here and the pool is whole again. That leaks nothing: the hole card goes
 * back into the *pool the dealer draws from*, it is never treated as known.
 */
export function unseenComposition(shoe: Shoe, hiddenCards: readonly Card[] = []): RankComposition {
  const counts = { ...remainingComposition(shoe) } as Record<Rank, number>;
  for (const card of hiddenCards) counts[card.rank]++;
  return counts;
}

/** A composition with cards taken out of it — the player's own cards, or the upcard. */
export function compositionWithout(
  composition: RankComposition,
  cards: readonly Card[],
): RankComposition {
  const counts = { ...composition } as Record<Rank, number>;
  for (const card of cards) {
    if (counts[card.rank] <= 0) {
      throw new Error(`Cannot remove a ${card.rank} from a composition that holds none of them.`);
    }
    counts[card.rank]--;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Slots — the ten distinct card values
// ---------------------------------------------------------------------------

/**
 * EV arithmetic only ever cares what a card is worth, so the thirteen ranks collapse into
 * ten "slots": slot 0 is the ace, slots 1-8 are 2 through 9, and slot 9 holds every
 * ten-ranked card. Four ranks share slot 9, which is precisely why a ten arrives four
 * times as often as anything else.
 */
const SLOTS = 10;
const ACE_SLOT = 0;
const TEN_SLOT = 9;

function slotOf(rank: Rank): number {
  return isAce(rank) ? ACE_SLOT : rankValue(rank) - 1;
}

/** The composition as slot counts. Throws rather than quietly computing against nonsense. */
function toSlotCounts(composition: RankComposition): number[] {
  const counts = new Array<number>(SLOTS).fill(0);
  let total = 0;
  for (const rank of RANKS) {
    const held = composition[rank];
    if (!Number.isFinite(held) || held < 0) {
      throw new Error(`Composition holds an impossible number of ${rank}s: ${held}.`);
    }
    counts[slotOf(rank)] = (counts[slotOf(rank)] ?? 0) + held;
    total += held;
  }
  if (total <= 0) {
    throw new Error("Cannot compute an EV against an empty composition — no cards are left.");
  }
  return counts;
}

/** A hand's total, and whether an ace in it is still counted as 11. */
interface Total {
  readonly total: number;
  readonly soft: boolean;
}

/**
 * Adds one card to a running total, mirroring `evaluate` in `hand.ts` a card at a time.
 *
 * `evaluate` demotes aces after the fact, from the whole hand; this has to reach the same
 * answer incrementally, so it demotes as it goes. The case worth spelling out: an ace
 * drawn to an already-soft hand counts 1, because two aces counted 11 always bust.
 * `ev.test.ts` asserts the two agree across every three- and four-card hand there is.
 */
function addCard(current: Total, slot: number): Total {
  const value = slot === ACE_SLOT ? (current.soft ? 1 : 11) : slot + 1;
  let total = current.total + value;
  let soft = current.soft || slot === ACE_SLOT;
  if (total > 21 && soft) {
    total -= 10;
    soft = false;
  }
  return { total, soft };
}

// ---------------------------------------------------------------------------
// The solver
// ---------------------------------------------------------------------------

/** The dealer's final total as probabilities. Named fields, because six of them fit. */
interface DealerVector {
  readonly p17: number;
  readonly p18: number;
  readonly p19: number;
  readonly p20: number;
  readonly p21: number;
  readonly bust: number;
  /** Probability the dealer's two cards are a natural. The other six exclude it. */
  readonly natural: number;
}

const NO_NATURAL = { natural: 0 } as const;
const BUSTED: DealerVector = { p17: 0, p18: 0, p19: 0, p20: 0, p21: 0, bust: 1, ...NO_NATURAL };

/**
 * A dealer who has stopped on `total`, with nothing left to chance. Built once for each of
 * the five standing totals: these are the leaves of every dealer enumeration, so there are
 * a great many of them and none of them differ.
 */
const STANDS_ON: Readonly<Record<DealerTotal, DealerVector>> = {
  17: { p17: 1, p18: 0, p19: 0, p20: 0, p21: 0, bust: 0, ...NO_NATURAL },
  18: { p17: 0, p18: 1, p19: 0, p20: 0, p21: 0, bust: 0, ...NO_NATURAL },
  19: { p17: 0, p18: 0, p19: 1, p20: 0, p21: 0, bust: 0, ...NO_NATURAL },
  20: { p17: 0, p18: 0, p19: 0, p20: 1, p21: 0, bust: 0, ...NO_NATURAL },
  21: { p17: 0, p18: 0, p19: 0, p20: 0, p21: 1, bust: 0, ...NO_NATURAL },
};

/** +1 when the player's total beats the dealer's, 0 on a push, -1 on a loss. */
function settle(playerTotal: number, dealerTotal: number): number {
  return playerTotal > dealerTotal ? 1 : playerTotal === dealerTotal ? 0 : -1;
}

/** The EV of standing on `total`, in the world where the dealer has no natural. */
function standAgainst(dealer: DealerVector, total: number): number {
  return (
    dealer.bust +
    dealer.p17 * settle(total, 17) +
    dealer.p18 * settle(total, 18) +
    dealer.p19 * settle(total, 19) +
    dealer.p20 * settle(total, 20) +
    dealer.p21 * settle(total, 21)
  );
}

/**
 * One EV computation, over one composition, against one upcard.
 *
 * The composition is held as a mutable array of slot counts that every branch draws from
 * and puts back, so recursion of any depth costs a decrement rather than a copied array.
 * The mutation never escapes — every path restores what it took — so from the outside the
 * solver is indistinguishable from a pure function (ADR-0002).
 */
function createSolver(
  composition: RankComposition,
  upcard: Card,
  rules: RuleSet,
  model: DealerCompositionModel,
) {
  const counts = toSlotCounts(composition);
  let remaining = counts.reduce((sum, held) => sum + held, 0);
  /** How many of each slot the branch being explored has taken. Never more than a hand. */
  const drawn = new Array<number>(SLOTS).fill(0);
  const dealerCache = new Map<string, DealerVector>();
  const playerCache = new Map<string, number>();

  const hitsSoft17 = rules.dealerSoft17 === "hit";
  const upSlot = slotOf(upcard.rank);
  const upcardTotal: Total =
    upSlot === ACE_SLOT ? { total: 11, soft: true } : { total: upSlot + 1, soft: false };
  /** The hole card that would make this upcard a natural, or -1 when none can. */
  const naturalSlot = upSlot === ACE_SLOT ? TEN_SLOT : upSlot === TEN_SLOT ? ACE_SLOT : -1;
  const peeks = rules.dealerPeek && naturalSlot >= 0;

  /**
   * The cards this branch has taken, as a memo key. Two branches that took the same
   * multiset in a different order face an identical shoe, and this is what lets them share
   * an answer — the difference between enumerating a few hundred states and a few million.
   *
   * Keyed on what was *taken* rather than on what is left, because a branch can never take
   * more cards than fit in a hand and `String.fromCharCode` silently truncates above
   * 0xFFFF. An eight-deck shoe holds 128 tens; a branch never takes more than a few dozen.
   */
  function shoeKey(): string {
    return String.fromCharCode(...drawn);
  }

  function take(slot: number): void {
    counts[slot] = (counts[slot] ?? 0) - 1;
    drawn[slot] = (drawn[slot] ?? 0) + 1;
    remaining--;
  }

  function give(slot: number): void {
    counts[slot] = (counts[slot] ?? 0) + 1;
    drawn[slot] = (drawn[slot] ?? 0) - 1;
    remaining++;
  }

  // --- the dealer --------------------------------------------------------------------

  /**
   * The dealer's final total, starting from a known hand of two or more cards.
   *
   * This is `round.ts`'s drawing rule — draw below 17, and draw a soft 17 only under H17 —
   * applied to every card the composition still holds.
   */
  function playOutDealer(hand: Total): DealerVector {
    if (hand.total > 21) return BUSTED;
    if (hand.total > 17 || (hand.total === 17 && !(hand.soft && hitsSoft17))) {
      return STANDS_ON[hand.total as DealerTotal];
    }

    const cacheKey = `${hand.total}${hand.soft ? "s" : "h"}${shoeKey()}`;
    const cached = dealerCache.get(cacheKey);
    if (cached) return cached;

    let p17 = 0;
    let p18 = 0;
    let p19 = 0;
    let p20 = 0;
    let p21 = 0;
    let bust = 0;
    for (let slot = 0; slot < SLOTS; slot++) {
      const held = counts[slot] ?? 0;
      if (held === 0) continue;
      const chance = held / remaining;
      take(slot);
      const sub = playOutDealer(addCard(hand, slot));
      give(slot);
      p17 += chance * sub.p17;
      p18 += chance * sub.p18;
      p19 += chance * sub.p19;
      p20 += chance * sub.p20;
      p21 += chance * sub.p21;
      bust += chance * sub.bust;
    }

    const vector: DealerVector = { p17, p18, p19, p20, p21, bust, ...NO_NATURAL };
    dealerCache.set(cacheKey, vector);
    return vector;
  }

  /** Held once the dealer's odds are pinned at the decision point. */
  let pinned: DealerVector | null = null;

  /**
   * The dealer's odds from the upcard alone.
   *
   * The hole card is enumerated *here*, inside the dealer, which is the whole reason this
   * function exists. Enumerate it any further out and the player's own max(stand, hit)
   * would be choosing with knowledge of a card nobody has turned over — an EV that would
   * read beautifully and be a lie.
   *
   * The six totals are normalised over the world in which the dealer has no natural, with
   * that natural's own probability carried alongside in `natural`.
   */
  function dealerVector(): DealerVector {
    if (pinned) return pinned;
    const cacheKey = `up${shoeKey()}`;
    const cached = dealerCache.get(cacheKey);
    if (cached) return cached;

    let p17 = 0;
    let p18 = 0;
    let p19 = 0;
    let p20 = 0;
    let p21 = 0;
    let bust = 0;
    let natural = 0;
    for (let slot = 0; slot < SLOTS; slot++) {
      const held = counts[slot] ?? 0;
      if (held === 0) continue;
      const chance = held / remaining;
      if (slot === naturalSlot) {
        natural += chance;
        continue;
      }
      take(slot);
      const sub = playOutDealer(addCard(upcardTotal, slot));
      give(slot);
      p17 += chance * sub.p17;
      p18 += chance * sub.p18;
      p19 += chance * sub.p19;
      p20 += chance * sub.p20;
      p21 += chance * sub.p21;
      bust += chance * sub.bust;
    }
    if (natural >= 1) {
      throw new Error("Every unseen card would give the dealer a natural; that shoe cannot exist.");
    }

    const scale = 1 / (1 - natural);
    const vector: DealerVector = {
      p17: p17 * scale,
      p18: p18 * scale,
      p19: p19 * scale,
      p20: p20 * scale,
      p21: p21 * scale,
      bust: bust * scale,
      natural,
    };
    dealerCache.set(cacheKey, vector);
    if (model === "at-decision") pinned = vector;
    return vector;
  }

  // --- the player --------------------------------------------------------------------

  function standEv(total: number): number {
    return standAgainst(dealerVector(), total);
  }

  /**
   * The EV of taking one more card and then playing on as well as possible.
   *
   * "As well as possible" is the better of standing and drawing again: doubling and
   * splitting are first-decision actions, so they are off the table once a third card has
   * landed. A total of 21 never draws — hard 21 can only bust, and drawing to a soft 21
   * can only turn a certain 21 into something smaller.
   */
  function hitEv(hand: Total): number {
    const cacheKey = `${hand.total}${hand.soft ? "s" : "h"}${shoeKey()}`;
    const cached = playerCache.get(cacheKey);
    if (cached !== undefined) return cached;

    let ev = 0;
    for (let slot = 0; slot < SLOTS; slot++) {
      const held = counts[slot] ?? 0;
      if (held === 0) continue;
      const chance = held / remaining;
      take(slot);
      const drawn = addCard(hand, slot);
      let value: number;
      if (drawn.total > 21) value = -1;
      else {
        const stand = standEv(drawn.total);
        value = drawn.total >= 21 ? stand : Math.max(stand, hitEv(drawn));
      }
      give(slot);
      ev += chance * value;
    }

    playerCache.set(cacheKey, ev);
    return ev;
  }

  /** Two units on exactly one more card, and no decision after it. */
  function doubleEv(hand: Total): number {
    let ev = 0;
    for (let slot = 0; slot < SLOTS; slot++) {
      const held = counts[slot] ?? 0;
      if (held === 0) continue;
      const chance = held / remaining;
      take(slot);
      const drawn = addCard(hand, slot);
      const value = drawn.total > 21 ? -2 : 2 * standEv(drawn.total);
      give(slot);
      ev += chance * value;
    }
    return ev;
  }

  /** Mirrors `allowsDouble` in `hand.ts`, which `legalActions` has already applied. */
  function allowsDouble(total: number): boolean {
    switch (rules.doubleRule) {
      case "any":
        return true;
      case "9-11":
        return total >= 9 && total <= 11;
      case "10-11":
        return total >= 10 && total <= 11;
    }
  }

  /**
   * The EV of splitting a pair, summed over every hand the split ends up producing, in
   * units of the *opening* bet. Each hand carries its own bet, so two hands that both win
   * is +2.
   *
   * Two steps. First: what one post-split hand is worth for each possible second card,
   * played under the post-split rules — no natural (a split ten and ace is 21, not
   * blackjack), doubling only where `doubleAfterSplit` allows it, and split aces frozen
   * after their one card when `oneCardToSplitAces`.
   *
   * Second: the resplit walk. A slot is one half of a split, holding a single card. It
   * draws; if it drew the pair rank again and the table still allows another hand, the
   * player takes whichever is worth more — playing the new pair as a hand, or splitting it
   * into two fresh slots. That is `round.ts`'s left-to-right, insert-in-place resolution,
   * counted rather than dealt.
   *
   * The walk uses the draw probabilities from the decision point rather than re-deriving
   * them as each slot draws: a second-order effect on a second-order term. Against
   * Appendix 1, whose infinite deck makes the walk exact, every cell the published chart
   * actually splits agrees to better than 0.0005.
   */
  function splitEv(pairSlot: number): number {
    const splittingAces = pairSlot === ACE_SLOT;
    const frozen = splittingAces && rules.oneCardToSplitAces;
    const pairCard: Total =
      splittingAces ? { total: 11, soft: true } : { total: pairSlot + 1, soft: false };

    const handEv = new Array<number>(SLOTS).fill(0);
    const chance = new Array<number>(SLOTS).fill(0);
    for (let slot = 0; slot < SLOTS; slot++) {
      const held = counts[slot] ?? 0;
      if (held === 0) continue;
      chance[slot] = held / remaining;
      take(slot);
      const hand = addCard(pairCard, slot);
      if (frozen) handEv[slot] = standEv(hand.total);
      else {
        let best = Math.max(standEv(hand.total), hitEv(hand));
        if (rules.doubleAfterSplit && allowsDouble(hand.total)) {
          best = Math.max(best, doubleEv(hand));
        }
        handEv[slot] = best;
      }
      give(slot);
    }

    // Split aces resplit only where the table says so, and a frozen split ace never gets
    // the chance — it is already holding the only card it will ever get.
    const mayResplit = !splittingAces || (rules.resplitAces && !frozen);
    const walked = new Map<string, number>();

    /** `pending` slots still to draw, with `hands` hands already on the table. */
    function walk(pending: number, hands: number): number {
      if (pending === 0) return 0;
      const cacheKey = `${pending}:${hands}`;
      const cached = walked.get(cacheKey);
      if (cached !== undefined) return cached;

      const playedOut = walk(pending - 1, hands);
      // A resplit turns this one slot into two: one more hand, one more slot to draw.
      const resplit =
        mayResplit && hands < rules.maxSplitHands ? walk(pending + 1, hands + 1) : -Infinity;

      let ev = 0;
      for (let slot = 0; slot < SLOTS; slot++) {
        const drawChance = chance[slot] ?? 0;
        if (drawChance === 0) continue;
        const asOneHand = (handEv[slot] ?? 0) + playedOut;
        ev += drawChance * (slot === pairSlot && resplit > asOneHand ? resplit : asOneHand);
      }

      walked.set(cacheKey, ev);
      return ev;
    }

    return walk(2, 2);
  }

  // Pin the dealer's odds to the composition the decision is actually being made at, now,
  // before anything has taken a card. Left to the first lookup instead, they would be
  // pinned to whatever shoe that lookup happened to reach — and the first lookup is often
  // a stand deep inside the hit recursion, several cards down.
  if (model === "at-decision") pinned = dealerVector();

  return { peeks, dealerVector, standEv, hitEv, doubleEv, splitEv };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * The dealer's final-total probabilities against this upcard and this composition.
 *
 * `composition` is the unseen pack — every card except the player's own and the upcard
 * itself. The hole card is one of those unseen cards, and is enumerated here.
 */
export function dealerOutcomes(
  upcard: Card,
  rules: RuleSet,
  composition: RankComposition,
): DealerOutcomes {
  const solver = createSolver(composition, upcard, rules, "at-decision");
  const vector = solver.dealerVector();
  // The solver normalises over the no-natural world; a caller wants probabilities that
  // sum to one across every way the hand can end, naturals included.
  const blackjack = solver.peeks ? 0 : vector.natural;
  const scale = 1 - blackjack;
  return {
    totals: {
      17: vector.p17 * scale,
      18: vector.p18 * scale,
      19: vector.p19 * scale,
      20: vector.p20 * scale,
      21: vector.p21 * scale,
    },
    bust: vector.bust * scale,
    blackjack,
  };
}

/**
 * The expected value of every action the player may legally take.
 *
 * `composition` is the composition of the cards the player has not seen: the undealt shoe
 * plus the dealer's hole card, with the player's own cards and the dealer's upcard taken
 * out. `unseenComposition` builds it from a `Shoe`.
 *
 * Only legal actions appear, and the set is exactly `legalActions` — the same single
 * source of truth the buttons are drawn from (invariant 7). A hand with nothing left to
 * decide (busted, a natural, a split ace holding its one card) returns an empty record.
 *
 * `rules.blackjackPayout` deliberately appears nowhere below. A hand with a decision in
 * front of it is not a natural, so 3:2 against 6:5 cannot reach any of these numbers: it
 * changes what a *shoe* is worth, not what a hand is worth.
 */
export function actionEvs(
  hand: Hand,
  dealerUpcard: Card,
  rules: RuleSet,
  composition: RankComposition,
  context: EvContext = {},
): ActionEvs {
  const legal = legalActions({
    hand,
    rules,
    handCount: context.handCount ?? 1,
    bankroll: context.bankroll ?? Number.POSITIVE_INFINITY,
  });
  if (legal.length === 0) return {};

  const solver = createSolver(
    composition,
    dealerUpcard,
    rules,
    context.dealerComposition ?? "at-decision",
  );
  const value = evaluate(hand.cards);
  const start: Total = { total: value.total, soft: value.soft };

  // In a no-peek game the dealer can still turn over a natural. The player loses only the
  // opening bet when that happens — `round.ts` settles original bets only, so the second
  // half of a double and every hand beyond the first come back — which is a flat -1 laid
  // across every action alike. Early surrender is the exception the rule exists for: it
  // is taken *before* the dealer ever looks.
  const natural = solver.peeks ? 0 : solver.dealerVector().natural;
  const blend = (ev: number) => (1 - natural) * ev + natural * -1;

  const evs: Partial<Record<Action, number>> = {};
  for (const action of legal) {
    switch (action) {
      case "stand":
        evs.stand = blend(solver.standEv(value.total));
        break;
      case "hit":
        evs.hit = blend(solver.hitEv(start));
        break;
      case "double":
        evs.double = blend(solver.doubleEv(start));
        break;
      case "split":
        evs.split = blend(solver.splitEv(pairSlotOf(hand)));
        break;
      case "surrender":
        evs.surrender = rules.surrender === "early" ? -0.5 : blend(-0.5);
        break;
    }
  }
  return evs;
}

/**
 * Tie-break order, least money at risk first.
 *
 * Exact ties are vanishingly rare against a real composition, but "vanishingly rare" is
 * not "never", and a verdict that flipped between two runs of the same hand would be
 * exactly the kind of trust bug this engine exists to prevent. Ordering them costs
 * nothing; leaving them to whatever order the actions happen to arrive in does not.
 */
const TIE_BREAK: readonly Action[] = ["stand", "hit", "surrender", "double", "split"];

/** Every action that has an EV, best first. The Explanation panel's ordering. */
export function rankActions(evs: ActionEvs): RankedAction[] {
  const ranked: RankedAction[] = [];
  for (const action of TIE_BREAK) {
    const ev = evs[action];
    if (ev !== undefined) ranked.push({ action, ev });
  }
  return ranked.sort((a, b) => b.ev - a.ev);
}

/**
 * The highest-EV action — the verdict a Decision is graded against.
 *
 * At a neutral count this agrees with `basicStrategy` across the whole chart. That is
 * asserted in `ev.test.ts` for every rule set the reference tables cover, and a
 * disagreement is a bug in one of the two modules.
 */
export function bestAction(evs: ActionEvs): Action {
  const [best] = rankActions(evs);
  if (!best) {
    throw new Error("bestAction needs at least one action, and this hand had no legal ones.");
  }
  return best.action;
}

/**
 * What a choice cost against the best play available, as a non-negative number of bets.
 *
 * This is the headline of an Explanation. Not "wrong", but "this costs 0.043 bets every
 * time you play it" (ADR-0005). Zero means the choice *was* the best play.
 */
export function evLoss(evs: ActionEvs, action: Action): number {
  const chosen = evs[action];
  if (chosen === undefined) {
    throw new Error(`No EV for "${action}" — it was not legal for this hand.`);
  }
  const best = evs[bestAction(evs)];
  return Math.max(0, (best ?? chosen) - chosen);
}

/** A pair's slot. Every ten-ranked pair shares one, which is what makes K,Q a pair. */
function pairSlotOf(hand: Hand): number {
  const first = hand.cards[0];
  if (!first || !isSplittablePair(hand)) {
    throw new Error("Split EV was asked for a hand that is not a splittable pair.");
  }
  return slotOf(first.rank);
}
