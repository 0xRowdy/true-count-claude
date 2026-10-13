/**
 * The strategy library (`/strategies`, the "Strategies" nav item): the player's drafts, the
 * curated strategies and the community ranking, filterable by game. Curated and community
 * entries are fixture data in this build (no backend, ADR-0003) and say so.
 */

import { router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, StrategyCard, Tabs, colors, display, ui, icons as ds } from "@/ui/ds";
import { STRATEGY_GAMES, type StrategyDraft, type StrategyGame } from "@/state/strategies";
import { checkChart } from "./blackjack";
import { checkPlan } from "@/games/craps";
import { checkLayout } from "./roulette";
import { deleteDraft, saveDraft, useDrafts } from "./draftStore";
import {
  BUILDER_ROUTES,
  EXAMPLE_IDS,
  GAME_NAMES,
  LIBRARY,
  type LibraryStrategy,
  builderHref,
  communityRanked,
  compactCount,
  draftChangeCount,
  exampleDraft,
  forkStrategy,
  gameLine,
  isExampleId,
  newStrategy,
} from "./library";
import { InfoNote } from "./parts";
import { StrategyShell } from "./StrategyShell";
import { Plus } from "@/ui/ds/icons";

type Filter = "all" | StrategyGame;

const FILTERS: readonly { value: Filter; label: string }[] = [
  { value: "all", label: "All games" },
  ...STRATEGY_GAMES.map((g) => ({ value: g, label: GAME_NAMES[g] })),
];

function rulesOk(d: StrategyDraft): boolean {
  switch (d.game) {
    case "blackjack":
      return checkChart(d).ok;
    case "craps":
      return checkPlan(d.plan).ok;
    case "roulette":
      return checkLayout(d.layout).ok;
  }
}

export function StrategyLibrary() {
  const { drafts, ready, status } = useDrafts();
  const [filter, setFilter] = useState<Filter>("all");
  // Stored drafts are read after mount; until then the section shows a placeholder.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const shown = (g: StrategyGame) => filter === "all" || filter === g;
  const mine: StrategyDraft[] = [...drafts];
  for (const g of STRATEGY_GAMES) {
    if (!mine.some((d) => d.id === EXAMPLE_IDS[g])) mine.push(exampleDraft(g));
  }
  const ids = drafts.map((d) => d.id);

  const open = (d: StrategyDraft) => router.push(builderHref(d.game, d.id));
  const fork = (s: LibraryStrategy) => {
    const f = forkStrategy(s, ids);
    saveDraft(f);
    router.push(builderHref(f.game, f.id));
  };
  const create = (g: StrategyGame) => {
    const d = newStrategy(g, ids);
    saveDraft(d);
    router.push(builderHref(g, d.id));
  };

  const curated = LIBRARY.filter((s) => s.kind === "curated" && shown(s.draft.game));
  const community = communityRanked().filter((s) => shown(s.draft.game));

  return (
    <StrategyShell>
      <View style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headText}>
            <Text
              accessibilityRole="header"
              style={[display(32, 500), { color: colors.foreground }]}
            >
              Strategies
            </Text>
            <Text style={[ui(15, 400, { lineHeight: 22 }), { color: colors.mutedForeground }]}>
              Build a strategy, fork a proven one, and let the coach check you against it. Every
              rule is checked against the real payouts.
            </Text>
          </View>
          <View style={styles.newRow}>
            {STRATEGY_GAMES.map((g) => (
              <Button
                key={g}
                label={`New ${GAME_NAMES[g].toLowerCase()} strategy`}
                variant="secondary"
                icon={Plus}
                onPress={() => create(g)}
              />
            ))}
          </View>
        </View>

        <Tabs
          accessibilityLabel="Filter by game"
          options={FILTERS}
          value={filter}
          onChange={setFilter}
        />

        <Section
          title="My strategies"
          aside={
            status === "unavailable"
              ? "Storage unavailable: drafts last for this visit only"
              : "Saved on this device"
          }
        >
          {!mounted || !ready ? (
            <Text style={[ui(14), { color: colors.mutedForeground }]}>Loading your drafts…</Text>
          ) : (
            <Grid>
              {mine
                .filter((d) => shown(d.game))
                .map((d) => {
                  const changes = draftChangeCount(d);
                  const notes = Object.keys(d.notes).length;
                  return (
                    <Item key={d.id}>
                      <StrategyCard
                        width="auto"
                        title={d.title}
                        game={gameLine(d)}
                        description={
                          d.forkedFrom
                            ? `Forked from ${d.forkedFrom.title}. ${changes} ${changes === 1 ? "change" : "changes"}, ${notes} coach ${notes === 1 ? "note" : "notes"}.`
                            : `${changes} ${changes === 1 ? "change" : "changes"}, ${notes} coach ${notes === 1 ? "note" : "notes"}.`
                        }
                        author={
                          isExampleId(d.id) && !d.savedAt ? "You · example draft" : "You · draft"
                        }
                        verified={rulesOk(d)}
                        onPress={() => open(d)}
                      />
                      <View style={styles.actions}>
                        <Button
                          label="Open"
                          size="sm"
                          variant="secondary"
                          accessibilityLabel={`Open ${d.title}`}
                          onPress={() => open(d)}
                        />
                        {d.savedAt ? (
                          <Button
                            label={isExampleId(d.id) ? "Reset example" : "Delete"}
                            size="sm"
                            variant="ghost"
                            accessibilityLabel={`${isExampleId(d.id) ? "Reset" : "Delete"} ${d.title}`}
                            onPress={() => deleteDraft(d.id)}
                          />
                        ) : null}
                      </View>
                    </Item>
                  );
                })}
            </Grid>
          )}
        </Section>

        <Section title="Curated by Tableside" aside="Examples in this build">
          <Grid>
            {curated.map((s) => (
              <LibraryItem key={s.id} s={s} onFork={() => fork(s)} />
            ))}
          </Grid>
        </Section>

        <Section title="Top community strategies" aside="Example data · no server yet">
          <Grid>
            {community.map((s, i) => (
              <LibraryItem key={s.id} s={s} rank={i + 1} onFork={() => fork(s)} />
            ))}
          </Grid>
        </Section>

        <InfoNote text="Curated and community strategies here are examples: this build has no server, so their votes, forks and learner scores are illustrative, and forks and drafts are saved on this device only." />
      </View>
    </StrategyShell>
  );
}

