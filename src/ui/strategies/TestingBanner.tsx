/**
 * The table side of "Test in trainer": which strategy is being tested, from `?strategy=<id>`.
 * Query and storage are read after mount (the web export is prerendered without either), so
 * the first render never shows a banner and hydration matches.
 */

import { Link, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, colors, Notice, ui } from "@/ui/ds";
import type { StrategyGame } from "@/state/strategies";
import { useDrafts } from "./draftStore";
import { BUILDER_ROUTES, EXAMPLE_IDS, builderHref, gameLine } from "./library";
import { type GameDraft, findTestedStrategy } from "./testedStrategy";

export type TestedStrategy<G extends StrategyGame> =
  | { status: "none" }
  | { status: "missing"; id: string }
  | { status: "ready"; id: string; draft: GameDraft<G> };

/** The strategy this table was opened to test, if any. */
export function useTestedStrategy<G extends StrategyGame>(game: G): TestedStrategy<G> {
  const params = useLocalSearchParams<{ strategy?: string }>();
  const { drafts, ready } = useDrafts();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const id = typeof params.strategy === "string" && params.strategy.trim() ? params.strategy : null;
  if (!mounted || !ready || id === null) return { status: "none" };
  const draft = findTestedStrategy(game, id, drafts);
  return draft ? { status: "ready", id, draft } : { status: "missing", id };
}

function editHref(game: StrategyGame, id: string, own: boolean): string {
  return own ? builderHref(game, id) : `${BUILDER_ROUTES[game]}?view=${encodeURIComponent(id)}`;
}

/**
 * "Testing: <draft name>", dismissible. `detail` says what the table does with the strategy
 * (blackjack coaches against its chart; the other tables show it for reference).
 */
export function TestingBanner<G extends StrategyGame>({
  game,
  tested,
  detail,
  action,
}: {
  game: G;
  tested: TestedStrategy<G>;
  /** What the table does with the strategy; may read the draft. */
  detail: string | ((draft: GameDraft<G>) => string);
  /** What the table can do with the strategy ("Place its bets"). */
  action?: { label: string; onPress: (draft: GameDraft<G>) => void };
}) {
  const [dismissed, setDismissed] = useState(false);
  const { drafts } = useDrafts();
  if (dismissed || tested.status === "none") return null;
  if (tested.status === "missing") {
    return (
      <Notice
        title="That strategy isn't on this device"
        body="Drafts live in this browser only. Open the strategy library to pick one to test."
        onClose={() => setDismissed(true)}
        closeLabel="Dismiss strategy banner"
        style={styles.banner}
      >
        <Link href="/strategies" style={[ui(13, 600), { color: colors.primary }]}>
          Strategy library
        </Link>
      </Notice>
    );
  }
  // The player's drafts (and the example, which the builder treats as one) open for editing;
  // a library strategy opens read-only.
  const own = drafts.some((d) => d.id === tested.id) || tested.id === EXAMPLE_IDS[game];
  return (
    <Notice
      title={`Testing: ${tested.draft.title}`}
      body={`${gameLine(tested.draft)}. ${typeof detail === "function" ? detail(tested.draft) : detail}`}
      onClose={() => setDismissed(true)}
      closeLabel="Dismiss strategy banner"
      style={styles.banner}
    >
      <View style={styles.actions}>
        {action ? (
          <Button
            label={action.label}
            size="sm"
            variant="secondary"
            onPress={() => action.onPress(tested.draft)}
          />
        ) : null}
        <Link
          href={editHref(game, tested.draft.id, own)}
          style={[ui(13, 600), { color: colors.primary }]}
        >
          Open in the builder
        </Link>
      </View>
    </Notice>
  );
}

const styles = StyleSheet.create({
  banner: { marginHorizontal: 16, marginTop: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 16, marginTop: 6 },
});
