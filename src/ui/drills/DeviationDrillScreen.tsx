/**
 * The Deviation drill: hands posed at counts either side of a published index.
 *
 * This screen is built around the engine's three honest refusals, and shows every one of them
 * rather than papering over it:
 *
 *  1. **Only Hi-Lo publishes indices.** For the other five systems the drill declines, says why,
 *     and offers the switch — it never lends them Hi-Lo's numbers, and it never hides the drill.
 *  2. **Some published indices do not apply at your table.** The ones your Rule Set takes off
 *     the board are listed by name with the reason, because "18 indices" that are silently 12
 *     would be the auditable-math promise (invariant 4) broken in the drill pool.
 *  3. **The boundary belongs to the "at or above" side.** Questions sit either side of the
 *     index and on it, and the Explanation shows the distance with its sign.
 *
 * Every answer — right or wrong — shows the full `ExplanationPanel` (#8), graded against the
 * chart as amended by the index numbers at this count.
 */

import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { type CountingSystem, DEFAULT_COUNTING_SYSTEM, getCountingSystem, signed } from "@/engine";
import { type Action, legalActions } from "@/engine/hand";
import { canUndo, undo } from "@/drills/progress";
import {
  DEFAULT_DEVIATION_CONFIG,
  type DeviationDrill,
  deviationDrillAvailability,
  deviationReport,
  nextDeviationQuestion,
  startDeviationDrill,
  submitDeviation,
} from "@/drills/deviation";
import type { DrillAction } from "@/drills/explanation";
import { getDrill } from "@/drills/types";
import { ExplanationPanel } from "@/ui/explanation/ExplanationPanel";
import { ActionButton, Badge, Panel, Screen, SecondaryButton, StatRow, type Tone } from "@/ui/primitives";
import { useConfiguredRules } from "@/ui/rules/rulesStore";
import { CardRow } from "@/ui/table/CardView";
import { colors, spacing, type } from "@/ui/theme";
import {
  DrillHeader,
  NotRecordedPanel,
  Section,
  SystemPicker,
  TableLine,
  UndoControl,
  drillStyles,
} from "./DrillChrome";
import { EXCLUSION_REASON, ROUNDING_NAME, decksText, formatCountValue, formatRate, upcardName } from "./drillFormat";
import { freshSeed } from "./useRecordedDrill";

const DRILL = getDrill("deviation");
const TWO_COLUMN_WIDTH = 900;
/** Large, so no index play is ever withheld for want of chips (invariant 7). Matches the engine. */
const DRILL_BANKROLL = 1_000_000;

const ACTION_ORDER: readonly Action[] = ["hit", "stand", "double", "split", "surrender"];
const ACTION_LABEL: Record<Action, string> = {
  hit: "Hit",
  stand: "Stand",
  double: "Double",
  split: "Split",
  surrender: "Surrender",
};
const ACTION_TONE: Record<Action, Tone> = {
  hit: "neutral",
  stand: "neutral",
  double: "info",
  split: "warn",
  surrender: "bad",
};

