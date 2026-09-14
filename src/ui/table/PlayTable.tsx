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
 */

import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import type { Action } from "@/engine/hand";
import { describeRules } from "@/engine/rules";
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
import { colors, spacing, type } from "@/ui/theme";
import type { CardSize } from "./CardView";
import { CountPanel, type CountVisibility, SystemPanel } from "./CountPanel";
import { DealerHandView, PlayerHandView } from "./HandView";
import { useTableFeedback } from "./feedback";
import { formatChips, formatNet } from "./format";
import {
  STARTING_BANKROLL,
  type PlayTable as PlayTableState,
  affordableChips,
  amountAtRisk,
  availableBankroll,
  chooseBet,
  chooseSystem,
  countReadout,
  currentShoe,
  dealRound,
  insuranceWithheld,
  isBroke,
  nextRound,
  playAction,
  resetBankroll,
  shuffleShoe,
  takeInsurance,
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
  const { table, update } = usePlayTable();
  const { width } = useWindowDimensions();
  const [visibility, setVisibility] = useState<CountVisibility>("shown");
  const feedback = useTableFeedback();

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
    update((current) => playAction(current, action));
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
          onChooseBet={(amount) => update((current) => chooseBet(current, amount))}
          onDeal={() => {
            feedback.play("deal");
            update(dealRound);
          }}
          onReset={() => update(resetBankroll)}
        />
      ) : round.phase === "insurance" ? (
        <InsuranceBar
          round={round}
          onDecide={(take) => {
            if (take) feedback.play("chips");
            update((current) => takeInsurance(current, take));
          }}
        />
      ) : isRoundOver(round) ? (
        <SettlementBar
          round={round}
          justShuffled={table.justShuffled}
          onNext={() => {
            const net = round.settlement?.net ?? 0;
            feedback.play(net > 0 ? "win" : net < 0 ? "lose" : "push");
            update(nextRound);
          }}
        />
      ) : (
        <ActionBar
          round={round}
          withheldInsurance={insuranceWithheld(table)}
          onAction={onAction}
        />
      )}

      <BankrollPanel table={table} />
    </View>
  );

  const railColumn = (
    <View style={columnStyle}>
      <CountPanel
        readout={readout}
        systemName={table.system.name}
        visibility={visibility}
        onChangeVisibility={setVisibility}
      />
      <SystemPanel table={table} onChange={(id) => update((current) => chooseSystem(current, id))} />
      <ShoePanel
        table={table}
        cutCardOut={cutCardOut}
        onShuffle={() => {
          feedback.play("shuffle");
          update(shuffleShoe);
        }}
      />
    </View>
  );

  return (
    <Screen width="wide">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {table.justShuffled ? (
          <Badge label="Cut card reached — new shoe, count reset" tone="info" />
        ) : cutCardOut && round !== null ? (
          <Badge label="Cut card is out — last round on this shoe" tone="warn" />
        ) : null}

        <View style={twoColumn ? styles.wide : styles.narrow}>
          {tableColumn}
          {railColumn}
        </View>

        <Text style={styles.rules}>{describeRules(table.rules)}</Text>
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
}: {
  table: PlayTableState;
  onChooseBet: (amount: number) => void;
  onDeal: () => void;
  onReset: () => void;
}) {
  if (isBroke(table)) {
    return (
      <Panel title="Out of chips">
        <Text style={styles.note}>
          The bankroll is {formatChips(table.bankroll)}, below the {formatChips(table.rules.minBet)}{" "}
          table minimum. Reset it here and keep playing — you never have to leave this screen.
        </Text>
        <View style={styles.actions}>
          <ActionButton
            label={`Reset to ${formatChips(STARTING_BANKROLL)}`}
            tone="good"
            accessibilityHint="Restore the practice bankroll and carry on from this hand."
            onPress={onReset}
          />
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

// --- Rail panels ---------------------------------------------------------------------------

function BankrollPanel({ table }: { table: PlayTableState }) {
  const atRisk = amountAtRisk(table);
  return (
    <Panel title="Bankroll">
      <StatRow label="Available" value={formatChips(availableBankroll(table))} />
      {atRisk > 0 ? <StatRow label="On the felt" value={formatChips(atRisk)} tone="warn" /> : null}
      <StatRow label="Hands played" value={table.handsPlayed} />
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
  rules: { ...type.caption, color: colors.textMuted, textAlign: "center" },
});
