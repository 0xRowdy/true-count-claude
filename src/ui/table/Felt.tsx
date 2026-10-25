/**
 * The blackjack felt and the things printed or placed on it (frames CcmBm, N6Lcl, WSAfm,
 * w7wLdL): the radial-gradient cloth with its wooden rail, the dealer tray and shoe, the
 * hands in their outlines, the pills that name totals and actions, the bet spot and its chip
 * stack, and the payout stack.
 */

import { useId, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import type { Card } from "@/engine/cards";
import { CardBack, Chip, PlayingCard, type CardSize, type LucideIcon } from "@/ui/ds";
import { formatMoney, type ChipValue } from "@/ui/ds/format";
import { colors, display, surfaces, textScale, type, ui } from "@/ui/ds/tokens";
import { felt } from "./feltTokens";
import type { TotalTone } from "./tableView";

// ---------------------------------------------------------------------------
// The cloth
// ---------------------------------------------------------------------------

/** The felt: a radial gradient, rounded into the rail at the bottom. */
export function FeltSurface({
  height,
  children,
}: {
  /** The design's 460 (bet, payout) or 410 (deal, result); content may grow it. */
  height: number;
  children: ReactNode;
}) {
  const id = `felt${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <View style={[styles.felt, { minHeight: height }]}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id={id} cx="0.5" cy="0.45" rx="0.75" ry="0.6" fx="0.5" fy="0.45">
              <Stop offset={0} stopColor={felt.centre} />
              <Stop offset={1} stopColor={colors.feltDeep} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
        </Svg>
      </View>
      {children}
    </View>
  );
}

const TRAY = [
  colors.chip1,
  colors.chip5,
  colors.chip25,
  colors.chip100,
  colors.chip500,
  colors.chip1,
];

/** The dealer's chip tray at the top edge of the felt. Decoration. */
export function DealerTray() {
  return (
    <View style={styles.tray} accessibilityElementsHidden importantForAccessibility="no">
      {TRAY.map((fill, i) => (
        <View key={i} style={[styles.trayStack, { backgroundColor: fill }]} />
      ))}
    </View>
  );
}

/** The shoe in the corner, which opens the count and the shoe panel. */
export function ShoeButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Shoe and count"
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.shoe, pressed && styles.pressed]}
    >
      <Text style={[type.overline, { color: felt.label }]} maxFontSizeMultiplier={textScale.felt}>
        SHOE
      </Text>
    </Pressable>
  );
}

/** "BLACKJACK PAYS 3 TO 2" / "DEALER STANDS ON ALL 17s", printed from the Rule Set. */
export function FeltRules({ pays, dealer }: { pays: string; dealer: string }) {
  return (
    <View style={styles.rules}>
      <Text
        style={[display(18, 400, { letterSpacing: 2.5 }), styles.center, { color: felt.ruleText }]}
        maxFontSizeMultiplier={textScale.felt}
      >
        {pays}
      </Text>
      <Text
        style={[ui(11, 400, { letterSpacing: 2 }), styles.center, { color: felt.ruleText }]}
        maxFontSizeMultiplier={textScale.felt}
      >
        {dealer}
      </Text>
    </View>
  );
}

export function DealerLabel() {
  return (
    <Text
      style={[ui(11, 700, { letterSpacing: 2 }), styles.center, { color: felt.label }]}
      maxFontSizeMultiplier={textScale.felt}
    >
      DEALER
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Hands
// ---------------------------------------------------------------------------

/** Card tilts, left to right, so a hand reads as dealt rather than typeset. */
const TILT = [3, -2, 2, -3, 1, -1];

/**
 * A hand in its outline. Cards overlap (the design's −24); a doubled hand's third card lies
 * sideways, as a dealer places it. Empty, the outline holds `placeholder`.
 */
export function HandBox({
  cards,
  holeCard = false,
  spread = false,
  doubled = false,
  size = "md",
  active = false,
  placeholder,
  dim = false,
  tilt = true,
  label,
}: {
  cards: readonly Card[];
  /** Draw a face-down hole card ahead of `cards` (the dealer, before the reveal). */
  holeCard?: boolean;
  /** Lay cards side by side with a gap rather than overlapped (the dealer before the reveal). */
  spread?: boolean;
  doubled?: boolean;
  size?: CardSize;
  active?: boolean;
  placeholder?: string;
  /** The payout dims the hands (55%) once the chips are moving. */
  dim?: boolean;
  /** The player's cards sit at a slight angle; the dealer's lie square. */
  tilt?: boolean;
  label: string;
}) {
  const overlap = size === "sm" ? -18 : tilt ? -24 : -22;
  const faces = cards.map((card, i) => {
    const sideways = doubled && i === 2;
    return (
      <View
        key={`${card.rank}${card.suit}${i}`}
        style={{
          marginLeft: i === 0 && !holeCard ? 0 : spread ? 8 : overlap,
          transform: [{ rotate: `${sideways ? -90 : tilt ? TILT[i % TILT.length] : 0}deg` }],
          ...(sideways ? { marginTop: 12 } : null),
        }}
      >
        <PlayingCard rank={card.rank} suit={card.suit} size={size} />
      </View>
    );
  });
  return (
    <View
      accessibilityLabel={label}
      style={[
        styles.handBox,
        // The outline marks where cards will go; once they are down the frames draw none.
        cards.length === 0 && !holeCard && styles.handEmpty,
        active && styles.handActive,
        dim && styles.dim,
      ]}
    >
      {holeCard ? <CardBack size={size} /> : null}
      {faces}
      {cards.length === 0 && !holeCard && placeholder ? (
        <Text style={[ui(12), { color: felt.hint }]} maxFontSizeMultiplier={textScale.felt}>
          {placeholder}
        </Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Pills
// ---------------------------------------------------------------------------

export type PillTone = TotalTone | "mistake" | "correct" | "neutral";

/** A pill on the felt: a total, a bet amount, or the player's last action. */
export function FeltPill({
  text,
  tone = "plain",
  icon: Icon,
  size = 13,
  outlined = false,
  style,
}: {
  text: string;
  tone?: PillTone;
  icon?: LucideIcon;
  size?: number;
  outlined?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const orange = tone === "bust" || tone === "mistake";
  const green = tone === "correct";
  const gold = tone === "blackjack";
  const ink = orange
    ? felt.onMistake
    : green
      ? felt.onCorrect
      : gold
        ? colors.primaryForeground
        : colors.feltText;
  return (
    <View
      style={[
        styles.pill,
        orange && { backgroundColor: colors.mistake, borderColor: colors.mistake },
        green && { backgroundColor: colors.correct, borderColor: colors.correct },
        gold && { backgroundColor: colors.primary, borderColor: colors.primary },
        outlined && { borderColor: colors.foreground, borderWidth: 1.5 },
        style,
      ]}
    >
      {Icon ? <Icon size={12} color={ink} strokeWidth={2.25} /> : null}
      <Text style={[ui(size, 700), { color: ink }]} maxFontSizeMultiplier={textScale.felt}>
        {text}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Chips on the felt
// ---------------------------------------------------------------------------

/** A stack of chips, each 7pt above the last, as the design stacks them. */
export function ChipStackView({ chips }: { chips: readonly ChipValue[] }) {
  const height = 52 + Math.max(0, chips.length - 1) * 7;
  return (
    <View style={{ width: 52, height }} accessibilityElementsHidden importantForAccessibility="no">
      {chips.map((value, i) => (
        <View key={i} style={[styles.stacked, { top: height - 52 - i * 7 }]}>
          <Chip value={value} />
        </View>
      ))}
    </View>
  );
}

/**
 * The player's bet spot: a 90pt ring holding the stack. During betting a tap adds the
 * selected chip and a long-press takes one off — and both have buttons too (the chips plus
 * Clear), so no wager depends on a gesture (invariant 7).
 */
export function BetCircle({
  amount,
  chips,
  active,
  onPress,
  onLongPress,
  removeLabel,
}: {
  amount: number;
  chips: readonly ChipValue[];
  active: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  removeLabel?: string;
}) {
  const ring = [styles.spot, active ? styles.spotActive : null];
  const stack = <ChipStackView chips={chips} />;
  if (!onPress) {
    return (
      <View style={ring} accessible accessibilityLabel={`Bet ${formatMoney(amount)}`}>
        {stack}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Bet spot, ${formatMoney(amount)}`}
      accessibilityHint="Tap to add the selected chip. Long-press to remove one."
      accessibilityActions={[{ name: "longpress", label: removeLabel ?? "Remove a chip" }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "longpress") onLongPress?.();
      }}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={450}
      style={({ pressed }) => [ring, pressed && styles.pressed]}
    >
      {stack}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  felt: {
    width: "100%",
    borderBottomLeftRadius: 150,
    borderBottomRightRadius: 150,
    borderBottomWidth: 10,
    borderColor: colors.rail,
    overflow: "hidden",
    alignItems: "center",
  },
  tray: {
    width: 160,
    height: 22,
    flexDirection: "row",
    gap: 3,
    paddingVertical: 3,
    paddingHorizontal: 8,
    justifyContent: "center",
    backgroundColor: felt.tray,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  trayStack: { width: 20, height: 14, borderRadius: 3 },
  shoe: {
    position: "absolute",
    top: 34,
    right: 20,
    width: 52,
    height: 44,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: felt.shoeEdge,
    backgroundColor: felt.tray,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.85 },
  rules: { gap: 8, alignSelf: "stretch" },
  center: { textAlign: "center" },
  handBox: {
    minWidth: 128,
    height: 82,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: surfaces.transparent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  handEmpty: { paddingHorizontal: 0, borderColor: felt.outline },
  handActive: { borderColor: colors.primary, borderWidth: 1.5 },
  dim: { opacity: 0.55 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.feltLine,
    backgroundColor: felt.pill,
    alignSelf: "center",
  },
  stacked: { position: "absolute", left: 0 },
  spot: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 1.5,
    borderColor: colors.feltLine,
    backgroundColor: felt.spot,
    alignItems: "center",
    justifyContent: "center",
  },
  spotActive: { borderColor: colors.primary, borderWidth: 2 },
});
