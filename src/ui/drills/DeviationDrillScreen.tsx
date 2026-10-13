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
 *
 * Every answer is also recorded into the drill's Session as an **index play** (#27), never as a
 * Decision. These hands are placed at a real shoe position rather than dealt from it, and a
 * Decision claims every card it shows came off its shoe — a claim `verifyReplay` checks. The
 * index play records what is true instead: the cards as placed, and the run seed, question index,
 * shoe seed and cut position that reproduce the question (ADR-0004).
 */

import { memo, useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import {
  type CountingSystem,
  type RuleSet,
  getCountingSystem,
  getIndexSet,
  signed,
} from "@/engine";
import { type Action, legalActions } from "@/engine/hand";
import {
  DEFAULT_DEVIATION_CONFIG,
  type DeviationDrill,
  type DeviationDrillAvailability,
  type DeviationDrillState,
  deviationDrillAvailability,
  deviationReport,
  nextDeviationQuestion,
  startDeviationDrill,
  submitDeviation,
} from "@/drills/deviation";
import type { DrillAction } from "@/drills/explanation";
import { getDrill } from "@/drills/types";
import { ExplanationPanel } from "@/ui/explanation/ExplanationPanel";
import { colors, display, surfaces, ui, Panel } from "@/ui/ds";
import { CardFan, Felt, FeltLabel } from "@/ui/trainer/Felt";
import {
  ActionButton,
  SecondaryButton,
  StatCards,
  StatRow,
  ToneBadge,
  TrainerPage,
  type Tone,
} from "@/ui/trainer/kit";
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
import { deviationRecords, replaceRun, stepRun } from "./drillRecorder";
import {
  EXCLUSION_REASON,
  ROUNDING_NAME,
  decksText,
  formatCountValue,
  formatRate,
  upcardName,
} from "./drillFormat";
import { type RunConfig, useRecordedDrill } from "./useRecordedDrill";

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

const TABLE_REASON =
  "This drill's Session records one table for its whole length, and every index play in it was graded against that table's chart. Drilling another table inside it would leave the Session naming rules some of its answers were never graded under.";

function start(config: RunConfig) {
  if (!deviationDrillAvailability(config.rules, config.system).available) return null;
  return startDeviationDrill(
    {
      ...DEFAULT_DEVIATION_CONFIG,
      rules: config.rules,
      system: config.system,
      bet: config.rules.minBet,
    },
    config.seed,
  );
}

/**
 * The screen can re-render more often than the drill changes. Profiling a production web build
 * (#28) found saving an answer re-rendering it twice more with the same run, each render costing
 * as much as the one that shows the Explanation. That came from the drill Session store, which
 * screens now read by slice so a save no longer renders them (#29). The two columns stay
 * memoised on the run and on stable callbacks all the same: a render that changes nothing they
 * show — the recording panel, a pending table — leaves them alone.
 */
export function DeviationDrillScreen() {
  const recorded = useRecordedDrill<DeviationDrillState>({
    drillId: "deviation",
    start,
    // An index play names its own system, so a Session carries on across a switch.
    systemBindsSession: false,
    startingBankroll: 0,
  });
  const { run, config, update, changeSystem, undo } = recorded;
  /** A system the user picked that publishes no indices. Shown, never recorded. */
  const [declined, setDeclined] = useState<CountingSystem | null>(null);
  const [showExcluded, setShowExcluded] = useState(true);
  const { width } = useWindowDimensions();
  const twoColumn = width >= TWO_COLUMN_WIDTH;

  const pickSystem = useCallback(
    (system: CountingSystem) => {
      if (getIndexSet(system) === undefined) {
        setDeclined(system);
        return;
      }
      setDeclined(null);
      changeSystem(system);
    },
    [changeSystem],
  );

  const answer = useCallback(
    (action: DrillAction) => {
      const at = Date.now();
      update((current) => {
        const before = current.drill.current;
        // A second submission is a no-op in the drill; it must not become an undo point either.
        if (before.lastResult !== null) return current;
        const next = submitDeviation(current.drill, action, at);
        return stepRun(current, next, deviationRecords(before, next.current));
      });
    },
    [update],
  );

  const nextQuestion = useCallback(
    () => update((current) => replaceRun(current, nextDeviationQuestion(current.drill))),
    [update],
  );
  const toggleExcluded = useCallback(() => setShowExcluded((open) => !open), []);

  const rules = config?.rules ?? null;
  const system = config ? (declined ?? config.system) : null;
  const availability = useMemo(
    () => (rules && system ? deviationDrillAvailability(rules, system) : null),
    [rules, system],
  );

  if (!config || !rules || !system || !availability) {
    return (
      <TrainerPage>
        <DrillHeader drill={DRILL} />
        <Text style={drillStyles.loading}>Loading your table…</Text>
      </TrainerPage>
    );
  }

  const header = (
    <>
      <DrillHeader
        drill={DRILL}
        report={{
          countingSystem: system.name,
          rules,
          details: run
            ? { runSeed: run.drill.current.seed, questionIndex: run.drill.current.question.index }
            : {},
        }}
      />
      <RecordingPanel
        session={recorded.session}
        ended={recorded.ended}
        unit="index plays"
        error={recorded.storageError}
        onEnd={recorded.endSession}
      />
      {recorded.pendingRules ? (
        <PendingTablePanel
          current={rules}
          pending={recorded.pendingRules}
          onTakeUp={recorded.takeUpRules}
          reason={TABLE_REASON}
        />
      ) : null}
    </>
  );

  if (declined || !run || !availability.available) {
    return (
      <TrainerPage>
        {header}
        <Panel
          title={
            availability.indexSet
              ? "Nothing to drill at this table"
              : `No indices for ${system.name}`
          }
        >
          <ToneBadge label="Declined" tone="info" />
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
                      onPress={() => pickSystem(supported)}
                    />
                  );
                })
              : null}
          </View>
        </Panel>
        {availability.indexSet ? (
          <PoolPanel
            availability={availability}
            showExcluded={showExcluded}
            onToggle={toggleExcluded}
          />
        ) : null}
        <SetupPanel
          rules={rules}
          system={system}
          availability={availability}
          onPickSystem={pickSystem}
        />
      </TrainerPage>
    );
  }

  return (
    <TrainerPage>
      {header}
      <View style={twoColumn ? styles.wide : styles.narrow}>
        <QuestionColumn
          drill={run.drill}
          twoColumn={twoColumn}
          canUndo={recorded.canUndo}
          onUndo={undo}
          onAnswer={answer}
          onNext={nextQuestion}
        />
        <RailColumn
          drill={run.drill}
          twoColumn={twoColumn}
          rules={rules}
          system={system}
          availability={availability}
          showExcluded={showExcluded}
          onToggleExcluded={toggleExcluded}
          onPickSystem={pickSystem}
        />
      </View>
    </TrainerPage>
  );
}

