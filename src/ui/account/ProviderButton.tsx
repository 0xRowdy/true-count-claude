import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  type ImageSourcePropType,
} from "react-native";
import appleLogo from "../../../assets/auth/apple-logo.png";
import googleLogo from "../../../assets/auth/google-logo.png";
import { brand, radius, ui } from "@/ui/ds";

export type Provider = "apple" | "google";

/**
 * The brand marks are the providers' own artwork, never redrawn: Apple's logo-only button from
 * appleid.cdn-apple.com (white style, 52pt, the button's height as Apple asks) and Google's
 * Neutral-theme logo from its sign-in asset bundle. Each button is filled with its artwork's
 * background, so the logo sits on its own colour with the padding the asset was drawn with.
 *
 * Both buttons share one size and weight: Apple and Google each require at least equal
 * prominence with any other sign-in option.
 */
const BRAND: Record<
  Provider,
  {
    label: string;
    logo: ImageSourcePropType;
    size: number;
    bg: string;
    fg: string;
    padLeft: number;
  }
> = {
  // White style on a dark background; the artwork carries its own side padding.
  apple: {
    label: "Continue with Apple",
    logo: appleLogo,
    size: 52,
    bg: brand.apple,
    fg: brand.appleInk,
    padLeft: 0,
  },
  // Neutral theme: no stroke. The 40pt asset holds the 20pt "G" with
  // 10pt round it, so 2pt more gives Google's 12pt lead-in.
  google: {
    label: "Continue with Google",
    logo: googleLogo,
    size: 40,
    bg: brand.google,
    fg: brand.googleInk,
    padLeft: 2,
  },
};

export function ProviderButton({
  provider,
  onPress,
  busy = false,
}: {
  provider: Provider;
  onPress: () => void;
  /** This provider's sign-in is in flight: a spinner replaces the logo and presses are ignored. */
  busy?: boolean;
}) {
  const b = BRAND[provider];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={b.label}
      aria-busy={busy}
      onPress={busy ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: b.bg, paddingLeft: b.padLeft },
        pressed && !busy && styles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={b.fg} style={{ width: b.size, height: b.size }} />
      ) : (
        <Image
          source={b.logo}
          style={{ width: b.size, height: b.size }}
          accessibilityIgnoresInvertColors
        />
      )}
      <Text style={[ui(16, 500), { color: b.fg }]} numberOfLines={1}>
        {b.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    // The logo's own artwork padding is the gap on its right.
    gap: 0,
    paddingRight: 20,
    borderRadius: radius.md,
    overflow: "hidden",
    alignSelf: "stretch",
  },
  pressed: { opacity: 0.85 },
});
