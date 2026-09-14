/**
 * The Deviation drill — hands posed at counts either side of a published index.
 *
 * The category leader has no index play as a trainable skill at all; "count-based
 * deviations" exists there only as a rule toggle, never scored
 * (`docs/research/competitive-landscape.md`). Together with the six counting systems this
 * is the product's wedge, so the drill is built to be *honest* about the published numbers
 * rather than generous with them.
 *
 * Three refusals, each inherited from the engine and each surfaced to the user rather than
 * papered over:
 *
 *  1. **Only Hi-Lo has indices.** The Illustrious 18 and the Fab 4 are quoted against
 *     Hi-Lo's true-count scale and do not transfer. `deviationDrillAvailability` declines
 *     for the other five systems and says so; it does not lend them Hi-Lo's numbers.
 *  2. **An index that this Rule Set has already moved is not drilled.** The I18's 16 vs 10
 *     says "stand instead of hitting", and in a late-surrender game Basic Strategy
 *     surrenders that hand — there is nothing left to depart from, and no source publishes
 *     the departure from surrendering. Those entries are excluded from the question pool
 *     *with the reason attached*, so a screen can tell the user which of the 22 published
 *     indices their table takes off the board and why.
 *  3. **An index fires in one direction only.** The negative half of the I18 departs
 *     *below* its index; the surrender indices depart at or above theirs. The generator
 *     poses both sides on purpose, including the boundary itself, because the index value
 *     always belongs to the "at or above" side and that off-by-one is the single most
 *     common way to get index play wrong.
 *
 * **Questions are cut from a real shoe.** Rather than inventing a composition to match a
 * count, the generator deals a seeded shoe to a position whose True Count *is* the target
 * and places the hand there. The per-action EVs in the Explanation are then computed
 * against a shoe that genuinely exists, which is what lets the drill say "standing is worth
 * more than hitting *here*" instead of asserting it. When no position in the shoes tried
 * produces the target count the question is still posed, with the count stated and the EVs
 * honestly absent — see `evNote` on the Explanation.
 */

import {
  type Card,
  type CountingSystem,
  type CountingSystemId,
  type DealerUpcard,
  type Hand,
  type HardTotal,
  type IndexEntry,
  type PairRank,
  type Rank,
  type RankComposition,
  type Rng,
  type RuleSet,
  type Shoe,
  type SoftTotal,
  type TrueCountRounding,
  DEFAULT_RULES,
  DEFAULT_TRUE_COUNT_ROUNDING,
  HI_LO,
  RANKS,
  compositionWithout,
  createHand,
  createRng,
  createShoe,
  deviationLookup,
  getCountingSystem,
  getIndexSet,
  initialRunningCount,
  insuranceIndex,
  tagFor,
  trueCount,
} from "@/engine";
import {
  type CountContext,
  type DecisionSituation,
  type DrillAction,
  type InsuranceSituation,
  buildCountContext,
  systemsWithIndexes,
} from "./explanation";
import {
  type ScoreTally,
  type Undoable,
  EMPTY_TALLY,
  beginUndoable,
  rate,
  recordVerdict,
  replace,
  step,
} from "./progress";
import {
  type DrillDecisionResult,
  type InsuranceAnswer,
  scoreAgainstIndexPlay,
  scoreInsuranceAgainstIndexPlay,
} from "./scoring";
import { questionSeed } from "./trueCount";
import type { Verdict } from "./types";

/** Chips the drill assumes. Large, so no index play is ever taken off the table (invariant 7). */
const DRILL_BANKROLL = 1_000_000;

export interface DeviationDrillConfig {
  readonly rules: RuleSet;
  readonly system: CountingSystem;
  readonly rounding: TrueCountRounding;
  readonly bet: number;
  /** How far either side of an index a question may sit, in true-count points. */
  readonly spread: number;
  /** Restrict the pool to these entry ids. Empty means every playable entry. */
  readonly entryIds: readonly string[];
}

export const DEFAULT_DEVIATION_CONFIG: DeviationDrillConfig = {
  rules: DEFAULT_RULES,
  system: HI_LO,
  rounding: DEFAULT_TRUE_COUNT_ROUNDING,
  bet: DEFAULT_RULES.minBet,
  spread: 2,
  entryIds: [],
};

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