function LibraryItem({
  s,
  rank,
  onFork,
}: {
  s: LibraryStrategy;
  rank?: number;
  onFork: () => void;
}) {
  const view = () =>
    router.push(`${BUILDER_ROUTES[s.draft.game]}?view=${encodeURIComponent(s.id)}`);
  return (
    <Item>
      <StrategyCard
        width="auto"
        rank={rank}
        title={s.title}
        game={gameLine(s.draft)}
        description={s.description}
        votes={compactCount(s.votes)}
        forks={compactCount(s.forks)}
        accuracy={`Avg. learner ${s.accuracy}%`}
        author={s.author}
        verified={s.verified}
        onPress={view}
      />
      <View style={styles.actions}>
        <Button
          label="Open"
          size="sm"
          variant="secondary"
          accessibilityLabel={`Open ${s.title}`}
          onPress={view}
        />
        <Button
          label="Fork"
          size="sm"
          variant="ghost"
          icon={ds.GitFork}
          accessibilityLabel={`Fork ${s.title}`}
          onPress={onFork}
        />
      </View>
    </Item>
  );
}

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text accessibilityRole="header" style={[display(24, 400), { color: colors.foreground }]}>
          {title}
        </Text>
        {aside ? <Text style={[ui(13), { color: colors.mutedForeground }]}>{aside}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

function Item({ children }: { children: React.ReactNode }) {
  return <View style={styles.item}>{children}</View>;
}

const styles = StyleSheet.create({
  page: { gap: 28 },
  header: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 16,
  },
  headText: { gap: 8, maxWidth: 640 },
  newRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  section: { gap: 14 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  item: { flexGrow: 1, flexBasis: 320, maxWidth: 460, gap: 8 },
  actions: { flexDirection: "row", gap: 8 },
});
