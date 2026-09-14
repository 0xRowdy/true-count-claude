/**
 * Explanation — the *why* behind a verdict, as data.
 *
 * Invariant 2 (CONTEXT.md): every wrong verdict carries an Explanation. ADR-0005 says what
 * it holds and why it is the product rather than a feature of it — "it doesn't actually
 * teach" is the largest product complaint in this category at 22% of low-star reviews, and
 * the reviews say exactly what is missing:
 *
 *   > "They tell you if your move is right or wrong, but they don't tell you why."
 *
 * Two rules follow, and this module exists to enforce both.
 *
 * **An Explanation is structured data, never a sentence.** No function here returns prose
 * for a screen to print. It returns the per-action EVs from `actionEvs`, the governing
 * chart cell from `governingCell`, the dealer's own final-total odds, and the index number
 * with the distance the count sits from it. A screen decides how to say that; the engine
 * decides what is true. Prose baked in here could not be translated, re-laid-out, or
 * expanded into the chart view the Explanation panel wants — and, worse, it could drift
 * from the numbers it claims to describe.
 *
 * **Correct answers are explained too.** Nothing below takes the verdict as an input. The
 * Explanation is built from the situation, not from whether the user got it right, so
 * confirming your reasoning after a correct play costs exactly as much as being corrected
 * after a wrong one. A trainer that only speaks when you are wrong teaches you to guess
 * until it goes quiet.
 *
 * Everything here is pure and synchronous, and cheap enough to call at the instant of the
 * tap while the cards are still on the table (invariant 3): a decision explanation costs a
 * few milliseconds at six decks, dealer odds included.
 */

import {
  type Action,
  type ActionEvs,
  type Card,
  type CountingSystem,
  type CountingSystemId,
  type DealerOutcomes,
  type Deviation,
  type DeviationSkipReason,
  type GoverningCell,
  type Hand,
  type IndexDirection,
  type IndexEntry,
  type RankComposition,
  type RankedAction,
  type RuleSet,
  type TrueCountRounding,
  DEFAULT_TRUE_COUNT_ROUNDING,
  RANKS,
  actionEvs,
  dealerOutcomes,
  deviationLookup,
  evaluate,
  getIndexSet,
  governingCell,
  insuranceDeviation,
  insuranceIndex,
  isTen,
  legalActions,
  rankActions,
  trueCount,
} from "@/engine";

/** A player action plus the two side-bet decisions. Matches `DecisionAction` in `src/state`. */
export type DrillAction = Action | "insurance" | "decline-insurance";

// ---------------------------------------------------------------------------
// The count
// ---------------------------------------------------------------------------

/**
 * The count at the instant of a decision, with the division that produced it left visible.
 *
 * `trueCount` is `null` rather than a number whenever there is no such number to show —
 * `trueCount()` in the engine throws at zero decks remaining, and an unbalanced system does
 * not convert at all; its player reads the Running Count against a pivot. `trueCountNote`
 * says which, so a screen can print the reason instead of a blank.
 */
export interface CountContext {
  readonly system: CountingSystemId;
  readonly systemName: string;
  readonly balanced: boolean;
  /** The Running Count the player is holding — an unbalanced system's start value included. */
  readonly runningCount: number;
  readonly cardsRemaining: number;
  readonly decksRemaining: number;
  readonly rounding: TrueCountRounding;
  /** The rounded True Count, or `null` when the conversion does not exist. */
  readonly trueCount: number | null;
  /** The unrounded quotient, so the rounding step is visible rather than assumed. */
  readonly exactTrueCount: number | null;
  /** Why `trueCount` is null. `null` when it is a number. */
  readonly trueCountNote: string | null;
}

export interface CountContextInput {
  readonly system: CountingSystem;
  /** Decks in the shoe — the divisor an unbalanced system's start value depends on. */
  readonly decks: number;
  readonly runningCount: number;
  readonly cardsRemaining: number;
  readonly rounding?: TrueCountRounding;
}

