/**
 * The Play surface — a full round of blackjack: bet, deal, act, settle, repeat.
 *
 * Four constraints here are requirements rather than taste, each traced to a verified
 * competitor failure in `docs/research/competitive-landscape.md`:
 *
 * 1. **Buttons, never gestures** (invariant 7). Reviews of gesture-driven competitors report
 *    "splits and double downs randomly read as hits". Every action is a labelled 44pt target.
 * 2. **Never a disabled legal action** (invariant 7). The action bar renders exactly what
 *    `currentLegalActions` returns and nothing else. Greying out a legal split corrupts the
 *    user's own accuracy statistics — a complaint that appears three times in one competitor's
 *    reviews — so there is no code path here that can produce a greyed-out action.
 * 3. **Responsive, never letterboxed.** The incumbent letterboxes to 16:9 and shows black bars
 *    on an ordinary laptop. The layout is a single scrolling column under 760pt and a
 *    two-column table-and-rail above it. Nothing has a fixed width, everything that can
 *    overflow wraps, and the page never scrolls sideways.
 * 4. **Never a dead end** (invariant 6). A bankroll below the table minimum is met with a
 *    reset button in place. A competitor lost a paying customer because their top-up lived on
 *    a separate website.
 *
 * The action bar is deliberately the third thing on the page, above the count rail, so it is
 * inside the first screenful on a 360x640 phone without the page having to be pinned.
 *
 * The table being dealt is named on the page (#19), because the Rule Set screen shows a
 * strategy chart generated from the user's own game and a Play surface that quietly dealt a
 * different one would make the app's own chart wrong. When the two disagree — a change is
 * configured but cannot be taken up yet — the page says so and says why, rather than deferring
 * it in silence.
 */

import { useMemo, useState } from "react";
import { Link } from "expo-router";
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import type { Action } from "@/engine/hand";
import { type RuleSet, describeRules } from "@/engine/rules";
import { ReportBugButton } from "@/ui/bug-report/ReportBugButton";
import {
  type RoundState,
  currentLegalActions,
  insuranceStake,
  isRoundOver,
  visibleDealerCards,
} from "@/engine/round";
import { isCutCardReached } from "@/engine/shoe";
import {
  ActionButton,
  Badge,
  Panel,
  Screen,
  SecondaryButton,
  StatRow,
  type Tone,
} from "@/ui/primitives";
import { useConfiguredRules } from "@/ui/rules/rulesStore";
import { matchingPreset } from "@/ui/rules/presets";
import {
  SessionControlBar,
  SessionEndedPanel,
  SessionStatsPanel,
} from "@/ui/session/SessionPanels";
import { usePlaySession } from "@/ui/session/usePlaySession";
import { colors, spacing, type } from "@/ui/theme";
import type { CardSize } from "./CardView";
import { CountPanel, type CountVisibility, SystemPanel } from "./CountPanel";
import { DecisionFeedback } from "./DecisionFeedback";
import { DealerHandView, PlayerHandView } from "./HandView";
import { useTableFeedback } from "./feedback";
import { formatChips, formatNet } from "./format";
import { type TableDecision, gradeTableInsurance, gradeTablePlay } from "./tableExplanation";
import {
  STARTING_BANKROLL,
  type PlayTable as PlayTableState,
  type RulesHold,
  affordableChips,
  amountAtRisk,
  availableBankroll,
  countReadout,
  currentShoe,
  insuranceWithheld,
  isBroke,
  usePlayTable,
} from "./usePlayTable";

/** Above this width the table and the count rail sit side by side. */
const TWO_COLUMN_WIDTH = 760;
/** Below this width the cards shrink so a four-hand split still fits without clipping. */
const COMPACT_CARD_WIDTH = 420;

const ACTION_LABEL: Record<Action, string> = {
  hit: "Hit",
  stand: "Stand",
  double: "Double",
  split: "Split",
  surrender: "Surrender",
};

/**
 * Tones are for telling the buttons apart at a glance under time pressure, not for ranking
 * them. Nothing here implies an action is unavailable — every rendered action is legal.
 */
