/**
 * The zero-sum check — the single most important thing on this screen.
 *
 * A competitor shipped a count that did not return to zero at the end of a balanced Shoe,
 * and a user found it before the developer did (ADR-0004). The weak answer is a sentence
 * promising that ours does. The answer here is a ledger the user can watch balance.
 *
 * Two things make it a check rather than a claim:
 *
 * 1. It reconciles at **every** point in the Shoe, not just the last card. What you hold
 *    plus what is still in the Shoe always equals the finish. The user does not have to
 *    wait, and does not have to trust the wait.
 * 2. The Shoe can be run out on demand, so the finish is something they see land rather
 *    than something they are told about.
 *
 * Unbalanced systems are not hidden or excluded. KO finishes on its pivot of +4 and Red 7
 * on 0 from a start of -12, and saying so is itself credibility: a panel that pretended
 * every system ends on zero would be wrong in exactly the way it claims to protect against.
 */

import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { TracePoint, TraceRange, ZeroSumCheck } from "./integrity";
import { formatSigned } from "./integrity";
import { CountTrace } from "./CountTrace";
import { Badge, Panel, StatRow } from "@/ui/primitives";
import { colors, radius, spacing, type } from "@/ui/theme";

export function ZeroSumCheckPanel({
  check,
  points,
  range,
  totalCards,
  cutIndex,
  trueCount,
  keyCount,
  controls,
}: {
  check: ZeroSumCheck;
  points: readonly TracePoint[];
  range: TraceRange;
  totalCards: number;
  cutIndex: number;
  /** Omitted when undefined — unbalanced systems, or a Shoe with no cards left. */
  trueCount?: number;
  /** The published Key Count, for unbalanced systems that have one at this deck count. */
  keyCount?: number;
  controls: ReactNode;
}) {
  const finishLabel = formatSigned(check.finish);
  const homeLabel = check.shoeComplete
    ? `The Shoe is finished. The Running Count landed on ${formatSigned(check.countNow)}.`
    : `The green line is ${finishLabel} — where the Running Count must finish.`;

  return (
    <Panel title="The zero-sum check">
      <View style={styles.headerRow}>
        <Badge
          label={check.holds ? "RECONCILES" : "DOES NOT RECONCILE"}
          tone={check.holds ? "good" : "bad"}
        />
        {check.shoeComplete ? (
          <Badge
            label={check.countNow === check.finish ? `FINISHED ON ${finishLabel}` : "WRONG FINISH"}
            tone={check.countNow === check.finish ? "good" : "bad"}
          />
        ) : null}
      </View>

      <Text style={styles.prose}>
        {check.balanced ? (
          <>
            <Text style={styles.strong}>{check.systemName}</Text> is balanced: its tags sum to
            zero over a deck, so the Running Count must finish this Shoe on{" "}
            <Text style={styles.strong}>exactly 0</Text>.
          </>
        ) : (
          <>
            <Text style={styles.strong}>{check.systemName}</Text> is unbalanced: its tags sum to{" "}
            <Text style={styles.strong}>{formatSigned(check.tagsPerDeck)}</Text> per deck, so it
            starts this Shoe at <Text style={styles.strong}>{formatSigned(check.start)}</Text> and
            must finish on its pivot, <Text style={styles.strong}>{finishLabel}</Text>.
          </>
        )}
      </Text>

      <View style={styles.ledger}>
        <StatRow label="Running Count you hold now" value={formatSigned(check.countNow)} />
        <StatRow
          label={`Count still in the Shoe (${check.cardsRemaining} cards)`}
          value={formatSigned(check.countRemaining)}
        />
        <View style={styles.rule} />
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Adds up to</Text>
          <Text style={[styles.totalValue, { color: check.holds ? colors.accent : colors.danger }]}>
            {formatSigned(check.reconciled)}
            <Text style={styles.totalSuffix}>{`  must be ${finishLabel}`}</Text>
          </Text>
        </View>
      </View>

      <Text style={styles.prose}>
        {check.shoeComplete
          ? "Every card is dealt and nothing is left to cancel, so what you hold is the finish."
          : "Those two numbers cancel at every point in the Shoe, not only at the end — so you do not have to take the finish on faith. Run the Shoe out and watch the line come home."}
      </Text>

      <CountTrace
        points={points}
        range={range}
        totalCards={totalCards}
        cutIndex={cutIndex}
        homeLabel={homeLabel}
        landed={check.shoeComplete}
      />

      <View style={styles.controls}>{controls}</View>

      <View style={styles.footNotes}>
        <StatRow
          label="Balanced flag, recomputed from the tag table"
          value={check.balanceClaimVerified ? "agrees" : "DISAGREES"}
          tone={check.balanceClaimVerified ? "good" : "bad"}
        />
        {trueCount === undefined ? null : (
          <StatRow label="True Count" value={formatSigned(trueCount)} tone="info" />
        )}
        {check.balanced ? null : (
          <StatRow
            label="Key Count (published, this deck count)"
            value={keyCount === undefined ? "none published" : formatSigned(keyCount)}
          />
        )}
        {check.balanced || trueCount !== undefined ? null : (
          <Text style={styles.note}>
            True Count is not shown for an unbalanced system: it converts a count that already
            carries a deck-count offset, and the result would not mean anything.
          </Text>
        )}
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  prose: { ...type.body, color: colors.textMuted },
  strong: { color: colors.text, fontWeight: "700" },
  ledger: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  rule: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  totalLabel: { ...type.body, color: colors.text, fontWeight: "600" },
  totalValue: { ...type.mono, fontSize: 18, fontWeight: "700" },
  totalSuffix: { ...type.mono, fontSize: 12, color: colors.textMuted, fontWeight: "400" },
  controls: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  footNotes: { gap: spacing.xs },
  note: { ...type.caption, color: colors.textMuted },
});