/** Why a published index cannot be drilled at this table. */
export type EntryExclusionReason =
  /** The Rule Set's own Basic Strategy is not the play this index departs from. */
  | "outside-published-rules"
  /** The indicated action is not legal at this table. */
  | "action-not-legal"
  /** No two-card hand can hold this total without being a pair the chart reads differently. */
  | "no-representable-hand"
  /** The lookup landed on a different entry covering the same coordinate. */
  | "superseded";

export interface ExcludedEntry {
  readonly entry: IndexEntry;
  readonly reason: EntryExclusionReason;
}

export interface DeviationDrillAvailability {
  readonly available: boolean;
  readonly system: CountingSystemId;
  /** The published set's name, when the system has one. */
  readonly indexSet: string | null;
  /** Entries this table can actually fire, and which the drill will pose. */
  readonly playable: readonly IndexEntry[];
  /** Entries this table takes off the board, each with the reason. */
  readonly excluded: readonly ExcludedEntry[];
  readonly note: string | null;
  /** Systems that publish an index set, so a screen can offer a switch instead of a dead end. */
  readonly systemsWithIndexes: readonly CountingSystemId[];
}

/**
 * What this table and this system can actually drill.
 *
 * Both lists are returned, not just the usable one. A user whose six-deck H17 late-surrender
 * game removes four of the twenty-two published indices deserves to be told which four and
 * why — that is the auditable-math promise (invariant 4) applied to the drill pool rather
 * than only to the chart.
 */
export function deviationDrillAvailability(
  rules: RuleSet,
  system: CountingSystem,
): DeviationDrillAvailability {
  const set = getIndexSet(system);
  if (!set) {
    return {
      available: false,
      system: system.id,
      indexSet: null,
      playable: [],
      excluded: [],
      note:
        `${system.name} publishes no index set. The Illustrious 18 and Fab 4 are Schlesinger's ` +
        `numbers for Hi-Lo and are quoted against Hi-Lo's true-count scale, so they do not ` +
        `transfer — lending them to ${system.name} would be inventing math. Switch to Hi-Lo ` +
        `to drill index play.`,
      systemsWithIndexes: systemsWithIndexes(),
    };
  }

  const playable: IndexEntry[] = [];
  const excluded: ExcludedEntry[] = [];

  for (const entry of set.entries) {
    const reason = entryExclusion(entry, rules, system);
    if (reason === null) playable.push(entry);
    else excluded.push({ entry, reason });
  }

  return {
    available: playable.length > 0,
    system: system.id,
    indexSet: set.name,
    playable,
    excluded,
    note:
      playable.length > 0
        ? null
        : `No published index applies at this table (${set.entries.length} checked).`,
    systemsWithIndexes: systemsWithIndexes(),
  };
}

/** `null` when the entry is drillable here; the reason otherwise. */
function entryExclusion(
  entry: IndexEntry,
  rules: RuleSet,
  system: CountingSystem,
): EntryExclusionReason | null {
  if (entry.hand.kind === "insurance") {
    // Insurance is a side bet with no chart coordinate and no rule that can move it, so it
    // is drillable wherever the system publishes an index for it.
    return insuranceIndex(system) === undefined ? "outside-published-rules" : null;
  }

  const cards = handCardsFor(entry, defaultSuits());
  if (!cards) return "no-representable-hand";

  const hand = createHand(cards, 1);
  const upcard = upcardCardFor(entry.upcard, "s");
  // Probe at a count that definitely fires: the index itself for an "at or above" entry,
  // one point below it for a "below" one.
  const firingCount = entry.direction === "at-or-above" ? entry.index : entry.index - 1;
  const lookup = deviationLookup(hand, upcard, firingCount, rules, system, {
    handCount: 1,
    bankroll: DRILL_BANKROLL,
  });

  if (lookup.deviation === null) {
    // `count-on-basic-side` cannot reach here — the probe above is on the firing side by
    // construction — and `no-index-set` was handled before the loop. Anything else means
    // this Rule Set has moved the cell the index departs from, or taken the play away.
    return lookup.skipped === "action-not-legal" ? "action-not-legal" : "outside-published-rules";
  }
  // A coordinate can be covered by two entries — hard 15 vs 10 is both I18 #3 and Fab 4 #2 —
  // and the lookup resolves surrender first. The entry that loses that race cannot be drilled
  // on its own terms, so it is excluded rather than posed and then graded as something else.
  return lookup.entry?.id === entry.id ? null : "superseded";
}

