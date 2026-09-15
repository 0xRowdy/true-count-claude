/**
 * The Explanation for the two kinds of answer `ExplanationPanel` does not cover.
 *
 * `ExplanationPanel` (#8) explains a *Decision* — a play or an insurance call — and its props
 * take a `DecisionExplanation` or an `InsuranceExplanation`. A count check and a True Count
 * conversion are not Decisions, and the drills module gives each its own structured
 * Explanation (`CountExplanation`, `TrueCountExplanation`). These panels render those, in the
 * same visual language, under the same rule: invariant 2 — a right answer is explained exactly
 * as fully as a wrong one.
 *
 * - A count check is explained by its **tag trail**: every card since the last check, with its
 *   tag and the total after it. "You are two low" teaches nothing; the trail shows where.
 * - A True Count is explained by **the division and every rounding of it**, so a user who
 *   floored where the drill truncates is told they did arithmetic, not a blunder.
 */

import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { getCountingSystem } from "@/engine/counting";
import type { CountCheckResult } from "@/drills/counting";
import type { TrueCountResult } from "@/drills/trueCount";
import { Panel, StatRow } from "@/ui/primitives";
import { CardView } from "@/ui/table/CardView";
import { colors, radius, spacing, type } from "@/ui/theme";
import {
  ROUNDING_NAME,
  ROUNDING_SHORT,
  countCheckVerdict,
  decksText,
  divisionText,
  formatCountValue,
  trueCountVerdict,
} from "./drillFormat";
import { NONE_PUBLISHED, unbalancedCountRows } from "./unbalancedCount";

export function CountCheckExplanationPanel({
  result,
  decks,
  accessory,
}: {
  result: CountCheckResult;
  /** Decks in the shoe, for an unbalanced system's starting count and Key Count. */
  decks: number;
  accessory?: ReactNode;
}) {
  const e = result.explanation;
  const verdict = countCheckVerdict(result);
  const system = getCountingSystem(e.count.system);
  const references = unbalancedCountRows(system, decks);

  return (
    <Panel title="Why">
      {accessory}
      <Verdict correct={verdict.correct} headline={verdict.headline} detail={verdict.detail} />

      <Group title="The count">
        <Text style={styles.body}>
          <Text style={styles.strong}>{e.systemName}</Text> Running Count{" "}
          <Text style={styles.mono}>{formatCountValue(e.actualRunningCount)}</Text> after{" "}
          {e.cardsSeen} cards, with {decksText(e.count.cardsRemaining)} left.
        </Text>
        {e.balanced ? (
          e.count.trueCount !== null && e.count.exactTrueCount !== null ? (
            <Text style={styles.body}>
              True Count{" "}
              <Text style={styles.mono}>
                {divisionText(e.actualRunningCount, e.count.decksRemaining, e.count.exactTrueCount)}
              </Text>
              , played as <Text style={[styles.mono, styles.strong]}>{formatCountValue(e.count.trueCount)}</Text>{" "}
              <Text style={styles.muted}>({ROUNDING_NAME[e.count.rounding]})</Text>
            </Text>
          ) : null
        ) : (
          <>
            <Text style={styles.body}>
              {e.systemName} starts a {decks}-deck shoe at{" "}
              <Text style={styles.mono}>{formatCountValue(e.initialRunningCount)}</Text>, not at zero — the
              count you hold includes that start.
            </Text>
            {references.map((row) => (
              <StatRow
                key={row.kind}
                label={row.label}
                value={row.value === null ? NONE_PUBLISHED : formatCountValue(row.value)}
              />
            ))}
          </>
        )}
        {e.count.trueCountNote ? <Text style={styles.refusal}>{e.count.trueCountNote}</Text> : null}
      </Group>

      <Group title="Since your last check">
        <Text style={styles.body}>
          The count was <Text style={styles.mono}>{formatCountValue(e.spanStartRunningCount)}</Text>;{" "}
          {e.trailTruncated ? "the cards since" : `the ${e.trail.length} card${e.trail.length === 1 ? "" : "s"} since`} add{" "}
          <Text style={styles.mono}>{formatCountValue(e.spanTagSum)}</Text>, making{" "}
          <Text style={styles.mono}>{formatCountValue(e.actualRunningCount)}</Text>.
        </Text>
        {e.trailTruncated ? (
          <Text style={styles.note}>
            A long stretch: only its last {e.trail.length} cards are shown. The total above covers all of it.
          </Text>
        ) : null}
        {e.trail.length === 0 ? (
          <Text style={styles.note}>No cards have been dealt since the last check.</Text>
        ) : (
          <View style={styles.trail}>
            {e.trail.map((stepView) => (
              <View key={stepView.ordinal} style={styles.trailStep}>
                <CardView card={stepView.card} size="sm" />
                <Text style={[styles.tag, tagColor(stepView.tag)]}>{formatCountValue(stepView.tag)}</Text>
                <Text style={styles.total}>{formatCountValue(stepView.runningCount)}</Text>
              </View>
            ))}
          </View>
        )}
        <Text style={styles.note}>Under each card: its tag, then the Running Count after it.</Text>
      </Group>

      {e.byRank.length > 0 ? (
        <Group title="By rank, since your last check">
          <View style={styles.table}>
            <View style={styles.tableRow}>
              <Text style={[styles.cell, styles.head]}>Rank</Text>
              <Text style={[styles.cell, styles.head]}>Seen</Text>
              <Text style={[styles.cell, styles.head]}>Tag</Text>
              <Text style={[styles.cell, styles.head]}>Adds</Text>
            </View>
            {e.byRank.map((rank) => (
              <View key={rank.rank} style={styles.tableRow}>
                <Text style={styles.cell}>{rank.rank}</Text>
                <Text style={styles.cell}>{rank.seen}</Text>
                <Text style={styles.cell}>{rank.tag === null ? "by suit" : formatCountValue(rank.tag)}</Text>
                <Text style={[styles.cell, tagColor(rank.contribution)]}>{formatCountValue(rank.contribution)}</Text>
              </View>
            ))}
          </View>
          {e.byRank.some((rank) => rank.tag === null) ? (
            <Text style={styles.note}>
              {e.systemName} counts a red seven +1 and a black seven 0, so a seven has no single tag.
            </Text>
          ) : null}
        </Group>
      ) : null}
    </Panel>
  );
}