/** The question on the table, its answer buttons, undo, and — once answered — the Explanation. */
const QuestionColumn = memo(function QuestionColumn({
  drill,
  twoColumn,
  canUndo,
  onUndo,
  onAnswer,
  onNext,
}: {
  drill: DeviationDrill;
  twoColumn: boolean;
  canUndo: boolean;
  onUndo: () => void;
  onAnswer: (action: DrillAction) => void;
  onNext: () => void;
}) {
  const state = drill.current;
  const question = state.question;
  const result = state.lastResult;
  const count = question.count;
  const actions =
    question.kind === "hand"
      ? ACTION_ORDER.filter((action) =>
          legalActions({
            hand: question.hand,
            rules: question.rules,
            handCount: 1,
            bankroll: DRILL_BANKROLL,
          }).includes(action),
        )
      : [];

  return (
    <View style={twoColumn ? styles.columnWide : styles.columnNarrow}>
      <Felt>
        <Text accessibilityRole="header" style={styles.questionTitle}>
          {`Question ${question.index + 1}`}
        </Text>
        <View style={styles.hands}>
          {question.kind === "hand" ? (
            <View style={styles.seat}>
              <FeltLabel>You</FeltLabel>
              <CardFan cards={question.hand.cards} size="lg" />
            </View>
          ) : null}
          <View style={styles.seat}>
            <FeltLabel>Dealer shows</FeltLabel>
            <CardFan cards={[question.dealerUpcard]} size="lg" />
          </View>
        </View>
        <View style={styles.count}>
          <CountFigure
            label={`Running count · ${count.systemName}`}
            value={formatCountValue(count.runningCount)}
          />
          <CountFigure label="Left in the shoe" value={decksText(count.cardsRemaining)} />
          <CountFigure
            label={`True count (${ROUNDING_NAME[count.rounding]})`}
            value={count.trueCount === null ? "—" : formatCountValue(count.trueCount)}
            accent
          />
        </View>
      </Felt>

      {result ? null : question.kind === "insurance" ? (
        <Panel title={`Insurance against a dealer ${upcardName(11)}?`}>
          <View style={drillStyles.actions}>
            <ActionButton
              label="Take insurance"
              tone="info"
              onPress={() => onAnswer("insurance")}
            />
            <ActionButton label="Decline insurance" onPress={() => onAnswer("decline-insurance")} />
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
                onPress={() => onAnswer(action)}
              />
            ))}
          </View>
        </Panel>
      )}

      <UndoControl canUndo={canUndo} onUndo={onUndo} undone={drill.undone} />

      {result ? (
        <ExplanationPanel
          explanation={result.decision.explanation}
          verdict={result.decision}
          accessory={
            <View style={styles.accessory}>
              <Text style={drillStyles.note}>
                {question.entry.label}: index {signed(question.entry.index)}, count{" "}
                {signed(question.trueCount)} —{" "}
                {question.firing ? "the index has fired" : "the chart holds"}.
              </Text>
              <View style={drillStyles.actions}>
                <ActionButton label="Next question" tone="good" onPress={onNext} />
              </View>
            </View>
          }
        />
      ) : null}
    </View>
  );
});

