/**
 * Coaching against a strategy under test ("Test in trainer" from the blackjack builder,
 * `/play?strategy=<id>`).
 *
 * The table still grades every Decision against the engine (Basic Strategy plus the index
 * plays at this count) and records that verdict in the Session log, so the log never says a
 * chart is right when the arithmetic says otherwise (ADR-0005). What changes is what the coach
 * says when the draft and the engine disagree:
 *
 * - The player plays the draft's move and the engine prefers another: the coach does not
 *   stop the hand (this is the strategy being tested). It shows the draft's own coach note for
 *   that cell and what the departure costs in expected value.
 * - The player leaves the draft for the engine's move: the coach points out that the draft
 *   plays something else here, with the same note and the EV difference.
 *
 * Where the draft and the engine agree, the table's normal coach is all there is.
 * React-free, so it runs under vitest.
 */

import type { Action } from "@/engine/hand";
import type { GoverningCell } from "@/engine/strategy";
import type { DecisionExplanation, DrillAction } from "@/drills/explanation";
import type { BlackjackDraft } from "@/state/strategies";
import { ACTION_NAME, formatBets, handTitle } from "@/ui/explanation/explanationFormat";
import {
  type CellRef,
  HARD_ROWS,
  PAIR_ROWS,
  SOFT_ROWS,
  cellKey,
  draftCode,
  playFor,
} from "@/ui/strategies/blackjack";

/** The builder's cell for the chart cell behind a Decision; null where the builder has no row. */
export function draftCellRef(cell: GoverningCell): CellRef | null {
  const upcard = cell.upcard;
  switch (cell.section) {
    case "hard":
      return (HARD_ROWS as readonly string[]).includes(cell.row)
        ? { section: "hard", row: cell.row, upcard }
        : null;
    case "soft": {
      // "A,7" → soft 18
      const kicker = Number(cell.row.split(",")[1]);
      const row = String(11 + kicker);
      return Number.isFinite(kicker) && (SOFT_ROWS as readonly string[]).includes(row)
        ? { section: "soft", row, upcard }
        : null;
    }
    case "pairs": {
      // "8,8" → 8, "A,A" → A
      const row = cell.row.split(",")[0] ?? "";
      return PAIR_ROWS.includes(row) ? { section: "pairs", row, upcard } : null;
    }
  }
}

/** The move the draft plays for this Decision, among the buttons on offer; null off its chart. */
export function draftPlay(draft: BlackjackDraft, explanation: DecisionExplanation): Action | null {
  const ref = draftCellRef(explanation.cell);
  if (!ref) return null;
  return playFor(draftCode(draft, ref), explanation.legalActions);
}

export interface DraftAdvice {
  /** "follows": the player played the draft's move; "departs": the engine's instead. */
  readonly kind: "follows" | "departs";
  /** The CoachNote eyebrow. */
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
}

function lower(action: DrillAction): string {
  return ACTION_NAME[action].toLowerCase();
}

/**
 * What the coach says about a Decision while `draft` is under test, or null when the draft
 * agrees with the engine here (or has no cell for this hand) and the normal coach applies.
 *
 * `correct` is the move the table grades against (count-aware), `taken` the move played.
 */
export function draftAdvice(
  draft: BlackjackDraft,
  explanation: DecisionExplanation,
  taken: DrillAction,
  correct: DrillAction,
): DraftAdvice | null {
  const play = draftPlay(draft, explanation);
  if (play === null || play === correct) return null;
  if (taken !== play && taken !== correct) return null;

  const ref = draftCellRef(explanation.cell);
  const note = ref ? draft.notes[cellKey(ref)]?.trim() : undefined;
  const evs = explanation.evs as Partial<Record<DrillAction, number>>;
  const draftEv = evs[play];
  const engineEv = evs[correct];
  const gap =
    typeof draftEv === "number" && typeof engineEv === "number" ? engineEv - draftEv : null;
  const Play = ACTION_NAME[play];
  const cost =
    gap === null
      ? `The table's play here is ${lower(correct)}.`
      : gap > 0.0005
        ? `${Play} gives up ${formatBets(gap)} per hand against ${lower(correct)}, the table's play, on this shoe.`
        : `${Play} is worth about as much as ${lower(correct)}, the table's play, on this shoe.`;
  const body = [note, cost].filter(Boolean).join(" ");
  const subject = handTitle(explanation);

  if (taken === play) {
    return {
      kind: "follows",
      eyebrow: `Your strategy · ${draft.title}`,
      title: `${subject}: ${lower(play)}, as your strategy plays it.`,
      body,
    };
  }
  return {
    kind: "departs",
    eyebrow: `Your strategy · ${draft.title}`,
    title: `${subject}: your strategy plays ${lower(play)} here.`,
    body: `You played ${lower(taken)}, the table's play. ${body}`,
  };
}
