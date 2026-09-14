/**
 * The round's Decisions, each with its Explanation, directly under the buttons that made them.
 *
 * Invariant 3: feedback arrives while the cards are still on screen. Every Decision is graded
 * at the tap, before the round moves (`tableExplanation.ts`), and stays here until the next
 * hand is dealt — through a split, a bust, and the settlement — so the hand being explained is
 * always either still on the felt or drawn in the panel from its own snapshot.
 *
 * It sits *below* the action bar rather than above it, so the buttons stay inside the first
 * screenful of a 360x640 phone however long the explanation is. The full panel is open by
 * default, because the explanation is the product; a player who wants a faster table can fold
 * it to a one-line verdict, and that choice holds for the rest of the visit.
 */

import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ExplanationPanel } from "@/ui/explanation/ExplanationPanel";
import { TONE_COLOR } from "@/ui/explanation/EvLadder";
import {
  ACTION_NAME,
  type VerdictView,
  decisionVerdict,
  insuranceVerdict,
} from "@/ui/explanation/explanationFormat";
import { Panel, SecondaryButton, SegmentedControl } from "@/ui/primitives";
import { colors, spacing, type } from "@/ui/theme";
import type { TableDecision } from "./tableExplanation";

function verdictOf(decision: TableDecision): VerdictView {
  return decision.kind === "decision"
    ? decisionVerdict(decision.explanation, decision)
    : insuranceVerdict(decision.explanation, decision);
}

export function DecisionFeedback({
  decisions,
  roundOver,
  expanded,
  onChangeExpanded,
}: {
  decisions: readonly TableDecision[];
  /** The cards have been swept and the bet prompt is showing. */
  roundOver: boolean;
  expanded: boolean;
  onChangeExpanded: (expanded: boolean) => void;
}) {
  // A pick is only honoured while no new Decision has arrived; the newest one always takes
  // the panel, because it is the one the player just made.
  const [pick, setPick] = useState<{ count: number; index: number } | null>(null);
  if (decisions.length === 0) return null;

  const latest = decisions.length - 1;
  const index = pick !== null && pick.count === decisions.length ? pick.index : latest;
  const decision = decisions[index] ?? decisions[latest];
  if (!decision) return null;

  const title = roundOver
    ? "Last hand — why"
    : decisions.length > 1
      ? `Decision ${index + 1} of ${decisions.length} — why`
      : "Why";

  const picker =
    decisions.length > 1 ? (
      <SegmentedControl
        options={decisions.map((entry, position) => ({
          value: String(position),
          label: `${position + 1} · ${ACTION_NAME[entry.actionTaken]} ${
            entry.verdict === "correct" ? "✓" : "✗"
          }`,
        }))}
        value={String(index)}
        onChange={(value) => setPick({ count: decisions.length, index: Number(value) })}
      />
    ) : null;

  if (!expanded) {
    const view = verdictOf(decision);
    return (
      <Panel>
        {picker}
        <Text style={[styles.headline, { color: TONE_COLOR[view.tone] }]}>{view.headline}</Text>
        {view.detail ? <Text style={styles.detail}>{view.detail}</Text> : null}
        <View style={styles.toggle}>
          <SecondaryButton label="Show why" onPress={() => onChangeExpanded(true)} />
        </View>
      </Panel>
    );
  }

  return (
    <ExplanationPanel
      explanation={decision.explanation}
      verdict={decision}
      title={title}
      accessory={
        <View style={styles.accessory}>
          {picker}
          <View style={styles.toggle}>
            <SecondaryButton label="Fold to the verdict" onPress={() => onChangeExpanded(false)} />
          </View>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  headline: { ...type.body, fontSize: 16, fontWeight: "700" },
  detail: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  accessory: { gap: spacing.sm },
  toggle: { alignSelf: "flex-start" },
});