export function buildCountContext(input: CountContextInput): CountContext {
  const { system, runningCount, cardsRemaining } = input;
  const rounding = input.rounding ?? DEFAULT_TRUE_COUNT_ROUNDING;
  const decksRemaining = cardsRemaining / 52;

  const note = !system.balanced
    ? `${system.name} is unbalanced — play the Running Count against its pivot of ${system.pivot} rather than converting.`
    : decksRemaining <= 0
      ? "No cards left to divide by; the shoe reshuffles at the cut card."
      : null;

  return {
    system: system.id,
    systemName: system.name,
    balanced: system.balanced,
    runningCount,
    cardsRemaining,
    decksRemaining,
    rounding,
    trueCount: note === null ? trueCount(runningCount, decksRemaining, rounding) : null,
    exactTrueCount: note === null ? trueCount(runningCount, decksRemaining, "exact") : null,
    trueCountNote: note,
  };
}

// ---------------------------------------------------------------------------
// The index
// ---------------------------------------------------------------------------

/**
 * Why no index applies. The engine's own reasons, plus the one only a drill can hit: an
 * index needs a True Count to compare against, and there is no such number at the end of a
 * shoe or for an unbalanced system.
 */
export type IndexSkipReason = DeviationSkipReason | "no-true-count";

/**
 * How far the count sits from the index that governs this hand, and which way.
 *
 * `distanceToIndex` is always `trueCount - index`, signed, in both directions. It is not
 * folded into "how far from firing", because the sign is the thing users get backwards:
 * the negative half of the Illustrious 18 fires *below* its index, and a distance that
 * silently flipped sign for those entries would teach the error it exists to correct.
 * `fired` says whether the departure actually applies; `direction` says which side does it.
 */
export interface IndexExplanation {
  /** The published entry covering this hand, or `null` when none does. */
  readonly entry: IndexEntry | null;
  readonly index: number | null;
  readonly direction: IndexDirection | null;
  /** `trueCount - index`. Null when there is no entry or no True Count to compare. */
  readonly distanceToIndex: number | null;
  /** True when the count has crossed the index and the departure is the right play. */
  readonly fired: boolean;
  /** The departure, when one fired. */
  readonly deviation: Deviation | null;
  /** Why there is no departure. `null` when there is one. */
  readonly skipped: IndexSkipReason | null;
  /**
   * The True Count at which this cell's play changes. The index number itself, which
   * always belongs to the "at or above" side — 16 vs 10 stands at exactly 0.
   */
  readonly flipsAt: number | null;
  /** The entry's own sourcing caveat, where it has one. */
  readonly entryNote: string | null;
  /** Why no index set applies at all, for the systems that publish none. */
  readonly systemNote: string | null;
}

const NO_INDEX: IndexExplanation = {
  entry: null,
  index: null,
  direction: null,
  distanceToIndex: null,
  fired: false,
  deviation: null,
  skipped: null,
  flipsAt: null,
  entryNote: null,
  systemNote: null,
};

/**
 * The systems that publish an index set. Hi-Lo is the only one today, and the others
 * return `null` rather than borrowing its numbers — an index is quoted against its own
 * system's true-count scale and is not transferable.
 */
export function systemsWithIndexes(): readonly CountingSystemId[] {
  return ["hi-lo"];
}

function noIndexSetNote(system: CountingSystem): string {
  return (
    `${system.name} publishes no index set. The Illustrious 18 and Fab 4 are quoted against ` +
    `Hi-Lo's true-count scale and do not transfer, so no deviation is scored here — switch to ` +
    `Hi-Lo to drill index play.`
  );
}

/** Everything `legalActions` and `governingCell` need that a `Hand` does not carry. */
export interface HandContext {
  readonly handCount?: number;
  readonly bankroll?: number;
}

export function buildIndexExplanation(
  hand: Hand,
  dealerUpcard: Card,
  rules: RuleSet,
  system: CountingSystem,
  count: CountContext,
  context: HandContext = {},
): IndexExplanation {
  if (!getIndexSet(system)) {
    return { ...NO_INDEX, skipped: "no-index-set", systemNote: noIndexSetNote(system) };
  }
  if (count.trueCount === null) {
    // The system publishes indices, but there is no number to compare them against — an
    // exhausted shoe, or an unbalanced count that never converts. Saying "no index set"
    // here would blame the wrong thing.
    return { ...NO_INDEX, skipped: "no-true-count", systemNote: count.trueCountNote };
  }

  const lookup = deviationLookup(hand, dealerUpcard, count.trueCount, rules, system, context);
  const entry = lookup.entry;

  return {
    entry,
    index: entry?.index ?? null,
    direction: entry?.direction ?? null,
    distanceToIndex: entry ? count.trueCount - entry.index : null,
    fired: lookup.deviation !== null,
    deviation: lookup.deviation,
    skipped: lookup.skipped,
    flipsAt: entry?.index ?? null,
    entryNote: entry?.note ?? null,
    systemNote: null,
  };
}

