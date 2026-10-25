import { useId, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import type { Card } from "@/engine/cards";
import {
  BET_LABELS,
  type BaccaratRules,
  type BetKind,
  type BetSettlement,
  type Side,
  handTotal,
  payLabel,
} from "@/games/baccarat";
import { Chip, FeltText, PlayingCard, colors, display, ui } from "@/ui/ds";
import { chipStack, formatAmount } from "./baccaratTable";
import { Minus } from "@/ui/ds/icons";
import { baccaratPalette as pal } from "./palette";

/** The felt (design "Felt", pgZXh): radial glow, rounded bottom corners. */
export function FeltSurface({ children }: { children: ReactNode }) {
  const id = `felt${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <View style={styles.felt}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id={id} cx="50%" cy="30%" rx="80%" ry="65%" fx="50%" fy="30%">
              <Stop offset={0} stopColor={pal.feltGlow} />
              <Stop offset={1} stopColor={pal.feltDeep} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
        </Svg>
      </View>
      {children}
    </View>
  );
}

/**
 * One hand (design "PLAYER" / "BANKER" panels): head dot and name, the cards, the big total and
 * its caption ("Natural 9", "Stands on 7", "Draws to 5"). The winning panel is washed gold.
 */
export function HandPanel({
  side,
  cards,
  caption,
  winner,
}: {
  side: Side;
  cards: readonly Card[];
  /** Shown once the coup is complete. */
  caption: string | null;
  winner: boolean;
}) {
  const name = side === "player" ? "PLAYER" : "BANKER";
  const total = cards.length >= 2 ? handTotal(cards) : null;
  const size = cards.length > 2 ? "sm" : "md";
  return (
    <View
      style={[styles.panel, winner && styles.panelWin]}
      accessible
      accessibilityLabel={`${side === "player" ? "Player" : "Banker"} hand${total !== null ? `, ${total}` : ""}${caption ? `, ${caption}` : ""}${winner ? ", wins" : ""}`}
      testID={`hand-${side}`}
    >
      <View style={styles.head}>
        <View
          style={[
            styles.headDot,
            { backgroundColor: side === "player" ? pal.dotPlayer : pal.dotBanker },
          ]}
        />
        <FeltText style={[ui(12, 800, { letterSpacing: 1.5 }), { color: colors.feltText }]}>
          {name}
        </FeltText>
      </View>
      <View style={styles.cards}>
        {cards.length === 0 ? (
          <>
            <View style={styles.slot} />
            <View style={styles.slot} />
          </>
        ) : (
          cards.map((c, i) => <PlayingCard key={i} rank={c.rank} suit={c.suit} size={size} />)
        )}
        {cards.length === 1 ? <View style={styles.slot} /> : null}
      </View>
      <View style={styles.total}>
        <FeltText style={[display(34, 500, { lineHeight: 37 }), { color: colors.feltText }]}>
          {total ?? " "}
        </FeltText>
        <FeltText style={ui(12)}>{caption ?? " "}</FeltText>
      </View>
    </View>
  );
}

/** What a settled spot shows: "+$50", "−$25", "Push". */
function tagFor(s: BetSettlement | undefined): { text: string; fill: string; ink: string } | null {
  if (!s) return null;
  if (s.outcome === "win")
    return { text: formatAmount(s.net, true), fill: pal.winTag, ink: pal.winTagInk };
  if (s.outcome === "lose")
    return { text: formatAmount(s.net, true), fill: pal.lossTag, ink: pal.winTagInk };
  return { text: "Push", fill: colors.secondary, ink: colors.foreground };
}

/**
 * A bet spot (design "Spot PLAYER", UJsKQ): label and odds along the bottom, the chip stack
 * top-left, the stake (betting) or the result tag (payout) beside it. Tap adds the selected
 * chip; long-press takes one back (Undo and Clear are the button equivalents).
 */
export function Spot({
  bet,
  rules,
  stake,
  settlement,
  onPress,
  onLongPress,
  compact = false,
}: {
  bet: BetKind;
  rules: BaccaratRules;
  stake: number;
  settlement?: BetSettlement;
  onPress?: () => void;
  onLongPress?: () => void;
  compact?: boolean;
}) {
  const label = BET_LABELS[bet];
  const pays = payLabel(rules, bet);
  const won = settlement?.outcome === "win";
  const lost = settlement?.outcome === "lose";
  // Largest chip at the bottom; at most three drawn (the stake tag says the amount).
  const chips = lost ? [] : chipStack(stake).slice(0, 3);
  const tag = tagFor(settlement);
  const chipSize = compact ? 30 : 52;
  const a11y = `${label}, ${pays}${stake > 0 ? `, ${formatAmount(stake)} bet` : ""}${tag ? `, ${tag.text}` : ""}`;
  const body = (
    <>
      {chips.map((value, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={[
            styles.chip,
            compact ? { left: 6, top: 6 - i * 3 } : { left: 14, top: 8 - i * 6 },
            { zIndex: i },
          ]}
        >
          <Chip value={value} size={chipSize} />
        </View>
      ))}
      {tag ? (
        <View
          style={[styles.tag, compact ? styles.tagCompact : null, { backgroundColor: tag.fill }]}
        >
          <FeltText fixed style={[ui(compact ? 11 : 13, 800), { color: tag.ink }]}>
            {tag.text}
          </FeltText>
        </View>
      ) : stake > 0 ? (
        <View style={[styles.tag, compact ? styles.tagCompact : null, styles.stake]}>
          <FeltText fixed style={[ui(compact ? 11 : 13, 800), { color: colors.feltText }]}>
            {formatAmount(stake)}
          </FeltText>
        </View>
      ) : null}
      <FeltText
        style={[ui(compact ? 10 : 11, 800, { letterSpacing: 1 }), { color: colors.feltText }]}
        numberOfLines={1}
      >
        {label.toUpperCase()}
      </FeltText>
      <FeltText style={ui(11)}>{pays}</FeltText>
    </>
  );
  const frame = [
    styles.spot,
    compact ? styles.spotCompact : null,
    (won || (stake > 0 && !settlement)) && styles.spotOn,
  ];
  if (!onPress) {
    return (
      <View style={frame} accessible accessibilityLabel={a11y} testID={`spot-${bet}`}>
        {body}
      </View>
    );
  }
  const spot = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityHint="Adds the selected chip"
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={450}
      testID={`spot-${bet}`}
      style={({ pressed }) => [
        ...frame,
        onLongPress ? styles.spotInWrap : null,
        pressed && { opacity: 0.85 },
      ]}
    >
      {body}
    </Pressable>
  );
  if (!onLongPress) return spot;
  // Long-press never fires from a keyboard or screen reader on web, so taking a chip back
  // also has a real button (invariant 7: buttons, not gestures). The wrapper is always there,
  // so the spot keeps keyboard focus when its first chip lands.
  return (
    <View style={styles.wrap}>
      {spot}
      {stake > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Take a chip off ${label}`}
          onPress={onLongPress}
          hitSlop={9}
          style={({ pressed }) => [
            styles.remove,
            compact ? styles.removeCompact : null,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Minus size={14} color={colors.feltText} strokeWidth={2.5} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  felt: {
    gap: 14,
    paddingTop: 18,
    paddingHorizontal: 16,
    paddingBottom: 22,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    overflow: "hidden",
    backgroundColor: pal.feltDeep,
  },
  panel: {
    flex: 1,
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.feltLine,
  },
  panelWin: { borderWidth: 2, borderColor: colors.primary, backgroundColor: pal.winnerWash },
  head: { flexDirection: "row", alignItems: "center", gap: 6 },
  headDot: { width: 10, height: 10, borderRadius: 5 },
  cards: { flexDirection: "row", gap: 6, minHeight: 82, alignItems: "center" },
  slot: {
    width: 58,
    height: 82,
    borderRadius: 6,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.feltLine,
    opacity: 0.5,
  },
  total: { alignItems: "center" },
  spot: {
    flex: 1,
    height: 96,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.feltLine,
    gap: 2,
    paddingBottom: 10,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  spotCompact: { height: 56, paddingBottom: 6, borderRadius: 10 },
  spotOn: { borderWidth: 2, borderColor: colors.primary },
  wrap: { flex: 1 },
  // Not `flex: 0`: React Native Web expands that to `0 1 0%`, and a zero basis in the wrapper's
  // column overrides `height`, collapsing the spot to its text (12px).
  spotInWrap: { flexGrow: 0, flexShrink: 0, flexBasis: "auto" },
  remove: {
    position: "absolute",
    right: 5,
    bottom: 5,
    zIndex: 20,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.feltLine,
    backgroundColor: pal.stakeTag,
  },
  removeCompact: { width: 22, height: 22, borderRadius: 11, right: 4, bottom: 4 },
  chip: { position: "absolute" },
  tag: {
    position: "absolute",
    right: 6,
    top: 16,
    zIndex: 10,
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 7,
  },
  tagCompact: { right: 4, top: 4, paddingVertical: 1, paddingHorizontal: 5 },
  stake: { backgroundColor: pal.stakeTag },
});
