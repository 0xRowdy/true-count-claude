import { useId, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type DimensionValue } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import {
  type LiveTableState,
  type PointNumber,
  POINT_NUMBERS,
  fieldPaysText,
  formatDollars,
  payoutLabel,
} from "@/games/craps";
import { Die, type DieValue } from "@/ui/ds/Die";
import { colors, display, radius, surfaces, textScale, ui } from "@/ui/ds/tokens";
import { Info, Timer } from "@/ui/ds/icons";
import { type ChipView, type Spot, chipText, chipsOn, yourLineTag, yourStakeOn } from "./session";
import { live } from "./theme";

const WORDS: Partial<Record<PointNumber, string>> = { 6: "SIX", 9: "NINE" };

/** A practice chip as the felt draws it: 30pt, the owner's colour, a light rim. */
function FeltChip({ chip }: { chip: ChipView }) {
  const ink = chip.mine ? colors.primaryForeground : live.white;
  return (
    <View style={[styles.chip, { backgroundColor: chip.color }]}>
      <Text
        style={[ui(10, 800), { color: ink }]}
        numberOfLines={1}
        maxFontSizeMultiplier={textScale.fixed}
      >
        {chipText(chip.amount)}
      </Text>
    </View>
  );
}

function ChipStack({ chips, max = 3 }: { chips: readonly ChipView[]; max?: number }) {
  if (chips.length === 0) return null;
  const shown = chips.length > max ? chips.slice(chips.length - max) : chips;
  return (
    <View style={styles.stack} pointerEvents="none">
      {shown.map((c) => (
        <FeltChip key={c.key} chip={c} />
      ))}
    </View>
  );
}

function Puck({ on, size = 30 }: { on: boolean; size?: number }) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={on ? "Puck on" : "Puck off"}
      style={[
        styles.puck,
        { width: size, height: size, borderRadius: size / 2 },
        on
          ? { backgroundColor: live.puckOn, borderColor: live.puckOff }
          : { backgroundColor: live.puckOff, borderColor: live.puckOn },
      ]}
    >
      <Text style={[ui(size < 30 ? 8 : 10, 800), { color: on ? live.puckOff : live.puckOn }]}>
        {on ? "ON" : "OFF"}
      </Text>
    </View>
  );
}

