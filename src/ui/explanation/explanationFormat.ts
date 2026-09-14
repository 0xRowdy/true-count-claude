/**
 * The Explanation, put into words — and nothing else.
 *
 * `src/drills/explanation.ts` decides what is true: the EV of every legal action, the chart
 * cell, the index and the signed distance to it. This module decides how to *say* it, and it
 * is deliberately forbidden from deciding anything the engine already decided. It never
 * computes an EV, never looks up a strategy cell, never compares a count against an index
 * itself. Every sentence below is a reading of a field the Explanation already carries, which
 * is what keeps the words from drifting away from the numbers (ADR-0005).
 *
 * The brief is the category's own reviews:
 *
 *   > "They tell you if your move is right or wrong, but they don't tell you why."
 *
 * So there are four questions every Decision answers here, for a right answer as fully as for
 * a wrong one (invariant 2): how close was the call, which chart cell says so, what did the
 * count do to it, and what would have to change for the other answer to be right.
 *
 * Pure, React-free, and tested in `explanationFormat.test.ts`.
 */

import type { Action } from "@/engine/hand";
import { type IndexEntry, type IndexSetName, signed } from "@/engine/deviations";
import type { DealerTotal } from "@/engine/ev";
import type { TrueCountRounding } from "@/engine/counting";
import type { DealerUpcard } from "@/engine/strategy";
import type {
  CountContext,
  DecisionExplanation,
  DrillAction,
  IndexExplanation,
  InsuranceExplanation,
} from "@/drills/explanation";
import { evLossFor } from "@/drills/explanation";
import type { GradingStandard } from "@/drills/scoring";
import { CHART_CODE_LABEL, SECTION_TITLE, upcardLabel } from "@/ui/rules/chartChanges";

// ---------------------------------------------------------------------------
// The verdict a panel is asked to explain
// ---------------------------------------------------------------------------

/**
 * What the user did and what they were graded against — the only part of a result that is
 * not already in the Explanation.
 *
 * A drill's `DecisionResult` and `InsuranceResult` both satisfy this shape structurally, so a
 * drill screen passes its result straight through. It is optional everywhere: an Explanation
 * with no verdict is a hint, and it reads the same minus the first line.
 */
export interface ExplanationVerdict {
  readonly actionTaken: DrillAction;
  readonly correctAction: DrillAction;
  readonly gradedAgainst: GradingStandard;
  /**
   * Bets given up against the best play for this exact shoe, when the caller already has
   * it. Required for insurance, whose loss is not derivable from the Explanation alone;
   * for a playing decision it is read from `evLossFor` when omitted.
   */
  readonly evLoss?: number | null;
}

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export const ACTION_NAME: Readonly<Record<DrillAction, string>> = {
  hit: "Hit",
  stand: "Stand",
  double: "Double",
  split: "Split",
  surrender: "Surrender",
  insurance: "Take insurance",
  "decline-insurance": "Decline insurance",
};

/** "You stood", "You doubled" — the verdict line names the play the way a player would. */
export const ACTION_PAST: Readonly<Record<DrillAction, string>> = {
  hit: "hit",
  stand: "stood",
  double: "doubled",
  split: "split",
  surrender: "surrendered",
  insurance: "took insurance",
  "decline-insurance": "declined insurance",
};

/** The lower-case verb, for the middle of a sentence: "stand at +0 or higher". */
const ACTION_VERB: Readonly<Record<DrillAction, string>> = {
  hit: "hit",
  stand: "stand",
  double: "double",
  split: "split",
  surrender: "surrender",
  insurance: "take insurance",
  "decline-insurance": "decline insurance",
};

export const STANDARD_NAME: Readonly<Record<GradingStandard, string>> = {
  "basic-strategy": "Basic Strategy",
  "index-play": "the chart plus index plays at this count",
};

const SET_NAME: Readonly<Record<IndexSetName, string>> = {
  "illustrious-18": "Illustrious 18",
  "fab-4": "Fab 4",
};

const ROUNDING_NAME: Readonly<Record<TrueCountRounding, string>> = {
  exact: "unrounded",
  truncate: "truncated toward zero",
  floor: "rounded down",
  round: "rounded to nearest",
};

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

/** An EV in bets, always signed, to three places: "+0.120", "-0.534", "0.000". */
export function formatEv(ev: number): string {
  const rounded = Math.round(ev * 1000) / 1000;
  if (rounded === 0) return "0.000";
  return `${rounded > 0 ? "+" : "-"}${Math.abs(rounded).toFixed(3)}`;
}

