import { StyleSheet, View } from "react-native";
import { Gradient } from "./Gradient";
import { CARD_SIZES, type CardSize } from "./cardSize";
import { shadow, surfaces } from "./tokens";

/** The design's Card Back (I9Udbi): cream border around a burgundy gradient field. */
export function CardBack({ size = "md" }: { size?: CardSize }) {
  const d = CARD_SIZES[size];
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Face-down card"
      style={[styles.card, { width: d.width, height: d.height, padding: 5 * d.k }]}
    >
      <View style={styles.field}>
        <Gradient from={surfaces.cardBackFrom} to={surfaces.cardBackTo} angle={135} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: surfaces.cardFace,
    borderRadius: 6,
    boxShadow: shadow.card,
  },
  field: {
    flex: 1,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: surfaces.cardBackLine,
    overflow: "hidden",
  },
});