/** One betting area. Tapping it bets the selected chip there. */
function SpotBox({
  label,
  mine,
  onPress,
  style,
  children,
}: {
  label: string;
  mine: number;
  onPress: () => void;
  style: object | object[];
  children: ReactNode;
}) {
  const a11y = mine > 0 ? `${label}, your bet ${formatDollars(mine)}` : label;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      style={({ pressed }) => [style, mine > 0 && styles.mine, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

function Felt({ children }: { children: ReactNode }) {
  const id = `f${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <View style={styles.felt}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id={id} cx={0.45} cy={0.4} rx={0.7} ry={0.8} fx={0.45} fy={0.4}>
              <Stop offset={0} stopColor={live.feltGlow} />
              <Stop offset={1} stopColor={live.feltDeep} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width="100%" height="100%" rx={18} ry={18} fill={`url(#${id})`} />
        </Svg>
      </View>
      {children}
    </View>
  );
}

/**
 * The craps layout of design 11 (QEqUW): the roll call and the bet timer, the six box numbers
 * with the puck and every player's chips, come, field, don't come, the pass line with your tag,
 * the don't pass bar, and the center bets column.
 */
export function CrapsFelt({
  state,
  timer,
  onSpot,
}: {
  state: LiveTableState;
  /** "Bets close in 0:12", or null before the timer starts. */
  timer: string;
  onSpot: (spot: Spot) => void;
}) {
  const [width, setWidth] = useState<number | null>(null);
  const narrow = width !== null && width < 760;
  const { table, last } = state;
  const point = table.point;

  const box = (spot: Spot) => ({
    chips: chipsOn(table, spot),
    mine: yourStakeOn(table, spot),
  });

  const lineChips = (kind: "pass" | "dontPass") => {
    const chips = chipsOn(table, { kind });
    return { theirs: chips.filter((c) => !c.mine), mine: chips.filter((c) => c.mine) };
  };
  const pass = lineChips("pass");
  const dontPass = lineChips("dontPass");
  const passTag = yourLineTag(table, "pass");
  const dontTag = yourLineTag(table, "dontPass");

  const strip = (
    spot: Spot,
    label: string,
    height: number,
    content: ReactNode,
    chipLeft: DimensionValue,
  ) => {
    const b = box(spot);
    return (
      <SpotBox
        label={label}
        mine={b.mine}
        onPress={() => onSpot(spot)}
        style={[styles.strip, narrow ? styles.stripNarrow : { height }]}
      >
        {content}
        <View
          style={narrow ? styles.inflow : [styles.stripChips, { left: chipLeft }]}
          pointerEvents="none"
        >
          <ChipStack chips={b.chips} max={narrow ? 6 : 4} />
        </View>
      </SpotBox>
    );
  };

  const line = (
    kind: "pass" | "dontPass",
    label: string,
    title: ReactNode,
    height: number,
    chips: { theirs: ChipView[]; mine: ChipView[] },
    tag: string | null,
  ) => (
    <SpotBox
      label={label}
      mine={chips.mine.reduce((s, c) => s + c.amount, 0)}
      onPress={() => onSpot({ kind })}
      style={[styles.strip, narrow ? styles.stripNarrow : { height }]}
    >
      {title}
      <View
        style={narrow ? styles.inflow : [styles.stripChips, { left: "8%" }]}
        pointerEvents="none"
      >
        <ChipStack chips={chips.theirs} max={narrow ? 6 : 4} />
      </View>
      {chips.mine.length ? (
        <View
          style={narrow ? styles.inflow : [styles.yours, { right: "22%" }]}
          pointerEvents="none"
        >
          {tag ? (
            <View style={styles.youTag}>
              <Text
                style={[ui(9, 800), { color: colors.primaryForeground }]}
                maxFontSizeMultiplier={textScale.fixed}
              >
                {tag}
              </Text>
            </View>
          ) : null}
          <ChipStack chips={chips.mine} />
        </View>
      ) : null}
    </SpotBox>
  );

  const center = (
    <View style={[styles.center, narrow && styles.centerNarrow]}>
      <Text style={[ui(11, 700, { letterSpacing: 1.5 }), { color: colors.feltText }]}>
        CENTER BETS
      </Text>
      {(
        [
          [6, 8],
          [4, 10],
        ] as const
      ).map((row) => (
        <View key={row.join("-")} style={styles.hardRow}>
          {row.map((n) => {
            const spot: Spot = { kind: "hard", number: n };
            const b = box(spot);
            return (
              <SpotBox
                key={n}
                label={`Hard ${n}`}
                mine={b.mine}
                onPress={() => onSpot(spot)}
                style={styles.hard}
              >
                <Text style={[ui(13, 700), { color: colors.feltText }]}>Hard {n}</Text>
                <Text style={[ui(11), { color: surfaces.feltTextMuted }]}>
                  {payoutLabel("hard", n)}
                </Text>
                <View style={styles.hardChips} pointerEvents="none">
                  <ChipStack chips={b.chips} max={2} />
                </View>
              </SpotBox>
            );
          })}
        </View>
      ))}
      {(
        [
          ["anySeven", "Any Seven"],
          ["anyCraps", "Any Craps"],
          ["yo", "Yo (11)"],
        ] as const
      ).map(([bet, label]) => {
        const spot: Spot = { kind: "oneRoll", bet };
        const b = box(spot);
        return (
          <SpotBox
            key={bet}
            label={label}
            mine={b.mine}
            onPress={() => onSpot(spot)}
            style={[styles.oneRoll, bet === "anySeven" && { backgroundColor: live.anySeven }]}
          >
            <Text style={[ui(13, 700), { color: colors.feltText }]}>{label}</Text>
            <View style={styles.oneRollRight}>
              <ChipStack chips={b.chips} max={2} />
              <Text style={[ui(12), { color: surfaces.feltTextMuted }]}>{payoutLabel(bet)}</Text>
            </View>
          </SpotBox>
        );
      })}
      {/* Aces (2) and twelve (12) share a box on the layout; each word is its own bet. */}
      <View style={styles.oneRoll}>
        <View style={styles.acesRow}>
          {(
            [
              ["aces", "Aces"],
              ["twelve", "Twelve"],
            ] as const
          ).map(([bet, label], i) => {
            const spot: Spot = { kind: "oneRoll", bet };
            const mine = yourStakeOn(table, spot);
            return (
              <View key={bet} style={styles.acesRow}>
                {i > 0 ? (
                  <Text style={[ui(13, 700), { color: colors.feltText }]}>{" / "}</Text>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    mine > 0 ? `${label}, your bet ${formatDollars(mine)}` : label
                  }
                  onPress={() => onSpot(spot)}
                  hitSlop={{ top: 12, bottom: 12, left: 4, right: 4 }}
                >
                  <Text
                    style={[ui(13, 700), { color: mine > 0 ? colors.primary : colors.feltText }]}
                  >
                    {label}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
        <View style={styles.oneRollRight}>
          <ChipStack
            chips={[
              ...chipsOn(table, { kind: "oneRoll", bet: "aces" }),
              ...chipsOn(table, { kind: "oneRoll", bet: "twelve" }),
            ]}
            max={2}
          />
          <Text style={[ui(12), { color: surfaces.feltTextMuted }]}>{payoutLabel("aces")}</Text>
        </View>
      </View>
      <View style={styles.edgeNote}>
        <Info size={12} color={surfaces.feltTextMuted} strokeWidth={2} />
        <Text style={[ui(11), styles.flex, { color: surfaces.feltTextMuted }]}>
          House edge 9–17% on center bets
        </Text>
      </View>
    </View>
  );

  return (
    <Felt>
      <View
        style={[styles.feltInner, narrow && styles.feltInnerNarrow]}
        onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      >
        <View style={styles.main}>
          {/* The roll: dice, the stickman's call, and the betting window. */}
          <View style={[styles.roll, narrow && styles.rollNarrow]}>
            {last ? (
              <View style={styles.dice} accessibilityLabel="Last roll">
                <Die value={last.record.dice.d1 as DieValue} rotation={-10} />
                <Die value={last.record.dice.d2 as DieValue} rotation={8} />
              </View>
            ) : null}
            <View style={[styles.call, narrow && styles.callNarrow]}>
              <Text
                accessibilityRole="header"
                aria-level={2}
                aria-live="polite"
                style={[display(22, 400), { color: colors.feltText }]}
              >
                {last ? last.call : "Come-out roll. Place your bets."}
              </Text>
              {last ? (
                <Text style={[ui(13), { color: surfaces.feltTextMuted }]}>{last.summary}</Text>
              ) : null}
            </View>
            <View style={styles.timer} accessibilityLabel={timer}>
              <Timer size={16} color={colors.feltText} strokeWidth={2} />
              <Text style={[ui(13, 600), { color: colors.feltText }]}>{timer}</Text>
            </View>
          </View>

          <View style={styles.numbers}>
            {POINT_NUMBERS.map((n) => {
              const spot: Spot = { kind: "box", number: n };
              const b = box(spot);
              const word = WORDS[n];
              return (
                <SpotBox
                  key={n}
                  label={`Place ${n}`}
                  mine={b.mine}
                  onPress={() => onSpot(spot)}
                  style={[styles.number, narrow && styles.numberNarrow]}
                >
                  {/* Phones: the puck and chips sit in the flow, above and below the number. */}
                  {narrow && point === n ? <Puck on size={22} /> : null}
                  <Text
                    style={[
                      word ? display(narrow ? 15 : 20, 600) : display(narrow ? 22 : 28, 600),
                      { color: colors.feltText },
                    ]}
                  >
                    {word ?? String(n)}
                  </Text>
                  <Text style={[ui(narrow ? 9 : 11), { color: surfaces.feltTextMuted }]}>
                    {narrow ? payoutLabel("place", n) : `place ${payoutLabel("place", n)}`}
                  </Text>
                  {!narrow && point === n ? (
                    <View style={styles.puckSpot}>
                      <Puck on />
                    </View>
                  ) : null}
                  <View style={narrow ? styles.inflow : styles.numberChips} pointerEvents="none">
                    <ChipStack chips={b.chips} max={narrow ? 1 : 3} />
                  </View>
                </SpotBox>
              );
            })}
          </View>

          {strip(
            { kind: "come" },
            "Come",
            56,
            <>
              <Text style={[display(16, 600, { letterSpacing: 3 }), { color: colors.feltText }]}>
                COME
              </Text>
              <Text style={[ui(11), { color: surfaces.feltTextMuted }]}>pays 1:1</Text>
            </>,
            "27%",
          )}
          {strip(
            { kind: "field" },
            "Field",
            60,
            <>
              <Text style={[display(24, 600, { letterSpacing: 3 }), { color: colors.feltText }]}>
                FIELD
              </Text>
              <Text style={[ui(11), styles.centerText, { color: surfaces.feltTextMuted }]}>
                {`2 · 3 · 4 · 9 · 10 · 11 · 12  •  ${fieldPaysCopy(state)}`}
              </Text>
            </>,
            "16%",
          )}
          <View>
            {strip(
              { kind: "dontCome" },
              "Don't come",
              44,
              <Text style={[ui(12, 700, { letterSpacing: 1.5 }), { color: colors.feltText }]}>
                {"DON'T COME · BAR 12"}
              </Text>,
              "70%",
            )}
            {point === null ? (
              <View style={styles.offPuck} pointerEvents="none">
                <Puck on={false} />
              </View>
            ) : null}
          </View>
          {line(
            "pass",
            "Pass line",
            <Text style={[display(24, 600, { letterSpacing: 3 }), { color: colors.feltText }]}>
              PASS LINE
            </Text>,
            68,
            pass,
            passTag,
          )}
          {line(
            "dontPass",
            "Don't pass bar",
            <Text style={[display(16, 600, { letterSpacing: 3 }), { color: colors.feltText }]}>
              {"DON'T PASS BAR"}
            </Text>,
            44,
            dontPass,
            dontTag,
          )}
        </View>
        {center}
      </View>
    </Felt>
  );
}

/** "2 and 12 pay double" for the Downtown rules; the engine's wording otherwise. */
function fieldPaysCopy(state: LiveTableState): string {
  const r = state.table.rules;
  if (r.fieldTwoPays === 2 && r.fieldTwelvePays === 2) return "2 and 12 pay double";
  return fieldPaysText(r);
}

const styles = StyleSheet.create({
  felt: {
    borderRadius: 28,
    borderWidth: 10,
    borderColor: colors.rail,
    overflow: "hidden",
    backgroundColor: colors.feltDeep,
  },
  feltInner: { flexDirection: "row", gap: 14, padding: 20 },
  feltInnerNarrow: { flexDirection: "column", padding: 12 },
  flex: { flex: 1 },
  main: { flex: 1, gap: 8 },
  roll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingTop: 0,
    paddingHorizontal: 4,
    paddingBottom: 6,
  },
  rollNarrow: { flexWrap: "wrap" },
  dice: { flexDirection: "row", gap: 8 },
  call: { flex: 1, gap: 2 },
  callNarrow: { minWidth: 200 },
  timer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.feltLine,
    backgroundColor: surfaces.tableButton,
  },
  numbers: { flexDirection: "row", gap: 6 },
  number: {
    flex: 1,
    height: 84,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.feltLine,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  numberNarrow: { height: "auto", minHeight: 84, paddingVertical: 6 },
  numberChips: { position: "absolute", left: 6, bottom: 6 },
  puckSpot: { position: "absolute", left: 6, top: 6 },
  strip: {
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.feltLine,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  stripNarrow: { minHeight: 44, paddingVertical: 8 },
  inflow: { alignItems: "center", gap: 2 },
  stripChips: { position: "absolute", top: 0, bottom: 0, justifyContent: "center" },
  centerText: { textAlign: "center", paddingHorizontal: 8 },
  offPuck: { position: "absolute", left: 10, top: 0, bottom: 0, justifyContent: "center" },
  yours: { position: "absolute", top: 2, bottom: 0, alignItems: "center", gap: 2 },
  youTag: {
    backgroundColor: colors.primary,
    borderRadius: 4,
    paddingVertical: 1,
    paddingHorizontal: 6,
  },
  mine: { borderColor: colors.primary, borderWidth: 2 },
  pressed: { opacity: 0.8 },
  stack: { flexDirection: "row", gap: 4 },
  chip: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: live.chipRim,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: live.chipShadow,
  },
  puck: {
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    width: 210,
    gap: 6,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.feltLine,
    backgroundColor: live.centerPanel,
    alignSelf: "flex-start",
  },
  centerNarrow: { width: "100%", alignSelf: "stretch" },
  hardRow: { flexDirection: "row", gap: 6 },
  hard: {
    flex: 1,
    height: 52,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: live.centerLine,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  hardChips: { position: "absolute", right: 4, top: 4 },
  oneRoll: {
    height: 44,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: live.centerLine,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  oneRollRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  acesRow: { flexDirection: "row", alignItems: "center" },
  edgeNote: { flexDirection: "row", gap: 6, paddingTop: 4, alignItems: "flex-start" },
});
