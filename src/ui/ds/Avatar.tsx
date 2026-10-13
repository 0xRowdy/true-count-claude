import { Image, StyleSheet, Text, View, type ImageSourcePropType } from "react-native";
import dealerPortrait from "../../../assets/avatars/dealer.jpg";
import playerPortrait from "../../../assets/avatars/player.jpg";
import { initials } from "./format";
import { colors, surfaces, ui } from "./tokens";

/** A round avatar: a photo when there is one, otherwise initials on a colour. */
export function Avatar({
  name,
  source,
  color = colors.chip500,
  size = 32,
  plain = false,
}: {
  name: string;
  source?: ImageSourcePropType;
  color?: string;
  size?: number;
  /** Just the colour dot, no initials (the Strategy Card's author mark). */
  plain?: boolean;
}) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (source) {
    return (
      <Image
        source={source}
        accessibilityLabel={name}
        style={[box, styles.photo]}
        resizeMode="cover"
      />
    );
  }
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={name}
      style={[box, styles.initials, { backgroundColor: color }]}
    >
      {plain ? null : (
        <Text style={[ui(Math.max(9, Math.round(size * 0.4)), 600), { color: colors.foreground }]}>
          {initials(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { backgroundColor: colors.muted, borderWidth: 1, borderColor: surfaces.hairline },
  initials: { alignItems: "center", justifyContent: "center" },
});

/** Bundled portraits from the design (dealer coach, signed-in player). */
export const portraits: Record<"dealer" | "player", ImageSourcePropType> = {
  dealer: dealerPortrait,
  player: playerPortrait,
};
