/**
 * The Basic Strategy drill: real hands off a real seeded shoe, every decision graded against
 * the chart for the configured Rule Set.
 *
 * The order of things on this screen is the drill's argument:
 *
 * 1. **The hand, and exactly its legal actions** (invariant 7). Nothing greyed out; the drill
 *    tops the bankroll up before every hand so a short stack never removes a chart cell.
 * 2. **The Explanation, directly under the buttons, the instant the tap lands** — graded before
 *    the round moves, and kept on screen through a split, a bust and the settlement
 *    (invariants 2 and 3). A correct play is explained as fully as a wrong one.
 * 3. **The breakdown in words.** "You are fine everywhere except soft 18" is what a user can go
 *    and practise; the percentage is shown, but beside that sentence, not instead of it.
 */

import { useCallback, useMemo } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import type { Action } from "@/engine/hand";
import { isRoundOver, visibleDealerCards } from "@/engine/round";
import {
  type BasicStrategyDrillState,
  DEFAULT_BASIC_STRATEGY_CONFIG,
  awaitingDecision,
  awaitingInsurance,
  basicStrategyReport,
  betweenRounds,
  currentActions,
  dealNextHand,
  startBasicStrategyDrill,
  submitDecision,
  submitInsurance,
} from "@/drills/basicStrategy";
import { getDrill } from "@/drills/types";
import { ExplanationPanel } from "@/ui/explanation/ExplanationPanel";
import { colors, surfaces, ui, Panel } from "@/ui/ds";
import { DealerHand, Felt, PlayerHand } from "@/ui/trainer/Felt";
import { ActionButton, StatCards, StatRow, TrainerPage, text, type Tone } from "@/ui/trainer/kit";
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
import { basicStrategyRecords, dealtRoundRecords, replaceRun, stepRun } from "./drillRecorder";
import { breakdownSentence, cellMistakeLine, formatRate } from "./drillFormat";
import { type RunConfig, useRecordedDrill } from "./useRecordedDrill";

const DRILL = getDrill("basic-strategy");
const TWO_COLUMN_WIDTH = 900;

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

function start(config: RunConfig) {
  return startBasicStrategyDrill(
    {
      ...DEFAULT_BASIC_STRATEGY_CONFIG,
      rules: config.rules,
      system: config.system,
      bet: config.rules.minBet,
    },
    config.seed,
  );
}

