import { StyleSheet, Text, View } from "react-native";
import type { Rank, Suit } from "@/engine/cards";
import { CardBack } from "./CardBack";
import { CARD_SIZES, type CardSize } from "./cardSize";
import { cardLabel, suitColor, suitGlyph } from "./format";
import { shadow, surfaces, ui } from "./tokens";

/**
 * The design's Playing Card (zqstp): a four-colour deck card with the rank and suit in the
 * top-left corner and a large pip bottom-right. `faceDown` renders the Card Back.
 */
export function PlayingCard({
  rank,
  suit,
  size = "md",
  faceDown = false,
}: {
  rank: Rank;
  suit: Suit;
  size?: CardSize;
  faceDown?: boolean;
}) {
  if (faceDown) return <CardBack size={size} />;
  const d = CARD_SIZES[size];
  const ink = suitColor(suit);
  const glyph = suitGlyph(suit);
  const px = (n: number) => Math.round(n * d.k);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={cardLabel(rank, suit)}
      style={[
        styles.card,
        {
          width: d.width,
          height: d.height,
          paddingVertical: 5 * d.k,
          paddingHorizontal: 6 * d.k,
        },
      ]}
    >
      <View style={styles.corner}>
        <Text style={[ui(px(20), 800), { color: ink, lineHeight: px(20) }]}>{rank}</Text>
        <Text style={[ui(px(15)), { color: ink, lineHeight: px(15) }]}>{glyph}</Text>
      </View>
      <View style={styles.pipRow}>
        <Text style={[ui(px(30)), { color: ink, lineHeight: px(30) }]}>{glyph}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: surfaces.cardFace,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: surfaces.cardEdge,
    boxShadow: shadow.card,
    justifyContent: "space-between",
  },
  corner: { alignSelf: "flex-start", alignItems: "center" },
  pipRow: { flexDirection: "row", justifyContent: "flex-end" },
});
