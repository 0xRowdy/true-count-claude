import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { AppShell } from "@/ui/ds/AppShell";
import { colors, display, radius, ui } from "@/ui/ds/tokens";
import { Armchair, Bot, CircleDot, Dices, Spade } from "./icons";
import { type LiveTableEntry, type TableIcon, liveTables, withReplayParams } from "./tables";

const ICONS: Record<TableIcon, typeof Dices> = {
  dices: Dices,
  spade: Spade,
  "circle-dot": CircleDot,
};

const HOW = [
  {
    title: "Simulated players",
    body: "The other seats are bots with real bet styles: pass and odds, don't pass, Iron Cross, come and field. They run on this device from a seed, so a table can be replayed roll for roll.",
  },
  {
    title: "Ranked on decisions",
    body: "The leaderboard ranks how well each seat bets (odds and low-edge bets count as good decisions), not who won the most chips.",
  },
  {
    title: "Practice chips only",
    body: "No accounts, no real money, nothing leaves your device. Chat stays on this table.",
  },
];

function TableRow({ table, search }: { table: LiveTableEntry; search: string }) {
  const Icon = ICONS[table.icon];
  const body = (
    <>
      <View style={styles.icon}>
        <Icon size={18} color={colors.feltText} strokeWidth={2} />
      </View>
      <View style={styles.text}>
        <Text style={[ui(14, 600), { color: colors.foreground }]}>{table.title}</Text>
        <Text style={[ui(12), { color: colors.mutedForeground }]}>{table.description}</Text>
      </View>
    </>
  );
  if (table.href && table.seats) {
    return (
      <Link href={withReplayParams(table.href, search)} asChild>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Join ${table.title}, ${table.seats} seats taken`}
          style={StyleSheet.flatten([styles.row])}
        >
          {body}
          <View style={styles.join}>
            <View style={styles.seats}>
              <Armchair size={13} color={colors.mutedForeground} strokeWidth={2} />
              <Text style={[ui(12), { color: colors.mutedForeground }]}>{table.seats}</Text>
            </View>
            <Text style={[ui(14, 600), { color: colors.primary }]}>Join</Text>
          </View>
        </Pressable>
      </Link>
    );
  }
  return (
    <View style={styles.row}>
      {body}
      <View style={styles.join}>
        <Text style={[ui(12), { color: colors.mutedForeground }]}>Opens soon</Text>
        <Link href={table.soloHref} asChild>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Play ${table.title.split(" · ")[0]} solo`}
            hitSlop={10}
          >
            <Text style={[ui(14, 600), { color: colors.primary }]}>Play solo</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

/** `/live`: the live tables list, in the lobby panel's visual language (ZDK1x "Live tables"). */
export function LiveTablesScreen() {
  const tables = liveTables();
  // Replay params are read after mount: the prerendered HTML has no query string (hydration).
  const [search, setSearch] = useState("");
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") setSearch(window.location.search);
  }, []);

  return (
    <AppShell active="live">
      <View style={styles.page} onLayout={(e) => setNarrow(e.nativeEvent.layout.width < 900)}>
        <View style={styles.intro}>
          <Text accessibilityRole="header" aria-level={1} style={[display(40, 500), styles.title]}>
            Live tables
          </Text>
          <Text style={[ui(15), { color: colors.mutedForeground }]}>
            Sit down at a practice table with a full rail. The other players are simulated on this
            device, so the table never waits on anyone and nothing costs real money.
          </Text>
        </View>
        <View style={[styles.columns, narrow && styles.columnsStacked]}>
          <View style={[styles.panel, styles.list]}>
            <View style={styles.head}>
              <View style={styles.headTitle}>
                <View style={styles.dot} />
                <Text
                  accessibilityRole="header"
                  style={[ui(17, 600), { color: colors.foreground }]}
                >
                  Practice tables
                </Text>
              </View>
              <View style={styles.headTitle}>
                <Bot size={14} color={colors.mutedForeground} strokeWidth={2} />
                <Text style={[ui(13), { color: colors.mutedForeground }]}>Simulated players</Text>
              </View>
            </View>
            {tables.map((t) => (
              <TableRow key={t.id} table={t} search={search} />
            ))}
          </View>
          <View style={[styles.panel, styles.how, narrow && styles.howStacked]}>
            <Text accessibilityRole="header" style={[ui(17, 600), { color: colors.foreground }]}>
              How practice tables work
            </Text>
            {HOW.map((h) => (
              <View key={h.title} style={styles.howItem}>
                <Text style={[ui(14, 600), { color: colors.foreground }]}>{h.title}</Text>
                <Text style={[ui(13, 400, { lineHeight: 19 }), { color: colors.mutedForeground }]}>
                  {h.body}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  page: { gap: 28 },
  intro: { gap: 8, maxWidth: 720 },
  title: { color: colors.foreground },
  columns: { flexDirection: "row", gap: 24, alignItems: "flex-start" },
  columnsStacked: { flexDirection: "column", alignItems: "stretch" },
  panel: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  list: { flex: 1, alignSelf: "stretch" },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  headTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.correct },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    minHeight: 68,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.felt,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, gap: 3, minWidth: 0 },
  join: { alignItems: "flex-end", gap: 4 },
  seats: { flexDirection: "row", alignItems: "center", gap: 4 },
  how: { width: 360, padding: 20, gap: 14 },
  howStacked: { width: "100%" },
  howItem: { gap: 4 },
});
