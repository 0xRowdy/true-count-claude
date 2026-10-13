/**
 * The dealer-coach at the Tableside table (frame N6Lcl): when to speak, and what to say.
 *
 * The player chooses how often the coach speaks up in onboarding (`profile.coach`):
 *
 * - `"asked"` — never unprompted. A Hint button is on the table; mistakes are reviewed at
 *   the Result, with their Explanations, while the cards are still on the felt (invariant 3).
 * - `"mistakes"` — a wrong play is caught *before* it reaches the cards. The hand pauses on
 *   a mistake Coach Note: take it back and play the right move (it still counts as a miss),
 *   or keep the original.
 * - `"every"` — as `"mistakes"`, plus a hint Coach Note before every decision.
 *
 * Nothing here decides what is right. Every word is a reading of the graded result or the
 * Explanation the engine already built (`scoreAgainstIndexPlay`, `explainDecision`), the same
 * verdict the Session log records (ADR-0005), so the coach can never contradict the chart.
 */

import type { CoachLevel } from "@/state/profile";
import type { Action } from "@/engine/hand";
import {
  type DecisionExplanation,
  type DrillAction,
  type InsuranceExplanation,
  explainDecision,
  explainInsurance,
  isHandAction,
} from "@/drills/explanation";
import {
  ACTION_NAME,
  ACTION_PAST,
  cellView,
  dealerOddsView,
  decisionVerdict,
  handTitle,
  indexRule,
  insuranceVerdict,
  insuranceView,
} from "@/ui/explanation/explanationFormat";
import { upcardLabel } from "@/ui/rules/chartChanges";
import { cardLabel } from "@/ui/ds/format";
import {
  type TableDecision,
  tableDecisionSituation,
  tableInsuranceSituation,
} from "./tableExplanation";
import type { PlayTable } from "./usePlayTable";

// ---------------------------------------------------------------------------
// When the coach speaks
// ---------------------------------------------------------------------------

/** True when a wrong play is caught and the hand paused before it reaches the cards. */
export function catchesMistakes(level: CoachLevel): boolean {
  return level !== "asked";
}

/** True when a hint is shown before every decision, unasked. */
export function hintsEveryDecision(level: CoachLevel): boolean {
  return level === "every";
}

/** True when the table offers a Hint button rather than speaking unprompted. */
export function offersHintButton(level: CoachLevel): boolean {
  return level === "asked";
}

// ---------------------------------------------------------------------------
// A Decision as the table remembers it
// ---------------------------------------------------------------------------

/**
 * One graded Decision on the table this hand. `playedInstead` is the move that reached the
 * cards when the coach caught `result` and the player took it back; `null` otherwise.
 */
export interface CoachedDecision {
  readonly result: TableDecision;
  readonly playedInstead: DrillAction | null;
}

/** True when the coach should stop this play: it is wrong, and the coach is catching. */
export function shouldCatch(level: CoachLevel, result: TableDecision | null): boolean {
  return result !== null && result.verdict === "incorrect" && catchesMistakes(level);
}

/**
 * The move "Take it back" plays, when there is one to play. A count-aware answer that is not
 * among the buttons on offer (an index departure the hand can no longer make) is not
 * offered as a take-back: the player keeps what they chose, with the Explanation.
 */
export function takeBackAction(
  result: TableDecision,
  legal: readonly Action[],
): DrillAction | null {
  const correct = result.correctAction;
  if (result.kind === "insurance") return correct;
  return isHandAction(correct) && legal.includes(correct) ? correct : null;
}

// ---------------------------------------------------------------------------
// The mistake note
// ---------------------------------------------------------------------------

export interface CoachCopy {
  /** The eyebrow under the dealer's name, when it differs from the variant's default. */
  readonly kind?: string;
  readonly title: string;
  readonly body: string;
}

