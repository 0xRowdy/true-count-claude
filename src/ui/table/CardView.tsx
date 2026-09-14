/**
 * Cards, drawn flat.
 *
 * ADR-0005: we compete on explanation quality, not visual fidelity. A card here is a legible
 * rank and suit on a raised surface — no felt, no gloss, no 3D. It must stay readable at the
 * small size a four-hand split forces on a 360pt phone, which is the whole design brief.
 */

import { StyleSheet, Text, View } from "react-native";
import type { Card, Suit } from "@/engine/cards";
import { colors, radius, spacing, type } from "@/ui/theme";

const SUIT_GLYPH: Record<Suit, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
const SUIT_NAME: Record<Suit, string> = { s: "spades", h: "hearts", d: "diamonds", c: "clubs" };

export type CardSize = "sm" | "md";

const SIZES = {
  sm: { width: 34, height: 48, rank: 15, suit: 13 },
  md: { width: 44, height: 62, rank: 19, suit: 16 },
} as const;

export function CardView({ card, size = "md" }: { card: Card; size?: CardSize }) {
  const dimensions = SIZES[size];
  const red = card.suit === "h" || card.suit === "d";
  const ink = red ? colors.danger : colors.text;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${card.rank} of ${SUIT_NAME[card.suit]}`}
      style={[styles.card, { width: dimensions.width, height: dimensions.height }]}
    >
      <Text style={[styles.rank, { fontSize: dimensions.rank, color: ink }]}>{card.rank}</Text>
      <Text style={[styles.suit, { fontSize: dimensions.suit, color: ink }]}>
        {SUIT_GLYPH[card.suit]}
      </Text>
    </View>
  );
}

/** The dealer's hole card while it is still face down. */
export function FaceDownCardView({ size = "md" }: { size?: CardSize }) {
  const dimensions = SIZES[size];
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Face-down card"
      style={[
        styles.card,
        styles.faceDown,
        { width: dimensions.width, height: dimensions.height },
      ]}
    >
      <Text style={[styles.faceDownMark, { fontSize: dimensions.suit }]}>{"▤"}</Text>
    </View>
  );
}

/** A row of cards that wraps rather than overflowing — nothing here scrolls sideways. */
export function CardRow({
  cards,
  size = "md",
  faceDown = false,
}: {
  cards: readonly Card[];
  size?: CardSize;
  faceDown?: boolean;
}) {
  return (
    <View style={styles.row}>
      {cards.map((card, index) => (
        <CardView key={`${card.rank}${card.suit}-${index}`} card={card} size={size} />
      ))}
      {faceDown ? <FaceDownCardView size={size} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, alignItems: "center" },
  card: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    justifyContent: "space-between",
  },
  rank: { ...type.mono, fontWeight: "700" },
  suit: { ...type.mono, textAlign: "right" },
  faceDown: {
    backgroundColor: colors.surface,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  faceDownMark: { color: colors.textMuted },
});
