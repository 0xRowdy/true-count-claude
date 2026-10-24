/**
 * The vertical roulette layout on felt (frame dBsVJ, "Felt Layout" JKQdr): the even-money
 * column, the dozens, the 0 (and 00) over 1–36 in three columns, the column bets, the chips on
 * their spots (splits and corners on the grid lines) and the bet loupe.
 */

import { useEffect, useId, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type PressableInstance,
} from "react-native";
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import Minus from "lucide-react-native/icons/minus";
import X from "lucide-react-native/icons/x";
import {
  type Bet,
  type Pocket,
  OUTSIDE_SPOT_IDS,
  getSpot,
  isInsideBet,
  pocketColor,
  straightId,
} from "@/games/roulette";
import { colors, shadow, surfaces, ui } from "@/ui/ds";
import {
  type TableState,
  CELL_H,
  GAP,
  GRID_H,
  amountOn,
  chipPoint,
  loupeOptions,
  numberRect,
  pocketName,
  rulesOf,
  stackChip,
  stackLabel,
  zeroRect,
} from "./rouletteTable";

const PAD = 12;
const EVEN_W = 52;
const DOZEN_W = 44;
const COL_GAP = 4;
const LOUPE_W = 268;
const LOUPE_ROW = 48;
const MINI = 26;

const POCKET_FILL = {
  red: colors.chip5,
  black: colors.chip100,
  green: colors.chip25,
} as const;

const CHIP_FILL: Record<number, string> = {
  1: colors.chip1,
  5: colors.chip5,
  25: colors.chip25,
  100: colors.chip100,
  500: colors.chip500,
  1000: colors.chip1k,
};

export interface FeltProps {
  state: TableState;
  /** Spots that win on the result (result and payout phases). */
  winners: ReadonlySet<string> | null;
  onAdd: (spotId: string) => void;
  onRemove: (spotId: string) => void;
  onLoupe: (pocket: Pocket | null) => void;
  /** A number was tapped or focused: the "Bets touching N" button follows it (keyboard path). */
  onPick?: (pocket: Pocket) => void;
}

/**
 * What every number cell does, said once. Screen-reader browse modes swallow a bare "L", so
 * the description points at the "Bets touching N" button first.
 */
const NUMBER_HELP =
  'Tap to bet straight up. Once picked, the "Bets touching" button in the bet summary lists ' +
  "every bet that covers this number. Long-press, right-click or the L key open it too.";
const NUMBER_HELP_ID = "roulette-number-help";