// ---------------------------------------------------------------------------
// The hand
// ---------------------------------------------------------------------------

/**
 * The hand as it stood when the decision was taken.
 *
 * Carried with the verdict rather than read back off the round, because the round moves on
 * the instant an action is applied — a split deals two cards, a stand can settle the whole
 * table. Invariant 3 says feedback arrives while the cards are still visible, and a
 * competitor review names post-sweep grading as the specific thing that made a drill
 * useless: *"when you make a mistake, you find out only after the cards dealt have been
 * removed."* A snapshot is what lets a screen keep showing the graded hand no matter what
 * the round did next.
 *
 * The field names match `DecisionHand` in `src/state/types.ts`, so this drops into a
 * Session's Decision log unchanged.
 */
export interface HandSnapshot {
  readonly handIndex: number;
  readonly playerCards: readonly Card[];
  readonly dealerUpcard: Card;
  readonly total: number;
  readonly soft: boolean;
  readonly fromSplit: boolean;
  readonly bet: number;
  /** How many hands the player held, which is what the resplit limit is read against. */
  readonly handCount: number;
}

export function snapshotHand(
  hand: Hand,
  dealerUpcard: Card,
  handIndex: number,
  handCount: number,
): HandSnapshot {
  const value = evaluate(hand.cards);
  return {
    handIndex,
    playerCards: hand.cards,
    dealerUpcard,
    total: value.total,
    soft: value.soft,
    fromSplit: hand.fromSplit,
    bet: hand.bet,
    handCount,
  };
}

// ---------------------------------------------------------------------------
// A playing decision
// ---------------------------------------------------------------------------

/**
 * Everything a decision can be scored and explained from, with no drill state attached.
 *
 * This is the argument to every `score` function in this module, and it is deliberately
 * plain data: a screen can build one from a live round, a generated question, or a replay,
 * and grade it synchronously at the moment of the tap.
 */
export interface DecisionSituation {
  readonly rules: RuleSet;
  readonly system: CountingSystem;
  readonly hand: Hand;
  readonly handIndex: number;
  readonly handCount: number;
  readonly dealerUpcard: Card;
  readonly bankroll: number;
  /**
   * The cards the player has not seen: the undealt shoe plus the dealer's hole card, with
   * the player's own cards and the upcard taken out. `unseenComposition` builds it — note
   * that `remainingComposition` alone is one card short during a live round, because the
   * hole card has left the shoe but nobody has seen it.
   *
   * `null` when no composition is available, in which case the EVs are omitted and
   * `evNote` says why rather than showing numbers computed against the wrong shoe.
   */
  readonly composition: RankComposition | null;
  /**
   * The count at this moment. It must be read off the *same* shoe as `composition` — the
   * drills in this module derive both from one `Shoe` for exactly that reason. A count and
   * a composition that disagree would produce an Explanation whose EVs contradict its own
   * index lookup, which is the "wrong math" failure in its most convincing disguise.
   */
  readonly count: CountContext;
}

/** The why behind a playing decision. Built from the situation alone; never from the verdict. */
export interface DecisionExplanation {
  readonly kind: "decision";
  readonly hand: HandSnapshot;
  readonly rules: RuleSet;
  readonly count: CountContext;
  /** The chart cell behind the Basic Strategy play — the cell the panel highlights. */
  readonly cell: GoverningCell;
  readonly basicStrategyAction: Action;
  /** Exactly the buttons the player had. Never a superset (invariant 7). */
  readonly legalActions: readonly Action[];
  /** The expected value of each legal action, in units of the opening bet. */
  readonly evs: ActionEvs;
  /** The same numbers, best first. */
  readonly ranked: readonly RankedAction[];
  /** The highest-EV action for this exact composition, or `null` when no EVs were available. */
  readonly bestByEv: Action | null;
  /** The dealer's final-total odds behind the stand EV. `null` alongside a null composition. */
  readonly dealer: DealerOutcomes | null;
  /** Why the EVs are missing, when they are. `null` when they are present. */
  readonly evNote: string | null;
  /** The index number governing this hand, and how far the count sits from it. */
  readonly index: IndexExplanation;
  /** The play once the count is taken into account: the departure if one fired, else the chart. */
  readonly countAwareAction: Action;
}