export function DeviationDrillScreen() {
  const configured = useConfiguredRules();
  const rules = configured.rules;
  const [system, setSystem] = useState<CountingSystem>(DEFAULT_COUNTING_SYSTEM);
  const [drill, setDrill] = useState<DeviationDrill | null>(null);
  const [showExcluded, setShowExcluded] = useState(true);
  const { width } = useWindowDimensions();
  const twoColumn = width >= TWO_COLUMN_WIDTH;

  const availability = useMemo(() => deviationDrillAvailability(rules, system), [rules, system]);

  useEffect(() => {
    if (!configured.ready || !availability.available) {
      setDrill(null);
      return;
    }
    setDrill(startDeviationDrill({ ...DEFAULT_DEVIATION_CONFIG, rules, system, bet: rules.minBet }, freshSeed()));
  }, [configured.ready, availability.available, rules, system]);

  const answer = (action: DrillAction) =>
    setDrill((current) => (current ? submitDeviation(current, action, Date.now()) : current));

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
      <NotRecordedPanel reason="These hands are placed at a real shoe position rather than dealt from it, and a Session's Decision log claims every card it shows came off its shoe. Recording them would invent a dealing history the Shoe Integrity Panel could not verify (ADR-0004), so your score stays on this screen. A Session will need an index-play record of its own." />
    </>
  );

  const setup = (
    <Panel title="Setup">
      <TableLine rules={rules} />
      <SystemPicker
        value={system}
        onChange={setSystem}
        note={availability.indexSet ? `${availability.indexSet}` : "publishes no index set"}
      />
    </Panel>
  );

  const poolPanel = availability.indexSet ? (
    <Panel title={availability.indexSet}>
      <Text style={drillStyles.body}>
        <Text style={drillStyles.strong}>{availability.playable.length}</Text> of{" "}
        {availability.playable.length + availability.excluded.length} published indices apply at your
        table and are drilled.
        {availability.excluded.length > 0
          ? ` Your Rule Set takes ${availability.excluded.length} off the board:`
          : " None is taken off the board."}
      </Text>
      {availability.excluded.length > 0 ? (
        <>
          <View style={styles.toggle}>
            <SecondaryButton
              label={showExcluded ? "Hide the list" : `Show the ${availability.excluded.length} and why`}
              onPress={() => setShowExcluded((open) => !open)}
            />
          </View>
          {showExcluded
            ? availability.excluded.map(({ entry, reason }) => (
                <View key={entry.id} style={styles.excluded}>
                  <Text style={drillStyles.body}>
                    <Text style={drillStyles.strong}>{entry.label}</Text>{" "}
                    <Text style={drillStyles.mono}>index {signed(entry.index)}</Text>
                  </Text>
                  <Text style={drillStyles.note}>{EXCLUSION_REASON[reason]}</Text>
                </View>
              ))
            : null}
        </>
      ) : null}
      {availability.note ? <Text style={drillStyles.refusal}>{availability.note}</Text> : null}
    </Panel>
  ) : null;

  if (!availability.available) {
    return (
      <ScrollView style={drillStyles.scroll} contentContainerStyle={drillStyles.scrollContent}>
        <Screen width="wide">
          {header}
          <Panel title={availability.indexSet ? "Nothing to drill at this table" : `No indices for ${system.name}`}>
            <Badge label="DECLINED" tone="info" />
            <Text style={drillStyles.refusal}>{availability.note}</Text>
            <View style={drillStyles.actions}>
              {availability.indexSet === null
                ? availability.systemsWithIndexes.map((id) => {
                    const supported = getCountingSystem(id);
                    return (
                      <ActionButton
                        key={id}
                        label={`Drill ${supported.name} indices`}
                        tone="good"
                        onPress={() => setSystem(supported)}
                      />
                    );
                  })
                : null}
            </View>
          </Panel>
          {poolPanel}
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
  const report = deviationReport(drill);
  const count = question.count;
  const actions =
    question.kind === "hand"
      ? ACTION_ORDER.filter((action) =>
          legalActions({ hand: question.hand, rules: question.rules, handCount: 1, bankroll: DRILL_BANKROLL }).includes(action),
        )
      : [];

  const questionColumn = (
    <View style={twoColumn ? styles.columnWide : styles.columnNarrow}>
      <Panel title={`Question ${question.index + 1}`}>
        <View style={styles.hands}>
          {question.kind === "hand" ? (
            <View style={styles.seat}>
              <Text style={styles.seatLabel}>You</Text>
              <CardRow cards={question.hand.cards} />
            </View>
          ) : null}
          <View style={styles.seat}>
            <Text style={styles.seatLabel}>Dealer shows</Text>
            <CardRow cards={[question.dealerUpcard]} />
          </View>
        </View>
        <View style={styles.count}>
          <StatRow label={`Running count · ${count.systemName}`} value={formatCountValue(count.runningCount)} />
          <StatRow label="Left in the shoe" value={decksText(count.cardsRemaining)} />
          <StatRow
            label={`True count (${ROUNDING_NAME[count.rounding]})`}
            value={count.trueCount === null ? "—" : formatCountValue(count.trueCount)}
            tone="info"
          />
        </View>
      </Panel>

      {result ? null : question.kind === "insurance" ? (
        <Panel title={`Insurance against a dealer ${upcardName(11)}?`}>
          <View style={drillStyles.actions}>
            <ActionButton label="Take insurance" tone="info" onPress={() => answer("insurance")} />
            <ActionButton label="Decline insurance" onPress={() => answer("decline-insurance")} />
          </View>
        </Panel>
      ) : (
        <Panel title="Your play at this count">
          <View style={drillStyles.actions}>
            {actions.map((action) => (
              <ActionButton
                key={action}
                label={ACTION_LABEL[action]}
                tone={ACTION_TONE[action]}
                onPress={() => answer(action)}
              />
            ))}
          </View>
        </Panel>
      )}

      <UndoControl
        canUndo={canUndo(drill)}
        onUndo={() => setDrill((current) => (current ? undo(current) : current))}
        undone={drill.undone}
      />

      {result ? (
        <ExplanationPanel
          explanation={result.decision.explanation}
          verdict={result.decision}
          accessory={
            <View style={styles.accessory}>
              <Text style={drillStyles.note}>
                {question.entry.label}: index {signed(question.entry.index)}, count{" "}
                {signed(question.trueCount)} — {question.firing ? "the index has fired" : "the chart holds"}.
              </Text>
              <View style={drillStyles.actions}>
                <ActionButton
                  label="Next question"
                  tone="good"
                  onPress={() => setDrill((current) => (current ? nextDeviationQuestion(current) : current))}
                />
              </View>
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
        <StatRow
          label="When the index had fired"
          value={`${formatRate(report.departures.accuracy)} (${report.departures.correct} of ${report.departures.attempts})`}
        />
        <StatRow
          label="When the chart held"
          value={`${formatRate(report.holds.accuracy)} (${report.holds.correct} of ${report.holds.attempts})`}
        />
        <StatRow label="Missed departures" value={report.missedDepartures} tone={report.missedDepartures > 0 ? "warn" : "neutral"} />
        <StatRow label="Departed too early" value={report.earlyDepartures} tone={report.earlyDepartures > 0 ? "warn" : "neutral"} />
        {report.byEntry.length > 0 ? (
          <Section title="By index, weakest first">
            {report.byEntry.map((entry) => (
              <StatRow
                key={entry.entryId}
                label={`${entry.label} (${signed(entry.indexNumber)})`}
                value={`${formatRate(entry.accuracy)} (${entry.correct} of ${entry.attempts})`}
                tone={entry.correct < entry.attempts ? "warn" : "good"}
              />
            ))}
          </Section>
        ) : null}
      </Panel>
      {poolPanel}
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
  hands: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg, alignItems: "flex-end" },
  seat: { gap: spacing.xs },
  seatLabel: { ...type.caption, color: colors.textMuted },
  count: { gap: 2, marginTop: spacing.sm },
  accessory: { gap: spacing.sm },
  toggle: { alignSelf: "flex-start" },
  excluded: { gap: 2, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border },
});