/**
 * A loss in bets. Anything that rounds to nothing at three places is said as "under 0.001"
 * rather than "0.000", because a loss that prints as zero next to a "Near-tie" label reads
 * as a contradiction.
 */
export function formatBets(loss: number): string {
  if (loss <= 0) return "0 bets";
  if (loss < 0.0005) return "under 0.001 bets";
  return `${loss.toFixed(3)} bets`;
}

/** A probability as a percentage to one place: "22.9%". */
export function formatPercent(probability: number): string {
  return `${(probability * 100).toFixed(1)}%`;
}

/** A count: integers bare, fractions to one place, always signed like the index tables. */
export function formatSignedCount(count: number): string {
  if (Number.isInteger(count)) return signed(count);
  const rounded = Math.round(count * 10) / 10;
  return rounded < 0 ? rounded.toFixed(1) : `+${rounded.toFixed(1)}`;
}

/** An unsigned magnitude for "2 above the index": integers bare, fractions to one place. */
function formatMagnitude(value: number): string {
  const magnitude = Math.abs(value);
  return Number.isInteger(magnitude) ? String(magnitude) : magnitude.toFixed(1);
}

// ---------------------------------------------------------------------------
// How close the call was
// ---------------------------------------------------------------------------

/**
 * How big a gap in EV is, in five steps a player can feel.
 *
 * The thresholds are about what the gap *means at a table*, not about precision: under half
 * a hundredth of a bet is a coin-flip that composition can tip either way; under two
 * hundredths is the 16-vs-10 kind of close call a count genuinely moves; under a tenth is a
 * mistake a player should not be making; above that is a play that gives away a real slice of
 * every bet. A 0.003 near-tie and a 0.4 blunder must not look alike, and these tiers are what
 * makes them not.
 */
export type EvGapTier = "best" | "near-tie" | "close" | "clear" | "severe";

export const EV_GAP_THRESHOLDS = {
  nearTie: 0.005,
  close: 0.02,
  clear: 0.1,
} as const;

/** Below this a gap is float noise, not a gap. */
const EPSILON = 1e-9;

export function evGapTier(loss: number): EvGapTier {
  if (loss <= EPSILON) return "best";
  if (loss < EV_GAP_THRESHOLDS.nearTie) return "near-tie";
  if (loss < EV_GAP_THRESHOLDS.close) return "close";
  if (loss < EV_GAP_THRESHOLDS.clear) return "clear";
  return "severe";
}

export const TIER_LABEL: Readonly<Record<EvGapTier, string>> = {
  best: "Best play",
  "near-tie": "Near-tie",
  close: "Close call",
  clear: "Clear mistake",
  severe: "Big mistake",
};

export type TierTone = "good" | "info" | "warn" | "bad";

export const TIER_TONE: Readonly<Record<EvGapTier, TierTone>> = {
  best: "good",
  "near-tie": "info",
  close: "warn",
  clear: "bad",
  severe: "bad",
};

/**
 * How long to draw a loss bar, 0 to 1.
 *
 * Square-root, capped at one whole bet. A linear scale makes every near-tie invisible and a
 * log scale makes a 0.4 blunder look only a little worse than a 0.04 slip; the square root
 * keeps 0.003 as a visible sliver (about 5%) while 0.4 fills most of the track (about 63%).
 * The scale is fixed rather than relative to the worst action on the hand, so the same gap
 * draws the same bar on every hand the user ever sees.
 */
export function lossBarFraction(loss: number): number {
  if (loss <= EPSILON) return 0;
  return Math.min(1, Math.sqrt(loss));
}

export interface EvRowView {
  readonly action: Action;
  readonly label: string;
  readonly ev: number;
  readonly evText: string;
  /** Behind the best action, in bets. Zero for the best. */
  readonly loss: number;
  readonly lossText: string;
  readonly tier: EvGapTier;
  readonly bar: number;
  /** The action the user took. */
  readonly chosen: boolean;
  /** The Basic Strategy play. */
  readonly chart: boolean;
  /** The play once the count is taken into account, when it differs from the chart. */
  readonly countPlay: boolean;
  readonly best: boolean;
}

/**
 * Every legal action, best first, with how far behind the best each one is.
 *
 * The order is `ranked` as the engine returned it — this does not re-sort, so a tie is broken
 * the way the engine broke it.
 */