export function RouletteFelt({ state, winners, onAdd, onRemove, onLoupe, onPick }: FeltProps) {
  const [gridW, setGridW] = useState(0);
  const [feltW, setFeltW] = useState(0);
  const gid = `felt${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const rules = rulesOf(state);
  const betting = state.phase === "bet";
  const pocket = state.settlement && state.phase !== "spin" ? state.settlement.pocket : null;

  const outside = (spotId: string, label: string, opts: { fill?: string; diamond?: boolean }) => {
    const amount = amountOn(state.bets, spotId);
    const won = winners?.has(spotId) ?? false;
    const spot = getSpot(rules, spotId)!;
    return (
      <Pressable
        key={spotId}
        accessibilityRole="button"
        accessibilityLabel={`${label}, pays ${spot.payout} to 1${amount ? `, ${stackLabelMoney(amount)} bet` : ""}`}
        accessibilityHint={
          betting ? "Tap to add the selected chip, long-press to remove" : undefined
        }
        onPress={betting ? () => onAdd(spotId) : undefined}
        onLongPress={betting ? () => onRemove(spotId) : undefined}
        delayLongPress={450}
        style={[
          styles.outside,
          opts.fill ? { backgroundColor: opts.fill } : null,
          won && styles.won,
        ]}
      >
        {opts.diamond ? <Diamond fill={opts.fill ?? surfaces.transparent} /> : null}
        <Text style={[ui(10, 700, { letterSpacing: 0.5 }), { color: colors.feltText }]}>
          {label}
        </Text>
        {amount > 0 ? (
          <View style={styles.outsideChip} pointerEvents="none">
            <MiniChip amount={amount} dim={!!winners && !won} />
          </View>
        ) : null}
      </Pressable>
    );
  };

  const dozen = (d: 1 | 2 | 3) => {
    const id = OUTSIDE_SPOT_IDS.dozen(d);
    const amount = amountOn(state.bets, id);
    const won = winners?.has(id) ?? false;
    const label = `${["1st", "2nd", "3rd"][d - 1]} 12`;
    return (
      <Pressable
        key={id}
        accessibilityRole="button"
        accessibilityLabel={`${label}, pays 2 to 1${amount ? `, ${stackLabelMoney(amount)} bet` : ""}`}
        onPress={betting ? () => onAdd(id) : undefined}
        onLongPress={betting ? () => onRemove(id) : undefined}
        delayLongPress={450}
        style={[styles.dozen, won && styles.won]}
      >
        <Text
          style={[ui(11, 700), { color: colors.feltText, transform: [{ rotate: "90deg" }] }]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {amount > 0 ? (
          <View style={styles.dozenChip} pointerEvents="none">
            <MiniChip amount={amount} dim={!!winners && !won} />
          </View>
        ) : null}
      </Pressable>
    );
  };

  const numberCell = (n: Pocket, flex: boolean, zero = false) => {
    const id = straightId(n);
    const amount = amountOn(state.bets, id);
    const color = pocketColor(n);
    const ringed = state.loupe === n || pocket === n;
    return (
      <Pressable
        key={String(n)}
        accessibilityRole="button"
        accessibilityLabel={`${pocketName(n)}${amount ? `, ${stackLabelMoney(amount)} straight up` : ""}`}
        // One shared description for all 37 cells (web), instead of repeating it in every name.
        // Native has no describedby, so it keeps the hint.
        {...(Platform.OS === "web"
          ? betting
            ? { "aria-describedby": NUMBER_HELP_ID }
            : {}
          : betting
            ? { accessibilityHint: NUMBER_HELP }
            : {})}
        // Native screen readers: the loupe as an accessibility action.
        accessibilityActions={betting ? [{ name: "longpress", label: "Open bet loupe" }] : []}
        onAccessibilityAction={(e) =>
          e.nativeEvent.actionName === "longpress" ? onLoupe(n) : undefined
        }
        // Web keyboards (invariant 7): L, or the context-menu key / Shift+F10, opens this
        // number's loupe in place. React Native Web never long-presses from the keyboard.
        {...webLoupeKeys(betting, () => {
          onPick?.(n);
          onLoupe(n);
        })}
        onPress={
          betting
            ? () => {
                onPick?.(n);
                onAdd(id);
              }
            : undefined
        }
        onLongPress={
          betting
            ? () => {
                onPick?.(n);
                onLoupe(n);
              }
            : undefined
        }
        delayLongPress={450}
        style={[
          zero ? styles.zero : styles.cell,
          flex && { flex: 1 },
          { backgroundColor: POCKET_FILL[color] },
          ringed && styles.ringed,
          pocket === n && styles.landed,
        ]}
      >
        <Text style={[ui(zero ? 16 : 15, zero ? 800 : 700), { color: surfaces.chipInkLight }]}>
          {String(n)}
        </Text>
      </Pressable>
    );
  };

  const column = (c: 1 | 2 | 3) => {
    const id = OUTSIDE_SPOT_IDS.column(c);
    const amount = amountOn(state.bets, id);
    const won = winners?.has(id) ?? false;
    return (
      <Pressable
        key={id}
        accessibilityRole="button"
        accessibilityLabel={`${["1st", "2nd", "3rd"][c - 1]} column, pays 2 to 1${amount ? `, ${stackLabelMoney(amount)} bet` : ""}`}
        onPress={betting ? () => onAdd(id) : undefined}
        onLongPress={betting ? () => onRemove(id) : undefined}
        delayLongPress={450}
        style={[styles.colBet, won && styles.won]}
      >
        <Text style={[ui(11, 700), { color: colors.feltText }]}>2 to 1</Text>
        {amount > 0 ? (
          <View style={styles.colChip} pointerEvents="none">
            <MiniChip amount={amount} dim={!!winners && !won} />
          </View>
        ) : null}
      </Pressable>
    );
  };

  // Chips for inside bets other than straight-ups on numbers sit on the grid lines.
  const lineChips = gridW
    ? state.bets.flatMap((b: Bet) => {
        const spot = getSpot(rules, b.spotId);
        if (!spot || !isInsideBet(spot.type) || spot.type === "straight") return [];
        const p = chipPoint(spot, rules.wheel, gridW);
        const won = winners?.has(spot.id) ?? false;
        return [
          <View
            key={spot.id}
            pointerEvents="none"
            style={[styles.lineChip, { left: p.x - MINI / 2, top: p.y - MINI / 2 }]}
          >
            <MiniChip amount={b.amount} dim={!!winners && !won} />
          </View>,
        ];
      })
    : [];

  const zeros: Pocket[] = rules.wheel === "american" ? [0, "00"] : [0];

  return (
    <View
      style={styles.felt}
      onLayout={(e: LayoutChangeEvent) => setFeltW(e.nativeEvent.layout.width)}
    >
      {Platform.OS === "web" ? (
        <Text id={NUMBER_HELP_ID} style={styles.srOnly}>
          {NUMBER_HELP}
        </Text>
      ) : null}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id={gid} cx="0.5" cy="0.4" rx="0.8" ry="0.6">
              <Stop offset="0" stopColor={colors.felt} />
              <Stop offset="1" stopColor={colors.feltDeep} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${gid})`} />
        </Svg>
      </View>

      <View style={[styles.side, { width: EVEN_W }]}>
        {outside(OUTSIDE_SPOT_IDS.low, "1–18", {})}
        {outside(OUTSIDE_SPOT_IDS.even, "EVEN", {})}
        {outside(OUTSIDE_SPOT_IDS.red, "RED", { fill: colors.chip5, diamond: true })}
        {outside(OUTSIDE_SPOT_IDS.black, "BLACK", { fill: colors.chip100, diamond: true })}
        {outside(OUTSIDE_SPOT_IDS.odd, "ODD", {})}
        {outside(OUTSIDE_SPOT_IDS.high, "19–36", {})}
      </View>
      <View style={[styles.side, { width: DOZEN_W }]}>
        {dozen(1)}
        {dozen(2)}
        {dozen(3)}
      </View>

      <View
        style={styles.numbers}
        onLayout={(e: LayoutChangeEvent) => setGridW(e.nativeEvent.layout.width)}
      >
        <View style={styles.row}>{zeros.map((z) => numberCell(z, true, true))}</View>
        {Array.from({ length: 12 }, (_, s) => (
          <View key={s} style={styles.row}>
            {[1, 2, 3].map((k) => numberCell(s * 3 + k, true))}
          </View>
        ))}
        <View style={styles.row}>{([1, 2, 3] as const).map(column)}</View>
        {/* Straight-up chips on the zeros and numbers, then everything on the lines. */}
        {gridW
          ? state.bets.map((b) => {
              const spot = getSpot(rules, b.spotId);
              if (!spot || spot.type !== "straight") return null;
              const p = spot.pockets[0]!;
              const r =
                typeof p === "number" && p > 0
                  ? numberRect(p, gridW)
                  : zeroRect(p, rules.wheel, gridW);
              const won = winners?.has(spot.id) ?? false;
              return (
                <View
                  key={spot.id}
                  pointerEvents="none"
                  style={[
                    styles.lineChip,
                    { left: r.x + r.w - MINI - 4, top: r.y + (CELL_H - MINI) / 2 },
                  ]}
                >
                  <MiniChip amount={b.amount} dim={!!winners && !won} />
                </View>
              );
            })
          : null}
        {lineChips}
      </View>

      {state.loupe !== null && gridW && feltW ? (
        <Loupe
          key={String(state.loupe)}
          state={state}
          pocket={state.loupe}
          gridW={gridW}
          feltW={feltW}
          onAdd={onAdd}
          onRemove={onRemove}
          onClose={() => onLoupe(null)}
        />
      ) : null}
    </View>
  );
}