const EMPTY_COMPOSITION_NOTE =
  "No cards left unseen, so there is nothing to compute an expected value against.";

const NO_COMPOSITION_NOTE =
  "This question was posed without a shoe behind it, so there are no per-action expected values.";

function compositionSize(composition: RankComposition): number {
  let total = 0;
  for (const rank of RANKS) total += composition[rank];
  return total;
}

/**
 * Builds the full Explanation for a playing decision.
 *
 * The EVs, the chart cell and the index lookup all come from the engine, so they cannot
 * drift out of step with the verdicts they justify (ADR-0005). They are computed against
 * the *remaining* composition, which is what makes the count's effect fall out of the
 * arithmetic — a ten-rich shoe is a composition with more tens in it, and standing on 16
 * gets better because the dealer busts more often, not because a table said so.
 */
export function explainDecision(situation: DecisionSituation): DecisionExplanation {
  const { rules, system, hand, dealerUpcard, composition, count } = situation;
  const context: HandContext = {
    handCount: situation.handCount,
    bankroll: situation.bankroll,
  };

  const cell = governingCell(hand, dealerUpcard, rules, context);
  const legal = legalActions({
    hand,
    rules,
    handCount: situation.handCount,
    bankroll: situation.bankroll,
  });

  const index = buildIndexExplanation(hand, dealerUpcard, rules, system, count, context);
  const departure = index.deviation?.action;
  const countAwareAction =
    departure !== undefined && departure !== "insurance" && departure !== "decline-insurance"
      ? departure
      : cell.action;

  const usable = composition !== null && compositionSize(composition) > 0;
  const evs: ActionEvs = usable ? actionEvs(hand, dealerUpcard, rules, composition, context) : {};
  const ranked = rankActions(evs);

  return {
    kind: "decision",
    hand: snapshotHand(hand, dealerUpcard, situation.handIndex, situation.handCount),
    rules,
    count,
    cell,
    basicStrategyAction: cell.action,
    legalActions: legal,
    evs,
    ranked,
    bestByEv: ranked[0]?.action ?? null,
    dealer: usable ? dealerOutcomes(dealerUpcard, rules, composition) : null,
    evNote: usable ? null : composition === null ? NO_COMPOSITION_NOTE : EMPTY_COMPOSITION_NOTE,
    index,
    countAwareAction,
  };
}

/**
 * What a choice cost against the best available play, in bets, or `null` when the action
 * carries no EV — an illegal tap, or a hand with no shoe behind it.
 *
 * This is the headline of an Explanation: not "wrong", but "this costs 0.043 bets every
 * time you play it" (ADR-0005). Zero means the choice *was* the best play.
 */
export function evLossFor(explanation: DecisionExplanation, action: DrillAction): number | null {
  const best = explanation.ranked[0];
  if (!best) return null;
  const chosen = isHandAction(action) ? explanation.evs[action] : undefined;
  if (chosen === undefined) return null;
  return Math.max(0, best.ev - chosen);
}

export function isHandAction(action: DrillAction): action is Action {
  return action !== "insurance" && action !== "decline-insurance";
}

// ---------------------------------------------------------------------------
// The insurance decision
// ---------------------------------------------------------------------------

/**
 * The why behind an insurance decision.
 *
 * Insurance is not a play on the hand, so it has no chart cell and no `actionEvs` entry —
 * but it does have an exact expected value, and it is the single most valuable index play
 * in the game (Illustrious 18 entry #1). The bet stakes half the opening wager and pays
 * 2:1, so in units of the opening bet it returns `1.5p - 0.5` where `p` is the chance the
 * hole card is a ten. That breaks even at exactly one ten in three, which is the whole
 * reason the count matters here: a fresh shoe holds 16 tens in 52, a shade under a third.
 */