export function evRows(
  explanation: DecisionExplanation,
  verdict?: ExplanationVerdict | null,
): readonly EvRowView[] {
  const best = explanation.ranked[0];
  if (!best) return [];

  return explanation.ranked.map(({ action, ev }) => {
    const loss = Math.max(0, best.ev - ev);
    const tier = evGapTier(loss);
    return {
      action,
      label: ACTION_NAME[action],
      ev,
      evText: formatEv(ev),
      loss,
      lossText: tier === "best" ? "best" : `-${loss < 0.0005 ? "<0.001" : loss.toFixed(3)}`,
      tier,
      bar: lossBarFraction(loss),
      chosen: verdict?.actionTaken === action,
      chart: explanation.basicStrategyAction === action,
      countPlay:
        explanation.countAwareAction === action &&
        explanation.countAwareAction !== explanation.basicStrategyAction,
      best: tier === "best",
    };
  });
}

export interface ClosenessView {
  readonly tier: EvGapTier;
  readonly text: string;
}

/**
 * How close the call itself was, whatever the user chose: the gap between the best action and
 * the runner-up. This is the number that tells a user whether a decision was worth agonising
 * over — 16 vs 10 and 20 vs 6 are both "stand", and they are nothing alike.
 */
export function closeness(explanation: DecisionExplanation): ClosenessView | null {
  const [first, second] = explanation.ranked;
  if (!first) return null;
  if (!second) {
    return { tier: "best", text: `${ACTION_NAME[first.action]} was the only play.` };
  }
  const margin = Math.max(0, first.ev - second.ev);
  const tier = evGapTier(margin);
  const lead = `${ACTION_NAME[first.action]} beats ${ACTION_NAME[second.action]} by ${formatBets(margin)}`;
  switch (tier) {
    case "best":
      return { tier: "near-tie", text: `${ACTION_NAME[first.action]} and ${ACTION_NAME[second.action]} are worth exactly the same here.` };
    case "near-tie":
      return { tier, text: `${lead} — effectively a coin flip.` };
    case "close":
      return { tier, text: `${lead} — a close call, the kind the count can move.` };
    case "clear":
      return { tier, text: `${lead} — a clear decision.` };
    case "severe":
      return { tier, text: `${lead} — not close.` };
  }
}

// ---------------------------------------------------------------------------
// The hand
// ---------------------------------------------------------------------------

/**
 * The hand the way the chart row names it, against the upcard: "Hard 16 vs 10",
 * "Soft 18 (A,7) vs 9", "8,8 vs 10".
 */
export function handTitle(explanation: DecisionExplanation): string {
  const { cell, hand } = explanation;
  const upcard = upcardLabel(cell.upcard);
  if (cell.section === "pairs") return `${cell.row} vs ${upcard}`;
  if (cell.section === "soft") {
    return /^A,/.test(cell.row)
      ? `Soft ${hand.total} (${cell.row}) vs ${upcard}`
      : `Soft ${hand.total} vs ${upcard}`;
  }
  return `Hard ${hand.total} vs ${upcard}`;
}

/** "Hand 2 of 3 · after a split", or null for the ordinary single hand. */
export function handContext(explanation: DecisionExplanation): string | null {
  const { hand } = explanation;
  if (hand.handCount <= 1) return null;
  return `Hand ${hand.handIndex + 1} of ${hand.handCount}${hand.fromSplit ? " · after a split" : ""}`;
}

// ---------------------------------------------------------------------------
// The verdict line
// ---------------------------------------------------------------------------

export interface VerdictView {
  readonly correct: boolean;
  readonly tone: TierTone;
  /** "You stood — correct." / "You hit. The play was Stand." */
  readonly headline: string;
  /** What the choice cost, or why a correct answer still trails on this exact shoe. */
  readonly detail: string | null;
  /** "Graded against the chart plus index plays at this count." */
  readonly standard: string;
  readonly tier: EvGapTier | null;
}