const ACTION_TONE: Record<Action, Tone> = {
  hit: "neutral",
  stand: "neutral",
  double: "info",
  split: "warn",
  surrender: "bad",
};

const ACTION_HINT: Record<Action, string> = {
  hit: "Draw one more card to this hand.",
  stand: "Take no more cards and move on.",
  double: "Double the wager and take exactly one card.",
  split: "Split the pair into two hands, each with its own wager.",
  surrender: "Give up the hand and keep half the wager.",
};

export function PlayTable() {
  const configured = useConfiguredRules();
  const controller = usePlayTable();
  const { table } = controller;
  // Every transition goes through the Session controller, so a Decision cannot be made
  // without being recorded and a round cannot settle without its result being written. The
  // configured Rule Set goes through it too, for the same reason: only the controller can see
  // both the Shoe and the Session, and a rules change is unsafe if either objects.
  const play = usePlaySession(controller, configured);
  const { width } = useWindowDimensions();
  const [visibility, setVisibility] = useState<CountVisibility>("shown");
  const feedback = useTableFeedback();
  // The round's graded Decisions, each carrying its Explanation. Cleared when the next hand is
  // dealt, never when a round settles: the cards stay up through the settlement, and so does
  // the why (invariant 3).
  const [decisions, setDecisions] = useState<readonly TableDecision[]>([]);
  const [explanationOpen, setExplanationOpen] = useState(true);
  const remember = (decision: TableDecision | null) => {
    if (decision) setDecisions((current) => [...current, decision]);
  };
  const startNew = () => {
    setDecisions([]);
    play.startNew();
  };

  const twoColumn = width >= TWO_COLUMN_WIDTH;
  const cardSize: CardSize = width < COMPACT_CARD_WIDTH ? "sm" : "md";

  const readout = useMemo(() => countReadout(table), [table]);
  const round = table.round;
  const shoe = currentShoe(table);
  const cutCardOut = isCutCardReached(shoe);
  const columnStyle = twoColumn ? styles.columnWide : styles.columnNarrow;

  const onAction = (action: Action) => {
    // Doubling and splitting push chips out; everything else is a card off the shoe.
    feedback.play(action === "double" || action === "split" ? "chips" : "card");
    // Graded against the table as it stands *before* the action is applied — the hand the
    // player was looking at, not whatever the round did next.
    remember(gradeTablePlay(table, action, Date.now()));
    play.act(action);
  };

  const tableColumn = (
    <View style={columnStyle}>
      <Panel>
        <DealerHandView
          cards={round ? visibleDealerCards(round) : []}
          revealed={round?.dealerHoleCardRevealed ?? true}
          size={cardSize}
        />
        <View style={styles.divider} />
        {round ? (
          <View style={styles.hands}>
            {round.playerHands.map((hand, index) => (
              <PlayerHandView
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
          <Text style={styles.placeholder}>Place a bet to deal the next hand.</Text>
        )}
      </Panel>

      {round === null ? (
        <BetBar
          table={table}
          onChooseBet={play.setBet}
          onDeal={() => {
            feedback.play("deal");
            setDecisions([]);
            play.deal();
          }}
          onReset={play.resetBankroll}
          {...(play.recording ? { onEndSession: () => play.end("bankroll-exhausted") } : {})}
        />
      ) : round.phase === "insurance" ? (
        <InsuranceBar
          round={round}
          onDecide={(take) => {
            if (take) feedback.play("chips");
            remember(gradeTableInsurance(table, take, Date.now()));
            play.insurance(take);
          }}
        />
      ) : isRoundOver(round) ? (
        <SettlementBar
          round={round}
          justShuffled={table.justShuffled}
          onNext={() => {
            const net = round.settlement?.net ?? 0;
            feedback.play(net > 0 ? "win" : net < 0 ? "lose" : "push");
            play.next();
          }}
        />
      ) : (
        <ActionBar
          round={round}
          withheldInsurance={insuranceWithheld(table)}
          onAction={onAction}
        />
      )}

      <DecisionFeedback
        decisions={decisions}
        roundOver={round === null}
        expanded={explanationOpen}
        onChangeExpanded={setExplanationOpen}
      />

      <BankrollPanel table={table} />
    </View>
  );

  const railColumn = (
    <View style={columnStyle}>
      <TablePanel rules={table.rules} />
      <CountPanel
        readout={readout}
        systemName={table.system.name}
        visibility={visibility}
        onChangeVisibility={setVisibility}
      />
      <SystemPanel table={table} onChange={play.setSystem} />
      <ShoePanel
        table={table}
        cutCardOut={cutCardOut}
        onShuffle={() => {
          feedback.play("shuffle");
          play.shuffle();
        }}
      />
      <SessionStatsPanel session={play.session} stats={play.stats} />
    </View>
  );

  return (
    <Screen width="wide">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* The Session bar sits above the felt, so the one control that ends a Session is on
            screen at every moment of it — mid-round included. */}
        <SessionControlBar
          session={play.session}
          recording={play.recording}
          error={play.error}
          onEnd={() => play.end()}
          onStartNew={startNew}
        >
          <Link href="/session" style={styles.statsLink}>
            Statistics →
          </Link>
          {/* In the bar that is on screen at every moment of a Session (invariant 10). The
              between-rounds Shoe, the live round and the bankroll it was dealt from are what
              let the report replay this exact hand. */}
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
        </SessionControlBar>

        {play.ended ? (
          <SessionEndedPanel
            session={play.ended}
            stats={play.stats}
            onStartNew={startNew}
          />
        ) : null}

        {play.pendingRules ? (
          <PendingTablePanel
            current={table.rules}
            pending={play.pendingRules}
            hold={play.rulesHold}
            onSwitch={play.switchTable}
          />
        ) : null}

        {table.justShuffled ? (
          <Badge label="Cut card reached — new shoe, count reset" tone="info" />
        ) : cutCardOut && round !== null ? (
          <Badge label="Cut card is out — last round on this shoe" tone="warn" />
        ) : null}

        <View style={twoColumn ? styles.wide : styles.narrow}>
          {tableColumn}
          {railColumn}
        </View>

        <Text style={styles.rules}>
          Dealing {describeRules(table.rules)}
        </Text>
      </ScrollView>
    </Screen>
  );
}

// --- Action surfaces -----------------------------------------------------------------------

/**
 * Renders exactly the legal actions, in a fixed order so a player's muscle memory holds from
 * hand to hand. `currentLegalActions` returns them in the engine's own order; sorting here
 * keeps Hit and Stand in the same place whether or not a Double is on offer.
 */
const ACTION_ORDER: readonly Action[] = ["hit", "stand", "double", "split", "surrender"];

function ActionBar({
  round,
  withheldInsurance,
  onAction,
}: {
  round: RoundState;
  /**
   * The engine withholds the insurance offer when the bankroll cannot cover the half-bet
   * stake, rather than offering a button that throws. That brushes invariant 7, so the
   * absence is explained in words instead of being left as a silently missing action.
   */
  withheldInsurance: boolean;
  onAction: (action: Action) => void;
}) {
  const legal = currentLegalActions(round);
  const ordered = ACTION_ORDER.filter((action) => legal.includes(action));
  const handLabel =
    round.playerHands.length > 1
      ? `Hand ${round.activeHandIndex + 1} of ${round.playerHands.length}`
      : "Your move";

  return (
    <Panel title={handLabel}>
      {withheldInsurance ? (
        <Text style={styles.note}>
          Insurance was not offered: the bankroll is below the{" "}
          {formatChips(insuranceStake(round.bet))} stake.
        </Text>
      ) : null}
      <View style={styles.actions}>
        {ordered.map((action) => (
          <ActionButton
            key={action}
            label={ACTION_LABEL[action]}
            tone={ACTION_TONE[action]}
            accessibilityHint={ACTION_HINT[action]}
            onPress={() => onAction(action)}
          />
        ))}
      </View>
    </Panel>
  );
}

function InsuranceBar({
  round,
  onDecide,
}: {
  round: RoundState;
  onDecide: (take: boolean) => void;
}) {
  return (
    <Panel title="Insurance?">
      <Text style={styles.note}>
        The dealer shows an ace. Insurance costs {formatChips(insuranceStake(round.bet))} and pays
        2:1 if the dealer has a natural. It is a bet on tens, not on your hand — only a high
        count makes it worth taking.
      </Text>
      <View style={styles.actions}>
        <ActionButton
          label="Take insurance"
          tone="info"
          accessibilityHint="Place the half-bet side wager against a dealer natural."
          onPress={() => onDecide(true)}
        />
        <ActionButton
          label="No insurance"
          accessibilityHint="Decline the side wager and play the hand out."
          onPress={() => onDecide(false)}
        />
      </View>
    </Panel>
  );
}

function BetBar({
  table,
  onChooseBet,
  onDeal,
  onReset,
  onEndSession,
}: {
  table: PlayTableState;
  onChooseBet: (amount: number) => void;
  onDeal: () => void;
  onReset: () => void;
  /**
   * Stopping here is a *choice*, offered alongside the reset — never inferred. A bankroll at
   * zero does not end a Session (`src/state/session.test.ts` asserts it), and the reset is
   * the primary action because invariant 6 forbids the dead end.
   */
  onEndSession?: () => void;
}) {
  if (isBroke(table)) {
    return (
      <Panel title="Out of chips">
        <Text style={styles.note}>
          The bankroll is {formatChips(table.bankroll)}, below the {formatChips(table.rules.minBet)}{" "}
          table minimum. Reset it here and keep playing — you never have to leave this screen.
          Going broke stays in your statistics either way; it is the most instructive thing in
          a training log.
        </Text>
        <View style={styles.actions}>
          <ActionButton
            label={`Reset to ${formatChips(STARTING_BANKROLL)}`}
            tone="good"
            accessibilityHint="Restore the practice bankroll and carry on from this hand."
            onPress={onReset}
          />
          {onEndSession ? (
            <ActionButton
              label="End session instead"
              tone="warn"
              accessibilityHint="Close this Session here and keep its statistics."
              onPress={onEndSession}
            />
          ) : null}
        </View>
      </Panel>
    );
  }

  const chips = affordableChips(table);

  return (
    <Panel title="Your bet">
      <View style={styles.betRow}>
        <Text style={styles.betAmount}>{formatChips(table.bet)}</Text>
        <Text style={styles.note}>
          {formatChips(table.rules.minBet)}–{formatChips(table.rules.maxBet)} table
        </Text>
      </View>
      <View style={styles.chips}>
        {chips.map((chip) => (
          <SecondaryButton
            key={chip}
            label={formatChips(chip)}
            onPress={() => onChooseBet(chip)}
          />
        ))}
        <SecondaryButton label="Max" onPress={() => onChooseBet(table.rules.maxBet)} />
      </View>
      <View style={styles.actions}>
        <ActionButton
          label="Deal"
          tone="good"
          accessibilityHint={`Deal a new hand for ${formatChips(table.bet)}.`}
          onPress={onDeal}
        />
      </View>
    </Panel>
  );
}

function SettlementBar({
  round,
  justShuffled,
  onNext,
}: {
  round: RoundState;
  justShuffled: boolean;
  onNext: () => void;
}) {
  const settlement = round.settlement;
  const net = settlement?.net ?? 0;

  return (
    <Panel title="Round settled">
      <StatRow
        label="This round"
        value={formatNet(net)}
        tone={net > 0 ? "good" : net < 0 ? "bad" : "neutral"}
      />
      {settlement && round.insurance.bet > 0 ? (
        <StatRow
          label="Insurance"
          value={formatNet(settlement.insuranceNet)}
          tone={settlement.insuranceNet > 0 ? "good" : "bad"}
        />
      ) : null}
      <View style={styles.actions}>
        <ActionButton
          label={justShuffled ? "Shuffle and deal" : "Next hand"}
          tone="good"
          accessibilityHint="Return to the bet prompt for the next hand."
          onPress={onNext}
        />
      </View>
    </Panel>
  );
}

// --- The table being dealt -------------------------------------------------------------------

/**
 * Which game this is, named on the surface that deals it.
 *
 * `describeRules` names every rule that moves a strategy cell, so a user can check the chart
 * they were shown against the game they are in without leaving the felt. The preset name is
 * added when the Rule Set is one of the real games, because "Downtown double deck" is what a
 * player calls their table and `2D · H17 · 3:2 · DAS · 70% pen` is what it means.
 */
function TablePanel({ rules }: { rules: RuleSet }) {
  const preset = matchingPreset(rules);
  return (
    <Panel title="Table">
      {preset ? <Text style={styles.tableName}>{preset.name}</Text> : null}
      <Text style={styles.tableRules}>{describeRules(rules)}</Text>
      <Link href="/rules" style={styles.statsLink}>
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
  shoe:
    "Cards are already off this shoe. Changing the deck count or the penetration under it would move the True Count's divisor mid-count and leave the zero-sum check unable to reconcile (ADR-0004).",
};

const HOLD_ACTION: Record<RulesHold, string | null> = {
  round: null,
  session: "End this session and deal the new table",
  shoe: "Shuffle to the new table",
};

/**
 * The deferred rules change, said out loud.
 *
 * A change the app silently ignores is worse than one it refuses: the user sets a single-deck
 * 6:5 game, sees the house edge treble on the Rule Set screen, comes here and is dealt a
 * six-deck shoe with no explanation. So the pending table is named, the reason it is waiting
 * is given in full, and the way through it is one tap — never a dead end (invariant 6).
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
      <Text style={styles.note}>
        {hold === null
          ? "Taking effect now."
          : HOLD_REASON[hold]}
      </Text>
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

// --- Rail panels ---------------------------------------------------------------------------

function BankrollPanel({ table }: { table: PlayTableState }) {
  const atRisk = amountAtRisk(table);
  return (
    <Panel title="Bankroll">
      <StatRow label="Available" value={formatChips(availableBankroll(table))} />
      {atRisk > 0 ? <StatRow label="On the felt" value={formatChips(atRisk)} tone="warn" /> : null}
      {/* Rounds, not hands: a split resolves two hands in one round, and the Session panel
          counts those separately. Two different numbers with one label would be a small lie. */}
      <StatRow label="Rounds played" value={table.handsPlayed} />
      <StatRow
        label="Session"
        value={formatNet(table.sessionNet)}
        tone={table.sessionNet > 0 ? "good" : table.sessionNet < 0 ? "bad" : "neutral"}
      />
    </Panel>
  );
}