export interface InsuranceExplanation {
  readonly kind: "insurance";
  readonly dealerUpcard: Card;
  /**
   * The hand the player is holding while the offer stands, when there is one. A Deviation
   * drill can pose the insurance decision on its own, with no hand behind it.
   */
  readonly hand: HandSnapshot | null;
  readonly count: CountContext;
  /** Chance the hole card is a ten, from the unseen composition. `null` without one. */
  readonly tenDensity: number | null;
  /** The density at which insurance breaks even: one in three. */
  readonly breakEvenDensity: number;
  /** EV per unit of the opening bet: `1.5 x tenDensity - 0.5`. Positive means take it. */
  readonly ev: number | null;
  /** The published insurance index for the active system, and the distance to it. */
  readonly index: IndexExplanation;
  /** Basic Strategy never insures, at any count. */
  readonly basicStrategyAction: "decline-insurance";
  /** The play once the count is taken into account. */
  readonly countAwareAction: DrillAction;
  readonly evNote: string | null;
}

/** Insurance pays 2:1 on a half-unit stake, so it breaks even at one ten in three. */
export const INSURANCE_BREAK_EVEN_DENSITY = 1 / 3;

export interface InsuranceSituation {
  readonly system: CountingSystem;
  readonly dealerUpcard: Card;
  /** The hand on the table while the offer stands, when the question has one. */
  readonly hand?: HandSnapshot | null;
  /** The unseen pack, hole card included. `null` when no shoe backs the question. */
  readonly composition: RankComposition | null;
  readonly count: CountContext;
}

export function explainInsurance(situation: InsuranceSituation): InsuranceExplanation {
  const { system, composition, count } = situation;

  const index = buildInsuranceIndexExplanation(system, count);
  const take = index.fired;

  let tenDensity: number | null = null;
  if (composition !== null) {
    const total = compositionSize(composition);
    if (total > 0) {
      let tens = 0;
      for (const rank of RANKS) if (isTen(rank)) tens += composition[rank];
      tenDensity = tens / total;
    }
  }

  return {
    kind: "insurance",
    dealerUpcard: situation.dealerUpcard,
    hand: situation.hand ?? null,
    count,
    tenDensity,
    breakEvenDensity: INSURANCE_BREAK_EVEN_DENSITY,
    ev: tenDensity === null ? null : 1.5 * tenDensity - 0.5,
    index,
    basicStrategyAction: "decline-insurance",
    countAwareAction: take ? "insurance" : "decline-insurance",
    evNote:
      tenDensity === null
        ? composition === null
          ? NO_COMPOSITION_NOTE
          : EMPTY_COMPOSITION_NOTE
        : null,
  };
}

function buildInsuranceIndexExplanation(
  system: CountingSystem,
  count: CountContext,
): IndexExplanation {
  const set = getIndexSet(system);
  if (!set) {
    return { ...NO_INDEX, skipped: "no-index-set", systemNote: noIndexSetNote(system) };
  }

  const entry = set.entries.find((candidate) => candidate.hand.kind === "insurance") ?? null;
  if (!entry) return { ...NO_INDEX, skipped: "no-entry" };

  const published = insuranceIndex(system) ?? entry.index;
  if (count.trueCount === null) {
    return {
      ...NO_INDEX,
      entry,
      index: published,
      direction: entry.direction,
      flipsAt: published,
      skipped: "no-true-count",
      systemNote: count.trueCountNote,
      entryNote: entry.note ?? null,
    };
  }

  // The firing decision is the engine's, not this module's. Re-deriving `trueCount >= index`
  // here would be a second copy of the boundary convention, free to drift from the one in
  // `deviations.ts` that every other index lookup goes through.
  const fired = insuranceDeviation(count.trueCount, system);

  return {
    entry,
    index: published,
    direction: entry.direction,
    distanceToIndex: count.trueCount - published,
    fired: fired !== null,
    deviation: fired,
    skipped: fired ? null : "count-on-basic-side",
    flipsAt: published,
    entryNote: entry.note ?? null,
    systemNote: null,
  };
}
