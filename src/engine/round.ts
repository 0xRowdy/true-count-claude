/**
 * The round lifecycle — deal, insurance, player actions, dealer play, settlement.
 *
 * This is the spine of Play and of every Drill. It is a pure, synchronous state machine:
 * every transition returns a new `RoundState` and the only randomness is the `Shoe` handed
 * in (ADR-0002, ADR-0004). The state *is* the replay format, so a seed plus the recorded
 * `actionLog` reproduces a round exactly — which is what makes a bug report a complete repro
 * and the Shoe Integrity Panel's history real rather than decorative.
 *
 * `legalActions` from `hand.ts` is the single source of truth for what the player may do;
 * nothing here re-derives it (invariant 7).
 */

import { type Card, isAce, isTen } from "./cards";
import { type Action, type Hand, createHand, evaluate, isBlackjack, legalActions } from "./hand";
import type { BlackjackPayout, RuleSet } from "./rules";
import { type Shoe, deal } from "./shoe";

/**
 * The phases a caller can actually observe. Dealer play is not among them: it needs no
 * input, so it runs to completion inside the transition that triggers it and the round
 * surfaces as `settled`.
 */
export type RoundPhase = "insurance" | "player" | "settled";

/** Everything the player may do in a round: a hand `Action`, plus the insurance decision. */
export type RoundAction =
  | { readonly type: "hit" }
  | { readonly type: "stand" }
  | { readonly type: "double" }
  | { readonly type: "split" }
  | { readonly type: "surrender" }
  | { readonly type: "insurance"; readonly take: boolean };

export interface Insurance {
  /** True while the player still owes an insurance decision. */
  readonly offered: boolean;
  readonly taken: boolean;
  /** The side bet placed, or 0 when declined or never offered. */
  readonly bet: number;
  /** Chips returned by the side bet, stake included. Zero until the round settles. */
  readonly returned: number;
}

export type HandResult = "blackjack" | "win" | "push" | "lose" | "bust" | "surrender";

export interface HandOutcome {
  readonly handIndex: number;
  readonly result: HandResult;
  /** Total staked on the hand — the bet, doubled when the player doubled. */
  readonly wagered: number;
  /** Chips returned to the bankroll, stake included. */
  readonly returned: number;
  /** Profit or loss: `returned - wagered`. */
  readonly net: number;
}

export interface RoundSettlement {
  /** One outcome per player hand, in the order the hands sit on the table. */
  readonly outcomes: readonly HandOutcome[];
  /** Profit or loss on the insurance side bet. */
  readonly insuranceNet: number;
  /** Profit or loss across every hand and insurance. */
  readonly net: number;
}

export interface RoundState {
  readonly rules: RuleSet;
  readonly shoe: Shoe;
  /** The opening wager. Split hands each carry a copy of it. */
  readonly bet: number;
  /** Chips not at risk. Stakes leave as they are placed and come back at settlement. */
  readonly bankroll: number;
  /** The player's hands, left to right. Splitting inserts in place; it never appends. */
  readonly playerHands: readonly Hand[];
  readonly activeHandIndex: number;
  /** `cards[0]` is the upcard, `cards[1]` the hole card. */
  readonly dealerHand: Hand;
  readonly dealerHoleCardRevealed: boolean;
  readonly insurance: Insurance;
  readonly phase: RoundPhase;
  /** Every action applied, in order. This plus the shoe's seed is a complete replay. */
  readonly actionLog: readonly RoundAction[];
  readonly settlement: RoundSettlement | null;
}

export interface StartRoundOptions {
  readonly rules: RuleSet;
  readonly shoe: Shoe;
  /** The wager on the opening hand. */
  readonly bet: number;
  /** Chips available before the bet is placed. */
  readonly bankroll: number;
}

/**
 * Deals a round: player, dealer up, player, dealer hole — the order cards leave a real
 * shoe, which matters because the Running Count is a function of that order.
 *
 * Returns a state that is already waiting on the player: any insurance offer and the
 * dealer's peek have happened, and a round the player cannot act in is already settled.
 */
