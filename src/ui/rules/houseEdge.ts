/**
 * The house edge implied by a Rule Set.
 *
 * This is the number that teaches. A user can read "6:5 is bad" in a lesson and forget it;
 * watching the edge jump from 0.56% to 1.95% when they tap 6:5 is not forgettable. So the
 * figure has to be right, and it has to be checkable — "wrong math" is 21% of low-star
 * reviews in this category (CONTEXT.md), and a house edge we made up would be exactly the
 * kind of wrong math that poisons the whole app.
 *
 * Accordingly this module invents nothing. It is a published baseline plus published
 * per-rule deltas, each carrying its citation, in the same spirit as the tag tables in
 * `src/engine/counting.ts` and the reference charts in `src/engine/strategy.reference.ts`.
 * Where no figure has been published, `percent` is `undefined` and the total refuses to
 * resolve rather than guessing.
 *
 * ---------------------------------------------------------------------------
 * SOURCES
 * ---------------------------------------------------------------------------
 *
 * [1] Wizard of Odds, "Why the number of decks matters in blackjack".
 *     https://wizardofodds.com/games/blackjack/why-number-of-decks-matter/
 *     Publishes the total house edge against a basic-strategy player by deck count:
 *
 *         1 deck 0.014% · 2 decks 0.341% · 4 decks 0.499% · 6 decks 0.551% · 8 decks 0.577%
 *
 *     under a fully specified game: dealer hits soft 17, blackjack pays 3 to 2, dealer
 *     peeks for blackjack on a ten or ace, player may double on any two cards, player may
 *     double after splitting, player may re-split any pair *including aces* up to three
 *     times (four hands), no surrender, cards shuffled after every hand, player uses basic
 *     strategy. That game is `EDGE_REFERENCE_RULES` below and it is the only absolute
 *     figure in this file; everything else is a delta from it.
 *
 *     The page states the one-deck-to-eight-deck spread as 0.563%, which is exactly
 *     0.577 - 0.014 — a useful internal check that the five figures above were read off
 *     correctly.
 *
 * [2] Wizard of Odds, "Blackjack Rule Variations".
 *     https://wizardofodds.com/games/blackjack/rule-variations/
 *     Publishes the effect of each rule on the *player's expected return*, "after taking
 *     into consideration proper basic strategy adjustments", against a benchmark of eight
 *     decks, dealer stands on soft 17, double on any first two cards, double after split,
 *     split to four hands. The entries used here, verbatim:
 *
 *         Dealer hits on soft 17                -0.22%
 *         Blackjack pays 6-5                    -1.39%
 *         Player may not double after splitting -0.14%
 *         Player may double on 9-11 only        -0.09%
 *         Player may double on 10,11 only       -0.18%
 *         Late surrender against ten            +0.07%
 *         Late surrender against ace            +0.00%
 *         Early surrender against ten           +0.24%
 *         Early surrender against ace           +0.39%
 *         Player may resplit aces               +0.08%
 *         Player may draw to split aces         +0.19%
 *         Player may not resplit                -0.10%
 *         Split to only 3 hands                 -0.01%
 *         European no hole card (splitting)     -0.03%
 *         European no hole card (doubling)      -0.08%
 *
 *     A player-return effect is a house-edge effect with the sign flipped, which is the
 *     one transformation applied to these numbers. Nothing else is derived.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS MODEL DOES NOT CLAIM
 * ---------------------------------------------------------------------------
 *
 * It is additive. Each delta in [2] was computed in a shoe game and the real interactions
 * between rules are small but non-zero — late surrender is worth more against an H17
 * dealer than the +0.07% measured against an S17 one, and 6:5 costs slightly more in
 * single deck because naturals are slightly more frequent. The reference figures also
 * assume a continuous shuffler; a cut-card game costs a basic-strategy player a little
 * more. Treat the total as accurate to about a tenth of a percent, which is what
 * `EDGE_PRECISION_NOTE` tells the user, and which is far inside the gap between a 3:2
 * table and a 6:5 one — the comparison this screen exists to make.
 *
 * There are no published figures for a 3-, 5- or 7-deck game (nobody deals one) or for a
 * game with no splitting at all, so those two inputs resolve to `undefined` and the total
 * reports itself as unavailable. Fewer numbers beats invented ones.
 *
 * Pure TypeScript. Lives in `src/ui` rather than `src/engine` because it is a teaching
 * aid on a settings screen, not part of dealing, strategy or scoring — but it is held to
 * the engine's standard and is tested in `houseEdge.test.ts`.
 */

import type { RuleSet } from "@/engine/rules";

/** Short citation keys, expanded by `EDGE_SOURCES` for display. */
export type EdgeSourceId = "decks" | "variations";