// ---------------------------------------------------------------------------
// Building a hand for an index coordinate
// ---------------------------------------------------------------------------

/**
 * Two-card hands for each hard total, chosen so the hand is neither a pair nor soft.
 *
 * It has to be both: a pair would send `governingCell` to the pairs chart and a soft hand to
 * the soft one, and in either case the hard-total index would have nothing to attach to.
 * Hard 4 and hard 20 are absent because the only two-card holdings that make them are 2,2
 * and 10,10 — and no published index names either.
 */
const HARD_HANDS: Partial<Record<HardTotal, readonly [Rank, Rank]>> = {
  5: ["3", "2"],
  6: ["4", "2"],
  7: ["5", "2"],
  8: ["5", "3"],
  9: ["5", "4"],
  10: ["6", "4"],
  11: ["7", "4"],
  12: ["10", "2"],
  13: ["10", "3"],
  14: ["10", "4"],
  15: ["10", "5"],
  16: ["10", "6"],
  17: ["10", "7"],
  18: ["10", "8"],
  19: ["10", "9"],
};

const TEN_RANKS: readonly Rank[] = ["10", "J", "Q", "K"];

interface Suits {
  readonly first: Card["suit"];
  readonly second: Card["suit"];
  readonly upcard: Card["suit"];
}

function defaultSuits(): Suits {
  return { first: "s", second: "h", upcard: "d" };
}

function softRanks(total: SoftTotal): readonly [Rank, Rank] | null {
  if (total < 13 || total > 20) return null;
  return ["A", String(total - 11) as Rank];
}

/** The two cards that make an entry's coordinate, or `null` when none can. */
function handCardsFor(entry: IndexEntry, suits: Suits, tenRank: Rank = "10"): Card[] | null {
  const ranks = handRanksFor(entry, tenRank);
  if (!ranks) return null;
  return [
    { rank: ranks[0], suit: suits.first },
    { rank: ranks[1], suit: suits.second },
  ];
}

function handRanksFor(entry: IndexEntry, tenRank: Rank): readonly [Rank, Rank] | null {
  switch (entry.hand.kind) {
    case "hard":
      return HARD_HANDS[entry.hand.total] ?? null;
    case "soft":
      return softRanks(entry.hand.total);
    case "pair":
      return pairRanks(entry.hand.rank, tenRank);
    case "insurance":
      return null;
  }
}

function pairRanks(rank: PairRank, tenRank: Rank): readonly [Rank, Rank] {
  if (rank === "10") return [tenRank, "10"];
  return [rank as Rank, rank as Rank];
}