interface WebKeyEvent {
  readonly key?: string;
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  preventDefault(): void;
}

/** onKeyDown / onContextMenu, which React Native Web forwards to the cell's element. */
function webLoupeKeys(enabled: boolean, open: () => void): object {
  if (!enabled) return {};
  return {
    onKeyDown: (e: WebKeyEvent) => {
      if ((e.key === "l" || e.key === "L") && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        open();
      }
    },
    onContextMenu: (e: WebKeyEvent) => {
      e.preventDefault();
      open();
    },
  };
}

function stackLabelMoney(amount: number): string {
  return `$${amount}`;
}

function Diamond({ fill }: { fill: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16">
      <Path d="M8 1 L15 8 L8 15 L1 8 Z" fill={fill} stroke={surfaces.chipInlay} strokeWidth={1.5} />
    </Svg>
  );
}

/** A chip stack on the felt: the denomination colour of the largest chip in it, and the total. */
export function MiniChip({ amount, dim = false }: { amount: number; dim?: boolean }) {
  const chip = stackChip(amount);
  const light = chip === 1 || chip === 1000;
  return (
    <View style={[styles.mini, { backgroundColor: CHIP_FILL[chip], opacity: dim ? 0.35 : 1 }]}>
      <Text
        style={[ui(10, 800), { color: light ? surfaces.chipInkDark : surfaces.chipInkLight }]}
        numberOfLines={1}
      >
        {stackLabel(amount)}
      </Text>
    </View>
  );
}

