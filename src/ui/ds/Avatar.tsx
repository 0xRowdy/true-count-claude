import { useEffect } from "react";
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

/** The URL a bundled image is served from on web (or null where it has none, e.g. native ids). */
export function imageUri(source: ImageSourcePropType): string | null {
  const value = source as unknown;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "uri" in value) {
    const uri = (value as { uri: unknown }).uri;
    return typeof uri === "string" ? uri : null;
  }
  return null;
}

/**
 * Fetches the portraits once, at app start, so a Coach Note never shows an empty disc while
 * the dealer's photo loads (the web shell also preloads them; see app/+html.tsx).
 */
export function usePrefetchPortraits(): void {
  useEffect(() => {
    for (const source of Object.values(portraits)) {
      const uri = imageUri(source);
      if (uri) Image.prefetch(uri).catch(() => undefined);
    }
  }, []);
}