/** This run's tallies, the index pool at this table, and the setup. */
const RailColumn = memo(function RailColumn({
  drill,
  twoColumn,
  rules,
  system,
  availability,
  showExcluded,
  onToggleExcluded,
  onPickSystem,
}: {
  drill: DeviationDrill;
  twoColumn: boolean;
  rules: RuleSet;
  system: CountingSystem;
  availability: DeviationDrillAvailability;
  showExcluded: boolean;
  onToggleExcluded: () => void;
  onPickSystem: (system: CountingSystem) => void;
}) {
  const report = deviationReport(drill);

  return (
    <View style={twoColumn ? styles.columnWide : styles.columnNarrow}>
      <StatCards
        cards={[
          {
            label: "Correct",
            value: formatRate(report.tally.accuracy),
            delta: `${report.tally.correct} of ${report.tally.attempts} index plays`,
          },
          {
            label: "Streak",
            value: String(report.tally.streak),
            delta: report.tally.streak > 0 ? "in a row" : "answer to start one",
            tone: report.tally.streak > 0 ? "good" : "neutral",
          },
        ]}
      />
      <Panel title="This run">
        <StatRow
          label="When the index had fired"
          value={`${formatRate(report.departures.accuracy)} (${report.departures.correct} of ${report.departures.attempts})`}
        />
        <StatRow
          label="When the chart held"
          value={`${formatRate(report.holds.accuracy)} (${report.holds.correct} of ${report.holds.attempts})`}
        />
        <StatRow
          label="Missed departures"
          value={report.missedDepartures}
          tone={report.missedDepartures > 0 ? "warn" : "neutral"}
        />
        <StatRow
          label="Departed too early"
          value={report.earlyDepartures}
          tone={report.earlyDepartures > 0 ? "warn" : "neutral"}
        />
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
      {availability.indexSet ? (
        <PoolPanel
          availability={availability}
          showExcluded={showExcluded}
          onToggle={onToggleExcluded}
        />
      ) : null}
      <SetupPanel
        rules={rules}
        system={system}
        availability={availability}
        onPickSystem={onPickSystem}
      />
    </View>
  );
});

function SetupPanel({
  rules,
  system,
  availability,
  onPickSystem,
}: {
  rules: RuleSet;
  system: CountingSystem;
  availability: DeviationDrillAvailability;
  onPickSystem: (system: CountingSystem) => void;
}) {
  return (
    <Panel title="Setup">
      <TableLine rules={rules} />
      <SystemPicker
        value={system}
        onChange={onPickSystem}
        note={availability.indexSet ? `${availability.indexSet}` : "publishes no index set"}
      />
    </Panel>
  );
}

/** The published set at this table: how many indices are drilled, and the ones taken off the board. */
function PoolPanel({
  availability,
  showExcluded,
  onToggle,
}: {
  availability: DeviationDrillAvailability;
  showExcluded: boolean;
  onToggle: () => void;
}) {
  return (
    <Panel title={availability.indexSet ?? undefined}>
      <Text style={drillStyles.body}>
        <Text style={drillStyles.strong}>{availability.playable.length}</Text> of{" "}
        {availability.playable.length + availability.excluded.length} published indices apply at
        your table and are drilled.
        {availability.excluded.length > 0
          ? ` Your Rule Set takes ${availability.excluded.length} off the board:`
          : " None is taken off the board."}
      </Text>
      {availability.excluded.length > 0 ? (
        <>
          <View style={styles.toggle}>
            <SecondaryButton
              label={
                showExcluded ? "Hide the list" : `Show the ${availability.excluded.length} and why`
              }
              onPress={onToggle}
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
  );
}

/** One of the three numbers the question is posed at, large on the felt. */
function CountFigure({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.figure} accessible accessibilityLabel={`${label}: ${value}`}>
      <FeltLabel>{label}</FeltLabel>
      <Text style={[styles.figureValue, accent && styles.figureAccent]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  narrow: { flexDirection: "column", gap: 24 },
  wide: { flexDirection: "row", gap: 24, alignItems: "flex-start" },
  columnWide: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, gap: 24 },
  columnNarrow: { width: "100%", gap: 24 },
  questionTitle: { ...ui(17, 600), color: colors.feltText },
  hands: { flexDirection: "row", flexWrap: "wrap", gap: 32, alignItems: "flex-end" },
  seat: { gap: 8 },
  count: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 28,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: surfaces.betSpot,
  },
  figure: { gap: 4 },
  figureValue: { ...display(28, 500), fontVariant: ["tabular-nums"], color: colors.feltText },
  figureAccent: { color: colors.primary },
  accessory: { gap: 12 },
  toggle: { alignSelf: "flex-start" },
  excluded: { gap: 2, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
});
