/**
 * Counting Systems — the product's wedge.
 *
 * The category leader ships one unnamed running/true count and no index play
 * (`docs/research/competitive-landscape.md`). Six named, correct systems is the reason this
 * product exists, so every tag table below is transcribed from a published source and the
 * citation travels with the data in `source`.
 *
 * A Counting System is *data*: a tag table, a balanced flag, a level, and a pivot. All the
 * logic in this file is driven by those fields, so a seventh system is a new entry in
 * `COUNTING_SYSTEMS` and nothing else.
 *
 * Pure and synchronous, no I/O, no clock, no `Math.random()` (ADR-0002).
 */

import { type Card, type Rank, type Suit, freshDeck, isAce } from "./cards";

export type CountingSystemId = "hi-lo" | "ko" | "omega-ii" | "wong-halves" | "zen" | "red-7";

/** How many distinct tag magnitudes a system uses. Level 1 is +/-1 only; level 3 uses halves. */
export type CountingSystemLevel = 1 | 2 | 3;

/** A tag for every rank. Tens, jacks, queens and kings always share a value. */
export type TagTable = Readonly<Record<Rank, number>>;

/**
 * Rank-and-suit tag overrides. Only Red 7 needs these — its red sevens count +1 and its
 * black sevens 0 — but keeping it on the interface means suit-sensitive systems need no
 * special case in `tagFor`.
 */
export type SuitedTagTable = Readonly<Partial<Record<Rank, Readonly<Record<Suit, number>>>>>;

export interface CountingSystem {
  readonly id: CountingSystemId;
  /** The published name, shown to the user. Named systems are the point. */
  readonly name: string;
  readonly level: CountingSystemLevel;
  /** True when the tags sum to exactly zero over a full deck (CONTEXT.md glossary). */
  readonly balanced: boolean;
  readonly tags: TagTable;
  readonly suitedTags?: SuitedTagTable;
  /**
   * True when the system tags aces 0 and therefore cannot value the remaining shoe for
   * betting without a separate ace count. See `aceSideCount`.
   */
  readonly usesAceSideCount: boolean;
  /**
   * The one Running Count that signals the same edge at every depth of the shoe, given the
   * system's initial running count. That is what lets an unbalanced system skip the
   * true-count conversion at this point.
   *
   * It is *not* in general where the remaining shoe is neutral. For a balanced system the
   * pivot is 0 and the two coincide; KO's pivot is +4, and a KO Running Count of +4 means a
   * remaining shoe worth roughly a true count of +4 — favourable, not neutral — at any depth.
   */
  readonly pivot: number;
  /**
   * Running Count at which the player starts raising bets, by deck count. Unbalanced
   * systems only, and only for the deck counts their authors published.
   */
  readonly keyCounts?: Readonly<Record<number, number>>;
  /** Where these tags were transcribed from. Invariant 4: the math is auditable. */
  readonly source: string;
}

/** The ten distinct values a published tag table lists. `T` covers 10, J, Q and K. */
type TagSpec = Readonly<
  Record<"A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "T", number>
>;

/** Expands a published tag table into a tag for every rank. */
function tagTable(spec: TagSpec): TagTable {
  return {
    A: spec.A,
    "2": spec["2"],
    "3": spec["3"],
    "4": spec["4"],
    "5": spec["5"],
    "6": spec["6"],
    "7": spec["7"],
    "8": spec["8"],
    "9": spec["9"],
    "10": spec.T,
    J: spec.T,
    Q: spec.T,
    K: spec.T,
  };
}

/**
 * Hi-Lo — Harvey Dubner's simplification of Thorp's Ten Count, and the system every
 * published index set is quoted against. The default.
 */
export const HI_LO: CountingSystem = {
  id: "hi-lo",
  name: "Hi-Lo",
  level: 1,
  balanced: true,
  tags: tagTable({ A: -1, "2": 1, "3": 1, "4": 1, "5": 1, "6": 1, "7": 0, "8": 0, "9": 0, T: -1 }),
  usesAceSideCount: false,
  pivot: 0,
  source: "Dubner's Hi-Lo as published in Wong, Professional Blackjack",
};

