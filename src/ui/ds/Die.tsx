import { View } from "react-native";
import { diePips } from "./format";
import { shadow, surfaces } from "./tokens";

export type DieValue = 1 | 2 | 3 | 4 | 5 | 6;

/** A craps die face (the design's Craps "Dice Result"): red, rounded, white pips. */
export function Die({
  value,
  size = 46,
  rotation = 0,
}: {
  value: DieValue;
  size?: number;
  /** Degrees; the design tilts thrown dice by -8° to -10°. */
  rotation?: number;
}) {
  const pip = (7 / 46) * size;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Die showing ${value}`}
      style={{
        width: size,
        height: size,
        borderRadius: (9 / 46) * size,
        backgroundColor: surfaces.die,
        borderWidth: 1,
        borderColor: surfaces.dieEdge,
        boxShadow: shadow.die,
        transform: [{ rotate: `${rotation}deg` }],
      }}
    >
      {diePips(value).map(([x, y], i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            left: x * size - pip / 2 - 1,
            top: y * size - pip / 2 - 1,
            width: pip,
            height: pip,
            borderRadius: pip / 2,
            backgroundColor: surfaces.diePip,
          }}
        />
      ))}
    </View>
  );
}