export function decisionVerdict(
  explanation: DecisionExplanation,
  verdict: ExplanationVerdict,
): VerdictView {
  const correct = verdict.actionTaken === verdict.correctAction;
  const loss =
    verdict.evLoss !== undefined ? verdict.evLoss : evLossFor(explanation, verdict.actionTaken);
  const tier = loss === null ? null : evGapTier(loss);
  const taken = ACTION_PAST[verdict.actionTaken];
  const answer = ACTION_NAME[verdict.correctAction];
  const best = explanation.bestByEv;
  const standard = `Graded against ${STANDARD_NAME[verdict.gradedAgainst]}.`;

  if (correct) {
    let detail: string | null;
    if (loss === null || tier === null) {
      detail = explanation.evNote;
    } else if (tier === "best") {
      detail = `${answer} is also the highest-EV play for this exact shoe.`;
    } else {
      // A chart cell is right on average over every shoe at this count; the shoe in front of
      // the player is one particular shoe. Saying so is information, not a contradiction.
      detail =
        `On this exact shoe ${best ? ACTION_NAME[best] : "another play"} edges it by ` +
        `${formatBets(loss)}. The chart is built for the average shoe at this count, and this ` +
        `one leans the other way by a whisker.`;
    }
    return { correct, tone: "good", headline: `You ${taken} — correct.`, detail, standard, tier };
  }

  let detail: string | null;
  if (loss === null || tier === null) {
    detail = explanation.evNote;
  } else if (tier === "best") {
    detail =
      `On this exact shoe ${ACTION_NAME[verdict.actionTaken]} actually scores as well as ` +
      `anything — but ${answer} is the play the chart and index numbers teach, and the one ` +
      `that is right on the average shoe at this count.`;
  } else {
    detail =
      `${capitalize(ACTION_VERB_ING[verdict.actionTaken])} gives up ${formatBets(loss)} ` +
      `(${formatPercent(loss)} of the bet) against the best play every time — ` +
      `${TIER_LABEL[tier].toLowerCase()}.`;
  }

  return {
    correct,
    // A wrong answer is never green, but a near-tie is not painted like a blunder either.
    tone: tier === "best" || tier === "near-tie" || tier === "close" ? "warn" : "bad",
    headline: `You ${taken}. The play was ${answer}.`,
    detail,
    standard,
    tier,
  };
}

const ACTION_VERB_ING: Readonly<Record<DrillAction, string>> = {
  hit: "hitting",
  stand: "standing",
  double: "doubling",
  split: "splitting",
  surrender: "surrendering",
  insurance: "taking insurance",
  "decline-insurance": "declining insurance",
};

function capitalize(text: string): string {
  return text.length === 0 ? text : `${text[0]?.toUpperCase()}${text.slice(1)}`;
}

// ---------------------------------------------------------------------------
// The chart cell
// ---------------------------------------------------------------------------

export interface CellView {
  readonly section: DecisionExplanation["cell"]["section"];
  readonly sectionTitle: string;
  readonly rowLabel: string;
  readonly upcard: DealerUpcard;
  readonly upcardLabel: string;
  readonly code: DecisionExplanation["cell"]["code"];
  /** "Surrender, else hit" */
  readonly codeLabel: string;
  /** "Hard totals · row 16, dealer 10: Surrender, else hit." */
  readonly sentence: string;
  /** Why the play is not the cell's first choice, when it is not. */
  readonly fallbackNote: string | null;
}

export function cellView(explanation: DecisionExplanation): CellView {
  const { cell } = explanation;
  const codeLabel = CHART_CODE_LABEL[cell.code];
  const upcard = upcardLabel(cell.upcard);
  const fallbackNote = cell.usedFallback
    ? `The cell's first choice is not available on this hand` +
      `${explanation.hand.playerCards.length > 2 ? ` (${explanation.hand.playerCards.length} cards)` : explanation.hand.fromSplit ? " (after a split)" : ""}` +
      `, so the chart play is its fallback: ${ACTION_NAME[cell.action]}.`
    : null;

  return {
    section: cell.section,
    sectionTitle: SECTION_TITLE[cell.section],
    rowLabel: cell.row,
    upcard: cell.upcard,
    upcardLabel: upcard,
    code: cell.code,
    codeLabel,
    sentence: `${SECTION_TITLE[cell.section]}, row ${cell.row} against a dealer ${upcard}: ${codeLabel}.`,
    fallbackNote,
  };
}

/**
 * Which rows of a section to show around the governing one.
 *
 * `labels` is the printed rows in order; the result is the half-open window `[start, end)`
 * around `rowLabel`, clamped to the section. `found` is false when the governing row is one
 * published tables do not print (hard 4, hard 21, soft 12, soft 21) — the caller shows the
 * section's edge and says so rather than highlighting a row that is not there.
 */
export function chartWindow(
  labels: readonly string[],
  rowLabel: string,
  radius: number,
): { start: number; end: number; index: number; found: boolean } {
  const index = labels.indexOf(rowLabel);
  const size = Math.min(labels.length, radius * 2 + 1);
  if (index < 0) {
    // Unprinted rows sit off one end or the other: 4 below hard 5, 21 above hard 20.
    const high = /21$/.test(rowLabel);
    return high
      ? { start: labels.length - size, end: labels.length, index: -1, found: false }
      : { start: 0, end: size, index: -1, found: false };
  }
  const start = Math.max(0, Math.min(index - radius, labels.length - size));
  return { start, end: start + size, index, found: true };
}