/**
 * KO (Knock-Out) — Vancura & Fuchs. Unbalanced: the tags sum to +4 per deck, so the count
 * is started at an offset that makes the pivot land on +4 regardless of deck count. That is
 * the trade the system makes — no true-count division, at the cost of a deck-dependent start.
 */
export const KO: CountingSystem = {
  id: "ko",
  name: "KO",
  level: 1,
  balanced: false,
  tags: tagTable({ A: -1, "2": 1, "3": 1, "4": 1, "5": 1, "6": 1, "7": 1, "8": 0, "9": 0, T: -1 }),
  usesAceSideCount: false,
  pivot: 4,
  // Published Key Counts. The offsets from the initial running count are irregular, so these
  // are a lookup rather than a formula, and only the deck counts the authors published appear
  // — four decks is deliberately absent rather than interpolated.
  keyCounts: { 1: 2, 2: 1, 6: -4, 8: -6 },
  source: "Vancura & Fuchs, Knock-Out Blackjack (standard IRC)",
};

/**
 * Omega II — Bryce Carlson. Level 2 and ace-neutral: aces are tagged 0 so the running count
 * tracks strategy-relevant composition cleanly, which is precisely why it needs an ace side
 * count before any betting decision.
 */
export const OMEGA_II: CountingSystem = {
  id: "omega-ii",
  name: "Omega II",
  level: 2,
  balanced: true,
  tags: tagTable({ A: 0, "2": 1, "3": 1, "4": 2, "5": 2, "6": 2, "7": 1, "8": 0, "9": -1, T: -2 }),
  usesAceSideCount: true,
  pivot: 0,
  source: "Carlson, Blackjack for Blood (Advanced Omega II)",
};

/**
 * Wong Halves — Stanford Wong. Level 3, with fractional tags. The halves are kept as halves
 * rather than doubled: the published index numbers are quoted against the fractional scale,
 * and every value here is an exact binary fraction, so the sums stay exact.
 */
export const WONG_HALVES: CountingSystem = {
  id: "wong-halves",
  name: "Wong Halves",
  level: 3,
  balanced: true,
  tags: tagTable({
    A: -1,
    "2": 0.5,
    "3": 1,
    "4": 1,
    "5": 1.5,
    "6": 1,
    "7": 0.5,
    "8": 0,
    "9": -0.5,
    T: -1,
  }),
  usesAceSideCount: false,
  pivot: 0,
  source: "Wong, Professional Blackjack (Halves)",
};

/** Zen Count — Arnold Snyder. Level 2, and unusually counts aces at -1 rather than 0. */
export const ZEN: CountingSystem = {
  id: "zen",
  name: "Zen Count",
  level: 2,
  balanced: true,
  tags: tagTable({ A: -1, "2": 1, "3": 1, "4": 2, "5": 2, "6": 2, "7": 1, "8": 0, "9": 0, T: -2 }),
  usesAceSideCount: false,
  pivot: 0,
  source: "Snyder, Blackbelt in Blackjack (Zen Count)",
};

/**
 * Red 7 — Arnold Snyder, the first unbalanced point count. Suit matters: a red seven counts
 * +1 and a black seven 0. That is the entire trick — it adds exactly two points per deck,
 * which is what makes the count unbalanced without adding a second tag magnitude.
 */
export const RED_7: CountingSystem = {
  id: "red-7",
  name: "Red 7",
  level: 1,
  balanced: false,
  // The base table is the black seven; the red sevens override to +1 below.
  tags: tagTable({ A: -1, "2": 1, "3": 1, "4": 1, "5": 1, "6": 1, "7": 0, "8": 0, "9": 0, T: -1 }),
  suitedTags: { "7": { s: 0, c: 0, h: 1, d: 1 } },
  usesAceSideCount: false,
  // Red 7 publishes no separate Key Count: the pivot is 0 and the player raises bets as the
  // count goes positive, so `keyCounts` is absent rather than a table of zeroes.
  pivot: 0,
  source: "Snyder, Blackbelt in Blackjack (Red Seven Count)",
};

export const COUNTING_SYSTEMS: readonly CountingSystem[] = [
  HI_LO,
  KO,
  OMEGA_II,
  WONG_HALVES,
  ZEN,
  RED_7,
];