function Loupe({
  state,
  pocket,
  gridW,
  feltW,
  onAdd,
  onRemove,
  onClose,
}: {
  state: TableState;
  pocket: Pocket;
  gridW: number;
  feltW: number;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const rules = rulesOf(state);
  const options = loupeOptions(state, pocket);

  // Focus moves into the loupe when it opens and back to whatever opened it when it closes;
  // Escape closes it (web; native screen readers move by the dialog role).
  const firstRef = useRef<PressableInstance | null>(null);
  const optionRefs = useRef(new Map<string, PressableInstance>());
  // When a Remove button takes the last chip off, it disappears: keep focus on its option.
  const removeFrom = (spotId: string, last: boolean) => {
    onRemove(spotId);
    if (!last) return;
    setTimeout(() => {
      (optionRefs.current.get(spotId) as unknown as HTMLElement | undefined)?.focus?.();
    }, 0);
  };
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    if (typeof document === "undefined") return;
    const opener = document.activeElement as HTMLElement | null;
    (firstRef.current as unknown as HTMLElement | null)?.focus?.();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener && opener !== document.body && opener.isConnected) opener.focus();
    };
  }, []);
  const rows: (typeof options)[] = [];
  for (let i = 0; i < options.length; i += 2) rows.push(options.slice(i, i + 2));
  const visibleRows = Math.min(rows.length, 3);
  const listH = visibleRows * LOUPE_ROW + (visibleRows - 1) * 10;
  const more = rows.length > 3;
  const height = 14 * 2 + 36 + 10 + listH + (more ? 26 : 0);

  // Grid coordinates → felt coordinates.
  const gridX = PAD + EVEN_W + COL_GAP + DOZEN_W + COL_GAP;
  const cell =
    typeof pocket === "number" && pocket > 0
      ? numberRect(pocket, gridW)
      : zeroRect(pocket, rules.wheel, gridW);
  const cx = gridX + cell.x + cell.w / 2;
  const feltH = PAD * 2 + GRID_H;
  const below = PAD + cell.y + cell.h + 14;
  const fitsBelow = below + height <= feltH;
  const top = fitsBelow ? below : Math.max(4, PAD + cell.y - 14 - height);
  const left = Math.max(8, Math.min((feltW - LOUPE_W) / 2, feltW - LOUPE_W - 8));
  const pointerLeft = Math.max(left + 16, Math.min(cx - 11, left + LOUPE_W - 38));

  return (
    <>
      <View
        pointerEvents="none"
        style={[
          styles.pointer,
          { left: pointerLeft, top: fitsBelow ? top - 11 : top + height - 1 },
        ]}
      >
        <Svg width={22} height={12} viewBox="0 0 22 12">
          <Path
            d={fitsBelow ? "M0 12 L11 0 L22 12 Z" : "M0 0 L11 12 L22 0 Z"}
            fill={colors.paper}
          />
        </Svg>
      </View>
      <View
        role="dialog"
        accessibilityLabel={`Bets touching ${String(pocket)}`}
        style={[styles.loupe, { left, top }]}
      >
        <View style={styles.loupeHead}>
          <View style={{ flex: 1, gap: 1 }}>
            <Text
              style={[ui(15, 700), { color: colors.ink }]}
            >{`Bets touching ${String(pocket)}`}</Text>
            <Text style={[ui(11), { color: colors.inkMuted }]}>
              {`Tap to add $${state.chip} · hold to remove`}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close bet loupe"
            onPress={onClose}
            hitSlop={12}
            style={styles.close}
          >
            <X size={20} color={colors.inkMuted} strokeWidth={2} />
          </Pressable>
        </View>
        <ScrollView style={{ maxHeight: listH }} contentContainerStyle={{ gap: 10 }}>
          {rows.map((row, i) => (
            <View key={i} style={styles.loupeRow}>
              {row.map((o) => {
                const on = o.amount > 0;
                return (
                  <View key={o.spotId} style={styles.optionSlot}>
                    <Pressable
                      ref={(el: PressableInstance | null) => {
                        if (o === options[0]) firstRef.current = el;
                        if (el) optionRefs.current.set(o.spotId, el);
                        else optionRefs.current.delete(o.spotId);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={o.accessibilityLabel}
                      onPress={() => onAdd(o.spotId)}
                      onLongPress={() => onRemove(o.spotId)}
                      delayLongPress={450}
                      style={[styles.option, on ? styles.optionOn : styles.optionOff]}
                    >
                      <Text
                        style={[ui(13, 700), { color: on ? colors.paper : colors.ink }]}
                        numberOfLines={1}
                      >
                        {o.label}
                      </Text>
                      <Text
                        style={[ui(11), { color: on ? surfaces.loupeOnMuted : colors.inkMuted }]}
                        numberOfLines={1}
                      >
                        {o.caption}
                      </Text>
                    </Pressable>
                    {on ? (
                      // The button path for "hold to remove" (invariant 7).
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove $${Math.min(state.chip, o.amount)} from ${o.name}`}
                        onPress={() => removeFrom(o.spotId, o.amount <= state.chip)}
                        hitSlop={10}
                        style={styles.minus}
                      >
                        <Minus size={14} color={colors.paper} strokeWidth={2.5} />
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
              {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
            </View>
          ))}
        </ScrollView>
        {more ? (
          <Text style={[ui(11), { color: colors.inkMuted }]}>Scroll for more bets</Text>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  // Read by screen readers (as the cells' description), never seen.
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    opacity: 0,
  },
  felt: {
    flexGrow: 1,
    flexDirection: "row",
    gap: COL_GAP,
    padding: PAD,
    overflow: "visible",
  },
  side: { gap: GAP, paddingVertical: CELL_H + GAP },
  outside: {
    height: CELL_H * 2 + GAP,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.feltLine,
    gap: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  outsideChip: { position: "absolute", left: (EVEN_W - MINI) / 2 - 1, bottom: 2 },
  dozen: {
    height: CELL_H * 4 + GAP * 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.feltLine,
    alignItems: "center",
    justifyContent: "center",
  },
  dozenChip: { position: "absolute", left: (DOZEN_W - MINI) / 2 - 1, top: 20 },
  numbers: { flex: 1, gap: GAP },
  row: { flexDirection: "row", gap: GAP },
  zero: {
    height: CELL_H,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    borderWidth: 1,
    borderColor: colors.feltLine,
    alignItems: "center",
    justifyContent: "center",
  },
  cell: {
    height: CELL_H,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: surfaces.numberLine,
    alignItems: "center",
    justifyContent: "center",
  },
  ringed: { borderWidth: 3, borderColor: colors.primary },
  landed: { boxShadow: `0px 0px 12px ${colors.primary}` },
  won: { borderWidth: 2, borderColor: colors.primary, backgroundColor: surfaces.primaryWash },
  colBet: {
    flex: 1,
    height: CELL_H,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.feltLine,
    alignItems: "center",
    justifyContent: "center",
  },
  colChip: { position: "absolute", right: 4, top: (CELL_H - MINI) / 2 },
  lineChip: { position: "absolute" },
  mini: {
    width: MINI,
    height: MINI,
    borderRadius: MINI / 2,
    borderWidth: 2,
    borderColor: surfaces.chipInlay,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: shadow.chip,
  },
  pointer: { position: "absolute", zIndex: 11 },
  loupe: {
    position: "absolute",
    zIndex: 10,
    width: LOUPE_W,
    backgroundColor: colors.paper,
    borderRadius: 16,
    padding: 14,
    gap: 10,
    boxShadow: shadow.loupe,
  },
  loupeHead: { flexDirection: "row", alignItems: "center", height: 36 },
  close: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  loupeRow: { flexDirection: "row", gap: 6 },
  optionSlot: { flex: 1 },
  minus: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: surfaces.loupeOnMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  option: {
    height: LOUPE_ROW,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 10,
    gap: 1,
    justifyContent: "center",
  },
  optionOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  optionOff: { backgroundColor: surfaces.loupeOption, borderColor: colors.paperBorder },
});
