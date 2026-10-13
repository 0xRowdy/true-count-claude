/**
 * Everything the Tableside felt keeps off the cloth, one tap away (the Top Bar's book icon and
 * the SHOE on the felt): the why behind every Decision this hand with its chart cell, the
 * Running and True Count with the counting system and the shoe, and the table itself — the
 * Rule Set being dealt, a configured table waiting to be taken up, the Session and its
 * statistics, and Report a bug (invariant 10).
 *
 * Opening the sheet never moves the hand on and never hides it for good: the cards stay on
 * the felt under the sheet, and closing it puts the player back where they were (invariant 3).
 */

import { Link } from "expo-router";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { CountingSystemId } from "@/engine/counting";
import { type RuleSet, describeRules } from "@/engine/rules";
import { isCutCardReached } from "@/engine/shoe";
import { ReportBugButton } from "@/ui/bug-report/ReportBugButton";
import { Button, Tabs, icons } from "@/ui/ds";
import { colors, ui } from "@/ui/ds/tokens";
import { Badge, Panel, SecondaryButton, StatRow, ActionButton } from "@/ui/primitives";
import { matchingPreset } from "@/ui/rules/presets";
import {
  SessionControlBar,
  SessionEndedPanel,
  SessionStatsPanel,
} from "@/ui/session/SessionPanels";
import type { PlaySession } from "@/ui/session/usePlaySession";
import { CountPanel, type CountVisibility, SystemPanel } from "./CountPanel";
import { DecisionFeedback } from "./DecisionFeedback";
import { felt } from "./feltTokens";
import { formatChips, formatNet } from "./format";
import type { TableDecision } from "./tableExplanation";
import {
  type PlayTable,
  type RulesHold,
  amountAtRisk,
  availableBankroll,
  countReadout,
  currentShoe,
} from "./usePlayTable";

export type SheetTab = "why" | "count" | "table";

const TABS = [
  { value: "why" as const, label: "Why" },
  { value: "count" as const, label: "Count & shoe" },
  { value: "table" as const, label: "Table" },
];