/** Hi-Lo is the default: it is the system every published index set is quoted against. */
export const DEFAULT_COUNTING_SYSTEM = HI_LO;

export function getCountingSystem(id: CountingSystemId): CountingSystem {
  const system = COUNTING_SYSTEMS.find((candidate) => candidate.id === id);
  if (!system) {
    throw new Error(
      `Unknown counting system "${id}". Known systems: ${COUNTING_SYSTEMS.map((s) => s.id).join(", ")}.`,
    );
  }
  return system;
}

/** The tag a system assigns to one card. Suit is consulted only where a system uses it. */
export function tagFor(card: Card, system: CountingSystem): number {
  const suited = system.suitedTags?.[card.rank]?.[card.suit];
  return suited ?? system.tags[card.rank];
}

/**
 * Running Count: the sum of the tags of the cards seen so far (CONTEXT.md glossary).
 *
 * This is the tag sum alone. An unbalanced system's count as the player holds it also
 * carries the initial running count — see `currentRunningCount`.
 */
export function runningCount(cards: readonly Card[], system: CountingSystem): number {
  let count = 0;
  for (const card of cards) count += tagFor(card, system);
  return normalizeZero(count);
}

/**
 * Sum of a system's tags over one full 52-card deck. Zero for a balanced system; +4 for KO
 * and +2 for Red 7. Computed from the tag table rather than stored, so it cannot drift out
 * of step with the tags.
 */
export function deckTagSum(system: CountingSystem): number {
  return runningCount(freshDeck(), system);
}

/**
 * Invariant 5, as a function: a balanced system's tags sum to exactly zero over a deck.
 * `verifyBalance` recomputes it; `system.balanced` merely claims it. CI asserts they agree,
 * and the Shoe Integrity Panel shows the user the recomputed answer.
 */
export function verifyBalance(system: CountingSystem): boolean {
  return (deckTagSum(system) === 0) === system.balanced;
}

/**
 * The count an unbalanced system starts at, so that a fully dealt shoe finishes on the pivot.
 *
 * Derived, not tabulated: `pivot - tagsPerDeck x decks`. For KO that reproduces the published
 * `4 - 4 x decks` (0, -4, -20, -28 at 1/2/6/8 decks) and for Red 7 the published `-2 x decks`.
 * Always 0 for a balanced system, which is why the player starts those at zero.
 */
export function initialRunningCount(system: CountingSystem, decks: number): number {
  return normalizeZero(system.pivot - deckTagSum(system) * decks);
}

/**
 * The Running Count the player is actually holding: the initial running count for the deck
 * count in play, plus the tags seen so far. For balanced systems this is just `runningCount`.
 */
export function currentRunningCount(
  cards: readonly Card[],
  system: CountingSystem,
  decks: number,
): number {
  return normalizeZero(initialRunningCount(system, decks) + runningCount(cards, system));
}

/**
 * The published Key Count — where an unbalanced system's player starts raising bets — or
 * `undefined` when the system is balanced or the author published nothing for this deck count.
 * Balanced systems use the true count against an index instead.
 */
export function keyCount(system: CountingSystem, decks: number): number | undefined {
  return system.keyCounts?.[decks];
}

/**
 * How the exact true count is reduced to the number compared against an index.
 *
 * - `exact` — no rounding. Use this for EV and for anything downstream that rounds itself.
 * - `truncate` — toward zero. +3.9 becomes +3, -3.9 becomes -3. **The default.**
 * - `floor` — toward negative infinity. +3.9 becomes +3, -3.1 becomes -4.
 * - `round` — to nearest, halves away from zero. +3.5 becomes +4, -3.5 becomes -4.
 */
export type TrueCountRounding = "exact" | "truncate" | "floor" | "round";

/**
 * Truncation toward zero is the default because it is symmetric and conservative in both
 * directions: it never credits the player with more advantage than they have hold of at a
 * positive count, and never overstates the danger at a negative one. `floor` is *not*
 * symmetric — it is conservative when positive and aggressive when negative — which is a
 * subtle way to get negative-count play wrong, and mishandled negative counts are exactly
 * what users have caught competitors doing.
 */