export function unprintedRowNote(rowLabel: string): string {
  return `Row ${rowLabel} is not printed on published charts — there is only one sensible play, and the cell above says what it is.`;
}

// ---------------------------------------------------------------------------
// The count
// ---------------------------------------------------------------------------

export interface CountView {
  readonly systemName: string;
  readonly runningCount: string;
  readonly decksRemaining: string;
  /** "+5 ÷ 2.9 decks = +1.7", or null when there is no conversion. */
  readonly division: string | null;
  /** "+1 (truncated toward zero)", or null. */
  readonly trueCount: string | null;
  /** Why there is no True Count, said out loud rather than left blank. */
  readonly note: string | null;
}

export function countView(count: CountContext): CountView {
  const decks = count.decksRemaining.toFixed(1);
  return {
    systemName: count.systemName,
    runningCount: formatSignedCount(count.runningCount),
    decksRemaining: `${decks} decks`,
    division:
      count.exactTrueCount === null
        ? null
        : `${formatSignedCount(count.runningCount)} ÷ ${decks} = ${formatSignedCount(count.exactTrueCount)}`,
    trueCount:
      count.trueCount === null
        ? null
        : count.rounding === "exact"
          ? formatSignedCount(count.trueCount)
          : `${formatSignedCount(count.trueCount)} (${ROUNDING_NAME[count.rounding]})`,
    note: count.trueCountNote,
  };
}

// ---------------------------------------------------------------------------
// The index
// ---------------------------------------------------------------------------

/**
 * What the count did to this decision.
 *
 * - `fired` — the count crossed the index and the play departs from the chart.
 * - `basic-side` — an index covers this hand, and the count has not crossed it.
 * - `blocked` — the count crossed it, but the departure is not a play this hand may make.
 * - `not-this-game` — an index is published for this hand, but for a game whose chart plays it
 *   differently; under these rules there is nothing for it to depart from.
 * - `no-entry` — no published index covers this hand at all.
 * - `no-index-set` / `no-true-count` — the honest refusals: the system publishes no index, or
 *   there is no True Count to compare one against.
 */
export type IndexStatus =
  | "fired"
  | "basic-side"
  | "blocked"
  | "not-this-game"
  | "no-entry"
  | "no-index-set"
  | "no-true-count";

export interface IndexView {
  readonly status: IndexStatus;
  readonly tone: TierTone;
  /** One line: what the count did. */
  readonly headline: string;
  /** "Illustrious 18 #2 · 16 vs 10", when an entry covers the hand. */
  readonly entryLabel: string | null;
  /** "Stand at +0 or higher, otherwise hit." */
  readonly rule: string | null;
  /** The departure's verb, "stand", for labelling the firing side of the number line. */
  readonly departure: string | null;
  /** "The count is +2 — 2 above the index." */
  readonly distance: string | null;
  /** The index number and the count, for a number line. Null without both. */
  readonly scale: { readonly index: number; readonly trueCount: number; readonly direction: IndexEntry["direction"] } | null;
  /** The entry's sourcing caveat, or the system's refusal note. */
  readonly notes: readonly string[];
}

export function entryLabel(entry: IndexEntry): string {
  return `${SET_NAME[entry.set]} #${entry.rank} · ${entry.label}`;
}

export function indexRule(entry: IndexEntry): string {
  const threshold =
    entry.direction === "at-or-above"
      ? `at ${signed(entry.index)} or higher`
      : `below ${signed(entry.index)}`;
  return `${capitalize(ACTION_VERB[entry.deviate])} ${threshold}, otherwise ${ACTION_VERB[entry.from]}.`;
}

/** "The count is +2 — 2 above the index." Signed distance, read in plain words. */
export function distanceSentence(trueCount: number, distance: number): string {
  const where =
    distance === 0
      ? "exactly at the index"
      : `${formatMagnitude(distance)} ${distance > 0 ? "above" : "below"} the index`;
  return `The true count is ${formatSignedCount(trueCount)} — ${where}.`;
}

