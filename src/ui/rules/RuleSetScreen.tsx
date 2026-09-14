/**
 * The Rule Set screen — build the table you actually play at.
 *
 * "No customization" is 12% of category low-star reviews, and one of them is simply *"The
 * rules are wrong and can't be fixed through customization."* Basic Strategy is a function
 * of the Rule Set (CONTEXT.md), so a trainer that hard-codes a table is training somebody
 * else's game. Every one of the thirteen fields is here.
 *
 * But a settings screen is a chore, so this one is arranged to teach on the way past, in
 * the order a player thinks:
 *
 *   1. **What does this table cost me?** The house edge, live, with every published figure
 *      that goes into it visible on request.
 *   2. **Which table is it?** Presets for the games that actually exist, one tap each.
 *   3. **What exactly are the rules?** All thirteen fields, each with a line on what it
 *      does to you.
 *   4. **So how do I play it?** The chart, generated from those rules, with the cells that
 *      just moved outlined.
 *
 * That last step is the one that makes this more than a form. Turn surrender off and watch
 * eight cells change; switch to 6:5 and watch the edge nearly triple. ADR-0005: we compete
 * on explanation, and this is explanation you operate rather than read.
 */

import { useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { DEFAULT_RULES } from "@/engine/rules";
import { type StrategyChart, strategyChart } from "@/engine/strategy";
import { Badge, Panel, Screen, SecondaryButton } from "@/ui/primitives";
import { colors, spacing, type } from "@/ui/theme";
import { HouseEdgePanel } from "./HouseEdgePanel";
import { PresetPanel } from "./PresetPanel";
import { RuleFields } from "./RuleFields";
import { StrategyChartPanel } from "./StrategyChartPanel";
import { type ChartChange, changedCellKeys, chartChanges } from "./chartChanges";
import { houseEdge } from "./houseEdge";
import { type RuleSetStatus, useRuleSet } from "./useRuleSet";

export function RuleSetScreen() {
  const { rules, setRules, reset, status, problems } = useRuleSet();

  const chart = useMemo(() => strategyChart(rules), [rules]);
  const estimate = useMemo(() => houseEdge(rules), [rules]);

  const { changes, changedKeys } = useChartDiff(chart);

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.pageContent}
      keyboardShouldPersistTaps="handled"
    >
      <Screen>
        <Panel>
          <Text style={styles.title}>Your table</Text>
          <Text style={styles.lede}>
            Basic Strategy is not one chart, it is a chart per rule set. Tell us the table you
            play and every verdict, drill and explanation in the app is generated for that
            table — not for a generic one that happens to be close.
          </Text>
          <StorageNote status={status} />
        </Panel>

        {problems.length > 0 ? <ProblemPanel problems={problems} /> : null}

        <HouseEdgePanel rules={rules} estimate={estimate} />

        <PresetPanel rules={rules} onSelect={setRules} />

        <RuleFields rules={rules} onChange={setRules} />

        <StrategyChartPanel
          rules={rules}
          chart={chart}
          changes={changes}
          changedKeys={changedKeys}
        />

        <Panel>
          <SecondaryButton label="Reset to the default table" onPress={reset} />
          <Text style={styles.resetNote}>
            The default is an ordinary Las Vegas six-deck shoe game — deliberately not the
            most generous table, because the default should look like one you would actually
            sit at.
          </Text>
        </Panel>
      </Screen>
    </ScrollView>
  );
}

/**
 * Which cells moved since the last rule change.
 *
 * Held in a ref rather than state because it is a *comparison against the previous
 * render*, not a value the user changes: storing it in state would need an effect to write
 * it, which would render twice and lose the diff. Computing it during render against the
 * previous chart is the whole mechanism, and it is what makes the highlight land on the
 * same frame as the new chart rather than one frame late.
 */
function useChartDiff(chart: StrategyChart): {
  changes: readonly ChartChange[];
  changedKeys: ReadonlySet<string>;
} {
  const previous = useRef<StrategyChart | undefined>(undefined);
  const [diff, setDiff] = useState<{
    changes: readonly ChartChange[];
    changedKeys: ReadonlySet<string>;
  }>({ changes: [], changedKeys: new Set() });

  if (previous.current !== chart) {
    const before = previous.current;
    previous.current = chart;
    if (before) {
      const changes = chartChanges(before, chart);
      // A rule that moves nothing leaves the previous report standing rather than
      // clearing it — the user changed the table minimum, not the strategy, and blanking
      // the panel would read as "your last change was undone".
      if (changes.length > 0) {
        setDiff({ changes, changedKeys: changedCellKeys(changes) });
      }
    }
  }

  return diff;
}

/**
 * The validation banner.
 *
 * `validateRules` is the single source of truth for what is impossible, so the screen
 * reports its reasons verbatim rather than paraphrasing them into a second, drifting copy
 * of the same rules. Nothing is disabled while the Rule Set is invalid — the chart above is
 * still correct, since none of the fields `validateRules` rejects affect strategy — but the
 * invalid table is not persisted, which is what the second line says.
 */
function ProblemPanel({ problems }: { problems: readonly string[] }) {
  return (
    <Panel>
      <Badge label="NOT A PLAYABLE TABLE" tone="bad" />
      {problems.map((problem) => (
        <Text key={problem} style={styles.problem}>
          {problem}
        </Text>
      ))}
      <Text style={styles.problemNote}>
        Fix these and the table saves itself. Until then nothing is written, so your last
        good table is still there next time.
      </Text>
    </Panel>
  );
}

function StorageNote({ status }: { status: RuleSetStatus }) {
  switch (status) {
    case "loading":
      return <Text style={styles.status}>Loading your table…</Text>;
    case "stored":
      return <Text style={styles.status}>Saved on this device. No account, no upload.</Text>;
    case "default":
      return (
        <Text style={styles.status}>
          Showing the default table ({DEFAULT_RULES.decks}-deck Vegas shoe). Any change is
          saved on this device.
        </Text>
      );
    case "unavailable":
      return (
        <Text style={[styles.status, styles.statusBad]}>
          This device will not let us save settings, so your table resets when the app
          restarts. Everything else on this screen still works.
        </Text>
      );
  }
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  pageContent: { flexGrow: 1, paddingBottom: spacing.xl },
  title: { ...type.title, color: colors.text },
  lede: { ...type.body, color: colors.textMuted },
  status: { ...type.caption, color: colors.textMuted, marginTop: spacing.xs },
  statusBad: { color: colors.warning },
  problem: { ...type.caption, color: colors.danger, lineHeight: 19 },
  problemNote: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  resetNote: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
});
