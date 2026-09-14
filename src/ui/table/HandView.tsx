/**
 * The felt: the dealer's hand and the player's hands.
 *
 * Two rules shape this file. Feedback must arrive while the cards are still on screen
 * (invariant 3), so an outcome renders *on* the hand it belongs to rather than in a summary
 * that replaces it. And a split may produce four hands on a 360pt phone, so the hands wrap and
 * shrink instead of being clipped or pushed off the side.
 */

import { StyleSheet, Text, View } from "react-native";
import type { Card } from "@/engine/cards";
import { type Hand, evaluate, isBlackjack } from "@/engine/hand";
import type { HandOutcome, HandResult } from "@/engine/round";
import { Badge, type Tone } from "@/ui/primitives";
import { colors, radius, spacing, type } from "@/ui/theme";
import { type CardSize, CardRow } from "./CardView";
import { formatChips, formatNet } from "./format";

const RESULT_LABEL: Record<HandResult, string> = {
  blackjack: "Blackjack",
  win: "Win",
  push: "Push",
  lose: "Lose",
  bust: "Bust",
  surrender: "Surrendered",
};

const RESULT_TONE: Record<HandResult, Tone> = {
  blackjack: "good",
  win: "good",
  push: "info",
  lose: "bad",
  bust: "bad",
  surrender: "warn",
};

/** A hand total in the words a player uses: "soft 18", "20", "Bust 23", "Blackjack". */
export function describeTotal(hand: Hand): string {
  if (isBlackjack(hand)) return "Blackjack";
  const value = evaluate(hand.cards);
  if (value.busted) return `Bust ${value.total}`;
  return value.soft ? `Soft ${value.total}` : `${value.total}`;
}

export function DealerHandView({
  cards,
  revealed,
  size,
}: {
  cards: readonly Card[];
  revealed: boolean;
  size: CardSize;
}) {
  // Before the hole card turns over, the total the player can reason about is the upcard's.
  const total =
    cards.length === 0
      ? "—"
      : revealed
        ? describeTotal({ cards, fromSplit: false, doubled: false, surrendered: false, bet: 0 })
        : `Showing ${evaluate(cards).total}`;

  return (
    <View style={styles.seat}>
      <View style={styles.seatHeader}>
        <Text style={styles.seatLabel}>Dealer</Text>
        <Text style={styles.seatTotal}>{total}</Text>
      </View>
      <CardRow cards={cards} size={size} faceDown={!revealed} />
    </View>
  );
}

export function PlayerHandView({
  hand,
  index,
  handCount,
  active,
  outcome,
  size,
}: {
  hand: Hand;
  index: number;
  handCount: number;
  active: boolean;
  outcome: HandOutcome | null;
  size: CardSize;
}) {
  const label = handCount > 1 ? `Hand ${index + 1}` : "You";
  const wagered = hand.doubled ? hand.bet * 2 : hand.bet;

  return (
    <View style={[styles.seat, styles.playerSeat, active && styles.activeSeat]}>
      <View style={styles.seatHeader}>
        <Text style={[styles.seatLabel, active && styles.activeLabel]}>
          {active ? `▸ ${label}` : label}
        </Text>
        <Text style={styles.seatTotal}>{describeTotal(hand)}</Text>
      </View>
      <CardRow cards={hand.cards} size={size} />
      <View style={styles.seatFooter}>
        <Text style={styles.wager}>
          {formatChips(wagered)}
          {hand.doubled ? " · doubled" : ""}
        </Text>
        {outcome ? (
          <View style={styles.outcome}>
            <Badge label={RESULT_LABEL[outcome.result]} tone={RESULT_TONE[outcome.result]} />
            <Text style={[styles.net, { color: netColor(outcome.net) }]}>
              {formatNet(outcome.net)}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function netColor(net: number): string {
  if (net > 0) return colors.accent;
  if (net < 0) return colors.danger;
  return colors.textMuted;
}

const styles = StyleSheet.create({
  seat: {
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  playerSeat: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 150,
    minWidth: 130,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    padding: spacing.sm,
  },
  activeSeat: { borderColor: colors.accent },
  seatHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: spacing.sm },
  seatLabel: { ...type.caption, color: colors.textMuted, fontWeight: "600" },
  activeLabel: { color: colors.accent },
  seatTotal: { ...type.mono, ...type.caption, color: colors.text },
  seatFooter: { gap: spacing.xs },
  wager: { ...type.mono, fontSize: 12, color: colors.textMuted },
  outcome: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  net: { ...type.mono, ...type.caption, fontWeight: "700" },
});