export function indexView(
  index: IndexExplanation,
  count: CountContext,
  basicStrategyAction: DrillAction,
): IndexView {
  const entry = index.entry;
  const notes: string[] = [];
  if (index.systemNote) notes.push(index.systemNote);
  if (index.entryNote) notes.push(index.entryNote);

  const scale =
    index.index !== null && count.trueCount !== null && index.direction !== null
      ? { index: index.index, trueCount: count.trueCount, direction: index.direction }
      : null;
  const distance =
    count.trueCount !== null && index.distanceToIndex !== null
      ? distanceSentence(count.trueCount, index.distanceToIndex)
      : null;
  const base = {
    entryLabel: entry ? entryLabel(entry) : null,
    rule: entry ? indexRule(entry) : null,
    departure: entry ? ACTION_VERB[entry.deviate] : null,
    distance,
    scale,
    notes,
  };

  if (index.skipped === "no-index-set") {
    return {
      ...base,
      status: "no-index-set",
      tone: "info",
      headline: `${count.systemName} publishes no index numbers, so the count does not change the chart play here.`,
    };
  }
  if (index.skipped === "no-true-count") {
    return {
      ...base,
      status: "no-true-count",
      tone: "info",
      headline: entry
        ? `The index is ${signed(entry.index)}, but there is no True Count to compare it with.`
        : "There is no True Count to compare an index against.",
    };
  }
  if (index.fired && index.deviation) {
    return {
      ...base,
      status: "fired",
      tone: "warn",
      headline: `The count changes the play: ${ACTION_VERB[index.deviation.action]} instead of ${ACTION_VERB[index.deviation.basicStrategy]}.`,
    };
  }
  if (!entry) {
    return {
      ...base,
      status: "no-entry",
      tone: "info",
      headline: `No published ${count.systemName} index covers this hand, so no count changes the chart play.`,
    };
  }
  switch (index.skipped) {
    case "count-on-basic-side":
      return {
        ...base,
        status: "basic-side",
        tone: "good",
        headline: `The count has not crossed the index, so the chart play stands: ${ACTION_VERB[entry.from]}.`,
      };
    case "action-not-legal":
      return {
        ...base,
        status: "blocked",
        tone: "info",
        headline: `The index says ${ACTION_VERB[entry.deviate]}, but that is not a play this hand may make, so the chart play stands.`,
      };
    case "outside-published-rules":
    default:
      return {
        ...base,
        // The distance to an index that does not apply is not a fact about this decision,
        // and printing it would invite the user to act on it.
        distance: null,
        scale: null,
        status: "not-this-game",
        tone: "info",
        headline:
          `This index departs from ${ACTION_VERB[entry.from]}, but under these rules the chart ` +
          `already says ${ACTION_VERB[basicStrategyAction]} — so it does not apply to this game.`,
      };
  }
}

// ---------------------------------------------------------------------------
// What would have to change
// ---------------------------------------------------------------------------

/**
 * The other answer, and what would have to be different for it to be the right one.
 *
 * "The other answer" is the user's own play when they got it wrong. When they got it right it
 * is the play on the far side of the index if one covers the hand, and otherwise the runner-up
 * by EV — the play they most plausibly weighed against it.
 *
 * Every line is a reading of the Explanation. Where the data cannot say what would flip the
 * decision — a play no index covers — this says *that*, rather than inventing a number.
 */
export function whatWouldChange(
  explanation: DecisionExplanation,
  verdict?: ExplanationVerdict | null,
): { readonly other: Action | null; readonly lines: readonly string[] } {
  const answer = verdict && isAction(verdict.correctAction) ? verdict.correctAction : explanation.countAwareAction;
  const other = pickOther(explanation, answer, verdict);
  if (other === null) {
    return { other: null, lines: [`${ACTION_NAME[answer]} was the only play on offer.`] };
  }

  const lines: string[] = [];
  const { index, count } = explanation;
  const entry = index.entry;
  const name = ACTION_NAME[other];
  const tc = count.trueCount;

  const linked =
    entry !== null &&
    tc !== null &&
    index.index !== null &&
    (index.skipped === null || index.skipped === "count-on-basic-side") &&
    (other === entry.deviate || other === entry.from);

  if (linked && entry && tc !== null) {
    const firesAbove = entry.direction === "at-or-above";
    const wantsDeparture = other === entry.deviate;
    // The departure wants the firing side; the chart play wants the other one.
    const needsHigh = firesAbove === wantsDeparture;
    const threshold = signed(entry.index);
    const now = formatSignedCount(tc);
    lines.push(
      needsHigh
        ? `${name} would be right at a true count of ${threshold} or higher. It is ${now}.`
        : `${name} would be right at a true count below ${threshold}. It is ${now}.`,
    );
  } else if (index.skipped === "no-index-set") {
    lines.push(
      `${count.systemName} has no index numbers, so no count reading here makes ${name} the play.`,
    );
  } else if (index.skipped === "no-true-count" && entry && (other === entry.deviate || other === entry.from)) {
    lines.push(
      `${name} turns on the true count (index ${signed(entry.index)}), and there is no true count to read.`,
    );
  } else if (entry && index.skipped === "outside-published-rules") {
    lines.push(
      `The published ${entry.label} index (${indexRule(entry).replace(/\.$/, "")}) is quoted for a ` +
        `game whose chart says ${ACTION_VERB[entry.from]} here. Under these rules no published count makes ${name} the play.`,
    );
  } else if (entry && index.skipped === "action-not-legal" && other !== entry.deviate) {
    lines.push(`No published index makes ${name} the play for this hand.`);
  } else {
    lines.push(
      `No published index makes ${name} the play for this hand at any count — only a different hand or dealer card would.`,
    );
  }

  const evs = explanation.evs;
  const otherEv = evs[other];
  const answerEv = evs[answer];
  if (otherEv !== undefined && answerEv !== undefined) {
    const gap = answerEv - otherEv;
    const wrong = verdict !== null && verdict !== undefined && verdict.actionTaken !== verdict.correctAction;
    // A wrong answer's cost is already the verdict's headline; saying it twice adds nothing.
    if (gap > EPSILON && !wrong) {
      lines.push(`On this shoe ${name} trails ${ACTION_NAME[answer]} by ${formatBets(gap)}.`);
    } else if (gap < -EPSILON) {
      lines.push(
        `On this exact shoe ${name} is already ahead of ${ACTION_NAME[answer]} by ${formatBets(-gap)} — ` +
          `a composition effect the chart and the published indexes are too coarse to capture.`,
      );
    }
  }

  if (explanation.cell.usedFallback) {
    lines.push(
      `With the cell's first choice on offer — ${CHART_CODE_LABEL[explanation.cell.code].toLowerCase()} — the chart play would be different.`,
    );
  }

  return { other, lines };
}