/** The dealer's upcard as a card. 11 is an ace; a ten column is any of the four ten ranks. */
function upcardCardFor(upcard: DealerUpcard, suit: Card["suit"], tenRank: Rank = "10"): Card {
  if (upcard === 11) return { rank: "A", suit };
  if (upcard === 10) return { rank: tenRank, suit };
  return { rank: String(upcard) as Rank, suit };
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

interface QuestionCommon {
  readonly index: number;
  readonly entry: IndexEntry;
  readonly system: CountingSystemId;
  readonly rules: RuleSet;
  readonly rounding: TrueCountRounding;
  readonly count: CountContext;
  /** The rounded True Count the question is posed at. */
  readonly trueCount: number;
  /** `trueCount - entry.index`, signed, in both directions. */
  readonly distanceToIndex: number;
  /** True when the count is on the departing side of the index. */
  readonly firing: boolean;
  /**
   * The seed of the shoe the question was cut from, and how far it had been dealt.
   *
   * The shoe itself is deliberately *not* carried. The question's cards are placed on the
   * table rather than dealt off the top, so a `Shoe` advanced past them would claim a
   * dealing history that never happened — and a false history in a product whose whole
   * pitch is a verifiable shoe (ADR-0004) is worse than no history. Seed plus position
   * reproduces the composition exactly, with nothing implied that is not true.
   */
  readonly shoeSeed: number | null;
  readonly cutPosition: number | null;
  /** The unseen pack. `null` when no shoe position produced the target count. */
  readonly composition: RankComposition | null;
  readonly dealerUpcard: Card;
}

export interface HandDeviationQuestion extends QuestionCommon {
  readonly kind: "hand";
  readonly hand: Hand;
  readonly bet: number;
}

export interface InsuranceDeviationQuestion extends QuestionCommon {
  readonly kind: "insurance";
}

export type DeviationQuestion = HandDeviationQuestion | InsuranceDeviationQuestion;

/** How many seeded shoes are searched for a position at the target count before giving up. */
const SHOE_ATTEMPTS = 8;

export function deviationQuestion(
  config: DeviationDrillConfig,
  availability: DeviationDrillAvailability,
  seed: number,
  index: number,
): DeviationQuestion {
  const pool = poolFor(config, availability);
  const entry = pool[createRng(questionSeed(seed, index)).nextInt(pool.length)] as IndexEntry;

  const rng = createRng(questionSeed(seed ^ 0x5bf03635, index));
  const target = targetCount(entry, config.spread, rng);
  const tenRank = TEN_RANKS[rng.nextInt(TEN_RANKS.length)] as Rank;
  const suits = pickSuits(rng);

  const upcard = upcardCardFor(entry.upcard, suits.upcard, tenRank);
  const cards = entry.hand.kind === "insurance" ? [] : (handCardsFor(entry, suits, tenRank) ?? []);
  const placed = [...cards, upcard];

  const cut = cutFromShoe(config, seed, index, placed, target);

  const common: QuestionCommon = {
    index,
    entry,
    system: config.system.id,
    rules: config.rules,
    rounding: config.rounding,
    count: cut.count,
    trueCount: target,
    distanceToIndex: target - entry.index,
    firing: fires(target, entry),
    shoeSeed: cut.shoeSeed,
    cutPosition: cut.cutPosition,
    composition: cut.composition,
    dealerUpcard: upcard,
  };

  if (entry.hand.kind === "insurance") {
    return { ...common, kind: "insurance" };
  }
  return { ...common, kind: "hand", hand: createHand(cards, config.bet), bet: config.bet };
}

function poolFor(
  config: DeviationDrillConfig,
  availability: DeviationDrillAvailability,
): readonly IndexEntry[] {
  const pool =
    config.entryIds.length === 0
      ? availability.playable
      : availability.playable.filter((entry) => config.entryIds.includes(entry.id));

  if (pool.length === 0) {
    throw new Error(
      availability.note ??
        `No playable index entries: ${config.entryIds.join(", ")} are not drillable at this table.`,
    );
  }
  return pool;
}

/** The boundary convention, restated exactly as `deviations.ts` states it. */
function fires(count: number, entry: IndexEntry): boolean {
  return entry.direction === "at-or-above" ? count >= entry.index : count < entry.index;
}

/**
 * A True Count either side of the index, with the boundary itself well represented.
 *
 * The firing side is chosen first and the offset second, so half the questions depart and
 * half do not — which is the only way to tell a user who has learnt the index from one who
 * has learnt to always deviate.
 */
function targetCount(entry: IndexEntry, spread: number, rng: Rng): number {
  const width = Math.max(1, Math.floor(spread));
  const shouldFire = rng.next() < 0.5;
  const offset = 1 + rng.nextInt(width);

  if (entry.direction === "at-or-above") {
    return shouldFire ? entry.index + rng.nextInt(width + 1) : entry.index - offset;
  }
  return shouldFire ? entry.index - offset : entry.index + rng.nextInt(width + 1);
}

function pickSuits(rng: Rng): Suits {
  const suits: readonly Card["suit"][] = ["s", "h", "d", "c"];
  return {
    first: suits[rng.nextInt(4)] as Card["suit"],
    second: suits[rng.nextInt(4)] as Card["suit"],
    upcard: suits[rng.nextInt(4)] as Card["suit"],
  };
}

interface ShoeCut {
  readonly shoeSeed: number | null;
  readonly cutPosition: number | null;
  readonly composition: RankComposition | null;
  readonly count: CountContext;
}

/**
 * Finds a real shoe position whose True Count is the target, with the question's cards still
 * in it, and cuts the shoe there.
 *
 * The four cards of the opening deal — two to the player, the upcard, and a hole card nobody
 * has seen — are accounted for exactly as a live round accounts for them: the hole card has
 * left the shoe, so it comes out of `decksRemaining`, but it stays in the unseen pool the
 * dealer draws from. Getting that wrong by one card is the mistake `#4`'s merge note warns
 * about.
 */
function cutFromShoe(
  config: DeviationDrillConfig,
  seed: number,
  index: number,
  placed: readonly Card[],
  target: number,
): ShoeCut {
  const { rules, system, rounding } = config;
  const totalCards = rules.decks * 52;
  const placedTags = placed.reduce((sum, card) => sum + tagFor(card, system), 0);
  const need = rankDemand(placed);

  const start = initialRunningCount(system, rules.decks);

  for (let attempt = 0; attempt < SHOE_ATTEMPTS; attempt++) {
    const shoeSeed = questionSeed(seed ^ 0x1b873593, index * SHOE_ATTEMPTS + attempt);
    const base = createShoe(rules, shoeSeed);
    const prefixTags = prefixTagSums(base, system);
    const held = rankCountsByPosition(base);

    const runningAt = (position: number): number =>
      start + (prefixTags[position] ?? 0) + placedTags;

    const matches: number[] = [];
    for (let position = 0; position <= base.cutIndex; position++) {
      const cardsLeft = totalCards - position - placed.length - 1;
      if (cardsLeft <= 0) break;
      if (trueCount(runningAt(position), cardsLeft / 52, rounding) !== target) continue;
      if (!hasRanks(held, position, need)) continue;
      matches.push(position);
    }

    if (matches.length === 0) continue;

    const chooser = createRng(questionSeed(seed ^ 0x27d4eb2f, index * SHOE_ATTEMPTS + attempt));
    const position = matches[chooser.nextInt(matches.length)] as number;
    const cardsLeft = totalCards - position - placed.length - 1;

    return {
      shoeSeed,
      cutPosition: position,
      // The unseen pack: everything still in the shoe at the cut, less the cards now on the
      // table. The hole card is one of the cards that remain, and is never treated as known.
      composition: compositionWithout(compositionAt(held, position), placed),
      count: buildCountContext({
        system,
        decks: rules.decks,
        runningCount: runningAt(position),
        cardsRemaining: cardsLeft,
        rounding,
      }),
    };
  }

  // No position in any shoe tried lands on the target. Pose the question anyway, with the
  // count stated and the EVs honestly absent rather than computed against a shoe that would
  // contradict it.
  return {
    shoeSeed: null,
    cutPosition: null,
    composition: null,
    count: syntheticCount(config, target),
  };
}

/**
 * A count with no shoe behind it: two decks left and a Running Count that divides exactly.
 *
 * Exact under every rounding mode, so the stated True Count is the target whatever the
 * caller's rounding is — a fallback that quietly changed the question would be worse than
 * no fallback at all.
 */
function syntheticCount(config: DeviationDrillConfig, target: number): CountContext {
  return buildCountContext({
    system: config.system,
    decks: config.rules.decks,
    runningCount: target * 2,
    cardsRemaining: 104,
    rounding: config.rounding,
  });
}

/** How many of each rank the question's own cards need. */
function rankDemand(cards: readonly Card[]): Partial<Record<Rank, number>> {
  const need: Partial<Record<Rank, number>> = {};
  for (const card of cards) need[card.rank] = (need[card.rank] ?? 0) + 1;
  return need;
}

/** Running tag sums: `prefixTags[p]` is the tag sum of the first `p` cards. */
function prefixTagSums(shoe: Shoe, system: CountingSystem): number[] {
  const sums = new Array<number>(shoe.cards.length + 1).fill(0);
  for (let i = 0; i < shoe.cards.length; i++) {
    sums[i + 1] = (sums[i] ?? 0) + tagFor(shoe.cards[i] as Card, system);
  }
  return sums;
}

/** `counts[rank][p]` is how many of that rank sit in the first `p` cards. */
function rankCountsByPosition(shoe: Shoe): Record<Rank, number[]> {
  const counts = Object.fromEntries(
    RANKS.map((rank) => [rank, new Array<number>(shoe.cards.length + 1).fill(0)]),
  ) as Record<Rank, number[]>;

  for (let i = 0; i < shoe.cards.length; i++) {
    for (const rank of RANKS) {
      const column = counts[rank];
      column[i + 1] = column[i] ?? 0;
    }
    const column = counts[(shoe.cards[i] as Card).rank];
    column[i + 1] = (column[i] ?? 0) + 1;
  }
  return counts;
}

function hasRanks(
  held: Record<Rank, number[]>,
  position: number,
  need: Partial<Record<Rank, number>>,
): boolean {
  for (const rank of RANKS) {
    const wanted = need[rank] ?? 0;
    if (wanted === 0) continue;
    if (remainingOf(held, rank, position) < wanted) return false;
  }
  return true;
}

function remainingOf(held: Record<Rank, number[]>, rank: Rank, position: number): number {
  const column = held[rank];
  return (column[column.length - 1] ?? 0) - (column[position] ?? 0);
}

/** What the shoe still holds at a position, as a composition. */
function compositionAt(held: Record<Rank, number[]>, position: number): RankComposition {
  return Object.fromEntries(
    RANKS.map((rank) => [rank, remainingOf(held, rank, position)]),
  ) as Record<Rank, number>;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface DeviationResult {
  readonly kind: "deviation";
  readonly question: DeviationQuestion;
  /** The graded decision, with the full Explanation — EVs, chart cell, index and distance. */
  readonly decision: DrillDecisionResult;
  readonly verdict: Verdict;
  readonly at: number;
}

/**
 * Grades an answer against the index numbers at the question's count.
 *
 * Pure and synchronous: callable at the instant of the tap, with the hand still on screen
 * (invariant 3). Correct answers carry the same Explanation as wrong ones — a user who
 * stood on 16 vs 10 at a true count of exactly 0 should see *why* the boundary went their
 * way, or they have learnt a coin flip.
 */
export function scoreDeviationQuestion(
  question: DeviationQuestion,
  answer: DrillAction,
  at: number,
): DeviationResult {
  if (question.kind === "insurance") {
    const situation: InsuranceSituation = {
      system: systemOf(question),
      dealerUpcard: question.dealerUpcard,
      composition: question.composition,
      count: question.count,
    };
    const insuranceAnswer: InsuranceAnswer =
      answer === "insurance" ? "insurance" : "decline-insurance";
    const decision = scoreInsuranceAgainstIndexPlay(situation, insuranceAnswer, at);
    return { kind: "deviation", question, decision, verdict: decision.verdict, at };
  }

  const situation: DecisionSituation = {
    rules: question.rules,
    system: systemOf(question),
    hand: question.hand,
    handIndex: 0,
    handCount: 1,
    dealerUpcard: question.dealerUpcard,
    bankroll: DRILL_BANKROLL,
    composition: question.composition,
    count: question.count,
  };
  const decision = scoreAgainstIndexPlay(situation, answer, at);
  return { kind: "deviation", question, decision, verdict: decision.verdict, at };
}

/**
 * The question's system, rebuilt from its id.
 *
 * Questions carry the id rather than the whole `CountingSystem` so they stay plain,
 * serializable data — a question is a bug report, and a bug report should be a value.
 */
function systemOf(question: DeviationQuestion): CountingSystem {
  return getCountingSystem(question.system);
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

export interface DeviationAttempt {
  readonly questionIndex: number;
  readonly entryId: string;
  readonly entryLabel: string;
  readonly indexNumber: number;
  readonly trueCount: number;
  readonly distanceToIndex: number;
  readonly firing: boolean;
  readonly actionTaken: DrillAction;
  readonly correctAction: DrillAction;
  readonly basicStrategyAction: DrillAction;
  readonly verdict: Verdict;
  readonly evLoss: number | null;
  readonly at: number;
}

export interface DeviationDrillState {
  readonly config: DeviationDrillConfig;
  readonly seed: number;
  readonly availability: DeviationDrillAvailability;
  readonly question: DeviationQuestion;
  readonly tally: ScoreTally;
  readonly attempts: readonly DeviationAttempt[];
  readonly lastResult: DeviationResult | null;
}

export type DeviationDrill = Undoable<DeviationDrillState>;

/**
 * Opens a Deviation drill, or throws with the reason it cannot be opened.
 *
 * Callers that want to offer a switch rather than an error should ask
 * `deviationDrillAvailability` first — it returns the same reason as data.
 */
export function startDeviationDrill(
  config: DeviationDrillConfig = DEFAULT_DEVIATION_CONFIG,
  seed = 1,
): DeviationDrill {
  const availability = deviationDrillAvailability(config.rules, config.system);
  if (!availability.available) {
    throw new Error(availability.note ?? "No published index applies at this table.");
  }

  return beginUndoable<DeviationDrillState>({
    config,
    seed,
    availability,
    question: deviationQuestion(config, availability, seed, 0),
    tally: EMPTY_TALLY,
    attempts: [],
    lastResult: null,
  });
}

/**
 * Grades the question on screen and leaves it there. Advancing is a separate call, so the
 * Explanation is read against the hand that produced it. A second submission is a no-op.
 */
export function submitDeviation(
  drill: DeviationDrill,
  answer: DrillAction,
  at: number,
): DeviationDrill {
  const state = drill.current;
  if (state.lastResult !== null) return drill;

  const result = scoreDeviationQuestion(state.question, answer, at);
  const decision = result.decision;

  return step(drill, {
    ...state,
    tally: recordVerdict(state.tally, result.verdict),
    attempts: [
      ...state.attempts,
      {
        questionIndex: state.question.index,
        entryId: state.question.entry.id,
        entryLabel: state.question.entry.label,
        indexNumber: state.question.entry.index,
        trueCount: state.question.trueCount,
        distanceToIndex: state.question.distanceToIndex,
        firing: state.question.firing,
        actionTaken: decision.actionTaken,
        correctAction: decision.correctAction,
        basicStrategyAction: decision.basicStrategyAction,
        verdict: result.verdict,
        evLoss: decision.evLoss,
        at,
      },
    ],
    lastResult: result,
  });
}

/** Moves to the next question. Not an undo point — undo takes back an *answer*. */
export function nextDeviationQuestion(drill: DeviationDrill): DeviationDrill {
  const state = drill.current;
  return replace(drill, {
    ...state,
    question: deviationQuestion(
      state.config,
      state.availability,
      state.seed,
      state.question.index + 1,
    ),
    lastResult: null,
  });
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export interface EntryStat {
  readonly entryId: string;
  readonly label: string;
  readonly indexNumber: number;
  readonly attempts: number;
  readonly correct: number;
  readonly accuracy: number | null;
  readonly evLost: number;
}

export interface DeviationReport {
  readonly tally: ScoreTally;
  readonly attempts: readonly DeviationAttempt[];
  readonly undone: number;
  readonly availability: DeviationDrillAvailability;
  /** Per published index, worst first. Which numbers you have actually learnt. */
  readonly byEntry: readonly EntryStat[];
  /** Accuracy on questions where the count *had* crossed the index. */
  readonly departures: { readonly attempts: number; readonly correct: number; readonly accuracy: number | null };
  /** Accuracy on questions where it had not — the half that catches over-deviating. */
  readonly holds: { readonly attempts: number; readonly correct: number; readonly accuracy: number | null };
  /** Times the count had crossed an index and the chart play was made anyway. */
  readonly missedDepartures: number;
  /** Times a departure was made at a count that does not support it. */
  readonly earlyDepartures: number;
}

export function deviationReport(drill: DeviationDrill): DeviationReport {
  const state = drill.current;
  const attempts = state.attempts;

  const byEntry = new Map<string, EntryStat>();
  for (const attempt of attempts) {
    const existing = byEntry.get(attempt.entryId);
    const correct = (existing?.correct ?? 0) + (attempt.verdict === "correct" ? 1 : 0);
    const count = (existing?.attempts ?? 0) + 1;
    byEntry.set(attempt.entryId, {
      entryId: attempt.entryId,
      label: attempt.entryLabel,
      indexNumber: attempt.indexNumber,
      attempts: count,
      correct,
      accuracy: rate(correct, count),
      evLost: (existing?.evLost ?? 0) + (attempt.evLoss ?? 0),
    });
  }

  const sliceOf = (of: (a: DeviationAttempt) => boolean) => {
    const members = attempts.filter(of);
    const correct = members.filter((a) => a.verdict === "correct").length;
    return { attempts: members.length, correct, accuracy: rate(correct, members.length) };
  };

  return {
    tally: state.tally,
    attempts,
    undone: drill.undone,
    availability: state.availability,
    byEntry: [...byEntry.values()].sort(
      (a, b) =>
        b.attempts - b.correct - (a.attempts - a.correct) ||
        b.evLost - a.evLost ||
        a.entryId.localeCompare(b.entryId),
    ),
    departures: sliceOf((a) => a.firing),
    holds: sliceOf((a) => !a.firing),
    missedDepartures: attempts.filter(
      (a) => a.firing && a.verdict === "incorrect" && a.actionTaken === a.basicStrategyAction,
    ).length,
    earlyDepartures: attempts.filter(
      (a) => !a.firing && a.verdict === "incorrect" && a.actionTaken !== a.basicStrategyAction,
    ).length,
  };
}