export function startRound(options: StartRoundOptions): RoundState {
  const { rules, shoe, bet, bankroll } = options;

  if (bet < rules.minBet || bet > rules.maxBet) {
    throw new Error(`Bet ${bet} is outside the table limits of ${rules.minBet}-${rules.maxBet}.`);
  }
  if (bet > bankroll) {
    throw new Error(`Bet ${bet} exceeds the bankroll of ${bankroll}.`);
  }

  const playerFirst = deal(shoe);
  const dealerUp = deal(playerFirst.shoe);
  const playerSecond = deal(dealerUp.shoe);
  const dealerHole = deal(playerSecond.shoe);

  const dealt: RoundState = {
    rules,
    shoe: dealerHole.shoe,
    bet,
    bankroll: bankroll - bet,
    playerHands: [createHand([playerFirst.card, playerSecond.card], bet)],
    activeHandIndex: 0,
    dealerHand: createHand([dealerUp.card, dealerHole.card], 0),
    dealerHoleCardRevealed: false,
    insurance: { offered: false, taken: false, bet: 0, returned: 0 },
    phase: "player",
    actionLog: [],
    settlement: null,
  };

  // Insurance is offered on an ace upcard, and it is offered *before* the dealer peeks —
  // that ordering is the whole point of the bet.
  if (isAce(dealerUpcard(dealt).rank) && dealt.bankroll >= insuranceStake(bet)) {
    return { ...dealt, phase: "insurance", insurance: { ...dealt.insurance, offered: true } };
  }
  return openPlay(dealt);
}

/**
 * Applies one action, returning a new state. Throws on anything the round does not permit,
 * rather than silently ignoring it: a swallowed action would desynchronise a replay.
 */
export function applyAction(state: RoundState, action: RoundAction): RoundState {
  if (state.phase === "settled") {
    throw new Error(`Cannot apply "${action.type}": the round has already settled.`);
  }

  const next =
    action.type === "insurance"
      ? applyInsurance(state, action.take)
      : applyPlay(state, action.type);

  return { ...next, actionLog: [...state.actionLog, action] };
}

/**
 * Replays a recorded round. Given the same options — critically, a shoe rebuilt from its
 * seed — this reproduces the original final state exactly (ADR-0004).
 */
export function replayRound(
  options: StartRoundOptions,
  actions: readonly RoundAction[],
): RoundState {
  let state = startRound(options);
  for (const action of actions) state = applyAction(state, action);
  return state;
}

/**
 * Every action the player may take on the hand in front of them. The UI renders exactly
 * this set and greys out none of it (invariant 7). Insurance is not here — it is a separate
 * decision, signalled by `phase === "insurance"`.
 */
export function currentLegalActions(state: RoundState): Action[] {
  if (state.phase !== "player") return [];
  return legalActionsFor(state, state.activeHandIndex);
}

/** The hand the player is acting on, or null when the round is not awaiting a hand action. */
export function activeHand(state: RoundState): Hand | null {
  if (state.phase !== "player") return null;
  return state.playerHands[state.activeHandIndex] ?? null;
}

/** The dealer's face-up card. */
export function dealerUpcard(state: RoundState): Card {
  const upcard = state.dealerHand.cards[0];
  if (!upcard) throw new Error("Round state has no dealer upcard; it was never dealt.");
  return upcard;
}

/**
 * The dealer cards the player can see. The hole card stays hidden until it is turned up,
 * so a counting system fed from this never counts a card the player has not seen.
 */
export function visibleDealerCards(state: RoundState): readonly Card[] {
  return state.dealerHoleCardRevealed ? state.dealerHand.cards : state.dealerHand.cards.slice(0, 1);
}

export function isRoundOver(state: RoundState): boolean {
  return state.phase === "settled";
}

/** The insurance stake: half the opening bet, as at every table that offers it. */
export function insuranceStake(bet: number): number {
  return bet / 2;
}

// --- Transitions -------------------------------------------------------------------------

function applyInsurance(state: RoundState, take: boolean): RoundState {
  if (state.phase !== "insurance") {
    throw new Error(`Insurance is not on offer during the "${state.phase}" phase.`);
  }

  const stake = take ? insuranceStake(state.bet) : 0;
  return openPlay({
    ...state,
    bankroll: state.bankroll - stake,
    insurance: { offered: false, taken: take, bet: stake, returned: 0 },
  });
}

/**
 * Opens the player's turn, once any insurance decision is settled.
 *
 * The peek comes first: with a ten or an ace showing the dealer checks the hole card before
 * anyone acts, so a natural ends the round right there and no further cards leave the shoe.
 */
function openPlay(state: RoundState): RoundState {
  const upcard = dealerUpcard(state);
  const peeks = state.rules.dealerPeek && (isTen(upcard.rank) || isAce(upcard.rank));

  if (peeks && isBlackjack(state.dealerHand)) {
    return settle({ ...state, phase: "player", dealerHoleCardRevealed: true });
  }
  return advance({ ...state, phase: "player" }, 0);
}

