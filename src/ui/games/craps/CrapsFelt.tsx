import { useId, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import {
  type CrapsTable,
  type PointNumber,
  POINT_NUMBERS,
  fieldPaysText,
  formatDollars,
  isWorking,
  payoutLabel,
} from "@/games/craps";
import { Die, type DieValue } from "@/ui/ds/Die";
import { CHIP_VALUES, chipColors, type ChipValue } from "@/ui/ds/format";
import { colors, display, radius, surfaces, ui } from "@/ui/ds/tokens";
import { LayoutGrid } from "./icons";
import {
  type Call,
  type FeltChip,
  type Spot,
  type WinTag,
  betAt,
  lineChips,
  numberChips,
  spotKey,
  spotName,
  stakeOn,
} from "./model";
import { craps } from "./theme";

const WORDS: Partial<Record<PointNumber, string>> = { 6: "SIX", 9: "NINE" };

/** The chip colour for an amount: the largest denomination it holds. */
function chipFor(amount: number): ChipValue {
  let v: ChipValue = 1;
  for (const c of CHIP_VALUES) if (amount >= c) v = c;
  return v;
}

/** "12", "250", "1.5K" — fits a 28pt chip. */
function shortAmount(amount: number): string {
  if (amount < 1000) return String(amount);
  const k = Math.floor(amount / 100) / 10;
  return `${k}K`;
}

/** A 28pt chip on the felt showing the amount bet. */
export function MiniChip({ amount, dim = false }: { amount: number; dim?: boolean }) {
  const { fill, ink } = chipColors(chipFor(amount));
  return (
    <View style={[styles.mini, { backgroundColor: fill }, dim && styles.dim]}>
      <Text style={[ui(amount >= 1000 ? 9 : 10, 800), { color: ink }]} numberOfLines={1}>
        {shortAmount(amount)}
      </Text>
    </View>
  );
}

export function Puck({ on }: { on: boolean }) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={on ? "Puck on" : "Puck off"}
      style={[
        styles.puck,
        on
          ? { backgroundColor: craps.puckOn, borderColor: craps.puckOff }
          : { backgroundColor: craps.puckOff, borderColor: craps.puckOn },
      ]}
    >
      <Text style={[ui(10, 800), { color: on ? craps.puckOff : craps.puckOn }]}>
        {on ? "ON" : "OFF"}
      </Text>
    </View>
  );
}

function Win({ tag, compact = false }: { tag: WinTag; compact?: boolean }) {
  return (
    <View
      style={[styles.win, compact && styles.winCompact]}
      accessibilityLabel={`Won ${tag.amount}`}
    >
      <Text style={[ui(compact ? 11 : 14, 800), { color: craps.winInk }]}>{tag.amount}</Text>
      {tag.breakdown && !compact ? (
        <Text style={[ui(9, 600), { color: craps.winInkMuted }]}>{tag.breakdown}</Text>
      ) : null}
    </View>
  );
}

export interface FeltProps {
  table: CrapsTable;
  point: PointNumber | null;
  call: Call;
  dice: { d1: number; d2: number } | null;
  rolling: boolean;
  wins: Record<string, WinTag>;
  /** The chip a tap bets (and a long-press takes off). */
  chip: number;
  onSpot: (spot: Spot) => void;
  onRemove: (spot: Spot) => void;
  onCenter: () => void;
}

/**
 * The phone craps layout of frame 06 (lUiCl): the dice and roll call, the six box numbers with
 * the puck, come, field, don't come with the Center bets sheet, the pass line with your chips and
 * odds, and the don't pass bar. Tap a spot to bet the selected chip; long-press to take it off.
 */