function ShoePanel({
  table,
  cutCardOut,
  onShuffle,
}: {
  table: PlayTableState;
  cutCardOut: boolean;
  onShuffle: () => void;
}) {
  const shoe = currentShoe(table);
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
  scroll: { flex: 1 },
  scrollContent: { gap: spacing.md, paddingBottom: spacing.xl },
  // Two layouts, one set of children. Neither has a fixed width, so nothing letterboxes and
  // the page never gains a horizontal scrollbar.
  narrow: { flexDirection: "column", gap: spacing.md },
  wide: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  // Side by side, the two columns share the width evenly: `flexBasis: 0` makes the split
  // independent of their content, so a long counting-system name cannot widen the rail.
  columnWide: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, gap: spacing.md },
  // Stacked, they must size to their content. `flexBasis: 0` here would resolve against an
  // unbounded scroll height and collapse both columns to nothing.
  columnNarrow: { width: "100%", gap: spacing.md },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  hands: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  placeholder: { ...type.body, color: colors.textMuted },
  // Generous gaps: mis-tapping the wrong action is a recurring complaint across the category,
  // and the primitives already guarantee 44pt targets.
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  betRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  betAmount: { ...type.mono, fontSize: 26, fontWeight: "700", color: colors.text },
  note: { ...type.caption, color: colors.textMuted, flexShrink: 1 },
  shuffle: { marginTop: spacing.xs, alignSelf: "flex-start" },
  statsLink: { ...type.body, color: colors.accent, minHeight: 44, paddingTop: spacing.sm },
  rules: { ...type.caption, color: colors.textMuted, textAlign: "center" },
  tableName: { ...type.body, color: colors.text, fontWeight: "600" },
  tableRules: { ...type.mono, ...type.caption, color: colors.textMuted, lineHeight: 19 },
});
