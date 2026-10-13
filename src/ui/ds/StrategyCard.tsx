import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Avatar } from "./Avatar";
import { ArrowBigUp, BadgeCheck, GitFork, Target, type LucideIcon } from "./icons";
import { colors, display, radius, ui } from "./tokens";

export interface StrategyCardProps {
  rank?: number;
  title: string;
  /** "Blackjack · 6 deck · S17" */
  game: string;
  description: string;
  votes?: string;
  forks?: string;
  /** "Avg. learner 91%" */
  accuracy?: string;
  author: string;
  authorColor?: string;
  /** Shows the green "Rules-checked" mark. */
  verified?: boolean;
  onPress?: () => void;
  width?: number | "auto";
  style?: StyleProp<ViewStyle>;
}

/** The design's Strategy Card (c337cs). */
export function StrategyCard({
  rank,
  title,
  game,
  description,
  votes,
  forks,
  accuracy,
  author,
  authorColor = colors.chip500,
  verified = false,
  onPress,
  width = 340,
  style,
}: StrategyCardProps) {
  const body = (
    <>
      <View style={styles.top}>
        {rank !== undefined ? (
          <Text style={[display(28, 600), { color: colors.primary }]}>#{rank}</Text>
        ) : null}
        <View style={styles.titles}>
          <Text style={[ui(16, 600), { color: colors.foreground }]}>{title}</Text>
          <Text style={[ui(12), { color: colors.mutedForeground }]}>{game}</Text>
        </View>
      </View>
      <Text style={[ui(14, 400, { lineHeight: 20 }), { color: colors.mutedForeground }]}>
        {description}
      </Text>
      <View style={styles.meta}>
        {votes ? <Meta icon={ArrowBigUp} text={votes} label={`${votes} upvotes`} /> : null}
        {forks ? <Meta icon={GitFork} text={forks} label={`${forks} forks`} /> : null}
        {accuracy ? <Meta icon={Target} text={accuracy} /> : null}
      </View>
      <View style={styles.author}>
        <Avatar name={author} color={authorColor} size={22} plain />
        <Text style={[ui(12, 600), styles.authorName]} numberOfLines={1}>
          by {author}
        </Text>
        {verified ? (
          <View style={styles.verified}>
            <BadgeCheck size={14} color={colors.correct} strokeWidth={2} />
            <Text style={[ui(11, 600), { color: colors.correct }]}>Rules-checked</Text>
          </View>
        ) : null}
      </View>
    </>
  );
  const frame = [styles.card, width === "auto" ? styles.fill : { width }, style];
  if (!onPress) return <View style={frame}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${game}`}
      onPress={onPress}
      style={({ pressed }) => [frame, pressed && { opacity: 0.9 }]}
    >
      {body}
    </Pressable>
  );
}

function Meta({ icon: Icon, text, label }: { icon: LucideIcon; text: string; label?: string }) {
  return (
    <View style={styles.metaItem} accessible accessibilityLabel={label ?? text}>
      <Icon size={14} color={colors.mutedForeground} strokeWidth={2} />
      <Text style={[ui(12, 500), { color: colors.mutedForeground }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 12,
  },
  fill: { flex: 1 },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  titles: { flex: 1, gap: 2 },
  meta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 16 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  author: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  authorName: { flex: 1, color: colors.foreground },
  verified: { flexDirection: "row", alignItems: "center", gap: 4 },
});