export function CrapsFelt({
  table,
  point,
  call,
  dice,
  rolling,
  wins,
  chip,
  onSpot,
  onRemove,
  onCenter,
}: FeltProps) {
  const spot = (s: Spot, style: StyleProp<ViewStyle>, children: ReactNode, extraLabel = "") => {
    const stake = stakeOn(table, s);
    const bet = betAt(table, s);
    const off = bet ? !isWorking(bet, table.point, table.rules) : false;
    const name = spotName(s);
    const label = `${name}${extraLabel}${stake > 0 ? `, your bet ${formatDollars(stake)}${off ? ", off" : ""}` : ""}`;
    return (
      <Pressable
        key={spotKey(s)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={`Tap to bet ${formatDollars(chip)}, long-press to take it off`}
        onPress={() => onSpot(s)}
        onLongPress={() => onRemove(s)}
        delayLongPress={450}
        style={({ pressed }) => [styles.box, style, pressed && styles.pressed]}
      >
        {children}
      </Pressable>
    );
  };

  const pass = lineChips(table, "pass");
  const dontPass = lineChips(table, "dontPass");
  const comeStake = stakeOn(table, { kind: "come" });
  const dontComeStake = stakeOn(table, { kind: "dontCome" });
  const fieldStake = stakeOn(table, { kind: "field" });

  return (
    <Felt>
      <View style={styles.diceRow}>
        {dice ? (
          <View style={[styles.dice, rolling && styles.rolling]} accessibilityLabel="Last roll">
            <Die value={dice.d1 as DieValue} rotation={-8} />
            <Die value={dice.d2 as DieValue} rotation={6} />
          </View>
        ) : null}
        <View style={styles.call}>
          <Text
            accessibilityRole="header"
            aria-level={2}
            aria-live="polite"
            style={[display(24, 500), { color: colors.feltText }]}
          >
            {call.headline}
          </Text>
          <Text style={[ui(13, 600), { color: craps.callSub }]}>{call.detail}</Text>
        </View>
      </View>

      <View style={styles.numbers}>
        {POINT_NUMBERS.map((n) => {
          const chips = numberChips(table, n);
          const word = WORDS[n];
          const win = wins[`place-${n}`];
          const placed = chips.filter((c) => !c.label);
          const come = chips.filter((c) => c.label);
          const comeText = come.length
            ? `, come bets ${come.map((c) => `${c.label === "C" ? "come" : "don't come"} ${formatDollars(c.amount)}`).join(", ")}`
            : "";
          return spot(
            { kind: "place", number: n },
            styles.number,
            <>
              <Text style={[display(word ? 15 : 22, 600), { color: colors.feltText }]}>
                {word ?? String(n)}
              </Text>
              <Text style={[ui(10), { color: surfaces.feltTextFaint }]}>
                {payoutLabel("place", n)}
              </Text>
              {point === n ? (
                <View style={styles.puckOnNumber} pointerEvents="none">
                  <Puck on />
                </View>
              ) : null}
              <ChipRow chips={placed} style={styles.numberChip} table={table} />
              <ChipRow chips={come} style={styles.comeChip} table={table} />
              {win ? (
                <View style={styles.numberWin} pointerEvents="none">
                  <Win tag={win} compact />
                </View>
              ) : null}
            </>,
            comeText,
          );
        })}
      </View>

      {spot(
        { kind: "come" },
        styles.come,
        <>
          <Text style={[display(20, 600, { letterSpacing: 2 }), { color: colors.feltText }]}>
            COME
          </Text>
          <Text style={[ui(10), { color: surfaces.feltTextFaint }]}>pays 1:1</Text>
          {comeStake > 0 ? (
            <View style={styles.stripChip} pointerEvents="none">
              <MiniChip amount={comeStake} />
            </View>
          ) : null}
          {wins.come ? (
            <View style={styles.stripWin} pointerEvents="none">
              <Win tag={wins.come} />
            </View>
          ) : null}
        </>,
      )}

      {spot(
        { kind: "field" },
        styles.field,
        <>
          <Text style={[display(20, 600, { letterSpacing: 2 }), { color: colors.feltText }]}>
            FIELD
          </Text>
          <Text style={[ui(10), styles.centerText, { color: surfaces.feltTextFaint }]}>
            {`2 · 3 · 4 · 9 · 10 · 11 · 12   •   ${fieldPaysText(table.rules)}`}
          </Text>
          {fieldStake > 0 ? (
            <View style={styles.stripChip} pointerEvents="none">
              <MiniChip amount={fieldStake} />
            </View>
          ) : null}
          {wins.field ? (
            <View style={styles.stripWin} pointerEvents="none">
              <Win tag={wins.field} />
            </View>
          ) : null}
        </>,
      )}

      <View style={styles.dontRow}>
        {spot(
          { kind: "dontCome" },
          styles.dontCome,
          <>
            <Text style={[ui(11, 700, { letterSpacing: 1 }), { color: colors.feltText }]}>
              {"DON'T COME · BAR 12"}
            </Text>
            {point === null ? (
              <View style={styles.offPuck} pointerEvents="none">
                <Puck on={false} />
              </View>
            ) : null}
            {dontComeStake > 0 ? (
              <View style={styles.dontChip} pointerEvents="none">
                <MiniChip amount={dontComeStake} />
              </View>
            ) : null}
          </>,
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Center bets"
          accessibilityHint="Hardways and one-roll bets"
          onPress={onCenter}
          style={({ pressed }) => [styles.box, styles.centerButton, pressed && styles.pressed]}
        >
          <LayoutGrid size={14} color={colors.feltText} strokeWidth={2} />
          <Text style={[ui(12, 700), { color: colors.feltText }]}>Center bets</Text>
        </Pressable>
      </View>

      {spot(
        { kind: "pass" },
        [styles.pass, pass.flat > 0 && styles.mine],
        <>
          <Text style={[display(20, 600, { letterSpacing: 2 }), { color: colors.feltText }]}>
            PASS LINE
          </Text>
          <LineStack line={pass} />
          {wins.pass ? (
            <View style={styles.lineWin} pointerEvents="none">
              <Win tag={wins.pass} />
            </View>
          ) : null}
        </>,
        pass.odds > 0 ? ` with ${formatDollars(pass.odds)} odds` : "",
      )}

      {spot(
        { kind: "dontPass" },
        [styles.dontPass, dontPass.flat > 0 && styles.mine],
        <>
          <Text style={[display(15, 600, { letterSpacing: 2 }), { color: colors.feltText }]}>
            {"DON'T PASS BAR"}
          </Text>
          <LineStack line={dontPass} />
          {wins.dontPass ? (
            <View style={styles.lineWinSmall} pointerEvents="none">
              <Win tag={wins.dontPass} compact />
            </View>
          ) : null}
        </>,
        dontPass.odds > 0 ? ` laying ${formatDollars(dontPass.odds)}` : "",
      )}
    </Felt>
  );
}

function ChipRow({
  chips,
  style,
  table,
}: {
  chips: readonly FeltChip[];
  style: StyleProp<ViewStyle>;
  table: CrapsTable;
}) {
  if (chips.length === 0) return null;
  const total = chips.reduce((s, c) => s + c.amount, 0);
  const bet = table.bets.find((b) => b.id === chips[0]!.key);
  const off = bet ? !isWorking(bet, table.point, table.rules) : false;
  return (
    <View style={style} pointerEvents="none">
      <MiniChip amount={total} dim={off} />
      {off || chips[0]!.label ? (
        <View style={styles.chipTag}>
          <Text style={[ui(7, 800, { letterSpacing: 0.5 }), { color: colors.feltText }]}>
            {[chips[0]!.label, off ? "OFF" : null].filter(Boolean).join(" ")}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function LineStack({ line }: { line: ReturnType<typeof lineChips> }) {
  if (line.flat <= 0) return null;
  return (
    <>
      <View style={styles.flatChip} pointerEvents="none">
        <MiniChip amount={line.flat} />
      </View>
      {line.odds > 0 ? (
        <>
          <View style={styles.oddsChip} pointerEvents="none">
            <MiniChip amount={line.odds} />
          </View>
          <View style={styles.oddsTag} pointerEvents="none">
            <Text style={[ui(8, 800, { letterSpacing: 0.5 }), { color: colors.feltText }]}>
              {line.oddsLabel}
            </Text>
          </View>
        </>
      ) : null}
    </>
  );
}

function Felt({ children }: { children: ReactNode }) {
  const id = `f${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <View style={styles.felt}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id={id} cx={0.5} cy={0.3} rx={0.8} ry={0.65} fx={0.5} fy={0.3}>
            <Stop offset={0} stopColor={craps.feltGlow} />
            <Stop offset={1} stopColor={craps.feltDeep} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  felt: { gap: 6, padding: 12, backgroundColor: colors.feltDeep, overflow: "hidden" },
  diceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingTop: 8,
    paddingHorizontal: 8,
    paddingBottom: 12,
    minHeight: 72,
  },
  dice: { flexDirection: "row", gap: 8, height: 52, alignItems: "center" },
  rolling: { opacity: 0.35 },
  call: { flex: 1, gap: 2 },
  numbers: { flexDirection: "row", gap: 4 },
  box: {
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.feltLine,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  number: { flex: 1, height: 68 },
  puckOnNumber: { position: "absolute", top: -12, alignSelf: "center" },
  numberChip: { position: "absolute", top: 42, alignSelf: "center", alignItems: "center" },
  comeChip: { position: "absolute", top: 2, right: 2, alignItems: "center" },
  numberWin: { position: "absolute", top: 2, left: 2 },
  come: { height: 52 },
  field: { height: 56 },
  centerText: { textAlign: "center", paddingHorizontal: 8 },
  stripChip: { position: "absolute", left: 24, top: 0, bottom: 0, justifyContent: "center" },
  stripWin: { position: "absolute", right: 12, top: 0, bottom: 0, justifyContent: "center" },
  dontRow: { flexDirection: "row", gap: 4 },
  dontCome: { flex: 1, height: 44 },
  offPuck: { position: "absolute", left: 8, top: 0, bottom: 0, justifyContent: "center" },
  dontChip: { position: "absolute", right: 8, top: 0, bottom: 0, justifyContent: "center" },
  centerButton: {
    width: 128,
    height: 44,
    flexDirection: "row",
    gap: 6,
    backgroundColor: craps.centerButton,
  },
  pass: { height: 64 },
  mine: { borderColor: colors.primary, borderWidth: 2 },
  dontPass: { height: 44 },
  flatChip: { position: "absolute", left: 60, top: 18 },
  oddsChip: { position: "absolute", left: 94, top: 18 },
  oddsTag: {
    position: "absolute",
    left: 86,
    top: 46,
    backgroundColor: craps.oddsTag,
    borderRadius: 4,
    paddingVertical: 1,
    paddingHorizontal: 5,
  },
  lineWin: { position: "absolute", right: 30, top: 0, bottom: 0, justifyContent: "center" },
  lineWinSmall: { position: "absolute", right: 12, top: 0, bottom: 0, justifyContent: "center" },
  win: {
    backgroundColor: craps.win,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  winCompact: { borderRadius: 6, paddingVertical: 1, paddingHorizontal: 4 },
  mini: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: craps.chipRim,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: craps.chipShadow,
  },
  dim: { opacity: 0.55 },
  chipTag: {
    position: "absolute",
    top: 20,
    alignSelf: "center",
    backgroundColor: craps.oddsTag,
    borderRadius: 3,
    paddingHorizontal: 3,
  },
  puck: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.8 },
});