function applyPlay(state: RoundState, action: Action): RoundState {
  if (state.phase !== "player") {
    throw new Error(`Cannot ${action}: the round is in the "${state.phase}" phase.`);
  }

  const legal = currentLegalActions(state);
  if (!legal.includes(action)) {
    throw new Error(
      `Illegal action "${action}" on hand ${state.activeHandIndex}. ` +
        `Legal actions: ${legal.length > 0 ? legal.join(", ") : "none"}.`,
    );
  }

  const index = state.activeHandIndex;
  switch (action) {
    case "hit":
      return advance(hit(state), index);
    // Standing is the one action that leaves the hand able to act; the round moves past it
    // explicitly rather than by re-asking `legalActions`.
    case "stand":
      return advance(state, index + 1);
    case "double":
      return advance(double(state), index);
    case "surrender":
      return advance(surrender(state), index);
    // A split leaves the player on the same hand — the left half of the pair.
    case "split":
      return advance(split(state), index);
  }
}

function hit(state: RoundState): RoundState {
  const hand = requireActiveHand(state);
  const drawn = deal(state.shoe);
  return {
    ...state,
    shoe: drawn.shoe,
    playerHands: withHand(state, state.activeHandIndex, {
      ...hand,
      cards: [...hand.cards, drawn.card],
    }),
  };
}

function double(state: RoundState): RoundState {
  const hand = requireActiveHand(state);
  const drawn = deal(state.shoe);
  return {
    ...state,
    shoe: drawn.shoe,
    bankroll: state.bankroll - hand.bet,
    playerHands: withHand(state, state.activeHandIndex, {
      ...hand,
      cards: [...hand.cards, drawn.card],
      doubled: true,
    }),
  };
}

function surrender(state: RoundState): RoundState {
  const hand = requireActiveHand(state);
  // No card is drawn and no extra chips are staked; half the bet comes back at settlement.
  return {
    ...state,
    playerHands: withHand(state, state.activeHandIndex, { ...hand, surrendered: true }),
  };
}

function split(state: RoundState): RoundState {
  const index = state.activeHandIndex;
  const hand = requireActiveHand(state);
  const [first, second] = hand.cards;
  if (!first || !second) {
    throw new Error(`Cannot split a hand of ${hand.cards.length} cards.`);
  }

  // Both halves draw immediately, left half first, so every hand always holds two cards
  // and `legalActions` stays the single source of truth without special-casing.
  const toLeft = deal(state.shoe);
  const toRight = deal(toLeft.shoe);

  // The new hand is inserted immediately after the hand it came from — never appended.
  // Appending is the ordering bug the incumbent shipped: a resplit's sibling would then be
  // played, and settled, after hands that sit to its right on the table.
  const playerHands = [
    ...state.playerHands.slice(0, index),
    createHand([first, toLeft.card], hand.bet, true),
    createHand([second, toRight.card], hand.bet, true),
    ...state.playerHands.slice(index + 1),
  ];

  return { ...state, shoe: toRight.shoe, playerHands, bankroll: state.bankroll - hand.bet };
}

/**
 * Moves the round forward through every step that needs no player input: skipping hands
 * with nothing left to decide, playing the dealer out, and settling.
 *
 * `fromIndex` is where to start looking for the next hand that can act. Hands are always
 * visited left to right and never revisited, which is the resolution order a table uses.
 */
function advance(state: RoundState, fromIndex: number): RoundState {
  for (let index = fromIndex; index < state.playerHands.length; index++) {
    if (legalActionsFor(state, index).length > 0) {
      return index === state.activeHandIndex ? state : { ...state, activeHandIndex: index };
    }
  }

  return playDealer({ ...state, activeHandIndex: Math.max(0, state.playerHands.length - 1) });
}

function playDealer(state: RoundState): RoundState {
  let dealerHand = state.dealerHand;
  let shoe = state.shoe;

  if (dealerDraws(state)) {
    while (dealerMustHit(dealerHand, state.rules)) {
      const drawn = deal(shoe);
      shoe = drawn.shoe;
      dealerHand = { ...dealerHand, cards: [...dealerHand.cards, drawn.card] };
    }
  }

  return settle({ ...state, shoe, dealerHand, dealerHoleCardRevealed: true });
}

/**
 * The dealer draws only while a hand can still be beaten. If every hand has busted,
 * surrendered, or is a natural the dealer turns the hole card up and stops — drawing anyway
 * would pull cards that never leave a real shoe, corrupting both the Running Count and the
 * remaining composition the Shoe Integrity Panel shows the user.
 */
