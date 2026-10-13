/**
 * The Tableside vocabulary for the trainer screens — the drills, Rules, Shoe Integrity and
 * Statistics — built from `src/ui/ds` (it replaces the old `theme.ts`/`primitives.tsx` there).
 *
 * The screens have no frames of their own in the design, so this applies the language of its
 * desktop pages (Lobby ZDK1x, Progress LvXnf, Strategy Builder RYP9O): a Fraunces page title,
 * `--card` panels on `--background`, muted overline group titles, table header rows on
 * `--muted`, Stat Cards for scores, felt for cards on the table.
 *
 * Two promises carry over from the old primitives, because they are invariants, not taste:
 *
 * - `ActionButton` has no `disabled` prop. Invariant 7 forbids disabling a legal action —
 *   render exactly the legal actions and nothing else.
 * - Every tap target is at least 44pt (`MIN_TAP`).
 */

import { useCallback, useState, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import CircleAlert from "lucide-react-native/icons/circle-alert";
import Info from "lucide-react-native/icons/info";
import TriangleAlert from "lucide-react-native/icons/triangle-alert";
import {
  AppShell,
  Badge,
  Button,
  Panel as DsPanel,
  SegmentedControl,
  StatCard,
  colors,
  display,
  fontFamily,
  icons,
  radius,
  type BadgeTone,
  type ButtonVariant,
  type DeltaTone,
  type LucideIcon,
  type NavKey,
  MIN_TAP,
  ui,
} from "@/ui/ds";
import { infoInk } from "@/ui/ds/strategyColors";

// ---------------------------------------------------------------------------
// Tone
// ---------------------------------------------------------------------------

/** What a value means for the user: right, wrong, worth a look, or plain information. */
export type Tone = "neutral" | "good" | "bad" | "warn" | "info";

/** Text colour for a tone on the dark app surfaces. */
export const toneColor: Readonly<Record<Tone, string>> = {
  neutral: colors.foreground,
  good: colors.correct,
  bad: colors.mistake,
  warn: colors.primary,
  info: infoInk,
};

/** Signed numbers: positive green, negative orange, zero muted (count tags, nets). */
export function signColor(value: number): string {
  return value > 0 ? colors.correct : value < 0 ? colors.mistake : colors.mutedForeground;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

const NUM: TextStyle = { fontVariant: ["tabular-nums"] };

/** Shared text styles. Weight is chosen by font family, never `fontWeight` (see tokens.ts). */
export const text = StyleSheet.create({
  body: { ...ui(15, 400, { lineHeight: 22 }), color: colors.foreground, flexShrink: 1 },
  bodyMuted: { ...ui(15, 400, { lineHeight: 22 }), color: colors.mutedForeground, flexShrink: 1 },
  lead: { ...ui(15, 600, { lineHeight: 22 }), color: colors.foreground, flexShrink: 1 },
  note: { ...ui(13, 400, { lineHeight: 19 }), color: colors.mutedForeground, flexShrink: 1 },
  small: { ...ui(12, 400, { lineHeight: 17 }), color: colors.mutedForeground, flexShrink: 1 },
  label: { ...ui(13, 500), color: colors.mutedForeground },
  strong: { fontFamily: fontFamily.ui[700], color: colors.foreground },
  muted: { color: colors.mutedForeground },
  num: { ...NUM, fontFamily: fontFamily.ui[600], color: colors.foreground },
  info: { ...ui(13, 400, { lineHeight: 19 }), color: infoInk, flexShrink: 1 },
  warn: { ...ui(13, 400, { lineHeight: 19 }), color: colors.primary, flexShrink: 1 },
  bad: { ...ui(13, 400, { lineHeight: 19 }), color: colors.mistake, flexShrink: 1 },
  /** Muted uppercase group title, the design's "HARD TOTALS" (10/700, tracked). */
  overline: {
    ...ui(11, 700, { letterSpacing: 1.2, textTransform: "uppercase" }),
    color: colors.mutedForeground,
  },
  /** An inline text link (Link `style`): primary, 44pt tall. */
  link: { ...ui(14, 600), color: colors.primary, minHeight: MIN_TAP, paddingTop: 12 },
  figure: { ...display(34, 500), ...NUM, color: colors.foreground },
});

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/**
 * A trainer page: the App Header with `active` lit, then the page head and the panels, 24
 * apart (the Progress page's rhythm).
 */
export function TrainerPage({
  active = "trainer",
  children,
}: {
  active?: NavKey;
  children: ReactNode;
}) {
  return (
    <AppShell active={active}>
      <View style={styles.page}>{children}</View>
    </AppShell>
  );
}

/** Page head: an eyebrow, the Fraunces title (Progress "Your progress", 36/500), the lede. */
export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
  children,
}: {
  eyebrow?: string;
  title: string;
  lede?: ReactNode;
  /** Right-aligned controls (Report a bug, a link back). */
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <View style={styles.head}>
      <View style={styles.headText}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text accessibilityRole="header" aria-level={1} style={styles.title}>
          {title}
        </Text>
        {lede ? <Text style={[text.bodyMuted, styles.lede]}>{lede}</Text> : null}
        {children}
      </View>
      {actions ? <View style={styles.headActions}>{actions}</View> : null}
    </View>
  );
}

