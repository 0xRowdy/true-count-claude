/**
 * The Play table's state.
 *
 * The engine owns the round; this owns everything that outlives one round — the shoe, the
 * bankroll, the wager, the counting system, and the shoe's replacement at the cut card. Every
 * transition is a pure function of the previous `PlayTable` so the screen stays a rendering
 * of state rather than a pile of effects, and so a future Session recorder can subscribe to
 * these transitions without the table changing shape.
 *
 * Three engine subtleties are handled here rather than at the call sites, because getting any
 * of them wrong shows the user a number that is quietly false:
 *
 * - `trueCount` throws at zero decks remaining, and it is meaningless for an unbalanced
 *   system. `countReadout` returns the conversion only when it exists.
 * - The Running Count must be built from the cards the *player has seen*. The dealer's hole
 *   card is dealt long before it is turned over, so it is excluded until it is revealed.
 * - Unbalanced systems (KO, Red 7) start at a non-zero count, so the count the player holds
 *   is `currentRunningCount`, not `runningCount`.
 */

import { useCallback, useMemo, useState } from "react";
import type { Card } from "@/engine/cards";
import {
  type CountingSystem,
  type CountingSystemId,
  aceSideCount,
  currentRunningCount,
  getCountingSystem,
  keyCount,
  trueCount,
} from "@/engine/counting";
import type { Action } from "@/engine/hand";
import { DEFAULT_RULES, type RuleSet } from "@/engine/rules";
import {
  type RoundAction,
  type RoundState,
  applyAction,
  insuranceStake,
  startRound,
} from "@/engine/round";
import {
  type Shoe,
  cardsRemaining,
  createShoe,
  dealtCards,
  decksRemaining,
  isCutCardReached,
} from "@/engine/shoe";

/** Opening bankroll, and the amount a one-tap reset restores (invariant 6). */
export const STARTING_BANKROLL = 500;

/**
 * The chip ladder offered at the bet prompt. Filtered at render time against the table limits
 * and the bankroll — an unaffordable chip is not rendered, never rendered greyed out.
 */
export const CHIP_VALUES: readonly number[] = [5, 10, 25, 50, 100, 250, 500];

/**
 * The player's shoe is replaced once the cut card is out. A handful of cards is also kept in
 * reserve so a long round of splits cannot run the shoe dry mid-hand, which `deal` treats as
 * a bug rather than a condition to recover from.
 */
const RESERVE_CARDS = 30;

export interface PlayTable {
  readonly rules: RuleSet;
  readonly system: CountingSystem;
  /** The seed of the session. Every shoe's seed is derived from it, so the run is replayable. */
  readonly sessionSeed: number;
  /** How many shoes have been opened this session. The current shoe is the last of them. */
  readonly shoeIndex: number;
  /** The shoe between rounds. While a round is live, `round.shoe` is further along. */
  readonly shoe: Shoe;
  /** Chips not at risk, between rounds. While a round is live, `round.bankroll` is current. */
  readonly bankroll: number;
  readonly bet: number;
  /** The live round, or null when the table is waiting on a wager. */
  readonly round: RoundState | null;
  /** True when the last round ended at the cut card and the shoe was replaced. */
  readonly justShuffled: boolean;
  readonly handsPlayed: number;
  /** Profit or loss across every settled round this session. */
  readonly sessionNet: number;
}

export function createPlayTable(rules: RuleSet, sessionSeed: number): PlayTable {
  return {
    rules,
    system: getCountingSystem("hi-lo"),
    sessionSeed,
    shoeIndex: 0,
    shoe: createShoe(rules, shoeSeed(sessionSeed, 0)),
    bankroll: STARTING_BANKROLL,
    bet: rules.minBet,
    round: null,
    justShuffled: false,
    handsPlayed: 0,
    sessionNet: 0,
  };
}

/** Everything a resumed table needs that a fresh one derives from its seed. */
export interface RestorePlayTableInput {
  readonly rules: RuleSet;
  readonly system: CountingSystem;
  readonly sessionSeed: number;
  readonly shoeIndex: number;
  /** Rebuilt from its recorded seed and dealt to where it stood (see `@/state`'s `rebuildShoe`). */
  readonly shoe: Shoe;
  readonly bankroll: number;
  readonly handsPlayed: number;
  readonly sessionNet: number;
}

/**
 * Rebuilds a table from a Session that was still running when the app closed.
 *
 * The table is restored *between* rounds, never inside one: a round that never settled was
 * never recorded, so resuming into the middle of it would deal cards the log does not know
 * about. The shoe comes back exactly where the last settled round left it, which is what
 * makes the resumed Running Count the same number the user was holding.
 */