export interface MistakeCopy extends CoachCopy {
  /** "Take it back & double", or null when no take-back is on offer. */
  readonly takeBackLabel: string | null;
  /** "Keep my stand" */
  readonly keepLabel: string;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function articled(action: DrillAction): string {
  return `a ${ACTION_NAME[action].toLowerCase()}`;
}

/** "Hold on: soft 17 vs 5 is a double." + the cost of the play and what drives it. */
export function mistakeCopy(result: TableDecision, takeBack: DrillAction | null): MistakeCopy {
  if (result.kind === "insurance") {
    const view = insuranceView(result.explanation);
    const verdict = insuranceVerdict(result.explanation, result);
    const take = result.correctAction === "insurance";
    return {
      title: `Hold on: at this count, ${take ? "take" : "decline"} insurance.`,
      body: [view.density, view.evLine ?? verdict.detail].filter(Boolean).join(" "),
      takeBackLabel: takeBack === null ? null : `Take it back & ${take ? "insure" : "decline"}`,
      keepLabel: "Keep my choice",
    };
  }

  const explanation = result.explanation;
  const verdict = decisionVerdict(explanation, result);
  const body: string[] = [];
  if (verdict.detail) body.push(verdict.detail);
  const odds = dealerOddsView(explanation);
  if (odds) {
    body.push(
      `A dealer ${upcardLabel(explanation.cell.upcard)} busts ${odds.bust} of the time on this shoe.`,
    );
  }
  if (result.correctWasDeparture && explanation.index.entry) {
    body.push(`The count moves this one: ${lowerFirst(indexRule(explanation.index.entry))}`);
  }

  return {
    title: `Hold on: ${lowerFirst(handTitle(explanation))} is ${articled(result.correctAction)}.`,
    body: body.join(" "),
    takeBackLabel:
      takeBack === null ? null : `Take it back & ${ACTION_NAME[takeBack].toLowerCase()}`,
    keepLabel: `Keep my ${ACTION_NAME[result.actionTaken].toLowerCase()}`,
  };
}

// ---------------------------------------------------------------------------
// The hint note
// ---------------------------------------------------------------------------

function decisionHint(explanation: DecisionExplanation): CoachCopy {
  const play = explanation.countAwareAction;
  const departs = play !== explanation.basicStrategyAction;
  const body: string[] = [cellView(explanation).sentence];
  if (departs && explanation.index.entry) {
    body.push(`The count moves it: ${lowerFirst(indexRule(explanation.index.entry))}`);
  }
  const odds = dealerOddsView(explanation);
  if (odds) {
    body.push(
      `A dealer ${upcardLabel(explanation.cell.upcard)} busts ${odds.bust} of the time on this shoe.`,
    );
  }
  return {
    kind: departs ? "Hint · Index play" : "Hint · Basic strategy",
    title: `${handTitle(explanation)}: ${ACTION_NAME[play].toLowerCase()}.`,
    body: body.join(" "),
  };
}

function insuranceHint(explanation: InsuranceExplanation): CoachCopy {
  const view = insuranceView(explanation);
  const take = explanation.countAwareAction === "insurance";
  return {
    kind: take ? "Hint · Index play" : "Hint · Basic strategy",
    title: `Insurance against ${cardLabel(explanation.dealerUpcard.rank, explanation.dealerUpcard.suit)}: ${take ? "take it" : "decline"}.`,
    body: [view.density, `It breaks even at ${view.breakEven} tens.`].filter(Boolean).join(" "),
  };
}

/** The hint for the decision in front of the player, or null when none is waiting. */
export function hintCopy(table: PlayTable): CoachCopy | null {
  const decision = tableDecisionSituation(table);
  if (decision) return decisionHint(explainDecision(decision));
  const insurance = tableInsuranceSituation(table);
  if (insurance) return insuranceHint(explainInsurance(insurance));
  return null;
}

// ---------------------------------------------------------------------------
// "Decisions this hand"
// ---------------------------------------------------------------------------

export interface ReviewRow {
  readonly key: string;
  /** "correct" draws a check, "replayed" the replay arrow, "miss" a cross. */
  readonly mark: "correct" | "replayed" | "miss";
  /** "Soft 17 (A,6) vs 5: stood, replayed as double" */
  readonly title: string;
  readonly detail: string;
  /** Position in the hand's Decisions, for opening its full Explanation. */
  readonly index: number;
}

function decisionSubject(result: TableDecision): string {
  if (result.kind === "decision") return handTitle(result.explanation);
  const upcard = result.explanation.dealerUpcard;
  return `Insurance vs ${cardLabel(upcard.rank, upcard.suit)}`;
}

/** The Result phase's review of every Decision this hand, in the order they were made. */
export function reviewRows(decisions: readonly CoachedDecision[]): ReviewRow[] {
  return decisions.map(({ result, playedInstead }, index) => {
    const subject = decisionSubject(result);
    const taken = ACTION_PAST[result.actionTaken];
    if (result.verdict === "correct") {
      return {
        key: `d${index}`,
        mark: "correct",
        title: `${subject}: ${taken}`,
        detail: result.correctWasDeparture
          ? "Correct — the index play at this count."
          : "Correct — the chart play.",
        index,
      };
    }
    const answer = ACTION_NAME[result.correctAction].toLowerCase();
    if (playedInstead !== null) {
      return {
        key: `d${index}`,
        mark: "replayed",
        title: `${subject}: ${taken}, replayed as ${ACTION_NAME[playedInstead].toLowerCase()}`,
        detail: "Counts as a miss.",
        index,
      };
    }
    return {
      key: `d${index}`,
      mark: "miss",
      title: `${subject}: ${taken}`,
      detail: `Counts as a miss. The play was ${answer}.`,
      index,
    };
  });
}
