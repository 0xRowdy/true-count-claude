import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Coup } from "@/games/baccarat";
import { colors, ui } from "@/ui/ds";
import { type RoadCell, type RoadView, beadRoadView, bigRoadView } from "./baccaratTable";
import { ArrowLeftRight } from "@/ui/ds/icons";
import { baccaratPalette as pal } from "./palette";

export type RoadKind = "bead" | "big";

const BEAD = 22;
const FILL = { P: pal.beadPlayer, B: pal.beadBanker, T: pal.beadTie } as const;
const NAME = { P: "Player", B: "Banker", T: "Tie" } as const;

/**
 * The scoreboard (design "Bead Road", UFDOD): "BEAD ROAD · THIS SHOE" with the legend counts,
 * a 12 × 6 grid with the latest bead ringed in gold, and a toggle to the big road.
 */
export function Road({
  coups,
  kind,
  onToggle,
}: {
  coups: readonly Coup[];
  kind: RoadKind;
  onToggle: (kind: RoadKind) => void;
}) {
  const view = kind === "bead" ? beadRoadView(coups) : bigRoadView(coups);
  const other: RoadKind = kind === "bead" ? "big" : "bead";
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Show the ${other === "big" ? "big road" : "bead road"}`}
          onPress={() => onToggle(other)}
          hitSlop={12}
          style={styles.title}
        >
          <Text style={[ui(10, 700, { letterSpacing: 1 }), { color: colors.mutedForeground }]}>
            {kind === "bead" ? "BEAD ROAD · THIS SHOE" : "BIG ROAD · THIS SHOE"}
          </Text>
          <ArrowLeftRight size={12} color={colors.primary} strokeWidth={2.25} />
        </Pressable>
        <View style={styles.legend}>
          <Legend color={pal.beadPlayer} label={`Player ${view.legend.player}`} />
          <Legend color={pal.beadBanker} label={`Banker ${view.legend.banker}`} />
          <Legend color={pal.beadTie} label={`Tie ${view.legend.tie}`} />
        </View>
      </View>
      <Grid view={view} kind={kind} />
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[ui(10), { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function Grid({ view, kind }: { view: RoadView; kind: RoadKind }) {
  const at = new Map<string, RoadCell>();
  for (const c of view.cells) at.set(`${c.column},${c.row}`, c);
  const latest = view.cells.find((c) => c.latest);
  const label =
    view.cells.length === 0
      ? `${kind === "bead" ? "Bead" : "Big"} road: no coups yet this shoe`
      : `${kind === "bead" ? "Bead" : "Big"} road: Player ${view.legend.player}, Banker ${view.legend.banker}, Tie ${view.legend.tie}. Latest: ${latest ? NAME[latest.letter] : "none"}`;
  return (
    <View style={styles.grid} accessible accessibilityRole="image" accessibilityLabel={label}>
      {Array.from({ length: view.columns }, (_, col) => (
        <View key={col} style={styles.col}>
          {Array.from({ length: view.rows }, (_, row) => {
            const cell = at.get(`${col},${row}`);
            if (!cell) return <View key={row} style={styles.empty} />;
            return kind === "bead" ? (
              <Bead key={row} cell={cell} />
            ) : (
              <BigBead key={row} cell={cell} />
            );
          })}
        </View>
      ))}
    </View>
  );
}

function Bead({ cell }: { cell: RoadCell }) {
  return (
    <View
      testID={cell.latest ? "latest-bead" : undefined}
      style={[styles.bead, { backgroundColor: FILL[cell.letter] }, cell.latest && styles.latest]}
    >
      <Text style={[ui(10, 800), { color: pal.beadInk }]}>{cell.letter}</Text>
    </View>
  );
}

/** Big road bead: a hollow ring in the winner's colour; ties after it as a green count. */
function BigBead({ cell }: { cell: RoadCell }) {
  return (
    <View
      testID={cell.latest ? "latest-bead" : undefined}
      style={[
        styles.bead,
        styles.ring,
        { borderColor: FILL[cell.letter] },
        cell.latest && { boxShadow: `0px 0px 0px 2px ${colors.primary}` },
      ]}
    >
      {cell.ties > 0 ? <Text style={[ui(9, 800), { color: pal.beadTie }]}>{cell.ties}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, paddingTop: 10, paddingHorizontal: 16, paddingBottom: 12 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 20 },
  legend: { flexDirection: "row", gap: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  grid: {
    flexDirection: "row",
    gap: 3,
    padding: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: pal.roadWell,
  },
  col: { flex: 1, gap: 3, alignItems: "center" },
  empty: {
    width: BEAD,
    height: BEAD,
    borderRadius: BEAD / 2,
    borderWidth: 1,
    borderColor: pal.beadEmpty,
  },
  bead: {
    width: BEAD,
    height: BEAD,
    borderRadius: BEAD / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  latest: { borderWidth: 2, borderColor: colors.primary },
  ring: { borderWidth: 3 },
});