export function restorePlayTable(input: RestorePlayTableInput): PlayTable {
  return chooseBet(
    {
      rules: input.rules,
      system: input.system,
      sessionSeed: input.sessionSeed,
      shoeIndex: input.shoeIndex,
      shoe: input.shoe,
      bankroll: input.bankroll,
      bet: input.rules.minBet,
      round: null,
      justShuffled: false,
      handsPlayed: input.handsPlayed,
      sessionNet: input.sessionNet,
    },
    input.rules.minBet,
  );
}

/**
 * Each shoe's seed is derived from the session seed and the shoe's index, so a whole session
 * reproduces from one number (ADR-0004) while no two shoes in it are the same deal.
 */
function shoeSeed(sessionSeed: number, shoeIndex: number): number {
  return (Math.imul(sessionSeed ^ (shoeIndex + 1), 2654435761) >>> 0) || 1;
}

// --- Derived views ------------------------------------------------------------------------

/** Chips not at risk right now — the live round's bankroll while one is running. */
export function availableBankroll(table: PlayTable): number {
  return table.round?.bankroll ?? table.bankroll;
}

/** The shoe as it stands right now — the live round's shoe while one is running. */
export function currentShoe(table: PlayTable): Shoe {
  return table.round?.shoe ?? table.shoe;
}

/**
 * Every card the player has actually seen leave the shoe.
 *
 * The dealer's hole card is dealt at the start of the round but stays face down, so it is
 * filtered out until it is turned up. `deal` hands back the very object stored in the shoe,
 * which is what makes the identity comparison exact even in a six-deck shoe full of duplicate
 * rank-and-suit pairs.
 */
export function seenCards(table: PlayTable): readonly Card[] {
  const shoe = currentShoe(table);
  const dealt = dealtCards(shoe);
  const round = table.round;
  if (!round || round.dealerHoleCardRevealed) return dealt;

  const holeCard = round.dealerHand.cards[1];
  if (!holeCard) return dealt;
  return dealt.filter((card) => card !== holeCard);
}

export interface CountReadout {
  /** The Running Count the player is holding, including an unbalanced system's start value. */
  readonly running: number;
  /**
   * The True Count, or null when there is no such number: an unbalanced system does not
   * convert, and the conversion is undefined with no decks left (`trueCount` throws there).
   */
  readonly trueCount: number | null;
  /** Why `trueCount` is null, for the UI to say out loud rather than showing a blank. */
  readonly trueCountNote: string | null;
  readonly decksRemaining: number;
  readonly cardsRemaining: number;
  /** The Key Count or pivot an unbalanced system uses in place of a True Count. */
  readonly pivot: number | null;
  /** Aces left relative to a neutral shoe. Present only for systems that tag aces zero. */
  readonly aceSurplusPerDeck: number | null;
}

export function countReadout(table: PlayTable): CountReadout {
  const shoe = currentShoe(table);
  const cards = seenCards(table);
  const decksLeft = decksRemaining(shoe);
  const running = currentRunningCount(cards, table.system, table.rules.decks);

  const unbalanced = !table.system.balanced;
  const exhausted = decksLeft <= 0;

  return {
    running,
    trueCount: unbalanced || exhausted ? null : trueCount(running, decksLeft),
    trueCountNote: unbalanced
      ? `${table.system.name} is unbalanced — play the running count against its pivot.`
      : exhausted
        ? "No cards left to divide by."
        : null,
    decksRemaining: decksLeft,
    cardsRemaining: cardsRemaining(shoe),
    pivot: unbalanced ? (keyCount(table.system, table.rules.decks) ?? table.system.pivot) : null,
    aceSurplusPerDeck: table.system.usesAceSideCount
      ? aceSideCount(cards, table.rules.decks).surplusPerDeck
      : null,
  };
}

/** Chips currently on the felt: every hand's stake, doubles included, plus insurance. */
export function amountAtRisk(table: PlayTable): number {
  const round = table.round;
  if (!round || round.phase === "settled") return 0;
  const hands = round.playerHands.reduce(
    (total, hand) => total + (hand.doubled ? hand.bet * 2 : hand.bet),
    0,
  );
  return hands + round.insurance.bet;
}

/**
 * True when the dealer is showing an ace and the engine withheld the insurance offer because
 * the bankroll could not cover the half-bet stake.
 *
 * This brushes invariant 7 — an action the rules allow is absent — but the engine's
 * alternative was a button that throws. The table says so in words rather than letting the
 * offer vanish silently, because an unexplained missing action is exactly the kind of thing
 * that makes a user distrust the rest of the app.
 */
