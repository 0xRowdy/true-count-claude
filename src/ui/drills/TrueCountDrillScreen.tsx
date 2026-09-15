/**
 * The True Count drill: a Running Count and a shoe remnant in, a True Count out.
 *
 * The engine over-weights the two cases players actually drop — negative counts, where
 * truncation and flooring disagree, and two-digit counts — and names the rounding mode a
 * "wrong" answer was right under. This screen's job is to put both in front of the user: the
 * keypad takes "−3" and "+14" without ceremony, and the Explanation shows the division and every
 * rounding of it.
 *
 * Every answer is recorded into the drill's Session as a conversion check (#27): the question's
 * numbers, the rounding it was graded under, and the run seed and question index that regenerate
 * it. No Shoe is named, because none was dealt. Undo takes an answer back out of the Session.
 *
 * KO and Red 7 never convert to a True Count, so the drill declines them. The refusal is shown,
 * with the reason and a one-tap way to a system that does convert — the drill is never hidden.
 * A declined system is never handed to the Session: nothing can be recorded under it, so the
 * Session stays in the system its answers were given in.
 */

import { useCallback, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import {
  type CountingSystem,
  type TrueCountRounding,
  DEFAULT_TRUE_COUNT_ROUNDING,
  getCountingSystem,
} from "@/engine/counting";
import {
  DEFAULT_TRUE_COUNT_CONFIG,
  type TrueCountDrillState,
  TRUE_COUNT_FOCUSES,
  nextTrueCountQuestion,
  startTrueCountDrill,
  submitTrueCount,
  trueCountDrillAvailability,
  trueCountReport,
} from "@/drills/trueCount";
import { getDrill } from "@/drills/types";
import { ActionButton, Badge, Panel, Screen, SegmentedControl, StatRow } from "@/ui/primitives";
import { colors, spacing, type } from "@/ui/theme";
import { CountEntryPad } from "./CountEntryPad";
import {
  DrillHeader,
  PendingTablePanel,
  RecordingPanel,
  Section,
  SystemPicker,
  TableLine,
  UndoControl,
  drillStyles,
} from "./DrillChrome";
import { TrueCountExplanationPanel } from "./DrillExplanations";
import { replaceRun, stepRun, trueCountRecords } from "./drillRecorder";
import { FOCUS_LABEL, ROUNDING_NAME, ROUNDING_SHORT, decksText, formatCountValue, formatRate } from "./drillFormat";
import { type RunConfig, useRecordedDrill } from "./useRecordedDrill";
import { NONE_PUBLISHED, unbalancedCountRows } from "./unbalancedCount";

const DRILL = getDrill("true-count");
const TWO_COLUMN_WIDTH = 900;
const ROUNDINGS: readonly TrueCountRounding[] = ["truncate", "floor", "round"];

const TABLE_REASON =
  "This drill's Session records one table for its whole length, and its conversions were posed at that table's deck count. Drilling another table inside it would leave the Session naming a table some of its answers were never posed at.";

export function TrueCountDrillScreen() {
  const [rounding, setRounding] = useState<TrueCountRounding>(DEFAULT_TRUE_COUNT_ROUNDING);
  const roundingRef = useRef(rounding);
  roundingRef.current = rounding;
  /** A system the user picked that this drill declines. Shown, never recorded. */
  const [declined, setDeclined] = useState<CountingSystem | null>(null);
  const { width } = useWindowDimensions();
  const twoColumn = width >= TWO_COLUMN_WIDTH;

  const start = useCallback((config: RunConfig) => {
    if (!trueCountDrillAvailability(config.system).available) return null;
    return startTrueCountDrill(
      {
        ...DEFAULT_TRUE_COUNT_CONFIG,
        system: config.system,
        decks: config.rules.decks,
        rounding: roundingRef.current,
      },
      config.seed,
    );
  }, []);

  const recorded = useRecordedDrill<TrueCountDrillState>({
    drillId: "true-count",
    start,
    // A conversion check names its own system, so a Session carries on across a switch.
    systemBindsSession: false,
    startingBankroll: 0,
  });
  const { run, config, update } = recorded;

  const pickSystem = useCallback(
    (system: CountingSystem) => {
      if (!trueCountDrillAvailability(system).available) {
        setDeclined(system);
        return;
      }
      setDeclined(null);
      recorded.changeSystem(system);
    },
    [recorded],
  );

  const answer = useCallback(
    (value: number) => {
      const at = Date.now();
      update((current) => {
        const before = current.drill.current;
        // A second submission for the same question is a no-op in the drill, so it must not
        // become an undo point on the log either — the two stacks move in lockstep.
        if (before.lastResult !== null) return current;
        const next = submitTrueCount(current.drill, value, at);
        return stepRun(current, next, trueCountRecords(before, next.current));
      });
    },
    [update],
  );

  const shownSystem = declined ?? config?.system ?? null;
  const header = (
    <>
      <DrillHeader
        drill={DRILL}
        report={{
          ...(shownSystem ? { countingSystem: shownSystem.name } : {}),
          details: run
            ? { runSeed: run.drill.current.seed, questionIndex: run.drill.current.question.index }
            : {},
        }}
      />
      <RecordingPanel
        session={recorded.session}
        ended={recorded.ended}
        unit="conversions"
        error={recorded.storageError}
        onEnd={recorded.endSession}
      />
      {recorded.pendingRules && config ? (
        <PendingTablePanel
          current={config.rules}
          pending={recorded.pendingRules}
          onTakeUp={recorded.takeUpRules}
          reason={TABLE_REASON}
        />
      ) : null}
    </>
  );

  if (!config || !shownSystem) {
    return (
      <ScrollView style={drillStyles.scroll} contentContainerStyle={drillStyles.scrollContent}>
        <Screen width="wide">
          <DrillHeader drill={DRILL} />
          <Text style={drillStyles.loading}>Loading your table…</Text>
        </Screen>
      </ScrollView>
    );
  }

  const decks = config.rules.decks;
  const setup = (
    <Panel title="Setup">
      <TableLine rules={config.rules} />
      <SystemPicker
        value={shownSystem}
        onChange={pickSystem}
        note={
          recorded.session
            ? "a conversion check names its system, so switching carries this Session on with a new set of questions."
            : "changing it starts a new set of questions."
        }
      />
      <Text style={styles.label}>Rounding</Text>
      <SegmentedControl
        options={ROUNDINGS.map((mode) => ({ value: mode, label: ROUNDING_SHORT[mode] }))}
        value={rounding}
        onChange={(mode) => {
          if (mode === rounding) return;
          setRounding(mode);
          // Read by `start` synchronously inside `restart`, so it is set before the call.
          roundingRef.current = mode;
          recorded.restart();
        }}
      />
      <Text style={drillStyles.note}>
        Graded {ROUNDING_NAME[rounding]}. Practise the convention you actually play with; the app's
        own index lookups truncate by default. Each recorded answer keeps the rounding it was graded
        under, so switching carries your Session on.
      </Text>
    </Panel>
  );

  if (declined || !run) {
    const refused = declined ?? config.system;
    const availability = trueCountDrillAvailability(refused);
    const references = unbalancedCountRows(refused, decks);
    return (
      <ScrollView style={drillStyles.scroll} contentContainerStyle={drillStyles.scrollContent}>
        <Screen width="wide">
          {header}
          <Panel title={`Not for ${refused.name}`}>
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
                    onPress={() => pickSystem(supported)}
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

  const state = run.drill.current;
  const question = state.question;
  const result = state.lastResult;
  const report = trueCountReport(run.drill);

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
            onSubmit={answer}
          />
        </Panel>
      )}

      <UndoControl canUndo={recorded.canUndo} onUndo={recorded.undo} undone={run.drill.undone} />

      {result ? (
        <TrueCountExplanationPanel
          result={result}
          accessory={
            <View style={drillStyles.actions}>
              <ActionButton
                label="Next question"
                tone="good"
                onPress={() => update((current) => replaceRun(current, nextTrueCountQuestion(current.drill)))}
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
    <ScrollView
      style={drillStyles.scroll}
      contentContainerStyle={drillStyles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
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