function pickOther(
  explanation: DecisionExplanation,
  answer: Action,
  verdict?: ExplanationVerdict | null,
): Action | null {
  if (verdict && verdict.actionTaken !== verdict.correctAction && isAction(verdict.actionTaken)) {
    return verdict.actionTaken;
  }
  const entry = explanation.index.entry;
  const legal = explanation.legalActions;
  if (entry && explanation.index.skipped !== "outside-published-rules") {
    const across = answer === entry.deviate ? entry.from : answer === entry.from ? entry.deviate : null;
    if (across !== null && isAction(across) && legal.includes(across)) return across;
  }
  const runnerUp = explanation.ranked.find((ranked) => ranked.action !== answer);
  if (runnerUp) return runnerUp.action;
  return legal.find((action) => action !== answer) ?? null;
}

function isAction(action: DrillAction): action is Action {
  return action !== "insurance" && action !== "decline-insurance";
}

// ---------------------------------------------------------------------------
// The dealer
// ---------------------------------------------------------------------------

export interface DealerOddsView {
  readonly bust: string;
  readonly totals: readonly { readonly total: DealerTotal; readonly text: string; readonly p: number }[];
  readonly bustP: number;
}

export function dealerOddsView(explanation: DecisionExplanation): DealerOddsView | null {
  const dealer = explanation.dealer;
  if (!dealer) return null;
  const totals = ([17, 18, 19, 20, 21] as const).map((total) => ({
    total,
    p: dealer.totals[total],
    text: formatPercent(dealer.totals[total]),
  }));
  return { bust: formatPercent(dealer.bust), bustP: dealer.bust, totals };
}

// ---------------------------------------------------------------------------
// Insurance
// ---------------------------------------------------------------------------

export interface InsuranceView {
  /** "30.4% of the unseen cards are tens." */
  readonly density: string | null;
  readonly densityP: number | null;
  readonly breakEven: string;
  readonly breakEvenP: number;
  /** "Insuring is worth -0.044 bets." */
  readonly evLine: string | null;
  readonly take: boolean | null;
}

export function insuranceView(explanation: InsuranceExplanation): InsuranceView {
  const { tenDensity, ev, breakEvenDensity } = explanation;
  return {
    density: tenDensity === null ? null : `${formatPercent(tenDensity)} of the unseen cards are tens.`,
    densityP: tenDensity,
    breakEven: formatPercent(breakEvenDensity),
    breakEvenP: breakEvenDensity,
    evLine:
      ev === null
        ? null
        : `Insurance pays 2:1 on half a bet, so it is worth ${formatEv(ev)} bets here — ` +
          `${ev > EPSILON ? "positive, so take it" : "negative, so decline it"}. It breaks even at one ten in three.`,
    take: ev === null ? null : ev > EPSILON,
  };
}

