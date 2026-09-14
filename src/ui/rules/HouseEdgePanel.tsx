/**
 * The house edge, live.
 *
 * This is the teaching surface of the screen. ADR-0005 says we compete on explanation, so
 * the panel does not stop at a number: it shows the published baseline, every rule that
 * moves it, and by how much, in the order those rules were applied. A user who taps 6:5
 * and watches a `+1.39` line appear above a total that has nearly tripled has learned the
 * single most valuable thing about choosing a table, and they have learned it from an
 * arithmetic they can check line by line.
 *
 * Two things this panel refuses to do. It will not show a total when any line is
 * unsourced — a partial sum presented as an answer is exactly the "wrong math" that is 21%
 * of low-star reviews in the category. And it does not hide the limits of the model:
 * `EDGE_PRECISION_NOTE` and the sources are on the panel, not in a footnote nobody reads.
 */

import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { RuleSet } from "@/engine/rules";
import { describeRules } from "@/engine/rules";
import { Badge, Panel, StatRow, type Tone } from "@/ui/primitives";
import { colors, radius, spacing, type } from "@/ui/theme";
import {
  EDGE_NEUTRAL_RULES,
  EDGE_PRECISION_NOTE,
  EDGE_SOURCES,
  EDGE_VERDICT_LABEL,
  type EdgeContribution,
  type EdgeVerdict,
  type HouseEdgeEstimate,
  edgeVerdict,
  formatEdge,
  formatEdgePerHundred,
  HANDS_PER_HOUR,
  hourlyCost,
} from "./houseEdge";

const VERDICT_TONE: Readonly<Record<EdgeVerdict, Tone>> = {
  "player-advantage": "good",
  excellent: "good",
  fair: "info",
  poor: "warn",
  predatory: "bad",
};

export function HouseEdgePanel({
  rules,
  estimate,
}: {
  rules: RuleSet;
  estimate: HouseEdgeEstimate;
}) {
  const [showWorking, setShowWorking] = useState(false);
  const percent = estimate.percent;

  return (
    <Panel title="House edge">
      <Text style={styles.tableLine}>{describeRules(rules)}</Text>

      {percent === undefined ? (
        <Unpriceable estimate={estimate} />
      ) : (
        <Headline percent={percent} rules={rules} />
      )}

      <Pressable
        onPress={() => setShowWorking((open) => !open)}
        accessibilityRole="button"
        accessibilityLabel={showWorking ? "Hide the working" : "Show the working"}
        style={({ pressed }) => [styles.disclosure, pressed && styles.pressed]}
      >
        <Text style={styles.disclosureLabel}>
          {showWorking ? "Hide the working ▴" : "Show the working ▾"}
        </Text>
      </Pressable>

      {showWorking ? <Working estimate={estimate} /> : null}
    </Panel>
  );
}

function Headline({ percent, rules }: { percent: number; rules: RuleSet }) {
  const verdict = edgeVerdict(percent);
  const tone = VERDICT_TONE[verdict];
  const hourly = hourlyCost(percent, rules.minBet);
  const playerAhead = percent < 0;

  return (
    <>
      <View style={styles.headline}>
        <Text style={[styles.edge, { color: toneColor(tone) }]}>{formatEdge(percent)}</Text>
        <View style={styles.headlineText}>
          <Badge label={EDGE_VERDICT_LABEL[verdict]} tone={tone} />
          <Text style={styles.headlineNote}>{formatEdgePerHundred(percent)}</Text>
        </View>
      </View>

      <StatRow
        label={`At your ${formatMoney(rules.minBet)} minimum, ${HANDS_PER_HOUR} hands an hour`}
        value={`${playerAhead ? "+" : "-"}${formatMoney(Math.abs(hourly))} / hour`}
        tone={tone}
      />

      {playerAhead ? (
        <Text style={styles.prose}>
          Basic strategy alone is ahead of the house at this table, before a single card is
          counted. Tables like this are rare, short-lived, and watched closely.
        </Text>
      ) : null}
    </>
  );
}

function Unpriceable({ estimate }: { estimate: HouseEdgeEstimate }) {
  return (
    <View style={styles.unpriceable}>
      <Badge label="NO PUBLISHED FIGURE" tone="warn" />
      <Text style={styles.prose}>
        We will not show you a number we cannot source. The rest of this screen still works —
        the strategy chart below is exact for these rules.
      </Text>
      {estimate.unsourced.map((entry) => (
        <Text key={entry.id} style={styles.unsourcedReason}>
          {entry.note ?? entry.label}
        </Text>
      ))}
    </View>
  );
}

