/**
 * Cards on felt, for the drills: the design's felt surface (the Lobby's "Up next" hero and the
 * design sheet's table strip) with the DS Playing Cards on it.
 *
 * The drills keep the Play table's two rules for the felt: an outcome renders *on* the hand it
 * belongs to (invariant 3 — feedback while the cards are visible), and a four-hand split wraps
 * on a 360pt phone rather than being clipped.
 */

import type { ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import type { Card } from "@/engine/cards";
import { type Hand, evaluate, isBlackjack } from "@/engine/hand";
import type { HandOutcome, HandResult } from "@/engine/round";
import {
  Badge,
  CardBack,
  Gradient,
  PlayingCard,
  colors,
  radius,
  surfaces,
  ui,
  type BadgeTone,
  type CardSize,
} from "@/ui/ds";
import { formatChips, formatNet } from "@/ui/table/format";

/** The felt surface: felt fading to deep felt, 16 radius, a faint felt-line edge. */
export function Felt({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.felt, style]}>
      <Gradient from={colors.felt} to={colors.feltDeep} angle={160} radius={radius.lg} />
      {children}
    </View>
  );
}

/** A small tracked label on felt ("DEALER", "YOU"). */
export function FeltLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

/** Cards in a row that wraps rather than overflowing; `holeCard` adds the face-down card. */
export function CardFan({
  cards,
  size = "md",
  holeCard = false,
}: {
  cards: readonly Card[];
  size?: CardSize;
  holeCard?: boolean;
}) {
  return (
    <View style={styles.fan}>
      {cards.map((card, index) => (
        <PlayingCard
          key={`${card.rank}${card.suit}-${index}`}
          rank={card.rank}
          suit={card.suit}
          size={size}
        />
      ))}
      {holeCard ? (
        <View accessible accessibilityRole="image" accessibilityLabel="Face-down card">
          <CardBack size={size} />
        </View>
      ) : null}
    </View>
  );
}

const RESULT_LABEL: Record<HandResult, string> = {
  blackjack: "Blackjack",
  win: "Win",
  push: "Push",
  lose: "Lose",
  bust: "Bust",
  surrender: "Surrendered",
};

const RESULT_TONE: Record<HandResult, BadgeTone> = {
  blackjack: "correct",
  win: "correct",
  push: "muted",
  lose: "mistake",
  bust: "mistake",
  surrender: "primary",
};

/** A hand total in the words a player uses: "Soft 18", "20", "Bust 23", "Blackjack". */
export function describeTotal(hand: Hand): string {
  if (isBlackjack(hand)) return "Blackjack";
  const value = evaluate(hand.cards);
  if (value.busted) return `Bust ${value.total}`;
  return value.soft ? `Soft ${value.total}` : `${value.total}`;
}

export function DealerHand({
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
      <View style={styles.seatHead}>
        <FeltLabel>Dealer</FeltLabel>
        <TotalPill text={total} />
      </View>
      <CardFan cards={cards} size={size} holeCard={!revealed} />
    </View>
  );
}

export function PlayerHand({
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
      <View style={styles.seatHead}>
        <FeltLabel>{active ? `▸ ${label}` : label}</FeltLabel>
        <TotalPill text={describeTotal(hand)} />
      </View>
      <CardFan cards={hand.cards} size={size} />
      <View style={styles.footer}>
        <Text style={styles.wager}>
          {formatChips(wagered)} practice{hand.doubled ? " · doubled" : ""}
        </Text>
        {outcome ? (
          <View style={styles.outcome}>
            <Badge
              label={RESULT_LABEL[outcome.result]}
              tone={RESULT_TONE[outcome.result]}
              showIcon={false}
            />
            <Text style={styles.net}>{formatNet(outcome.net)}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function TotalPill({ text }: { text: string }) {
  return (
    <View style={styles.total}>
      <Text style={[ui(13, 600), { color: colors.feltText }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  felt: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 16,
    overflow: "hidden",
    backgroundColor: colors.feltDeep,
  },
  label: {
    ...ui(11, 700, { letterSpacing: 1.6, textTransform: "uppercase" }),
    color: surfaces.feltTextMuted,
  },
  fan: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  seat: { gap: 10 },
  playerSeat: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 150,
    minWidth: 140,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.feltLine,
    backgroundColor: surfaces.betSpot,
  },
  activeSeat: { borderColor: colors.primary, borderWidth: 2 },
  seatHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  total: {
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: surfaces.tableButton,
    borderWidth: 1,
    borderColor: colors.feltLine,
  },
  footer: { gap: 6 },
  wager: { ...ui(12, 500), color: surfaces.feltTextMuted, fontVariant: ["tabular-nums"] },
  outcome: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  net: { ...ui(13, 700), color: colors.feltText, fontVariant: ["tabular-nums"] },
});