/** The design's panel (`--card`, 16 radius, 24 padding), with a 12pt rhythm inside. */
export function Panel({
  title,
  aside,
  children,
  style,
  gap = 12,
}: {
  title?: string;
  aside?: ReactNode;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  gap?: number;
}) {
  return (
    <DsPanel {...(title ? { title } : {})} {...(aside ? { aside } : {})} gap={gap} style={style}>
      {children}
    </DsPanel>
  );
}

/** A labelled group inside a panel: hairline above, overline title. */
export function Group({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.group}>
      <View style={styles.groupHead}>
        <Text style={text.overline} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text style={text.small}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/**
 * Two columns at `minWidth` and wider, one below it. Measured with onLayout after mount, so the
 * prerendered page and the first client render agree (hydration).
 */
export function useWide(minWidth: number): [boolean, (e: LayoutChangeEvent) => void] {
  const [wide, setWide] = useState(false);
  const onLayout = useCallback(
    (e: LayoutChangeEvent) => setWide(e.nativeEvent.layout.width >= minWidth),
    [minWidth],
  );
  return [wide, onLayout];
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

/** A label and its value on one line: the workhorse of the stats and integrity surfaces. */
export function StatRow({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: Tone;
}) {
  return (
    <View style={styles.statRow}>
      <Text style={[ui(14), styles.statLabel]}>{label}</Text>
      <Text style={[ui(14, 600), NUM, styles.statValue, { color: toneColor[tone] }]}>{value}</Text>
    </View>
  );
}

const STAT_TONE: Readonly<Record<Tone, DeltaTone>> = {
  neutral: "muted",
  good: "correct",
  bad: "mistake",
  warn: "primary",
  info: "muted",
};

/** A row of the design's Stat Cards (X5JL1), wrapping on a phone. */
export function StatCards({
  cards,
}: {
  cards: ReadonlyArray<{
    label: string;
    value: string;
    delta?: string;
    tone?: Tone;
    icon?: LucideIcon;
  }>;
}) {
  return (
    <View style={styles.statCards}>
      {cards.map((card) => (
        <StatCard
          key={card.label}
          label={card.label}
          value={card.value}
          width="auto"
          style={styles.statCard}
          {...(card.delta ? { delta: card.delta } : {})}
          deltaTone={STAT_TONE[card.tone ?? "neutral"]}
          deltaIcon={card.icon ?? icons.Target}
        />
      ))}
    </View>
  );
}

const BADGE: Readonly<Record<Tone, { tone: BadgeTone; icon: LucideIcon }>> = {
  neutral: { tone: "muted", icon: icons.Circle },
  good: { tone: "correct", icon: icons.CircleCheck },
  bad: { tone: "mistake", icon: CircleAlert },
  warn: { tone: "primary", icon: TriangleAlert },
  info: { tone: "muted", icon: Info },
};

/** A status pill: the design's Badge (VMvcV) with an icon that says what kind of status it is. */
export function ToneBadge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const b = BADGE[tone];
  return <Badge label={label} tone={b.tone} icon={b.icon} style={styles.badge} />;
}

// ---------------------------------------------------------------------------
// Buttons and choices
// ---------------------------------------------------------------------------

const ACTION_VARIANT: Readonly<Record<Tone, ButtonVariant>> = {
  good: "primary",
  neutral: "secondary",
  info: "secondary",
  warn: "secondary",
  bad: "secondary",
};

/**
 * A command or player action. `good` is the page's primary call to action (gold); the rest are
 * secondary. Deliberately has no `disabled` prop — if an action is not legal, do not render it.
 */
export function ActionButton({
  label,
  onPress,
  tone = "neutral",
  icon,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  tone?: Tone;
  icon?: LucideIcon;
  accessibilityHint?: string;
}) {
  return (
    <Button
      label={label}
      onPress={onPress}
      variant={ACTION_VARIANT[tone]}
      {...(icon ? { icon } : {})}
      {...(accessibilityHint ? { accessibilityHint } : {})}
    />
  );
}

/** A lower-emphasis command: navigation, toggles, copy. */
export function SecondaryButton({
  label,
  onPress,
  disabled,
  icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: LucideIcon;
}) {
  return (
    <Button
      label={label}
      onPress={onPress}
      variant="ghost"
      size="sm"
      style={styles.secondary}
      {...(icon ? { icon } : {})}
      {...(disabled ? { disabled } : {})}
    />
  );
}

/**
 * A row of mutually exclusive choices. Up to four short options sit in the design's Segmented
 * Control; more (six counting systems, eight deck counts) wrap as radio pills, so a phone never
 * squeezes them into unreadable slivers.
 */
export function Choice<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
  accessibilityLabel?: string;
}) {
  const longest = Math.max(...options.map((o) => o.label.length));
  if (options.length <= 4 && longest * options.length <= 44) {
    return (
      <SegmentedControl
        options={options}
        value={value}
        onChange={onChange}
        {...(accessibilityLabel ? { accessibilityLabel } : {})}
      />
    );
  }
  return (
    <View
      style={styles.pills}
      accessibilityRole="radiogroup"
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            aria-checked={on}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [styles.pill, on && styles.pillOn, pressed && styles.pressed]}
          >
            <Text
              style={[ui(14, on ? 600 : 500), { color: on ? colors.ink : colors.foreground }]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Text input styling shared by the money, seed and band fields. */
export const inputStyle: TextStyle = {
  ...ui(15, 500),
  ...NUM,
  minHeight: MIN_TAP,
  paddingHorizontal: 12,
  borderWidth: 1,
  borderColor: colors.input,
  borderRadius: radius.md,
  backgroundColor: colors.background,
  color: colors.foreground,
};

const styles = StyleSheet.create({
  page: { gap: 24 },
  head: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 16,
  },
  headText: { flexGrow: 1, flexShrink: 1, flexBasis: 320, gap: 10 },
  eyebrow: {
    ...ui(12, 600, { letterSpacing: 2, textTransform: "uppercase" }),
    color: colors.primary,
  },
  title: { ...display(36, 500), color: colors.foreground },
  lede: { maxWidth: 760 },
  headActions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  group: {
    gap: 10,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  groupHead: { gap: 2 },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12,
  },
  statLabel: { color: colors.mutedForeground, flexShrink: 1 },
  statValue: { textAlign: "right", flexShrink: 0, maxWidth: "60%" },
  statCards: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  statCard: { minWidth: 132 },
  badge: { alignSelf: "flex-start" },
  secondary: { borderColor: colors.border },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    minHeight: MIN_TAP,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  pillOn: { backgroundColor: colors.paper, borderColor: colors.paper },
  pressed: { opacity: 0.85 },
});
