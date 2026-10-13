import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { Avatar, portraits } from "./Avatar";
import { Logo } from "./Logo";
import { formatChips } from "./format";
import {
  Bell,
  ChartLine,
  GraduationCap,
  LayoutGrid,
  Library,
  Users,
  type LucideIcon,
} from "./icons";
import { colors, radius, surfaces, ui } from "./tokens";

export type NavKey = "lobby" | "trainer" | "strategies" | "live" | "progress";

/** The app's top-level destinations, in header order. Hrefs follow the fixed route map. */
export const NAV_ITEMS: ReadonlyArray<{
  key: NavKey;
  label: string;
  href: string;
  icon: LucideIcon;
}> = [
  { key: "lobby", label: "Lobby", href: "/lobby", icon: LayoutGrid },
  { key: "trainer", label: "Trainer", href: "/drills", icon: GraduationCap },
  { key: "strategies", label: "Strategies", href: "/strategies", icon: Library },
  { key: "live", label: "Live tables", href: "/live", icon: Users },
  { key: "progress", label: "Progress", href: "/progress", icon: ChartLine },
];

/** Below this header width nav items show icons only; below COMPACT the chip pill shortens. */
const ICONS_ONLY = 1040;
const COMPACT = 640;

/**
 * The design's App Header (wxeZn): logo, the five nav items (the `active` one highlighted),
 * the practice-chip pill, notifications and the player's avatar.
 *
 * Width is measured after mount (onLayout), never read during render, so the prerendered HTML
 * and the first client render agree (hydration); narrow layouts then collapse in place.
 */
export function AppHeader({
  active,
  chips,
  onNotifications,
}: {
  active?: NavKey;
  /** Practice chip balance shown in the pill; the pill is hidden until one is passed. */
  chips?: number;
  onNotifications?: () => void;
}) {
  const [width, setWidth] = useState<number | null>(null);
  const iconsOnly = width !== null && width < ICONS_ONLY;
  const compact = width !== null && width < COMPACT;
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  return (
    <View
      onLayout={onLayout}
      accessibilityRole="header"
      style={[styles.bar, compact && styles.barCompact]}
    >
      <Link href="/lobby" asChild>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Tableside, lobby"
          style={styles.logo}
        >
          <Logo wordmark={!compact} />
        </Pressable>
      </Link>

      <View
        style={[styles.nav, compact && styles.navCompact]}
        role="navigation"
        accessibilityLabel="Main"
      >
        {NAV_ITEMS.map((item) => {
          const on = item.key === active;
          const fg = on ? colors.foreground : colors.mutedForeground;
          const Icon = item.icon;
          return (
            <Link key={item.key} href={item.href} asChild>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={item.label}
                aria-current={on ? "page" : undefined}
                // Link asChild hands its child's style to the DOM on update: pass one flat object.
                style={StyleSheet.flatten([
                  styles.navItem,
                  iconsOnly && styles.navItemIcon,
                  compact && styles.navItemTight,
                  on && styles.navItemOn,
                ])}
              >
                <Icon size={16} color={fg} strokeWidth={2} />
                {iconsOnly ? null : <Text style={[ui(14, 500), { color: fg }]}>{item.label}</Text>}
              </Pressable>
            </Link>
          );
        })}
      </View>

      <View style={[styles.right, compact && styles.rightCompact]}>
        {chips === undefined ? null : (
          <View
            style={styles.pill}
            accessible
            accessibilityLabel={`${formatChips(chips)} practice chips`}
          >
            <View style={styles.chipDot} />
            <Text style={[ui(13, 600), { color: colors.foreground }]}>
              {compact ? formatChips(chips) : `${formatChips(chips)} practice chips`}
            </Text>
          </View>
        )}
        {compact ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            onPress={onNotifications}
            hitSlop={12}
          >
            <Bell size={20} color={colors.mutedForeground} strokeWidth={2} />
          </Pressable>
        )}
        <Avatar name="You" source={portraits.player} size={34} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 32,
    paddingHorizontal: 32,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  barCompact: { gap: 8, paddingHorizontal: 12 },
  logo: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 },
  nav: { flex: 1, flexDirection: "row", alignItems: "center", gap: 4 },
  navCompact: { gap: 0 },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    minHeight: 36,
  },
  navItemIcon: { paddingHorizontal: 10, minWidth: 40, justifyContent: "center" },
  navItemTight: { paddingHorizontal: 8, minWidth: 36 },
  navItemOn: { backgroundColor: colors.muted },
  right: { flexDirection: "row", alignItems: "center", gap: 16 },
  rightCompact: { gap: 8 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.muted,
  },
  chipDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.chip25,
    borderWidth: 1.5,
    borderColor: surfaces.chipDotRing,
  },
});
