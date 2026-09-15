/**
 * The True Count drill: a Running Count and a shoe remnant in, a True Count out.
 *
 * The engine over-weights the two cases players actually drop — negative counts, where
 * truncation and flooring disagree, and two-digit counts — and names the rounding mode a
 * "wrong" answer was right under. This screen's job is to put both in front of the user: the
 * keypad takes "−3" and "+14" without ceremony, and the Explanation shows the division and every
 * rounding of it.
 *
 * KO and Red 7 never convert to a True Count, so the drill declines them. The refusal is shown,
 * with the reason and a one-tap way to a system that does convert — the drill is never hidden.
 */

import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import {
  type CountingSystem,
  type TrueCountRounding,
  DEFAULT_COUNTING_SYSTEM,
  DEFAULT_TRUE_COUNT_ROUNDING,
  getCountingSystem,
} from "@/engine/counting";
import { canUndo, undo } from "@/drills/progress";
import {
  DEFAULT_TRUE_COUNT_CONFIG,
  type TrueCountDrill,
  TRUE_COUNT_FOCUSES,
  nextTrueCountQuestion,
  startTrueCountDrill,
  submitTrueCount,
  trueCountDrillAvailability,
  trueCountReport,
} from "@/drills/trueCount";
import { getDrill } from "@/drills/types";
import { ActionButton, Badge, Panel, Screen, SegmentedControl, StatRow } from "@/ui/primitives";
import { useConfiguredRules } from "@/ui/rules/rulesStore";
import { colors, spacing, type } from "@/ui/theme";
import { CountEntryPad } from "./CountEntryPad";
import {
  DrillHeader,
  NotRecordedPanel,
  Section,
  SystemPicker,
  TableLine,
  UndoControl,
  drillStyles,
} from "./DrillChrome";
import { TrueCountExplanationPanel } from "./DrillExplanations";
import { FOCUS_LABEL, ROUNDING_NAME, ROUNDING_SHORT, decksText, formatCountValue, formatRate } from "./drillFormat";
import { freshSeed } from "./useRecordedDrill";
import { NONE_PUBLISHED, unbalancedCountRows } from "./unbalancedCount";

const DRILL = getDrill("true-count");
const TWO_COLUMN_WIDTH = 900;
const ROUNDINGS: readonly TrueCountRounding[] = ["truncate", "floor", "round"];