export const DEFAULT_TRUE_COUNT_ROUNDING: TrueCountRounding = "truncate";

/**
 * True Count: Running Count divided by estimated decks remaining (CONTEXT.md glossary).
 *
 * Takes the Running Count already held by the player, so unbalanced systems can be excluded
 * by the caller rather than silently producing a meaningless number. `decksRemaining` is
 * fractional — `decksRemaining(shoe)` from `shoe.ts` supplies it — and may be less than one.
 */
export function trueCount(
  runningCount: number,
  decksRemaining: number,
  rounding: TrueCountRounding = DEFAULT_TRUE_COUNT_ROUNDING,
): number {
  if (!Number.isFinite(decksRemaining) || decksRemaining <= 0) {
    throw new Error(
      `True count is undefined with ${decksRemaining} decks remaining. ` +
        `Convert only while cards are left; the shoe reshuffles at the cut card.`,
    );
  }

  const exact = runningCount / decksRemaining;
  switch (rounding) {
    case "exact":
      return normalizeZero(exact);
    case "truncate":
      return normalizeZero(Math.trunc(exact));
    case "floor":
      return normalizeZero(Math.floor(exact));
    case "round":
      // Math.round breaks halves toward positive infinity, so -3.5 would become -3 while
      // +3.5 becomes +4. Round the magnitude instead to keep the two directions symmetric.
      return normalizeZero(Math.sign(exact) * Math.round(Math.abs(exact)));
  }
}

export interface AceSideCount {
  /** Aces already seen. */
  readonly seen: number;
  /** Aces left in the shoe. */
  readonly remaining: number;
  /** Aces a neutral shoe would still hold: four per deck remaining. Fractional. */
  readonly expectedRemaining: number;
  /** `remaining - expectedRemaining`. Positive means the shoe is ace-rich. */
  readonly surplus: number;
  /** Surplus normalised per deck remaining, the form a betting decision uses. */
  readonly surplusPerDeck: number;
}

/**
 * The ace side count Omega II needs. Omega II tags aces 0, so its Running Count says nothing
 * about how many aces are left — and aces are the single most bet-relevant rank in the shoe.
 *
 * This reports the side count only; `aceAdjustmentValue` folds it into a count for betting.
 *
 * `surplus` is exactly Carlson's "extra" aces. He defines the baseline off the cards *dealt* —
 * "there should be one Ace for every 13 cards" — where this counts up from the cards remaining,
 * and the two are the same number, not an approximation: with `n` cards dealt and `seen` aces
 * among them, `remaining - expectedRemaining` reduces to `n / 13 - seen`.
 */
export function aceSideCount(cards: readonly Card[], decks: number): AceSideCount {
  let seen = 0;
  for (const card of cards) if (isAce(card.rank)) seen++;

  const remaining = decks * 4 - seen;
  const decksLeft = (decks * 52 - cards.length) / 52;
  const expectedRemaining = decksLeft * 4;
  const surplus = remaining - expectedRemaining;

  return {
    seen,
    remaining,
    expectedRemaining,
    surplus: normalizeZero(surplus),
    surplusPerDeck: decksLeft > 0 ? normalizeZero(surplus / decksLeft) : 0,
  };
}