export function TrueCountExplanationPanel({
  result,
  accessory,
}: {
  result: TrueCountResult;
  accessory?: ReactNode;
}) {
  const e = result.explanation;
  const verdict = trueCountVerdict(result);
  const modes = ["truncate", "floor", "round", "exact"] as const;
  const traits = [
    e.traits.negativeRunningCount ? "a negative Running Count, where rounding conventions disagree" : null,
    e.traits.twoDigitRunningCount ? "a two-digit Running Count" : null,
    e.traits.twoDigitTrueCount ? "a two-digit True Count" : null,
    e.traits.deepShoe ? "under one deck left, so dividing makes the count bigger" : null,
    e.traits.fractionalDecks ? "a fractional number of decks" : null,
    e.traits.roundingMatters ? "a division that does not come out whole, so the rounding bites" : null,
  ].filter((line): line is string => line !== null);

  return (
    <Panel title="Why">
      {accessory}
      <Verdict correct={verdict.correct} headline={verdict.headline} detail={verdict.detail} />
      {verdict.lesson ? <Text style={styles.lesson}>{verdict.lesson}</Text> : null}

      <Group title="The division">
        <StatRow label={`Running Count · ${e.systemName}`} value={formatCountValue(e.runningCount)} />
        <StatRow label="Decks remaining" value={decksText(e.cardsRemaining)} />
        <StatRow label="Exact quotient" value={divisionText(e.runningCount, e.decksRemaining, e.exact)} />
      </Group>

      <Group title="Every rounding of it">
        {modes.map((mode) => {
          const graded = mode === e.rounding;
          const yours = e.byRounding[mode] === e.stated;
          return (
            <View key={mode} style={[styles.roundRow, graded && styles.roundGraded]}>
              <Text style={styles.roundName}>
                {ROUNDING_SHORT[mode]}
                <Text style={styles.muted}> · {ROUNDING_NAME[mode]}</Text>
              </Text>
              <View style={styles.roundValue}>
                {graded ? <Text style={styles.flag}>THIS DRILL</Text> : null}
                {yours && mode !== "exact" ? <Text style={[styles.flag, styles.flagYou]}>YOU</Text> : null}
                <Text style={styles.mono}>
                  {mode === "exact" ? e.exact.toFixed(2) : formatCountValue(e.byRounding[mode])}
                </Text>
              </View>
            </View>
          );
        })}
        <Text style={styles.note}>
          Truncating toward zero is symmetric: +3.9 and −3.9 both become 3. Flooring always goes down,
          so −3.1 becomes −4. Pick the convention your index numbers were computed with, and keep it.
        </Text>
      </Group>

      {traits.length > 0 ? (
        <Group title="What made this one hard">
          {traits.map((line) => (
            <Text key={line} style={styles.body}>
              • {line}
            </Text>
          ))}
        </Group>
      ) : null}
    </Panel>
  );
}

function Verdict({ correct, headline, detail }: { correct: boolean; headline: string; detail: string | null }) {
  const accent = correct ? colors.accent : colors.danger;
  return (
    <View accessibilityRole="summary" style={[styles.verdict, { borderLeftColor: accent }]}>
      <Text style={[styles.headline, { color: accent }]}>{headline}</Text>
      {detail ? <Text style={styles.body}>{detail}</Text> : null}
    </View>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function tagColor(value: number) {
  return { color: value > 0 ? colors.accent : value < 0 ? colors.danger : colors.textMuted };
}

const styles = StyleSheet.create({
  verdict: {
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderLeftWidth: 4,
    backgroundColor: colors.surfaceRaised,
  },
  headline: { ...type.body, fontSize: 16, fontWeight: "700" },
  body: { ...type.body, color: colors.text, flexShrink: 1 },
  lesson: { ...type.body, color: colors.warning, flexShrink: 1 },
  strong: { fontWeight: "700" },
  mono: { ...type.mono, color: colors.text },
  muted: { color: colors.textMuted },
  note: { ...type.caption, color: colors.textMuted, lineHeight: 18 },
  refusal: { ...type.caption, color: colors.info, lineHeight: 18 },
  group: { gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  groupTitle: {
    ...type.caption,
    color: colors.textMuted,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  trail: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  trailStep: { alignItems: "center", gap: 2, minWidth: 40 },
  tag: { ...type.mono, fontSize: 12, fontWeight: "700" },
  total: { ...type.mono, fontSize: 11, color: colors.textMuted },
  table: { gap: 2 },
  tableRow: { flexDirection: "row" },
  cell: { ...type.mono, ...type.caption, color: colors.text, flexBasis: 0, flexGrow: 1 },
  head: { color: colors.textMuted, fontWeight: "700" },
  roundRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  roundGraded: { backgroundColor: colors.surfaceRaised },
  roundName: { ...type.caption, color: colors.text, flexShrink: 1 },
  roundValue: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  flag: { ...type.caption, fontSize: 10, fontWeight: "700", color: colors.accent, letterSpacing: 0.6 },
  flagYou: { color: colors.warning },
});
