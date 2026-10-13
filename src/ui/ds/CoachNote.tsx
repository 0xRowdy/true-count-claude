import { Pressable, StyleSheet, Text, View, type ImageSourcePropType } from "react-native";
import { Avatar, portraits } from "./Avatar";
import { CircleCheck, Lightbulb, RotateCcw, type LucideIcon } from "./icons";
import { colors, radius, shadow, ui } from "./tokens";

export type CoachVariant = "hint" | "mistake" | "good";

const VARIANT: Record<
  CoachVariant,
  { accent: string; ink: string; icon: LucideIcon; kind: string }
> = {
  hint: {
    accent: colors.coachAccent,
    ink: colors.coachAccent,
    icon: Lightbulb,
    kind: "Hint · Basic strategy",
  },
  mistake: {
    accent: colors.mistake,
    ink: colors.mistakeInk,
    icon: RotateCcw,
    kind: "Let's replay that",
  },
  good: { accent: colors.correct, ink: colors.correctInk, icon: CircleCheck, kind: "Good call" },
};

export interface CoachAction {
  label: string;
  onPress?: () => void;
  accessibilityLabel?: string;
}

/**
 * The design's Coach Note (p3Ojh3): the dealer's note on paper, with a coloured left edge per
 * variant (hint blue, mistake orange, good-call green), a title, the why, and up to two actions.
 */
export function CoachNote({
  variant = "hint",
  dealer = "Marcus · your dealer",
  avatar = portraits.dealer,
  kind,
  title,
  body,
  primary,
  secondary,
  width = 358,
}: {
  variant?: CoachVariant;
  dealer?: string;
  avatar?: ImageSourcePropType;
  /** The eyebrow under the dealer's name; defaults per variant. */
  kind?: string;
  title: string;
  body?: string;
  primary?: CoachAction;
  secondary?: CoachAction;
  /** Fixed width (the design's 358) or "100%" to fill. */
  width?: number | "100%";
}) {
  const v = VARIANT[variant];
  const Icon = v.icon;
  return (
    <View
      role="note"
      accessibilityLabel={`Coach note: ${title}`}
      // A caught mistake arrives mid-hand; announce it without stealing focus.
      aria-live={variant === "mistake" ? "polite" : undefined}
      style={[styles.note, { width, maxWidth: "100%", borderLeftColor: v.accent }]}
    >
      <View style={styles.header}>
        <Avatar name={dealer} source={avatar} size={32} />
        <View style={styles.who}>
          <Text style={[ui(13, 600), { color: colors.ink }]}>{dealer}</Text>
          <Text style={[ui(10, 700, { letterSpacing: 1 }), { color: v.ink }]}>
            {(kind ?? v.kind).toUpperCase()}
          </Text>
        </View>
        <Icon size={18} color={v.ink} strokeWidth={2} />
      </View>
      <Text style={[ui(17, 700, { lineHeight: 22 }), { color: colors.ink }]}>{title}</Text>
      {body ? (
        <Text style={[ui(14, 400, { lineHeight: 20 }), { color: colors.inkMuted }]}>{body}</Text>
      ) : null}
      {primary || secondary ? (
        <View style={styles.actions}>
          {primary ? <NoteButton action={primary} solid /> : null}
          {secondary ? <NoteButton action={secondary} /> : null}
        </View>
      ) : null}
    </View>
  );
}

function NoteButton({ action, solid = false }: { action: CoachAction; solid?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.accessibilityLabel ?? action.label}
      onPress={action.onPress}
      hitSlop={2}
      style={({ pressed }) => [
        styles.button,
        solid ? styles.solid : styles.outline,
        pressed && { opacity: 0.85 },
      ]}
    >
      <Text
        style={[ui(14, 600, { textAlign: "center" }), { color: solid ? colors.paper : colors.ink }]}
      >
        {action.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  note: {
    backgroundColor: colors.coach,
    borderRadius: 16,
    borderLeftWidth: 4,
    boxShadow: shadow.note,
    gap: 10,
    paddingTop: 14,
    paddingRight: 16,
    paddingBottom: 16,
    paddingLeft: 16,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  who: { flex: 1 },
  // One row, as in N6Lcl: a long label ("Take it back & surrender") wraps inside its button
  // rather than pushing the other button onto a second row.
  actions: { flexDirection: "row", gap: 8 },
  button: {
    minHeight: 40,
    flexShrink: 1,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  solid: { backgroundColor: colors.ink },
  outline: { borderWidth: 1, borderColor: colors.paperBorder },
});