export function TableSheet({
  tab,
  onChangeTab,
  onClose,
  table,
  play,
  decisions,
  focus,
  roundOver,
  explanationOpen,
  onChangeExplanationOpen,
  visibility,
  onChangeVisibility,
  onShuffle,
  onStartNew,
}: {
  /** The open tab, or null when the sheet is closed. */
  tab: SheetTab | null;
  onChangeTab: (tab: SheetTab) => void;
  onClose: () => void;
  table: PlayTable;
  play: PlaySession;
  decisions: readonly TableDecision[];
  /** The Decision to open on, from the Result's review list. */
  focus: number | undefined;
  roundOver: boolean;
  explanationOpen: boolean;
  onChangeExplanationOpen: (open: boolean) => void;
  visibility: CountVisibility;
  onChangeVisibility: (visibility: CountVisibility) => void;
  onShuffle: () => void;
  onStartNew: () => void;
}) {
  return (
    <Modal visible={tab !== null} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Dismiss the panel"
          onPress={onClose}
        />
        <View style={styles.sheet} role="dialog" aria-modal accessibilityLabel="Table panel">
          <View style={styles.header}>
            <Tabs
              options={TABS}
              value={tab ?? "why"}
              onChange={onChangeTab}
              accessibilityLabel="Table panel"
            />
            <Button
              label="Close"
              variant="ghost"
              size="sm"
              icon={icons.X}
              onPress={onClose}
              accessibilityLabel="Close"
            />
          </View>
          <ScrollView contentContainerStyle={styles.body}>
            {tab === "why" ? (
              decisions.length > 0 ? (
                <DecisionFeedback
                  key={`${decisions.length}:${focus ?? "latest"}`}
                  decisions={decisions}
                  focus={focus}
                  roundOver={roundOver}
                  expanded={explanationOpen}
                  onChangeExpanded={onChangeExplanationOpen}
                />
              ) : (
                <Text style={[ui(14, 400, { lineHeight: 20 }), styles.muted]}>
                  No decisions yet this hand. Every play you make is graded here the moment you make
                  it — the EV of each option, the chart cell behind it, and what the count did to
                  it.
                </Text>
              )
            ) : null}

            {tab === "count" ? (
              <>
                <CountPanel
                  readout={countReadout(table)}
                  systemName={table.system.name}
                  visibility={visibility}
                  onChangeVisibility={onChangeVisibility}
                />
                <SystemPanel
                  table={table}
                  onChange={(id: CountingSystemId) => play.setSystem(id)}
                />
                <ShoePanel table={table} onShuffle={onShuffle} />
              </>
            ) : null}

            {tab === "table" ? (
              <>
                <View style={styles.report}>
                  <ReportBugButton
                    screen="Play table"
                    table={{
                      shoe: table.shoe,
                      round: table.round,
                      bankroll: table.bankroll,
                      shoeIndex: table.shoeIndex,
                    }}
                    rules={table.rules}
                    countingSystem={table.system.name}
                  />
                </View>
                {play.pendingRules ? (
                  <PendingTablePanel
                    current={table.rules}
                    pending={play.pendingRules}
                    hold={play.rulesHold}
                    onSwitch={play.switchTable}
                  />
                ) : null}
                <TablePanel rules={table.rules} />
                <SessionControlBar
                  session={play.session}
                  recording={play.recording}
                  error={play.error}
                  onEnd={() => play.end()}
                  onStartNew={onStartNew}
                >
                  <Link href="/session" style={styles.link}>
                    Statistics →
                  </Link>
                </SessionControlBar>
                {play.ended ? (
                  <SessionEndedPanel
                    session={play.ended}
                    stats={play.stats}
                    onStartNew={onStartNew}
                  />
                ) : null}
                <BankrollPanel table={table} />
                <SessionStatsPanel session={play.session} stats={play.stats} />
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// --- The table being dealt -------------------------------------------------------------------

/**
 * Which game this is, named on the surface that deals it (#19). The preset name is added when
 * the Rule Set is one of the real games.
 */
function TablePanel({ rules }: { rules: RuleSet }) {
  const preset = matchingPreset(rules);
  return (
    <Panel title="Table">
      {preset ? <Text style={styles.tableName}>{preset.name}</Text> : null}
      <Text style={styles.tableRules}>Dealing {describeRules(rules)}</Text>
      <Link href="/rules" style={styles.link}>
        Change your table →
      </Link>
    </Panel>
  );
}

const HOLD_REASON: Record<RulesHold, string> = {
  round:
    "The hand on the table was dealt under your current game and will be settled under it — a payout rule that changed mid-hand would pay the wrong money. Finish the hand.",
  session:
    "A Session records one table for its whole length, and its Shoes are rebuilt from that record to prove the count. Playing a second game inside it would make the hands you have already played replay as cards that were never dealt.",
  shoe: "Cards are already off this shoe. Changing the deck count or the penetration under it would move the True Count's divisor mid-count and leave the zero-sum check unable to reconcile (ADR-0004).",
};

const HOLD_ACTION: Record<RulesHold, string | null> = {
  round: null,
  session: "End this session and deal the new table",
  shoe: "Shuffle to the new table",
};

/**
 * The deferred rules change, said out loud: the pending table is named, the reason it is
 * waiting is given in full, and the way through it is one tap (invariant 6).
 */
function PendingTablePanel({
  current,
  pending,
  hold,
  onSwitch,
}: {
  current: RuleSet;
  pending: RuleSet;
  hold: RulesHold | null;
  onSwitch: () => void;
}) {
  const preset = matchingPreset(pending);
  const action = hold === null ? null : HOLD_ACTION[hold];
  return (
    <Panel>
      <Badge label="NEW TABLE WAITING" tone="warn" />
      <StatRow label="Dealing now" value={describeRules(current)} />
      <StatRow
        label={preset ? `Configured — ${preset.name}` : "Configured"}
        value={describeRules(pending)}
        tone="info"
      />
      <Text style={styles.note}>{hold === null ? "Taking effect now." : HOLD_REASON[hold]}</Text>
      {action ? (
        <View style={styles.actions}>
          <ActionButton
            label={action}
            tone="info"
            accessibilityHint="Switch to the table you configured on the Rule Set screen."
            onPress={onSwitch}
          />
        </View>
      ) : null}
    </Panel>
  );
}

function BankrollPanel({ table }: { table: PlayTable }) {
  const atRisk = amountAtRisk(table);
  return (
    <Panel title="Bankroll">
      <StatRow label="Available" value={formatChips(availableBankroll(table))} />
      {atRisk > 0 ? <StatRow label="On the felt" value={formatChips(atRisk)} tone="warn" /> : null}
      {/* Rounds, not hands: a split resolves two hands in one round. */}
      <StatRow label="Rounds played" value={table.handsPlayed} />
      <StatRow
        label="Session"
        value={formatNet(table.sessionNet)}
        tone={table.sessionNet > 0 ? "good" : table.sessionNet < 0 ? "bad" : "neutral"}
      />
    </Panel>
  );
}

function ShoePanel({ table, onShuffle }: { table: PlayTable; onShuffle: () => void }) {
  const shoe = currentShoe(table);
  const cutCardOut = isCutCardReached(shoe);
  return (
    <Panel title="Shoe">
      <StatRow label="Session seed" value={table.sessionSeed} />
      <StatRow label="Shoe" value={`#${table.shoeIndex + 1} · seed ${shoe.seed}`} />
      <StatRow label="Dealt" value={`${shoe.dealtCount} of ${shoe.cards.length}`} />
      <StatRow
        label="Cut card"
        value={cutCardOut ? "reached" : `at ${shoe.cutIndex}`}
        tone={cutCardOut ? "warn" : "neutral"}
      />
      {table.round === null ? (
        <View style={styles.shuffle}>
          <SecondaryButton label="Shuffle now" onPress={onShuffle} />
        </View>
      ) : null}
    </Panel>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: felt.scrim,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  sheet: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "88%",
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  body: { gap: 12, padding: 16, paddingBottom: 32 },
  muted: { color: colors.mutedForeground },
  report: { alignSelf: "flex-start" },
  link: { ...ui(15, 500), color: colors.primary, minHeight: 44, paddingTop: 10 },
  tableName: { ...ui(16, 600), color: colors.foreground },
  tableRules: { ...ui(13), color: colors.mutedForeground, lineHeight: 19 },
  note: { ...ui(12), color: colors.mutedForeground, flexShrink: 1, lineHeight: 18 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 8 },
  shuffle: { marginTop: 4, alignSelf: "flex-start" },
});