export const EDGE_SOURCES: Readonly<Record<EdgeSourceId, string>> = {
  decks:
    'Wizard of Odds, "Why the number of decks matters in blackjack" — ' +
    "wizardofodds.com/games/blackjack/why-number-of-decks-matter/",
  variations:
    'Wizard of Odds, "Blackjack Rule Variations" — ' +
    "wizardofodds.com/games/blackjack/rule-variations/",
} as const;

export const EDGE_PRECISION_NOTE =
  "Published figures, added up. Each rule's effect was measured on its own, so the total " +
  "is good to roughly a tenth of a percent — not a simulation of your exact table.";

/**
 * The game the baseline figures in [1] describe. Every contribution below is the cost or
 * credit of departing from this table in exactly one respect.
 *
 * Deliberately not `DEFAULT_RULES`: this is a reference point fixed by a published source,
 * and it must not drift when the product's default table changes.
 */
export const EDGE_REFERENCE_RULES = {
  dealerSoft17: "hit",
  blackjackPayout: "3:2",
  doubleAfterSplit: true,
  doubleRule: "any",
  surrender: "none",
  maxSplitHands: 4,
  resplitAces: true,
  oneCardToSplitAces: true,
  dealerPeek: true,
} as const satisfies Partial<RuleSet>;

/** Total house edge by deck count under `EDGE_REFERENCE_RULES`, from source [1]. */
const BASELINE_BY_DECKS: Readonly<Record<number, number>> = {
  1: 0.014,
  2: 0.341,
  4: 0.499,
  6: 0.551,
  8: 0.577,
};

/** Deck counts source [1] publishes. 3, 5 and 7 are absent because nobody deals them. */
export const SOURCED_DECK_COUNTS: readonly number[] = [1, 2, 4, 6, 8];

/**
 * One line of the house-edge derivation.
 *
 * `percent` is in percentage points of house edge: positive costs the player, negative
 * pays them. `undefined` means no figure has been published for this setting, in which
 * case `note` says so and the total declines to resolve.
 */
export interface EdgeContribution {
  /** Stable key, for React lists and for tests that assert one specific line. */
  readonly id: string;
  readonly label: string;
  readonly percent: number | undefined;
  readonly source: EdgeSourceId;
  readonly note?: string;
}

export interface HouseEdgeEstimate {
  /** The published starting point for this deck count, before any rule departures. */
  readonly baseline: EdgeContribution;
  /** Departures from `EDGE_REFERENCE_RULES`, in the order a table is read. */
  readonly adjustments: readonly EdgeContribution[];
  /** Every line, baseline first — what the breakdown table renders. */
  readonly lines: readonly EdgeContribution[];
  /** Lines with no published figure. Empty in the overwhelming majority of cases. */
  readonly unsourced: readonly EdgeContribution[];
  /**
   * House edge in percentage points, positive in the house's favour. `undefined` when any
   * line is unsourced — a partial sum presented as a total would be a wrong number.
   */
  readonly percent: number | undefined;
}

/** How a table reads to a player, for colouring and for a one-line verdict. */
export type EdgeVerdict = "player-advantage" | "excellent" | "fair" | "poor" | "predatory";

/**
 * Cut points chosen from what the figures mean at the table rather than from taste:
 *
 *   - below zero the basic-strategy player is ahead before any counting at all;
 *   - 0.5% is the usual dividing line for a "good" shoe game;
 *   - 1.0% is roughly where a countable edge stops covering the cost of playing;
 *   - past 1.5% you are in 6:5 territory, which is the whole reason this screen exists.
 */
export function edgeVerdict(percent: number): EdgeVerdict {
  if (percent < 0) return "player-advantage";
  if (percent < 0.5) return "excellent";
  if (percent < 1.0) return "fair";
  if (percent < 1.5) return "poor";
  return "predatory";
}

export const EDGE_VERDICT_LABEL: Readonly<Record<EdgeVerdict, string>> = {
  "player-advantage": "PLAYER ADVANTAGE",
  excellent: "EXCELLENT TABLE",
  fair: "PLAYABLE",
  poor: "POOR TABLE",
  predatory: "DO NOT PLAY",
};

/** House edge as a signed percentage, two decimals: "0.55%", "-0.13%". */
export function formatEdge(percent: number): string {
  return `${percent.toFixed(2)}%`;
}

/** The same figure in the units a player feels: dollars lost per hundred wagered. */
export function formatEdgePerHundred(percent: number): string {
  const amount = Math.abs(percent);
  const direction = percent < 0 ? "to you" : "to the house";
  return `$${amount.toFixed(2)} per $100 wagered, ${direction}`;
}

/**
 * Expected cost of an hour at this table, in the user's own minimum bet.
 *
 * Eighty hands an hour is the round number used throughout the literature for a
 * moderately full shoe game, and it is stated to the user rather than hidden, because the
 * point is the order of magnitude and not a false precision.
 */
export const HANDS_PER_HOUR = 80;

