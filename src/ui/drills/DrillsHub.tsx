/**
 * The drills hub: the four trainers, every one of them included, always.
 *
 * Invariant 1 is the reason this screen has no lock, price or badge on any card. The
 * incumbent sells the counting and basic-strategy trainers as a subscription on top of the
 * game purchase, and 36% of the category's low-star reviews are paywall friction. Each card says
 * what the drill grades against and which systems it runs with — and where a drill declines a
 * system, the drill screen says why rather than the hub hiding it.
 */

import { Link } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { COUNTING_SYSTEMS } from "@/engine/counting";
import { DRILLS, type DrillDefinition, type DrillId } from "@/drills/types";
import { Panel, Screen } from "@/ui/primitives";
import { useConfiguredRules } from "@/ui/rules/rulesStore";
import { colors, radius, spacing, type } from "@/ui/theme";
import { TableLine, drillStyles } from "./DrillChrome";

export const DRILL_HREF: Readonly<Record<DrillId, string>> = {
  "basic-strategy": "/drills/basic-strategy",
  counting: "/drills/counting",
  "true-count": "/drills/true-count",
  deviation: "/drills/deviation",
};

function systemsLine(drill: DrillDefinition): string {
  if (drill.systems === "all") return "All six counting systems";
  const names = drill.systems.map(
    (id) => COUNTING_SYSTEMS.find((system) => system.id === id)?.name ?? id,
  );
  return names.length === 1 ? `${names[0]} only` : names.join(", ");
}

export function DrillsHub() {
  const configured = useConfiguredRules();

  return (
    <ScrollView style={drillStyles.scroll} contentContainerStyle={drillStyles.scrollContent}>
      <Screen>
        <Panel>
          <Text style={styles.title}>Drills</Text>
          <Text style={styles.lede}>
            Focused practice with every answer graded and explained while the cards are still in
            front of you — right answers included. All four are part of the app; none is sold
            separately.
          </Text>
          <TableLine rules={configured.rules} />
        </Panel>

        {DRILLS.map((drill) => (
          <Link key={drill.id} href={DRILL_HREF[drill.id]} asChild>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`${drill.name} drill`}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle}>{drill.name}</Text>
                <Text style={styles.arrow}>Start →</Text>
              </View>
              <Text style={styles.body}>{drill.summary}</Text>
              <Text style={styles.meta}>Graded against {drill.gradedAgainst}</Text>
              <Text style={styles.meta}>{systemsLine(drill)}</Text>
            </Pressable>
          </Link>
        ))}

        <Link href="/session" style={styles.link}>
          Statistics — counting accuracy and every drill Session →
        </Link>
      </Screen>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { ...type.title, color: colors.text },
  lede: { ...type.body, color: colors.textMuted },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
    minHeight: 44,
  },
  pressed: { opacity: 0.7 },
  cardHead: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: spacing.sm,
  },
  cardTitle: { ...type.heading, color: colors.text },
  arrow: { ...type.body, color: colors.accent, fontWeight: "600" },
  body: { ...type.body, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted },
  link: { ...type.body, color: colors.accent, minHeight: 44, paddingTop: spacing.sm },
});
