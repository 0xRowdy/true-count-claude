/**
 * Pieces shared by the Lobby and Progress screens: game icons, link rows, the level ring,
 * the weekly accuracy bars, the bankroll line chart and the sample-data banner.
 */

import { Link } from "expo-router";
import { useId, useRef, useState, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewInstance,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";
import type { GameId } from "@/state/profile";
import { colors, display, icons, radius, surfaces, ui, type LucideIcon } from "@/ui/ds";
import { CircleDot, Crown, Dices, FlaskConical, Spade } from "@/ui/ds/icons";

export const GAME_ICON: Readonly<Record<GameId, LucideIcon>> = {
  blackjack: Spade,
  craps: Dices,
  "video-poker": icons.LayoutGrid,
  roulette: CircleDot,
  baccarat: Crown,
};

/** A 36–40pt rounded square with the game's icon: felt when active, muted otherwise. */
export function GameIcon({
  game,
  active,
  size = 36,
}: {
  game: GameId;
  active: boolean;
  size?: number;
}) {
  const Icon = GAME_ICON[game];
  return (
    <View
      style={[
        styles.gameIcon,
        { width: size, height: size, backgroundColor: active ? colors.felt : colors.muted },
      ]}
    >
      <Icon size={18} color={active ? colors.feltText : colors.mutedForeground} strokeWidth={2} />
    </View>
  );
}

/** A pressable that navigates (role link). `style` is flattened for `Link asChild`. */
export function LinkBox({
  href,
  label,
  style,
  children,
  testID,
}: {
  href: string;
  label: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  testID?: string;
}) {
  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={label}
        testID={testID}
        style={StyleSheet.flatten(style)}
      >
        {children}
      </Pressable>
    </Link>
  );
}

/** Text that links, muted (the design's section-head links). */
export function TextLink({ href, label, text }: { href: string; label?: string; text: string }) {
  return (
    <LinkBox href={href} label={label ?? text} style={styles.textLink}>
      <Text style={[ui(14, 500), { color: colors.mutedForeground }]}>{text}</Text>
    </LinkBox>
  );
}

/** Ring with the level number: track, then the progress arc from 12 o'clock, anticlockwise. */
export function LevelRing({
  level,
  progress,
  size = 120,
}: {
  level: number;
  progress: number;
  size?: number;
}) {
  const stroke = size * 0.07;
  const r = size / 2 - stroke / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Level ${level}, ${Math.round(p * 100)}% to the next level`}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={surfaces.track}
          strokeWidth={stroke}
          fill="none"
        />
        {p > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={colors.primary}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${c * p} ${c}`}
            // Start at 12 o'clock and run anticlockwise, like the design's sweep.
            transform={`rotate(-90 ${size / 2} ${size / 2}) scale(1 -1) translate(0 ${-size})`}
          />
        ) : null}
      </Svg>
      <View style={styles.ringText}>
        <Text style={[display(48, 500), { color: colors.foreground, lineHeight: 56 }]}>
          {level}
        </Text>
        <Text style={[ui(11, 700, { letterSpacing: 1.5 }), { color: colors.mutedForeground }]}>
          LEVEL
        </Text>
      </View>
    </View>
  );
}

