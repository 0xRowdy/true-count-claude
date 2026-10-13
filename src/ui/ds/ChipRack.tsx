import { StyleSheet, Text, View } from "react-native";
import { Chip } from "./Chip";
import { CHIP_VALUES, formatMoney, type ChipValue } from "./format";
import { Gradient } from "./Gradient";
import { surfaces, ui } from "./tokens";

/**
 * The design's Chip Rack (e2gA4): the wooden rail with every denomination; the selected chip
 * gets a gold ring, and the caption says what a tap does.
 */
export function ChipRack({
  selected,
  onSelect,
  values = CHIP_VALUES,
  caption,
}: {
  selected?: ChipValue;
  onSelect?: (value: ChipValue) => void;
  values?: ReadonlyArray<ChipValue>;
  caption?: string;
}) {
  const text =
    caption ??
    (selected !== undefined
      ? `${formatMoney(selected)} selected · tap a spot to bet, long-press to remove`
      : "Pick a chip, then tap a spot to bet");
  return (
    <View
      style={styles.rack}
      role={onSelect ? "radiogroup" : "group"}
      accessibilityLabel="Chip rack"
    >
      <Gradient from={surfaces.rackFrom} to={surfaces.rackTo} angle={180} />
      <View style={styles.chips}>
        {values.map((value) => (
          <Chip
            key={value}
            value={value}
            selected={value === selected}
            onPress={onSelect ? () => onSelect(value) : undefined}
          />
        ))}
      </View>
      <Text style={[ui(11), styles.caption]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rack: {
    gap: 6,
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: surfaces.rackEdge,
    overflow: "hidden",
  },
  chips: {
    height: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  caption: { color: surfaces.feltTextFaint, textAlign: "center" },
});
