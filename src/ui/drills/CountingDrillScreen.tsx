/**
 * The Counting drill: cards off a real seeded shoe at a pace the user picks, the Running Count
 * kept in their head, checked whenever they like.
 *
 * - **The count is hidden by default**, because a count permanently on screen trains reading,
 *   not counting. Revealing it is one tap and is counted, because peeking is part of the record.
 * - **Checking pauses the deal and grades at once**, with the cards since the last check laid
 *   out under the verdict, each with its tag (invariants 2 and 3). The deal resumes only when
 *   the user says so.
 * - **The answer is typed on a signed keypad** — "−12" and "+14" are ordinary Running Counts,
 *   and a Wong Halves count really can be +7.5.
 * - **All six systems.** An unbalanced system's starting count and its reference numbers are
 *   shown, each labelled with what it is (#25).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { RANKS } from "@/engine/cards";
import { type CountingSystem, initialRunningCount } from "@/engine/counting";
import {
  COUNTING_SPEEDS,
  type CountingDrillState,
  DEFAULT_COUNTING_CONFIG,
  advanceTo,
  countedCards,
  countingDrillFinished,
  countingReadout,
  countingReport,
  dealNextStep,
  setSpeed,
  startCountingDrill,
  submitCountCheck,
  toggleCount,
  totalCards,
} from "@/drills/counting";
import { getDrill } from "@/drills/types";
import { ActionButton, Panel, Screen, SecondaryButton, SegmentedControl, StatRow } from "@/ui/primitives";
import { CardView } from "@/ui/table/CardView";
import { colors, spacing, type } from "@/ui/theme";
import { CountEntryPad } from "./CountEntryPad";
import {
  DrillHeader,
  PendingTablePanel,
  RecordingPanel,
  SystemPicker,
  TableLine,
  UndoControl,
  drillStyles,
} from "./DrillChrome";
import { CountCheckExplanationPanel } from "./DrillExplanations";
import { countingRecords, replaceRun, stepRun } from "./drillRecorder";
import { formatCountValue, formatRate } from "./drillFormat";
import { NONE_PUBLISHED, unbalancedCountRows } from "./unbalancedCount";
import { type RunConfig, useRecordedDrill } from "./useRecordedDrill";

const DRILL = getDrill("counting");
const TICK_MS = 50;
const TWO_COLUMN_WIDTH = 900;

function hasHalfTags(system: CountingSystem): boolean {
  return RANKS.some((rank) => !Number.isInteger(system.tags[rank]));
}

export function CountingDrillScreen() {
  const [cardsPerMinute, setCardsPerMinute] = useState(DEFAULT_COUNTING_CONFIG.cardsPerMinute);
  const [cardsPerStep, setCardsPerStep] = useState(DEFAULT_COUNTING_CONFIG.cardsPerStep);
  const paceRef = useRef({ cardsPerMinute, cardsPerStep });
  paceRef.current = { cardsPerMinute, cardsPerStep };

  const start = useCallback(
    (config: RunConfig) =>
      startCountingDrill(
        {
          ...DEFAULT_COUNTING_CONFIG,
          system: config.system,
          decks: config.rules.decks,
          penetration: config.rules.penetration,
          cardsPerMinute: paceRef.current.cardsPerMinute,
          cardsPerStep: paceRef.current.cardsPerStep,
        },
        config.seed,
      ),
    [],
  );

  const recorded = useRecordedDrill<CountingDrillState>({
    drillId: "counting",
    start,
    systemBindsSession: true,
    startingBankroll: 0,
  });
  const { run, config, update } = recorded;
  const { width } = useWindowDimensions();
  const twoColumn = width >= TWO_COLUMN_WIDTH;

  const [running, setRunning] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const clock = useRef<{ startedAt: number; baseMs: number } | null>(null);

  // The drill holds no clock (`src/drills/counting.ts`); this is the one that drives it.
  useEffect(() => {
    if (!running) {
      clock.current = null;
      return;
    }
    const timer = setInterval(() => {
      update((current) => {
        if (clock.current === null) {
          clock.current = { startedAt: Date.now(), baseMs: current.drill.current.elapsedMs };
        }
        const elapsed = clock.current.baseMs + (Date.now() - clock.current.startedAt);
        return replaceRun(current, advanceTo(current.drill, elapsed));
      });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [running, update]);

  const finished = run ? countingDrillFinished(run.drill.current) : false;
  useEffect(() => {
    if (finished) setRunning(false);
  }, [finished]);

  // A new run — a system change, a new table, a new shoe — starts paused.
  const runSeed = config?.seed;
  useEffect(() => {
    setRunning(false);
    setShowResult(false);
  }, [runSeed]);

  const check = useCallback(
    (value: number) => {
      setRunning(false);
      const at = Date.now();
      update((current) => {
        const before = current.drill.current;
        const next = submitCountCheck(current.drill, value, at);
        return stepRun(current, next, countingRecords(before, next.current));
      });
      setShowResult(true);
    },
    [update],
  );

  if (!run || !config) {
    return (
      <ScrollView style={drillStyles.scroll} contentContainerStyle={drillStyles.scrollContent}>
        <Screen width="wide">
          <DrillHeader drill={DRILL} />
          <Text style={drillStyles.loading}>Loading your table…</Text>
        </Screen>
      </ScrollView>
    );
  }

  const state = run.drill.current;
  const report = countingReport(run.drill);
  const readout = countingReadout(state);
  const seen = countedCards(state);
  const showing = seen.slice(Math.max(0, seen.length - state.config.cardsPerStep));
  const hidden = state.countHidden;
  const references = unbalancedCountRows(config.system, config.rules.decks);
  const result = showResult ? state.lastResult : null;
  const sessionChecks = recorded.session?.countChecks.length ?? 0;

  const dealColumn = (
    <View style={twoColumn ? styles.columnWide : styles.columnNarrow}>
      <Panel>
        <View style={styles.cardStage} accessibilityLiveRegion="polite">
          {showing.length === 0 ? (
            <Text style={drillStyles.note}>Press Start and keep the count in your head.</Text>
          ) : (
            showing.map((card, index) => <CardView key={`${seen.length}-${index}`} card={card} size="md" />)
          )}
        </View>
        <StatRow label="Cards seen" value={`${seen.length} of ${totalCards(state)} (cut card)`} />
        <View style={drillStyles.actions}>
          {finished ? (
            <ActionButton label="New shoe" tone="good" onPress={recorded.restart} />
          ) : running ? (
            <ActionButton label="Pause and check my count" tone="warn" onPress={() => setRunning(false)} />
          ) : (
            <>
              <ActionButton
                label={seen.length === 0 ? "Start" : "Resume"}
                tone="good"
                onPress={() => {
                  setShowResult(false);
                  setRunning(true);
                }}
              />
              <SecondaryButton
                label={`Deal ${state.config.cardsPerStep === 1 ? "one card" : "two cards"}`}
                onPress={() => {
                  setShowResult(false);
                  update((current) => replaceRun(current, dealNextStep(current.drill)));
                }}
              />
            </>
          )}
        </View>
        {finished ? (
          <Text style={drillStyles.note}>
            Cut card reached. Check your final count before you start a new shoe.
          </Text>
        ) : null}
      </Panel>

      {!running ? (
        <Panel>
          <CountEntryPad
            prompt={`Your ${config.system.name} Running Count after ${seen.length} cards`}
            submitLabel="Check"
            allowHalf={hasHalfTags(config.system)}
            onSubmit={check}
          />
        </Panel>
      ) : null}

      <UndoControl
        canUndo={recorded.canUndo}
        onUndo={() => {
          setRunning(false);
          setShowResult(true);
          recorded.undo();
        }}
        undone={run.drill.undone}
      />

      {result ? (
        <CountCheckExplanationPanel result={result} decks={config.rules.decks} />
      ) : null}
    </View>
  );

  const railColumn = (
    <View style={twoColumn ? styles.columnWide : styles.columnNarrow}>
      <Panel title="The count">
        <SegmentedControl
          options={[
            { value: "hidden", label: "Hide count" },
            { value: "shown", label: "Reveal count" },
          ]}
          value={hidden ? "hidden" : "shown"}
          onChange={(next) => {
            if ((next === "hidden") !== hidden) update((current) => replaceRun(current, toggleCount(current.drill)));
          }}
        />
        <StatRow
          label={`Running count · ${config.system.name}`}
          value={hidden ? "• • •" : formatCountValue(readout.runningCount)}
        />
        {readout.trueCount !== null ? (
          <StatRow label="True count" value={hidden ? "• • •" : formatCountValue(readout.trueCount)} />
        ) : null}
        {references.map((row) => (
          <StatRow
            key={row.kind}
            label={row.label}
            value={row.value === null ? NONE_PUBLISHED : formatCountValue(row.value)}
          />
        ))}
        {!config.system.balanced ? (
          <Text style={drillStyles.note}>
            {config.system.name} starts a {config.rules.decks}-deck shoe at{" "}
            {formatCountValue(initialRunningCount(config.system, config.rules.decks))}, not at zero.
            There is no True Count to convert to.
          </Text>
        ) : null}
        <Text style={drillStyles.note}>
          {hidden
            ? `Hidden. Revealed ${state.reveals} time${state.reveals === 1 ? "" : "s"} this shoe — peeks are part of the record.`
            : "Showing. Hide it again to test yourself."}
        </Text>
      </Panel>

      <Panel title="This run">
        <StatRow
          label="Checks correct"
          value={`${formatRate(report.tally.accuracy)} (${report.tally.correct} of ${report.tally.attempts})`}
        />
        <StatRow label="Streak" value={report.tally.streak} tone={report.tally.streak > 0 ? "good" : "neutral"} />
        <StatRow
          label="Average miss"
          value={report.meanAbsoluteError === null ? "—" : `${report.meanAbsoluteError.toFixed(1)} points`}
        />
        <StatRow
          label="Tendency"
          value={
            report.meanSignedError === null || report.meanSignedError === 0
              ? "—"
              : `${Math.abs(report.meanSignedError).toFixed(1)} ${report.meanSignedError > 0 ? "high" : "low"}`
          }
        />
        <StatRow label="Worst miss" value={report.worstError === null ? "—" : `${report.worstError} points`} />
      </Panel>

      <Panel title="Setup">
        <TableLine rules={config.rules} />
        <SystemPicker
          value={config.system}
          onChange={(system) => {
            setRunning(false);
            recorded.changeSystem(system);
          }}
          note={
            recorded.session
              ? `recording to a ${config.system.name} Session (${sessionChecks} checks). A check does not name its system, so picking another ends that Session — its checks are kept — and deals a new shoe.`
              : "changing it deals a new shoe."
          }
        />
        <Text style={styles.label}>Speed</Text>
        <SegmentedControl
          options={COUNTING_SPEEDS.map((speed) => ({
            value: String(speed.cardsPerMinute),
            label: `${speed.name} · ${speed.cardsPerMinute}/min`,
          }))}
          value={String(state.config.cardsPerMinute)}
          onChange={(value) => {
            const next = Number(value);
            setCardsPerMinute(next);
            // Rebase the clock so the new pace runs from now, not from the start of the shoe.
            clock.current = null;
            update((current) => replaceRun(current, setSpeed(current.drill, next)));
          }}
        />
        <Text style={styles.label}>Cards at a time</Text>
        <SegmentedControl
          options={[
            { value: "1", label: "One" },
            { value: "2", label: "Two" },
          ]}
          value={String(cardsPerStep)}
          onChange={(value) => {
            const next = Number(value);
            if (next === cardsPerStep) return;
            setCardsPerStep(next);
            paceRef.current = { cardsPerMinute, cardsPerStep: next };
            recorded.restart();
          }}
        />
        <Text style={drillStyles.note}>
          A busy table deals around 90–120 cards a minute. Changing cards-at-a-time deals a new shoe;
          your Session carries on.
        </Text>
      </Panel>
    </View>
  );

  return (
    <ScrollView
      style={drillStyles.scroll}
      contentContainerStyle={drillStyles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <Screen width="wide">
        <DrillHeader drill={DRILL} />
        <RecordingPanel
          session={recorded.session}
          ended={recorded.ended}
          unit="count checks"
          error={recorded.storageError}
          onEnd={() => {
            setRunning(false);
            recorded.endSession();
          }}
        />
        {recorded.pendingRules ? (
          <PendingTablePanel current={config.rules} pending={recorded.pendingRules} onTakeUp={recorded.takeUpRules} />
        ) : null}
        <View style={twoColumn ? styles.wide : styles.narrow}>
          {dealColumn}
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
  cardStage: {
    minHeight: 80,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
  },
  label: {
    ...type.caption,
    color: colors.textMuted,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: spacing.sm,
  },
});
