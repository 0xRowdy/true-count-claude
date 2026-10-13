import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatMoney } from "./format";
import { BookOpen, ChevronLeft } from "./icons";
import { colors, ui } from "./tokens";

/**
 * The design's Table Top Bar (DqrMq): back, the game and its rules line, the practice
 * bankroll, and the rules/strategy book.
 */
export function TableTopBar({
  title,
  subtitle,
  bankroll,
  bankrollLabel = "Practice",
  bankrollColor = colors.primary,
  onBack,
  onBook,
  bookLabel = "Rules and strategy",
}: {
  title: string;
  /** "6 deck · S17 · 3:2 · $10–$500" */
  subtitle?: string;
  /** Practice chips; omitted until known (e.g. read from storage after mount). */
  bankroll?: number;
  bankrollLabel?: string;
  /** The amount's colour: gold by default, `--correct` while a payout lands (w7wLdL). */
  bankrollColor?: string;
  onBack?: () => void;
  onBook?: () => void;
  bookLabel?: string;
}) {
  return (
    <View style={styles.bar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        style={styles.square}
      >
        <ChevronLeft size={24} color={colors.foreground} strokeWidth={2} />
      </Pressable>
      <View style={styles.titles}>
        <Text accessibilityRole="header" style={[ui(16, 600), { color: colors.foreground }]}>
          {title}
        </Text>
        {subtitle ? (
          // Two lines rather than an ellipsis: at 390 a long rules line ("… 5% commission")
          // would otherwise lose its last, most specific part.
          <Text
            style={[ui(12, 400, { lineHeight: 15 }), { color: colors.mutedForeground }]}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {bankroll !== undefined ? (
        <View
          style={styles.bankroll}
          accessible
          accessibilityLabel={`${bankrollLabel} bankroll ${formatMoney(bankroll)}`}
        >
          <Text style={[ui(9, 700, { letterSpacing: 1 }), { color: colors.mutedForeground }]}>
            {bankrollLabel.toUpperCase()}
          </Text>
          <Text style={[ui(16, 700), { color: bankrollColor }]}>{formatMoney(bankroll)}</Text>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={bookLabel}
        onPress={onBook}
        style={styles.square}
      >
        <BookOpen size={22} color={colors.foreground} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 56,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingLeft: 4,
    paddingRight: 8,
    backgroundColor: colors.background,
  },
  square: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  titles: { flex: 1, gap: 1 },
  bankroll: { alignItems: "flex-end", paddingHorizontal: 6 },
});
