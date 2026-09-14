/**
 * The Shoe, rank by rank — remaining composition, live.
 *
 * A user reported a competitor's double-deck game containing more than twelve 2s
 * (ADR-0004). The defence is not a promise; it is this table, updating as cards come out,
 * with `Left + Dealt` visibly equal to `decks x 4` on every row.
 *
 * The active Counting System's tag sits in the same column as the rank, which is what makes
 * the zero-sum check checkable by hand: multiply each tag by `decks x 4`, add them up, get
 * zero. The two panels are the same claim seen from two directions.
 *
 * Thirteen ranks plus a total will not fit 360pt, so the table scrolls horizontally inside
 * its own container while the row labels stay put. The page itself never scrolls sideways.
 */

import { ScrollView, type StyleProp, StyleSheet, Text, type TextStyle, View } from "react-native";
import { type Rank, RANKS } from "@/engine/cards";
import type { TagTable } from "@/engine/counting";
import type { RankComposition } from "@/engine/shoe";
import { formatSigned } from "./integrity";
import { Badge, Panel } from "@/ui/primitives";
import { colors, radius, spacing, type } from "@/ui/theme";

const ROW_HEIGHT = 26;
const COLUMN_WIDTH = 44;

export function RankTable({
  remaining,
  dealt,
  tags,
  systemName,
  expectedPerRank,
  intact,
}: {
  remaining: RankComposition;
  dealt: RankComposition;
  tags: TagTable;
  systemName: string;
  /** `decks x 4`. Every rank starts here and every column must still add back to it. */
  expectedPerRank: number;
  /** `verifyComposition` — the Shoe holds exactly what it should. */
  intact: boolean;
}) {
  const totalRemaining = RANKS.reduce((sum, rank) => sum + remaining[rank], 0);
  const totalDealt = RANKS.reduce((sum, rank) => sum + dealt[rank], 0);
  const conserved = RANKS.every((rank) => remaining[rank] + dealt[rank] === expectedPerRank);

  return (
    <Panel title="The Shoe, rank by rank">
      <View style={styles.badges}>
        <Badge
          label={intact ? "COMPOSITION VERIFIED" : "COMPOSITION FAILED"}
          tone={intact ? "good" : "bad"}
        />
        <Badge
          label={conserved ? "EVERY RANK ADDS BACK" : "CARDS UNACCOUNTED FOR"}
          tone={conserved ? "good" : "bad"}
        />
      </View>

      <Text style={styles.prose}>
        Every rank started at <Text style={styles.strong}>{expectedPerRank}</Text>, and Left plus
        Dealt still adds back to {expectedPerRank} on every column. The tag row is{" "}
        {systemName}&apos;s — multiply each tag by {expectedPerRank}, add the row up, and you get
        the Shoe&apos;s total count.
      </Text>

      <View style={styles.table}>
        <View style={styles.labelColumn}>
          <Cell text="Rank" style={styles.labelCell} />
          <Cell text="Tag" style={styles.labelCell} />
          <Cell text="Left" style={styles.labelCell} />
          <Cell text="Dealt" style={styles.labelCell} />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          contentContainerStyle={styles.scrollRow}
        >
          {RANKS.map((rank) => (
            <RankColumn
              key={rank}
              rank={rank}
              tag={tags[rank]}
              remaining={remaining[rank]}
              dealt={dealt[rank]}
            />
          ))}
          <View style={[styles.column, styles.totalColumn]}>
            <Cell text="All" style={styles.headerCell} />
            <Cell text="—" style={styles.mutedCell} />
            <Cell text={String(totalRemaining)} style={styles.valueCell} />
            <Cell text={String(totalDealt)} style={styles.valueCell} />
          </View>
        </ScrollView>
      </View>
    </Panel>
  );
}

function RankColumn({
  rank,
  tag,
  remaining,
  dealt,
}: {
  rank: Rank;
  tag: number;
  remaining: number;
  dealt: number;
}) {
  const tagColor = tag > 0 ? colors.accent : tag < 0 ? colors.danger : colors.textMuted;
  return (
    <View style={styles.column}>
      <Cell text={rank} style={styles.headerCell} />
      <Cell text={formatSigned(tag)} style={[styles.valueCell, { color: tagColor }]} />
      <Cell
        text={String(remaining)}
        style={[styles.valueCell, remaining === 0 && styles.exhausted]}
      />
      <Cell text={String(dealt)} style={styles.mutedCell} />
    </View>
  );
}

function Cell({ text, style }: { text: string; style: StyleProp<TextStyle> }) {
  return (
    <View style={styles.cell}>
      <Text style={style} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  prose: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  strong: { color: colors.text, fontWeight: "700" },
  table: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    overflow: "hidden",
  },
  labelColumn: {
    borderRightWidth: 1,
    borderRightColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: spacing.sm,
  },
  scrollRow: { flexDirection: "row" },
  column: { width: COLUMN_WIDTH, alignItems: "center" },
  totalColumn: {
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  cell: { height: ROW_HEIGHT, justifyContent: "center", alignItems: "center" },
  labelCell: { ...type.caption, color: colors.textMuted },
  headerCell: { ...type.mono, ...type.caption, color: colors.text, fontWeight: "700" },
  valueCell: { ...type.mono, ...type.caption, color: colors.text },
  mutedCell: { ...type.mono, ...type.caption, color: colors.textMuted },
  exhausted: { color: colors.warning },
});