export function TrueCountDrillScreen() {
  const configured = useConfiguredRules();
  const decks = configured.rules.decks;
  const [system, setSystem] = useState<CountingSystem>(DEFAULT_COUNTING_SYSTEM);
  const [rounding, setRounding] = useState<TrueCountRounding>(DEFAULT_TRUE_COUNT_ROUNDING);
  const [drill, setDrill] = useState<TrueCountDrill | null>(null);
  const { width } = useWindowDimensions();
  const twoColumn = width >= TWO_COLUMN_WIDTH;

  const availability = useMemo(() => trueCountDrillAvailability(system), [system]);

  // A new drill whenever what it drills changes: the system, the rounding, or the deck count.
  useEffect(() => {
    if (!configured.ready || !availability.available) {
      setDrill(null);
      return;
    }
    setDrill(startTrueCountDrill({ ...DEFAULT_TRUE_COUNT_CONFIG, system, decks, rounding }, freshSeed()));
  }, [configured.ready, availability.available, system, decks, rounding]);

  const setup = (
    <Panel title="Setup">
      <TableLine rules={configured.rules} />
      <SystemPicker value={system} onChange={setSystem} note="changing it starts a new set of questions." />
      <Text style={styles.label}>Rounding</Text>
      <SegmentedControl
        options={ROUNDINGS.map((mode) => ({ value: mode, label: ROUNDING_SHORT[mode] }))}
        value={rounding}
        onChange={setRounding}
      />
      <Text style={drillStyles.note}>
        Graded {ROUNDING_NAME[rounding]}. Practise the convention you actually play with; the app's
        own index lookups truncate by default.
      </Text>
    </Panel>
  );

  const header = (
    <>
      <DrillHeader
        drill={DRILL}
        report={{
          countingSystem: system.name,
          details: drill
            ? { runSeed: drill.current.seed, questionIndex: drill.current.attempts.length }
            : {},
        }}
      />
      <NotRecordedPanel reason="A Session keeps a Decision log and a count-check log, and a True Count conversion is neither, so there is nowhere honest to write these answers yet. Your score stays on this screen; counting accuracy on the Statistics screen comes from the Counting drill." />
    </>
  );

  if (!availability.available) {
    const references = unbalancedCountRows(system, decks);
    return (
      <ScrollView style={drillStyles.scroll} contentContainerStyle={drillStyles.scrollContent}>
        <Screen width="wide">
          {header}
          <Panel title={`Not for ${system.name}`}>
            <Badge label="DECLINED" tone="info" />
            <Text style={drillStyles.refusal}>{availability.note}</Text>
            {references.map((row) => (
              <View key={row.kind} style={styles.reference}>
                <StatRow
                  label={row.label}
                  value={row.value === null ? NONE_PUBLISHED : formatCountValue(row.value)}
                />
                <Text style={drillStyles.note}>{row.meaning}</Text>
              </View>
            ))}
            <View style={drillStyles.actions}>
              {availability.supportedSystems.map((id) => {
                const supported = getCountingSystem(id);
                return (
                  <ActionButton
                    key={id}
                    label={`Drill ${supported.name}`}
                    tone="good"
                    onPress={() => setSystem(supported)}
                  />
                );
              })}
            </View>
          </Panel>
          {setup}
        </Screen>
      </ScrollView>
    );
  }

  if (!drill) {
    return (
      <ScrollView style={drillStyles.scroll} contentContainerStyle={drillStyles.scrollContent}>
        <Screen width="wide">
          {header}
          <Text style={drillStyles.loading}>Loading your table…</Text>
        </Screen>
      </ScrollView>
    );
  }

  const state = drill.current;
  const question = state.question;
  const result = state.lastResult;
  const report = trueCountReport(drill);

  const questionColumn = (
    <View style={twoColumn ? styles.columnWide : styles.columnNarrow}>
      <Panel title={`Question ${question.index + 1}`}>
        <View style={styles.question}>
          <View style={styles.given}>
            <Text style={styles.givenLabel}>Running Count · {question.systemName}</Text>
            <Text style={drillStyles.big}>{formatCountValue(question.runningCount)}</Text>
          </View>
          <View style={styles.given}>
            <Text style={styles.givenLabel}>Left in the shoe</Text>
            <Text style={styles.decks}>{decksText(question.cardsRemaining)}</Text>
          </View>
        </View>
        {result ? <Badge label={FOCUS_LABEL[question.focus]} tone="info" /> : null}
      </Panel>

      {result ? null : (
        <Panel>
          <CountEntryPad
            prompt={`True Count, ${ROUNDING_NAME[state.config.rounding]}`}
            submitLabel="Answer"
            onSubmit={(value) => setDrill((current) => (current ? submitTrueCount(current, value, Date.now()) : current))}
          />
        </Panel>
      )}

      <UndoControl
        canUndo={canUndo(drill)}
        onUndo={() => setDrill((current) => (current ? undo(current) : current))}
        undone={drill.undone}
      />

      {result ? (
        <TrueCountExplanationPanel
          result={result}
          accessory={
            <View style={drillStyles.actions}>
              <ActionButton
                label="Next question"
                tone="good"
                onPress={() => setDrill((current) => (current ? nextTrueCountQuestion(current) : current))}
              />
            </View>
          }
        />
      ) : null}
    </View>
  );

  const railColumn = (
    <View style={twoColumn ? styles.columnWide : styles.columnNarrow}>
      <Panel title="This run">
        <StatRow
          label="Correct"
          value={`${formatRate(report.tally.accuracy)} (${report.tally.correct} of ${report.tally.attempts})`}
        />
        <StatRow label="Streak" value={report.tally.streak} tone={report.tally.streak > 0 ? "good" : "neutral"} />
        <Section title="Where it goes wrong">
          {[report.negativeTrueCounts, report.positiveTrueCounts, report.twoDigitCounts, report.singleDigitCounts].map(
            (slice) => (
              <StatRow
                key={slice.label}
                label={slice.label}
                value={`${formatRate(slice.accuracy)} (${slice.correct} of ${slice.attempts})`}
              />
            ),
          )}
          <StatRow label="Right under another rounding" value={report.roundingErrors} tone={report.roundingErrors > 0 ? "warn" : "neutral"} />
          <StatRow label="Right size, wrong sign" value={report.signErrors} tone={report.signErrors > 0 ? "warn" : "neutral"} />
          <StatRow
            label="Average miss"
            value={report.meanAbsoluteError === null ? "—" : report.meanAbsoluteError.toFixed(1)}
          />
        </Section>
        <Section title="By kind of question">
          {TRUE_COUNT_FOCUSES.map((focus) => {
            const slice = report.byFocus.find((entry) => entry.focus === focus);
            return (
              <StatRow
                key={focus}
                label={FOCUS_LABEL[focus]}
                value={slice ? `${formatRate(slice.accuracy)} (${slice.correct} of ${slice.attempts})` : "—"}
              />
            );
          })}
          <Text style={drillStyles.note}>
            Negative and two-digit counts come up on purpose, far more often than a real shoe serves them.
          </Text>
        </Section>
      </Panel>
      {setup}
    </View>
  );

  return (
    <ScrollView style={drillStyles.scroll} contentContainerStyle={drillStyles.scrollContent}>
      <Screen width="wide">
        {header}
        <View style={twoColumn ? styles.wide : styles.narrow}>
          {questionColumn}
          {railColumn}
        </View>
      </Screen>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  narrow: { flexDirection: "column", gap: spacing.md },
  wide: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  columnWide: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, gap: spacing.md },
  columnNarrow: { width: "100%", gap: spacing.md },
  question: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg },
  given: { gap: 2 },
  givenLabel: { ...type.caption, color: colors.textMuted },
  decks: { ...type.mono, fontSize: 20, fontWeight: "700", color: colors.text },
  reference: { gap: 2 },
  label: {
    ...type.caption,
    color: colors.textMuted,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: spacing.sm,
  },
});