function dealerDraws(state: RoundState): boolean {
  if (isBlackjack(state.dealerHand)) return false;
  return state.playerHands.some(
    (hand) => !hand.surrendered && !isBlackjack(hand) && !evaluate(hand.cards).busted,
  );
}

function dealerMustHit(hand: Hand, rules: RuleSet): boolean {
  const value = evaluate(hand.cards);
  if (value.total < 17) return true;
  return value.total === 17 && value.soft && rules.dealerSoft17 === "hit";
}

// --- Settlement --------------------------------------------------------------------------

function settle(state: RoundState): RoundState {
  const outcomes = state.playerHands.map((hand, handIndex) =>
    settleHand(hand, handIndex, state.dealerHand, state.rules),
  );

  // Insurance pays 2:1 and is settled the moment the hole card is known — immediately after
  // the peek in a peek game, at dealer play in a no-peek one.
  const insuranceReturned = isBlackjack(state.dealerHand) ? state.insurance.bet * 3 : 0;
  const insuranceNet = insuranceReturned - state.insurance.bet;

  const returned = outcomes.reduce((total, outcome) => total + outcome.returned, 0);
  const net = outcomes.reduce((total, outcome) => total + outcome.net, 0) + insuranceNet;

  return {
    ...state,
    phase: "settled",
    dealerHoleCardRevealed: true,
    insurance: { ...state.insurance, offered: false, returned: insuranceReturned },
    bankroll: state.bankroll + returned + insuranceReturned,
    settlement: { outcomes, insuranceNet, net },
  };
}

function settleHand(hand: Hand, handIndex: number, dealerHand: Hand, rules: RuleSet): HandOutcome {
  const wagered = hand.doubled ? hand.bet * 2 : hand.bet;
  const dealerNatural = isBlackjack(dealerHand);

  // Original bets only. In a no-peek game the player may have doubled or split into wagers
  // they would never have placed against a known natural, so when the dealer turns one over
  // everything staked beyond the opening bet comes back. Only hand 0 descends from that bet;
  // with `rules.dealerPeek` on, the peek ends the round before any of this is reachable.
  const opening = handIndex === 0 ? hand.bet : 0;

  if (hand.surrendered) {
    // Early surrender is taken before the dealer peeks, so it keeps half the bet even
    // against a natural. Late surrender against a natural forfeits the opening bet.
    const forfeit = dealerNatural && rules.surrender !== "early" ? opening : wagered / 2;
    return toOutcome(handIndex, "surrender", wagered, wagered - forfeit);
  }

  const value = evaluate(hand.cards);
  if (value.busted) return toOutcome(handIndex, "bust", wagered, 0);

  if (dealerNatural) {
    if (isBlackjack(hand)) return toOutcome(handIndex, "push", wagered, wagered);
    return toOutcome(handIndex, "lose", wagered, wagered - opening);
  }

  if (isBlackjack(hand)) {
    return toOutcome(
      handIndex,
      "blackjack",
      wagered,
      wagered + wagered * blackjackOdds(rules.blackjackPayout),
    );
  }

  const dealerValue = evaluate(dealerHand.cards);
  if (dealerValue.busted || value.total > dealerValue.total) {
    return toOutcome(handIndex, "win", wagered, wagered * 2);
  }
  if (value.total === dealerValue.total) return toOutcome(handIndex, "push", wagered, wagered);
  return toOutcome(handIndex, "lose", wagered, 0);
}

/** Profit per unit staked on a natural. 6:5 is the rule that quietly triples the house edge. */
function blackjackOdds(payout: BlackjackPayout): number {
  return payout === "3:2" ? 1.5 : 1.2;
}

function toOutcome(
  handIndex: number,
  result: HandResult,
  wagered: number,
  returned: number,
): HandOutcome {
  return { handIndex, result, wagered, returned, net: returned - wagered };
}

// --- Internals ---------------------------------------------------------------------------

function legalActionsFor(state: RoundState, index: number): Action[] {
  const hand = state.playerHands[index];
  if (!hand) return [];
  return legalActions({
    hand,
    rules: state.rules,
    handCount: state.playerHands.length,
    bankroll: state.bankroll,
  });
}

function requireActiveHand(state: RoundState): Hand {
  const hand = state.playerHands[state.activeHandIndex];
  if (!hand) {
    throw new Error(
      `No hand at index ${state.activeHandIndex}; the round holds ${state.playerHands.length}.`,
    );
  }
  return hand;
}

function withHand(state: RoundState, index: number, hand: Hand): Hand[] {
  const hands = [...state.playerHands];
  hands[index] = hand;
  return hands;
}