function Working({ estimate }: { estimate: HouseEdgeEstimate }) {
  return (
    <View style={styles.working}>
      <Text style={styles.workingIntro}>
        A published house edge for the baseline game, plus a published figure for each rule
        your table differs by. Positive costs you; negative pays you.
      </Text>

      <View style={styles.ledger}>
        {estimate.lines.map((entry) => (
          <LedgerRow key={entry.id} entry={entry} baseline={entry === estimate.baseline} />
        ))}
        <View style={styles.ledgerTotal}>
          <Text style={styles.totalLabel}>House edge</Text>
          <Text style={styles.totalValue}>
            {estimate.percent === undefined ? "—" : formatEdge(estimate.percent)}
          </Text>
        </View>
      </View>

      <Text style={styles.caveat}>{EDGE_PRECISION_NOTE}</Text>

      <Text style={styles.subheading}>Rules with no effect on the edge</Text>
      {EDGE_NEUTRAL_RULES.map((rule) => (
        <Text key={rule.label} style={styles.neutral}>
          <Text style={styles.strong}>{rule.label}. </Text>
          {rule.why}
        </Text>
      ))}

      <Text style={styles.subheading}>Sources</Text>
      <Text style={styles.source}>{EDGE_SOURCES.decks}</Text>
      <Text style={styles.source}>{EDGE_SOURCES.variations}</Text>
    </View>
  );
}

/**
 * The baseline line is deliberately not coloured as a cost. It is the published starting
 * point for the deck count, not something a rule did to you; painting it red alongside the
 * departures would read as "six decks is a penalty", which is not what the figure means.
 */
function LedgerRow({ entry, baseline }: { entry: EdgeContribution; baseline: boolean }) {
  const value =
    entry.percent === undefined
      ? "—"
      : `${entry.percent > 0 && !baseline ? "+" : ""}${entry.percent.toFixed(2)}`;
  const valueColor =
    entry.percent === undefined
      ? colors.warning
      : baseline
        ? colors.text
        : entry.percent > 0
          ? colors.danger
          : entry.percent < 0
            ? colors.accent
            : colors.textMuted;

  return (
    <View style={styles.ledgerRow}>
      <View style={styles.ledgerLabelColumn}>
        <Text style={styles.ledgerLabel}>{entry.label}</Text>
        {entry.note ? <Text style={styles.ledgerNote}>{entry.note}</Text> : null}
      </View>
      <Text style={[styles.ledgerValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

function toneColor(tone: Tone): string {
  switch (tone) {
    case "good":
      return colors.accent;
    case "bad":
      return colors.danger;
    case "warn":
      return colors.warning;
    case "info":
      return colors.info;
    default:
      return colors.text;
  }
}

/** Whole dollars — the table minimum is never a fractional amount. */
function formatMoney(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

const styles = StyleSheet.create({
  tableLine: { ...type.mono, ...type.caption, color: colors.textMuted },
  headline: { flexDirection: "row", alignItems: "center", gap: spacing.md, flexWrap: "wrap" },
  edge: { fontSize: 44, fontWeight: "700", letterSpacing: -1.5, ...type.mono },
  headlineText: { gap: spacing.xs, flexShrink: 1 },
  headlineNote: { ...type.caption, color: colors.textMuted },
  prose: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  unpriceable: { gap: spacing.sm },
  unsourcedReason: { ...type.caption, color: colors.warning, lineHeight: 19 },
  disclosure: { minHeight: 44, justifyContent: "center" },
  disclosureLabel: { ...type.caption, color: colors.info, fontWeight: "600" },
  pressed: { opacity: 0.65 },
  working: { gap: spacing.sm },
  workingIntro: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  ledger: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
  },
  ledgerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  ledgerLabelColumn: { flexShrink: 1, flexGrow: 1, gap: 2 },
  ledgerLabel: { ...type.caption, color: colors.text, lineHeight: 18 },
  ledgerNote: { ...type.caption, color: colors.warning, fontSize: 12, lineHeight: 17 },
  ledgerValue: { ...type.mono, ...type.caption, minWidth: 56, textAlign: "right" },
  ledgerTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  totalLabel: { ...type.caption, color: colors.text, fontWeight: "700" },
  totalValue: { ...type.mono, ...type.caption, color: colors.text, fontWeight: "700" },
  caveat: { ...type.caption, color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  subheading: { ...type.caption, color: colors.text, fontWeight: "700", marginTop: spacing.xs },
  neutral: { ...type.caption, color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  strong: { color: colors.text, fontWeight: "700" },
  source: { ...type.caption, color: colors.textMuted, fontSize: 12, lineHeight: 17 },
});