export function insuranceWithheld(table: PlayTable): boolean {
  const round = table.round;
  if (!round || round.phase === "settled") return false;
  if (round.phase === "insurance") return false;
  if (round.insurance.taken || round.insurance.bet > 0) return false;
  if (round.dealerHand.cards[0]?.rank !== "A") return false;
  return round.bankroll < insuranceStake(round.bet);
}

/** Bets the bankroll and the table limits both allow, smallest first. */
export function affordableChips(table: PlayTable): number[] {
  const { rules } = table;
  return CHIP_VALUES.filter(
    (chip) => chip >= rules.minBet && chip <= rules.maxBet && chip <= table.bankroll,
  );
}

/** True when no legal wager is left — the dead end invariant 6 forbids leaving unattended. */
export function isBroke(table: PlayTable): boolean {
  return table.round === null && table.bankroll < table.rules.minBet;
}

// --- Transitions --------------------------------------------------------------------------

export function chooseSystem(table: PlayTable, id: CountingSystemId): PlayTable {
  return { ...table, system: getCountingSystem(id) };
}

/** Sets the wager, clamped to the table limits and to what the bankroll can cover. */
export function chooseBet(table: PlayTable, amount: number): PlayTable {
  const ceiling = Math.min(table.rules.maxBet, table.bankroll);
  const bet = Math.min(Math.max(amount, table.rules.minBet), Math.max(ceiling, table.rules.minBet));
  return { ...table, bet };
}

export function dealRound(table: PlayTable): PlayTable {
  if (table.round) return table;
  return {
    ...table,
    justShuffled: false,
    round: startRound({
      rules: table.rules,
      shoe: table.shoe,
      bet: table.bet,
      bankroll: table.bankroll,
    }),
  };
}

export function act(table: PlayTable, action: RoundAction): PlayTable {
  if (!table.round) return table;
  return { ...table, round: applyAction(table.round, action) };
}

export function takeInsurance(table: PlayTable, take: boolean): PlayTable {
  return act(table, { type: "insurance", take });
}

export function playAction(table: PlayTable, action: Action): PlayTable {
  return act(table, { type: action });
}

/**
 * Banks the settled round and returns the table to the bet prompt, replacing the shoe if the
 * cut card is out. Reshuffling here — between rounds, never inside one — is what keeps the
 * Running Count honest and the shoe from being dealt past its end.
 */
export function nextRound(table: PlayTable): PlayTable {
  const round = table.round;
  if (!round || round.phase !== "settled") return table;

  const needsShuffle =
    isCutCardReached(round.shoe) || cardsRemaining(round.shoe) < RESERVE_CARDS;
  const shoeIndex = needsShuffle ? table.shoeIndex + 1 : table.shoeIndex;

  const banked: PlayTable = {
    ...table,
    shoeIndex,
    shoe: needsShuffle
      ? createShoe(table.rules, shoeSeed(table.sessionSeed, shoeIndex))
      : round.shoe,
    bankroll: round.bankroll,
    round: null,
    justShuffled: needsShuffle,
    handsPlayed: table.handsPlayed + 1,
    sessionNet: table.sessionNet + (round.settlement?.net ?? 0),
  };

  return chooseBet(banked, table.bet);
}

/** Replaces the shoe on demand. Offered so the user can restart a count without a dead round. */
export function shuffleShoe(table: PlayTable): PlayTable {
  if (table.round) return table;
  const shoeIndex = table.shoeIndex + 1;
  return {
    ...table,
    shoeIndex,
    shoe: createShoe(table.rules, shoeSeed(table.sessionSeed, shoeIndex)),
    justShuffled: true,
  };
}

/**
 * Invariant 6: a bankroll at zero offers a one-tap reset *in place*. A competitor lost a
 * paying customer because their top-up lived on a separate website.
 */
export function resetBankroll(table: PlayTable): PlayTable {
  if (table.round) return table;
  return chooseBet({ ...table, bankroll: STARTING_BANKROLL }, table.rules.minBet);
}

// --- Hook ---------------------------------------------------------------------------------

export interface PlayTableController {
  readonly table: PlayTable;
  readonly update: (transition: (table: PlayTable) => PlayTable) => void;
}

/**
 * Holds a `PlayTable` in React state. The seed is drawn once, at mount, and never again — the
 * engine stays free of `Math.random()` (ADR-0004) and the session remains reproducible from
 * the seed the Shoe panel shows the user.
 */
export function usePlayTable(rules: RuleSet = DEFAULT_RULES): PlayTableController {
  const [table, setTable] = useState(() =>
    createPlayTable(rules, Math.floor(Math.random() * 0xffffffff) >>> 0),
  );

  const update = useCallback((transition: (current: PlayTable) => PlayTable) => {
    setTable((current) => transition(current));
  }, []);

  return useMemo(() => ({ table, update }), [table, update]);
}
