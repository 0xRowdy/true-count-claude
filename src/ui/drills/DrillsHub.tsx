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
import { Pressable, StyleSheet, Text, View } from "react-native";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Divide from "lucide-react-native/icons/divide";
import GitBranch from "lucide-react-native/icons/git-branch";
import Grid3x3 from "lucide-react-native/icons/grid-3x3";
import Hash from "lucide-react-native/icons/hash";
import { COUNTING_SYSTEMS } from "@/engine/counting";
import { DRILLS, type DrillDefinition, type DrillId } from "@/drills/types";
import { colors, display, radius, ui, type LucideIcon } from "@/ui/ds";
import { useConfiguredRules } from "@/ui/rules/rulesStore";
import { PageHeader, Panel, TrainerPage, text, useWide } from "@/ui/trainer/kit";
import { TableLine } from "./DrillChrome";

export const DRILL_HREF: Readonly<Record<DrillId, string>> = {
  "basic-strategy": "/drills/basic-strategy",
  counting: "/drills/counting",
  "true-count": "/drills/true-count",
  deviation: "/drills/deviation",
};

const DRILL_ICON: Readonly<Record<DrillId, LucideIcon>> = {
  "basic-strategy": Grid3x3,
  counting: Hash,
  "true-count": Divide,
  deviation: GitBranch,
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
  const [wide, onLayout] = useWide(720);

  return (
    <TrainerPage>
      <PageHeader
        eyebrow="Trainer"
        title="Drills"
        lede="Focused practice with every answer graded and explained while the cards are still in front of you — right answers included. All four are part of the app; none is sold separately."
      >
        <TableLine rules={configured.rules} />
      </PageHeader>

      <View style={styles.grid} onLayout={onLayout}>
        {DRILLS.map((drill, index) => {
          const Icon = DRILL_ICON[drill.id];
          return (
            <Link key={drill.id} href={DRILL_HREF[drill.id]} asChild>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`${drill.name} drill`}
                // Link asChild hands its child's style to the DOM on update: one flat object.
                style={StyleSheet.flatten([styles.card, wide && styles.cardWide])}
              >
                <View style={styles.cardHead}>
                  <View style={styles.icon}>
                    <Icon size={20} color={colors.feltText} strokeWidth={2} />
                  </View>
                  <Text style={styles.number}>{String(index + 1).padStart(2, "0")}</Text>
                </View>
                <Text style={styles.cardTitle}>{drill.name}</Text>
                <Text style={text.note}>{drill.summary}</Text>
                <View style={styles.meta}>
                  <Text style={text.small}>Graded against {drill.gradedAgainst}</Text>
                  <Text style={text.small}>{systemsLine(drill)}</Text>
                </View>
                <View style={styles.start}>
                  <Text style={styles.startText}>Start drill</Text>
                  <ChevronRight size={16} color={colors.primary} strokeWidth={2} />
                </View>
              </Pressable>
            </Link>
          );
        })}
      </View>

      <Panel title="Your record">
        <Text style={text.note}>
          Every drill records into its own Session on this device. Counting accuracy, conversions,
          index plays and every drill Session are on the Statistics screen.
        </Text>
        <Link href="/session" style={text.link}>
          Statistics — counting accuracy and every drill Session →
        </Link>
      </Panel>
    </TrainerPage>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  card: {
    width: "100%",
    minHeight: 44,
    padding: 20,
    gap: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  cardWide: { width: "auto", flexGrow: 1, flexBasis: 0, minWidth: 260 },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.felt,
    alignItems: "center",
    justifyContent: "center",
  },
  number: { ...display(20, 500), color: colors.mutedForeground },
  cardTitle: { ...ui(20, 600), color: colors.foreground },
  meta: { gap: 2, marginTop: "auto", paddingTop: 6 },
  start: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  startText: { ...ui(14, 600), color: colors.primary },
});