export function BasicStrategyDrillScreen() {
  const recorded = useRecordedDrill<BasicStrategyDrillState>({
    drillId: "basic-strategy",
    start,
    systemBindsSession: false,
    startingBankroll: DEFAULT_BASIC_STRATEGY_CONFIG.bankroll,
  });
  const { run, config, update } = recorded;
  const { width } = useWindowDimensions();
  const twoColumn = width >= TWO_COLUMN_WIDTH;
  const cardSize = width < 420 ? "sm" : width >= TWO_COLUMN_WIDTH ? "lg" : "md";

  const report = useMemo(() => (run ? basicStrategyReport(run.drill) : null), [run]);

  const deal = useCallback(() => {
    const at = Date.now();
    update((current) => {
      if (!betweenRounds(current.drill.current)) return current;
      const next = dealNextHand(current.drill);
      return replaceRun(current, next, dealtRoundRecords(next.current, at));
    });
  }, [update]);

  const act = useCallback(
    (action: Action) => {
      const at = Date.now();
      update((current) => {
        const before = current.drill.current;
        if (!awaitingDecision(before) || !currentActions(before).includes(action)) return current;
        // Graded first, applied second, inside `submitDecision` — the Explanation describes the
        // hand the user was looking at when they tapped.
        const next = submitDecision(current.drill, action, at);
        return stepRun(current, next, basicStrategyRecords(before, next.current));
      });
    },
    [update],
  );

  const insure = useCallback(
    (take: boolean) => {
      const at = Date.now();
      update((current) => {
        const before = current.drill.current;
        if (!awaitingInsurance(before)) return current;
        const next = submitInsurance(current.drill, take, at);
        return stepRun(current, next, basicStrategyRecords(before, next.current));
      });
    },
    [update],
  );

  if (!run || !config || !report) {
    return (
      <TrainerPage>
        <DrillHeader drill={DRILL} />
        <Text style={drillStyles.loading}>Loading your table…</Text>
      </TrainerPage>
    );
  }

  const state = run.drill.current;
  const round = state.round;
  const result = state.lastResult;

  const tableColumn = (
    <View style={twoColumn ? styles.columnWide : styles.columnNarrow}>
      <Felt>
        <DealerHand
          cards={round ? visibleDealerCards(round) : []}
          revealed={round?.dealerHoleCardRevealed ?? true}
          size={cardSize}
        />
        <View style={styles.divider} />
        {round ? (
          <View style={styles.hands}>
            {round.playerHands.map((hand, index) => (
              <PlayerHand
                key={index}
                hand={hand}
                index={index}
                handCount={round.playerHands.length}
                active={round.phase === "player" && index === round.activeHandIndex}
                outcome={round.settlement?.outcomes[index] ?? null}
                size={cardSize}
              />
            ))}
          </View>
        ) : (
          <Text style={styles.feltNote}>
            Deal a hand to start. Every decision you make is graded.
          </Text>
        )}
      </Felt>

      {awaitingInsurance(state) ? (
        <Panel title="Insurance?">
          <Text style={drillStyles.note}>
            The dealer shows an ace. Basic Strategy grades this too — and says why either way.
          </Text>
          <View style={drillStyles.actions}>
            <ActionButton label="Take insurance" tone="info" onPress={() => insure(true)} />
            <ActionButton label="No insurance" onPress={() => insure(false)} />
          </View>
        </Panel>
      ) : awaitingDecision(state) && round ? (
        <Panel
          title={
            round.playerHands.length > 1
              ? `Hand ${round.activeHandIndex + 1} of ${round.playerHands.length} — your play`
              : "Your play"
          }
        >
          <View style={drillStyles.actions}>
            {ACTION_ORDER.filter((action) => currentActions(state).includes(action)).map(
              (action) => (
                <ActionButton
                  key={action}
                  label={ACTION_LABEL[action]}
                  tone={ACTION_TONE[action]}
                  onPress={() => act(action)}
                />
              ),
            )}
          </View>
        </Panel>
      ) : (
        <Panel title={round && isRoundOver(round) ? "Hand over" : "Ready"}>
          {round?.settlement ? (
            <Text style={drillStyles.note}>
              The cards and the Explanation stay put until you deal again. Chips are topped up
              before every hand, so no chart cell is ever taken off the table.
            </Text>
          ) : null}
          <View style={drillStyles.actions}>
            <ActionButton
              label={round ? "Deal next hand" : "Deal"}
              tone="good"
              accessibilityHint="Deal a new hand from the shoe."
              onPress={deal}
            />
          </View>
        </Panel>
      )}

      <UndoControl canUndo={recorded.canUndo} onUndo={recorded.undo} undone={run.drill.undone} />

      {result ? (
        <ExplanationPanel
          explanation={result.explanation}
          verdict={result}
          title={result.verdict === "correct" ? "Correct — why" : "Why"}
        />
      ) : null}
    </View>
  );

  const railColumn = (
    <View style={twoColumn ? styles.columnWide : styles.columnNarrow}>
      <StatCards
        cards={[
          {
            label: "Accuracy",
            value: formatRate(report.tally.accuracy),
            delta: `${report.tally.correct} of ${report.tally.attempts} decisions`,
          },
          {
            label: "Streak",
            value: String(report.tally.streak),
            delta: `best ${report.tally.bestStreak}`,
            tone: report.tally.streak > 0 ? "good" : "neutral",
          },
        ]}
      />
      <Panel title="Where you stand">
        <Text style={text.lead}>{breakdownSentence(report)}</Text>
        <StatRow label="Hands dealt" value={report.roundsDealt} />
        {report.insuranceTally.attempts > 0 ? (
          <StatRow
            label="Insurance calls"
            value={`${formatRate(report.insuranceTally.accuracy)} (${report.insuranceTally.correct} of ${report.insuranceTally.attempts})`}
          />
        ) : null}

        {report.weakestCells.length > 0 ? (
          <Section title="Cells to practise">
            {report.weakestCells.map((cell) => (
              <Text key={cell.id} style={drillStyles.body}>
                • {cellMistakeLine(cell)}
              </Text>
            ))}
          </Section>
        ) : null}

        {report.breakdown.sections.length > 0 ? (
          <Section title="By section">
            {report.breakdown.sections.map((section) => (
              <StatRow
                key={section.section}
                label={
                  section.section === "pairs"
                    ? "Pairs"
                    : section.section === "soft"
                      ? "Soft totals"
                      : "Hard totals"
                }
                value={`${formatRate(section.accuracy)} (${section.correct} of ${section.attempts})`}
                tone={section.missed > 0 ? "warn" : "good"}
              />
            ))}
          </Section>
        ) : null}
      </Panel>

      <Panel title="Setup">
        <TableLine rules={config.rules} />
        <SystemPicker
          value={config.system}
          onChange={recorded.changeSystem}
          note="the count each Explanation shows; the grading is the chart either way. Changing it deals a fresh shoe."
        />
      </Panel>
    </View>
  );

  return (
    <TrainerPage>
      <DrillHeader
        drill={DRILL}
        report={{
          table: {
            shoe: state.shoe,
            round: state.round,
            bankroll: state.config.bankroll,
            shoeIndex: state.shoeIndex,
          },
          rules: state.config.rules,
          countingSystem: state.config.system.name,
          details: { runSeed: state.seed, roundsDealt: state.roundsDealt },
        }}
      />
      <RecordingPanel
        session={recorded.session}
        ended={recorded.ended}
        unit="decisions"
        error={recorded.storageError}
        onEnd={recorded.endSession}
      />
      {recorded.pendingRules ? (
        <PendingTablePanel
          current={config.rules}
          pending={recorded.pendingRules}
          onTakeUp={recorded.takeUpRules}
        />
      ) : null}
      <View style={twoColumn ? styles.wide : styles.narrow}>
        {tableColumn}
        {railColumn}
      </View>
    </TrainerPage>
  );
}

const styles = StyleSheet.create({
  narrow: { flexDirection: "column", gap: 24 },
  wide: { flexDirection: "row", gap: 24, alignItems: "flex-start" },
  columnWide: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, gap: 24 },
  columnNarrow: { width: "100%", gap: 24 },
  divider: { height: 1, backgroundColor: colors.feltLine, opacity: 0.4 },
  hands: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  feltNote: { ...ui(14), color: surfaces.feltTextMuted },
});