/** The weekly accuracy bars: value above, W-label below; the last (this week) in primary. */
export function WeeklyBars({
  weeks,
}: {
  weeks: ReadonlyArray<{ label: string; rate: number | null; total: number }>;
}) {
  const scroll = useRef<ScrollViewInstance>(null);
  const rates = weeks.map((w) => w.rate).filter((r): r is number => r !== null);
  // Scale like the design: the bars start from a floor below the lowest week.
  const floor = rates.length ? Math.max(0, Math.min(...rates) - 0.08) : 0;
  const span = 1 - floor || 1;
  const maxBar = 133;
  return (
    <ScrollView
      ref={scroll}
      horizontal
      contentContainerStyle={styles.bars}
      onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
      accessibilityLabel="Weekly accuracy"
      role="list"
    >
      {weeks.map((w, i) => {
        const last = i === weeks.length - 1;
        const h = w.rate === null ? 0 : Math.max(6, ((w.rate - floor) / span) * maxBar);
        const opacity = last ? 1 : i >= weeks.length - 4 ? 0.6 : 0.25;
        const value = w.rate === null ? "" : `${Math.round(w.rate * 100)}${last ? "%" : ""}`;
        return (
          <View
            key={w.label}
            style={styles.barCol}
            role="listitem"
            accessibilityLabel={`${w.label}: ${w.rate === null ? "no decisions" : `${Math.round(w.rate * 100)}%`}`}
          >
            <Text
              style={[
                last ? ui(11, 700) : ui(11),
                { color: last ? colors.primary : colors.mutedForeground },
              ]}
            >
              {value}
            </Text>
            <View style={[styles.bar, { height: h, opacity }]} />
            <Text style={[ui(11), { color: colors.mutedForeground }]}>{w.label}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

/** The practice bankroll line with a soft area fill and four grid lines. */
export function BankrollChart({
  points,
  height = 180,
}: {
  points: readonly number[];
  height?: number;
}) {
  const [width, setWidth] = useState(0);
  const id = `bk${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const pad = 10;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const spread = max - min || 1;
  const xy = points.map((p, i) => {
    const x = points.length === 1 ? width / 2 : (i / (points.length - 1)) * width;
    const y = pad + (1 - (p - min) / spread) * (height - 2 * pad);
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10] as const;
  });
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  return (
    <View
      style={{ height }}
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Practice bankroll chart, ${points.length} points`}
    >
      {[10, 66, 122, 178].map((y) => (
        <View key={y} style={[styles.grid, { top: (y / 180) * height }]} />
      ))}
      {width > 0 && points.length > 1 ? (
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.correct} stopOpacity={0.25} />
              <Stop offset="1" stopColor={colors.correct} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={area} fill={`url(#${id})`} />
          <Path
            d={line}
            stroke={colors.correct}
            strokeWidth={2.5}
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      ) : null}
    </View>
  );
}

/** A labelled accuracy bar (By decision type). Below 90% reads as a mistake colour. */
export function AccuracyBar({
  label,
  rate,
  total,
}: {
  label: string;
  rate: number | null;
  total: number;
}) {
  const weak = rate !== null && rate < 0.9;
  const tone = weak ? colors.mistake : colors.correct;
  return (
    <View style={styles.accRow}>
      <View style={styles.accHead}>
        <Text style={[ui(13), { color: colors.foreground }]}>{label}</Text>
        <Text
          style={[
            ui(13, 700),
            {
              color: weak
                ? colors.mistake
                : rate === null
                  ? colors.mutedForeground
                  : colors.foreground,
            },
          ]}
        >
          {rate === null ? "—" : `${Math.round(rate * 100)}%`}
        </Text>
      </View>
      <View
        style={styles.accTrack}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`${label}: ${rate === null ? "no decisions yet" : `${Math.round(rate * 100)}% of ${total}`}`}
        accessibilityValue={{ min: 0, max: 100, now: rate === null ? 0 : Math.round(rate * 100) }}
      >
        {rate !== null ? (
          <View
            style={{ width: `${rate * 100}%`, height: 8, borderRadius: 4, backgroundColor: tone }}
          />
        ) : null}
      </View>
    </View>
  );
}

/** Shown above a page while it renders the sample history instead of the player's own. */
export function SampleBanner({ exitHref }: { exitHref: string }) {
  return (
    <View style={styles.banner} role="status" accessibilityLabel="Sample data">
      <FlaskConical size={16} color={colors.coachAccent} strokeWidth={2} />
      <Text style={[ui(13, 500), styles.bannerText]}>
        Sample data. A made-up training history for demos; nothing here is yours, and nothing was
        saved.
      </Text>
      <LinkBox href={exitHref} label="Exit sample data" style={styles.bannerLink}>
        <Text style={[ui(13, 600), { color: colors.foreground }]}>Exit sample</Text>
      </LinkBox>
    </View>
  );
}

const styles = StyleSheet.create({
  gameIcon: { borderRadius: 10, alignItems: "center", justifyContent: "center" },
  textLink: { minHeight: 32, justifyContent: "center" },
  ringText: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 2,
  },
  bars: { flexGrow: 1, flexDirection: "row", alignItems: "flex-end", gap: 10, height: 200 },
  barCol: {
    flex: 1,
    minWidth: 36,
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    height: "100%",
  },
  bar: {
    alignSelf: "stretch",
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    backgroundColor: colors.primary,
  },
  grid: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: colors.border },
  accRow: { gap: 6 },
  accHead: { flexDirection: "row", justifyContent: "space-between" },
  accTrack: { height: 8, borderRadius: 4, backgroundColor: colors.muted, overflow: "hidden" },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.coachAccent,
    backgroundColor: colors.card,
    marginBottom: 24,
  },
  bannerText: { flex: 1, color: colors.foreground },
  bannerLink: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.secondary,
    justifyContent: "center",
  },
});