export function hourlyCost(percent: number, betSize: number): number {
  return (percent / 100) * betSize * HANDS_PER_HOUR;
}

function line(
  id: string,
  label: string,
  percent: number | undefined,
  source: EdgeSourceId,
  note?: string,
): EdgeContribution {
  return note === undefined
    ? { id, label, percent, source }
    : { id, label, percent, source, note };
}

/**
 * The house edge implied by a Rule Set, with every line of the derivation.
 *
 * The breakdown is the product, not a debugging aid: ADR-0005 says we show the reasoning,
 * and a user who can see that 6:5 alone is +1.39 has learned something a single summary
 * number would not have taught them.
 */
export function houseEdge(rules: RuleSet): HouseEdgeEstimate {
  const baselinePercent = BASELINE_BY_DECKS[rules.decks];
  const baseline = line(
    "baseline",
    `${rules.decks}-deck game, H17, 3:2, DAS, double any two, resplit to 4 including aces`,
    baselinePercent,
    "decks",
    baselinePercent === undefined
      ? `No house edge has been published for a ${rules.decks}-deck game — ` +
        `casinos deal 1, 2, 4, 6 and 8. Pick one of those to see the edge.`
      : undefined,
  );

  const adjustments: EdgeContribution[] = [];
  const add = (
    id: string,
    label: string,
    percent: number | undefined,
    note?: string,
  ): void => {
    adjustments.push(line(id, label, percent, "variations", note));
  };

  // Dealer soft 17. The reference game hits; standing hands 0.22% back to the player.
  if (rules.dealerSoft17 === "stand") {
    add("s17", "Dealer stands on soft 17 (S17)", -0.22);
  }

  // The single most expensive rule on a modern table, and the reason this panel exists.
  if (rules.blackjackPayout === "6:5") {
    add("payout", "Blackjack pays 6:5 instead of 3:2", 1.39);
  }

  if (!rules.doubleAfterSplit) {
    add("das", "No double after split (NDAS)", 0.14);
  }

  if (rules.doubleRule === "9-11") {
    add("double", "Double on 9-11 only", 0.09);
  } else if (rules.doubleRule === "10-11") {
    add("double", "Double on 10-11 only", 0.18);
  }

  // Late surrender is the sum of its two published cells: -0.07 against a ten, -0.00
  // against an ace. Early surrender is the two early cells, which are worth far more
  // because they are taken before the dealer's blackjack is resolved.
  if (rules.surrender === "late") {
    add("surrender", "Late surrender", -0.07);
  } else if (rules.surrender === "early") {
    add("surrender", "Early surrender (vs ten -0.24, vs ace -0.39)", -0.63);
  }

  if (rules.maxSplitHands >= 4) {
    // The reference game already splits to four. Nothing to adjust.
  } else if (rules.maxSplitHands === 3) {
    add("splits", "Split to 3 hands only", 0.01);
  } else if (rules.maxSplitHands === 2) {
    add("splits", "No resplitting — 2 hands maximum", 0.1);
  } else {
    add(
      "splits",
      "No splitting at all",
      undefined,
      "No published figure — every source measures a game in which splitting exists.",
    );
  }

  if (!rules.resplitAces) {
    add("rsa", "Split aces may not be resplit (no RSA)", 0.08);
  }

  if (!rules.oneCardToSplitAces) {
    add("draw-aces", "Player may draw to split aces", -0.19);
  }

  if (!rules.dealerPeek) {
    add("peek", "No hole card — dealer never peeks (splitting -0.03, doubling -0.08)", 0.11);
  }

  const lines = [baseline, ...adjustments];
  const unsourced = lines.filter((entry) => entry.percent === undefined);
  const percent =
    unsourced.length > 0
      ? undefined
      : // Percentages carried to three decimals accumulate float dust; the display
        // rounds to two, but round here too so equal rule sets compare equal.
        round(lines.reduce((sum, entry) => sum + (entry.percent ?? 0), 0));

  return {
    baseline,
    adjustments,
    lines,
    unsourced,
    ...(percent === undefined ? { percent: undefined } : { percent }),
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * The rules that carry no house-edge figure at all, and why.
 *
 * Shown on the screen rather than silently omitted: a user who has just set penetration to
 * 90% and seen the edge not move deserves to be told that this is correct and what
 * penetration actually buys them. It is the difference between a settings screen and a
 * teaching surface.
 */
export const EDGE_NEUTRAL_RULES: readonly { readonly label: string; readonly why: string }[] = [
  {
    label: "Penetration",
    why:
      "Does not change basic strategy or the house edge — it changes how much of the shoe " +
      "you get to count, which is where a counter's entire advantage comes from.",
  },
  {
    label: "Minimum and maximum bet",
    why:
      "House edge is a percentage of what you wager, so the table limits scale your loss " +
      "rate without moving the rate itself. The spread they allow is what matters to a counter.",
  },
];