/**
 * What one surplus ace is worth on the system's own count scale, for betting.
 *
 * Carlson states it outright for Omega II, in the system's own book — "If an excess of Aces
 * remain, add +2 to the running count for each 'extra' Ace per 13 dealt cards. If an excess of
 * Aces have fallen, add -2 to the running count for each Ace 'short' per 13 dealt cards."
 * Source: Carlson, Blackjack for Blood, "adjusting count for" aces — pp. 77-79 in the 2017
 * Huntington Press edition, p. 90 in the 1992 Gamestar edition.
 *
 * So the number is +/-2 for Omega II, from the primary source. It is nevertheless *derived from
 * the tag table* here rather than stored, because 2 is not a free constant: it is the magnitude
 * of the system's own ten tag. Humble's Hi-Opt I, which tags tens -1, publishes the same rule at
 * +/-1 — "for every extra ace that is left in the deck, you can add a count of plus one to the
 * running count for betting purposes ... for every extra ace that is out of the deck ... minus
 * one" (Humble, Blackjack Gold). Wattenberger states the generalised form, naming Omega II:
 * multiply excess aces by "the absolute value of the point count value assigned by the current
 * strategy to Ten-value cards" (Modern Blackjack, "Blackjack Side Counts",
 * www.qfit.com/book/ModernBlackjackPage185.htm; per-system values at
 * www.qfit.com/blackjack-side-counting-setup.htm). Reading it off `tags["10"]` means a seventh
 * ace-neutral system needs no new number, and a mistyped ten tag cannot leave the two disagreeing.
 *
 * Consistency check on the magnitude: this adjustment is equivalent to counting the ace -2 for
 * betting, and Carlson's published claim is that the side count lifts Advanced Omega II's betting
 * correlation to .99 from .92 without it (both figures repeated in Dalton, Blackjack Encyclopedia;
 * QFIT lists the unadjusted .92). Recomputing BC against Griffin's betting effects of removal
 * (Theory of Blackjack, ch. 4 p. 44) reproduces both: .917 with the ace at 0, .989 with it at -2.
 *
 * Throws for ace-reckoned systems. The rule is published as valid only for ace-neutral counts;
 * Hi-Lo and friends already price the ace into their tags, and quietly returning a no-op
 * adjustment would hide a caller's mistake instead of surfacing it.
 */
export function aceAdjustmentValue(system: CountingSystem): number {
  if (!system.usesAceSideCount) {
    throw new Error(
      `${system.name} counts aces at ${system.tags.A}, so it needs no ace side count adjustment. ` +
        `The betting adjustment is defined only for ace-neutral systems (Omega II here).`,
    );
  }
  return Math.abs(system.tags["10"]);
}

/**
 * The exact amount the ace side count moves the true count: the adjustment value times the ace
 * surplus per deck remaining.
 *
 * This is the number to *show* a user — "+1.6 from a four-ace surplus" — and it is exact, not
 * rounded. Do not add it to an already-rounded true count: the published procedure adjusts the
 * running count and then converts, which is what `bettingTrueCount` does.
 */
export function aceTrueCountAdjustment(side: AceSideCount, system: CountingSystem): number {
  return normalizeZero(aceAdjustmentValue(system) * side.surplusPerDeck);
}

/**
 * The Running Count as adjusted for betting: `runningCount + adjustmentValue x surplus`.
 *
 * This is the number Carlson's own worked examples end on, and the adjustment is explicitly
 * disposable: "after placing our bet, we would toss out the +5 adjusted running count, revert
 * back to the original running count of -1, and continue with the play." Playing decisions keep
 * using the unadjusted count, which is the whole reason Omega II tags aces 0 to begin with.
 */
export function aceAdjustedRunningCount(
  runningCount: number,
  side: AceSideCount,
  system: CountingSystem,
): number {
  return normalizeZero(runningCount + aceAdjustmentValue(system) * side.surplus);
}

/**
 * The True Count to bet off: the ace-adjusted running count, converted.
 *
 * The order matters. Rounding is applied *after* the ace adjustment, because the procedure
 * adjusts the running count and only then recalculates the true count — "temporarily add the
 * result to the running count / recalculate the true count for betting purposes only"
 * (Wattenberger, www.qfit.com/blackjack-side-counts.htm). Adjusting an already-truncated true
 * count rounds twice and can land a whole point away.
 *
 * The conversion step is sourced to Wattenberger rather than to Carlson: Carlson's own worked
 * examples are pitch games and stop at the adjusted running count, so `aceAdjustedRunningCount`
 * is the function that matches the primary source literally.
 */
export function bettingTrueCount(
  runningCount: number,
  decksRemaining: number,
  side: AceSideCount,
  system: CountingSystem,
  rounding: TrueCountRounding = DEFAULT_TRUE_COUNT_ROUNDING,
): number {
  return trueCount(aceAdjustedRunningCount(runningCount, side, system), decksRemaining, rounding);
}

/**
 * Collapses negative zero to zero. `Math.trunc(-0.4)` is `-0`, which renders to the user as
 * "-0" and compares unequal to `0` under `Object.is`. A count display is the last place that
 * should look broken.
 */
function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}