export function insuranceVerdict(
  explanation: InsuranceExplanation,
  verdict: ExplanationVerdict,
): VerdictView {
  const correct = verdict.actionTaken === verdict.correctAction;
  const loss = verdict.evLoss ?? null;
  const tier = loss === null ? null : evGapTier(loss);
  const standard = `Graded against ${STANDARD_NAME[verdict.gradedAgainst]}.`;
  const taken = ACTION_PAST[verdict.actionTaken];
  const answer = ACTION_NAME[verdict.correctAction].toLowerCase();

  if (correct) {
    return {
      correct,
      tone: "good",
      headline: `You ${taken} — correct.`,
      detail:
        loss === null || tier === null
          ? explanation.evNote
          : tier === "best"
            ? "That is also the better side of the bet on this exact shoe."
            : `On this exact shoe the other side is ahead by ${formatBets(loss)} — the index is built for the average shoe at this count.`,
      standard,
      tier,
    };
  }
  return {
    correct,
    tone: "bad",
    headline: `You ${taken}. The play was to ${answer}.`,
    detail:
      loss === null || tier === null
        ? explanation.evNote
        : tier === "best"
          ? "On this exact shoe it scores as well as the other side — but the index is what is right on the average shoe at this count."
          : `That gives up ${formatBets(loss)} (${formatPercent(loss)} of the bet) — ${TIER_LABEL[tier].toLowerCase()}.`,
    standard,
    tier,
  };
}

/** What would have to change for the other side of the insurance bet to be right. */
export function insuranceWhatWouldChange(explanation: InsuranceExplanation): readonly string[] {
  const { index, count } = explanation;
  const lines: string[] = [];
  const taking = explanation.countAwareAction === "insurance";
  if (index.skipped === "no-index-set") {
    lines.push(
      `${count.systemName} publishes no insurance index, so the count reading cannot tell you when to insure. The ten density above still can.`,
    );
  } else if (index.index !== null && count.trueCount !== null) {
    lines.push(
      taking
        ? `Declining would be right at a true count below ${signed(index.index)}. It is ${formatSignedCount(count.trueCount)}.`
        : `Insuring would be right at a true count of ${signed(index.index)} or higher. It is ${formatSignedCount(count.trueCount)}.`,
    );
  } else if (index.index !== null) {
    lines.push(`Insurance turns on the true count (index ${signed(index.index)}), and there is no true count to read.`);
  }
  if (explanation.tenDensity !== null) {
    lines.push(
      explanation.tenDensity > explanation.breakEvenDensity
        ? `On this exact shoe the tens are above one in three, so insuring is +EV whatever the index says.`
        : `On this exact shoe more than one card in three would have to be a ten for insuring to pay.`,
    );
  }
  return lines;
}

// ---------------------------------------------------------------------------
// The index as a number line
// ---------------------------------------------------------------------------

export interface IndexScaleGeometry {
  readonly low: number;
  readonly high: number;
  /** 0-1 across the track. */
  readonly indexAt: number;
  readonly countAt: number;
  /** The stretch of the track where the departure applies, 0-1. */
  readonly zoneFrom: number;
  readonly zoneTo: number;
  /** Whole-number ticks to label, low to high. */
  readonly ticks: readonly number[];
}

/**
 * Lays an index and a true count on one track, with the departure's side shaded.
 *
 * The track always spans at least eight counts and keeps two counts of margin past both
 * marks, so an index and a count that coincide still read as two things, and a count ten
 * away from the index still fits. The index itself belongs to the "at or above" side, so for
 * a `below` entry the shaded zone stops exactly at the index mark.
 */
export function indexScaleGeometry(scale: {
  readonly index: number;
  readonly trueCount: number;
  readonly direction: IndexEntry["direction"];
}): IndexScaleGeometry {
  let low = Math.floor(Math.min(scale.index, scale.trueCount)) - 2;
  let high = Math.ceil(Math.max(scale.index, scale.trueCount)) + 2;
  const MIN_SPAN = 8;
  if (high - low < MIN_SPAN) {
    const pad = MIN_SPAN - (high - low);
    low -= Math.floor(pad / 2);
    high += Math.ceil(pad / 2);
  }
  const at = (value: number) => (value - low) / (high - low);
  const indexAt = at(scale.index);
  const step = high - low > 16 ? 5 : high - low > 10 ? 2 : 1;
  const ticks: number[] = [];
  for (let tick = Math.ceil(low / step) * step; tick <= high; tick += step) ticks.push(tick);
  return {
    low,
    high,
    indexAt,
    countAt: at(scale.trueCount),
    zoneFrom: scale.direction === "at-or-above" ? indexAt : 0,
    zoneTo: scale.direction === "at-or-above" ? 1 : indexAt,
    ticks,
  };
}
