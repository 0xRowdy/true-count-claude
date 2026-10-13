/**
 * Progress & Mastery (design frame LvXnf): game tabs, range, level ring with the next level's
 * criteria, four stat cards, weekly accuracy, accuracy by decision type with the weak spot,
 * achievements, the practice bankroll, session stats and recent sessions.
 *
 * Everything is computed from the progress store (`useProgressView`). Until storage and the
 * clock have answered (and always in the prerendered HTML) the page shows its loading state.
 */

import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, type Role } from "react-native";
import { GAMES, GAME_NAMES } from "@/state/profile";
import {
  type Mastery,
  RANGES,
  type RangeId,
  type Scope,
  WIN_RATE_EXPECTATION,
  accuracy,
  accuracyDelta,
  achievements,
  bankrollSeries,
  bestStreak,
  categoryAccuracy,
  decisionsIn,
  handRecord,
  handsIn,
  mastery,
  rangeWindow,
  recentAccuracy,
  relativeDayLabel,
  sessionRows,
  sessionStats,
  weakestCategory,
  weeklyAccuracy,
} from "@/state/progressSelectors";
import { useProfile } from "@/ui/profile/profileStore";
import {
  AppShell,
  Button,
  Gradient,
  Panel,
  StatCard,
  Tabs,
  colors,
  display,
  formatMoney,
  formatThousands,
  icons,
  radius,
  shadow,
  surfaces,
  ui,
  type LucideIcon,
} from "@/ui/ds";
import { TRAINER_ROUTE, percent, signedMoney } from "./copy";
import {
  Calendar,
  Crosshair,
  Dices,
  Flame,
  Info,
  Layers,
  Lock,
  ShieldCheck,
  TrendingDown,
} from "./icons";
import { AccuracyBar, BankrollChart, LevelRing, LinkBox, SampleBanner, WeeklyBars } from "./parts";
import { useChipBalance, useProgressView } from "./progressStore";

type Tab = Scope;

const TAB_OPTIONS: ReadonlyArray<{ value: Tab; label: string }> = [
  { value: "all", label: "All games" },
  { value: "blackjack", label: "Blackjack" },
  { value: "craps", label: "Craps" },
  { value: "video-poker", label: "Video Poker" },
  { value: "roulette", label: "Roulette" },
  { value: "baccarat", label: "Baccarat" },
];

const WIDE = 1180;
const MEDIUM = 900;
const NARROW = 640;

export function ProgressScreen({ demo }: { demo: boolean }) {
  const view = useProgressView(demo);
  const chips = useChipBalance(view);
  const { profile, ready: profileReady } = useProfile();
  const [tab, setTab] = useState<Tab | null>(null);
  const [range, setRange] = useState<RangeId>("30d");
  const [width, setWidth] = useState(1376);

  // Until the player picks a tab, show their first game (the design opens on Blackjack).
  const scope: Tab = tab ?? (profileReady ? (profile.games[0] ?? "blackjack") : "blackjack");

  return (
    <AppShell active="progress" chips={chips}>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {view.demo ? <SampleBanner exitHref="/progress" /> : null}
        <View style={[styles.head, width < NARROW && styles.headNarrow]}>
          <View style={styles.headLeft}>
            <Text accessibilityRole="header" style={[display(36, 500), styles.fg]}>
              Your progress
            </Text>
            <Tabs options={TAB_OPTIONS} value={scope} onChange={setTab} accessibilityLabel="Game" />
          </View>
          <RangePicker value={range} onChange={setRange} />
        </View>
        {view.ready && view.today ? (
          <Body
            key={`${scope}`}
            data={view.data}
            today={view.today}
            scope={scope}
            range={range}
            width={width}
            demo={view.demo}
          />
        ) : (
          <View style={styles.loading} accessibilityLabel="Loading your progress">
            <Text style={[ui(14), styles.muted]}>Loading your progress…</Text>
          </View>
        )}
      </View>
    </AppShell>
  );
}

/** ARIA role for a checkable menu item; React Native's `Role` type predates it, RN Web passes it through. */
const MENU_ITEM_RADIO = "menuitemradio" as Role;

function RangePicker({ value, onChange }: { value: RangeId; onChange: (r: RangeId) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<View>(null);
  const label = RANGES.find((r) => r.id === value)!.label;

  // Web: Escape or a press outside the picker closes the menu.
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const node = wrap.current as unknown as { contains?: (n: unknown) => boolean } | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (!node?.contains?.(e.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <View ref={wrap} style={styles.rangeWrap}>
      <Button
        variant="secondary"
        size="sm"
        icon={Calendar}
        label={label}
        accessibilityLabel={`Range: ${label}`}
        onPress={() => setOpen((o) => !o)}
        style={styles.rangeButton}
      />
      {open ? (
        <View style={styles.menu} role="menu" accessibilityLabel="Range">
          {RANGES.map((r) => (
            <Pressable
              key={r.id}
              role={MENU_ITEM_RADIO}
              accessibilityLabel={r.label}
              aria-checked={r.id === value}
              onPress={() => {
                onChange(r.id);
                setOpen(false);
              }}
              style={[styles.menuItem, r.id === value && styles.menuItemOn]}
            >
              <Text style={[ui(14, r.id === value ? 600 : 500), styles.fg]}>{r.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Body({
  data,
  today,
  scope,
  range,
  width,
  demo,
}: {
  data: Parameters<typeof accuracy>[0];
  today: string;
  scope: Tab;
  range: RangeId;
  width: number;
  demo: boolean;
}) {
  const window = rangeWindow(range, today);
  const rangeLabel = RANGES.find((r) => r.id === range)!.label;
  const wide = width >= WIDE;
  const medium = width >= MEDIUM;
  const narrow = width < NARROW;

  const stats = {
    acc: accuracy(data, scope, window),
    delta: accuracyDelta(data, scope, range, today),
    hands: handRecord(handsIn(data, scope, window)),
    sessions: sessionRows(data, scope, window),
    streak: bestStreak(decisionsIn(data, scope, window)),
  };

  const empty = data.decisions.length === 0 && data.hands.length === 0;

  return (
    <View style={styles.body}>
      <LevelHero data={data} scope={scope} narrow={narrow} empty={empty} demo={demo} />

      <View style={[styles.stats, !medium && styles.wrap]}>
        <StatCard
          width="auto"
          style={!medium && styles.halfCard}
          label="Decision accuracy"
          value={stats.acc.rate === null ? "—" : `${(stats.acc.rate * 100).toFixed(1)}%`}
          delta={
            stats.acc.total === 0
              ? "No decisions in this range"
              : stats.delta === null
                ? `${formatThousands(stats.acc.total)} ${stats.acc.total === 1 ? "decision" : "decisions"}`
                : `${stats.delta >= 0 ? "+" : "−"}${Math.abs(stats.delta).toFixed(1)} pts vs prior ${range === "7d" ? "week" : range === "30d" ? "month" : "90 days"}`
          }
          deltaIcon={
            stats.delta === null ? Info : stats.delta >= 0 ? icons.TrendingUp : TrendingDown
          }
          deltaTone={stats.delta === null ? "muted" : stats.delta >= 0 ? "correct" : "mistake"}
        />
        <StatCard
          width="auto"
          style={!medium && styles.halfCard}
          label="Hands played"
          value={formatThousands(stats.hands.hands)}
          delta={`${stats.sessions.length} ${stats.sessions.length === 1 ? "session" : "sessions"}`}
          deltaIcon={Layers}
          deltaTone="muted"
        />
        <StatCard
          width="auto"
          style={!medium && styles.halfCard}
          label="Best streak"
          value={String(stats.streak)}
          delta="correct decisions in a row"
          deltaIcon={Flame}
          deltaTone="primary"
        />
        <StatCard
          width="auto"
          style={!medium && styles.halfCard}
          label="Practice win rate"
          value={stats.hands.winRate === null ? "—" : `${(stats.hands.winRate * 100).toFixed(1)}%`}
          delta={
            scope === "all"
              ? "Pushes left out · practice chips only"
              : `Real-table expectation ${WIN_RATE_EXPECTATION[scope]}`
          }
          deltaIcon={Info}
          deltaTone="muted"
        />
      </View>

      <View style={[styles.grid, !wide && styles.stack]}>
        <View style={styles.left}>
          <View style={[styles.row, !medium && styles.stack]}>
            <AccuracyOverTime data={data} scope={scope} today={today} />
            <ByDecisionType data={data} scope={scope} fixed={medium} />
          </View>
          <BankrollCard data={data} scope={scope} window={window} />
          <RecentSessions data={data} scope={scope} window={window} today={today} narrow={narrow} />
        </View>
        <View style={[styles.right, !wide && styles.rightStacked]}>
          <Achievements data={data} />
          <SessionStatsCard data={data} scope={scope} window={window} label={rangeLabel} />
        </View>
      </View>
    </View>
  );
}

function heroGame(data: Parameters<typeof mastery>[0], scope: Tab): Mastery {
  if (scope !== "all") return mastery(data, scope);
  const all = GAMES.map((g) => mastery(data, g));
  return all.reduce((best, m) =>
    m.level > best.level ||
    (m.level === best.level && (m.next?.progress ?? 0) > (best.next?.progress ?? 0))
      ? m
      : best,
  );
}

function LevelHero({
  data,
  scope,
  narrow,
  empty,
  demo,
}: {
  data: Parameters<typeof mastery>[0];
  scope: Tab;
  narrow: boolean;
  empty: boolean;
  demo: boolean;
}) {
  const m = heroGame(data, scope);
  const game = GAME_NAMES[m.game];
  const recent = recentAccuracy(data, m.game, 500);
  const acc = recent.total >= 20 ? recent.rate : null;
  const firstUnmet = m.next?.criteria.find((c) => !c.met);
  const eyebrow = !m.started
    ? `${scope === "all" ? "ALL GAMES" : game.toUpperCase()} · NOT STARTED`
    : m.next
      ? `${game.toUpperCase()} · ${Math.round(m.next.progress * 100)}% TO LEVEL ${m.next.level}`
      : `${game.toUpperCase()} · TOP LEVEL`;
  const lead = !m.started
    ? `Play your first ${scope === "all" ? "hands" : `${game.toLowerCase()} hands`} and your level shows up here. Level 1 “First steps” unlocks with your first decision.`
    : acc === null
      ? `Early days: ${recent.total} graded ${recent.total === 1 ? "decision" : "decisions"} so far. Your level climbs as the coach grades your play.`
      : m.game === "blackjack"
        ? `You'd play basic strategy correctly at a real table ${Math.round(acc * 100)} hands out of 100.`
        : `You make the right call at a real table ${Math.round(acc * 100)} times out of 100.`;
  const unlock =
    m.started && m.next && firstUnmet
      ? ` Level ${m.next.level} “${m.next.title}” unlocks when ${firstUnmet.phrase}.`
      : m.started && !m.next
        ? " You've reached the top level."
        : "";
  return (
    <View
      style={[styles.hero, narrow && styles.heroNarrow]}
      accessibilityLabel={`Level ${m.level} ${m.title}`}
    >
      <Gradient from={colors.feltDeep} to={colors.card} angle={90} radius={20} />
      <LevelRing level={m.level} progress={m.next?.progress ?? (m.started ? 1 : 0)} />
      <View style={styles.heroText}>
        <Text style={[ui(11, 700, { letterSpacing: 1.5 }), { color: colors.primary }]}>
          {eyebrow}
        </Text>
        <Text style={[display(32, 500), styles.fg]}>{m.title}</Text>
        <Text style={[ui(15, 400, { lineHeight: 22.5 }), styles.muted, styles.heroBody]}>
          {lead}
          {unlock}
        </Text>
        {empty && !demo ? (
          <View style={styles.emptyActions}>
            <LinkBox
              href="/drills/basic-strategy"
              label="Start the blackjack trainer"
              style={styles.primaryLink}
            >
              <Text style={[ui(14, 600), { color: colors.primaryForeground }]}>
                Start the blackjack trainer
              </Text>
            </LinkBox>
            <LinkBox
              href="/progress?demo=1"
              label="Load sample data (demo, not saved)"
              style={styles.secondaryLink}
            >
              <Text style={[ui(14, 600), styles.fg]}>Load sample data</Text>
              <Text style={[ui(12), styles.muted]}>demo · not saved</Text>
            </LinkBox>
          </View>
        ) : null}
      </View>
      {m.next && m.next.criteria.length > 0 ? (
        <View style={[styles.criteria, narrow && styles.criteriaNarrow]}>
          {m.next.criteria.map((c) => (
            <View key={c.label} style={styles.criterion}>
              <View style={styles.between}>
                <Text style={[ui(13, 600), styles.fg]}>{c.label}</Text>
                <Text style={[ui(12), { color: c.met ? colors.correct : colors.mutedForeground }]}>
                  {c.met ? "done" : `${percent(c.rate)} · ${c.count} / ${c.required} hands`}
                </Text>
              </View>
              <View
                style={styles.criterionTrack}
                accessible
                accessibilityRole="progressbar"
                accessibilityLabel={`${c.label}: ${c.met ? "done" : `${Math.round(c.progress * 100)}%`}`}
                accessibilityValue={{ min: 0, max: 100, now: Math.round(c.progress * 100) }}
              >
                <View
                  style={{
                    width: `${c.progress * 100}%`,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: c.met ? colors.correct : colors.primary,
                  }}
                />
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function AccuracyOverTime({
  data,
  scope,
  today,
}: {
  data: Parameters<typeof mastery>[0];
  scope: Tab;
  today: string;
}) {
  const weeks = weeklyAccuracy(data, scope, today, 12);
  const any = weeks.some((w) => w.total > 0);
  return (
    <Panel
      title="Accuracy over time"
      aside={`Weekly, ${scope === "all" ? "all games" : GAME_NAMES[scope].toLowerCase()}`}
      gap={18}
      style={styles.flex}
    >
      <View>
        <WeeklyBars weeks={weeks} />
        {!any ? (
          <View style={styles.overlay}>
            <Text style={[ui(13), styles.muted]}>No graded decisions in the last 12 weeks.</Text>
          </View>
        ) : null}
      </View>
    </Panel>
  );
}

function ByDecisionType({
  data,
  scope,
  fixed,
}: {
  data: Parameters<typeof mastery>[0];
  scope: Tab;
  fixed: boolean;
}) {
  const rows =
    scope === "all"
      ? GAMES.map((g) => ({ key: g, label: GAME_NAMES[g], ...recentAccuracy(data, g, 500) }))
      : categoryAccuracy(data, scope, 500).map((c) => ({ key: c.category, ...c }));
  const decided = scope === "all" ? 0 : Math.min(500, decisionsIn(data, scope).length);
  const weak = weakestCategory(data, scope === "all" ? GAMES : [scope]);
  const weakName = weak
    ? scope === "all"
      ? `${GAME_NAMES[weak.game]} ${weak.label.toLowerCase()}`
      : weak.label
    : "";
  const weakText = weak
    ? `${weakName} ${weak.label.endsWith("s") ? "are" : "is"} your weak spot. Drill them`
    : "";
  return (
    <Panel
      title={scope === "all" ? "By game" : "By decision type"}
      aside={
        scope === "all"
          ? "Last 500 per game"
          : decided === 500
            ? "Last 500 decisions"
            : `${decided} ${decided === 1 ? "decision" : "decisions"}`
      }
      gap={18}
      style={fixed ? styles.fixed380 : undefined}
    >
      {rows.map((r) => (
        <AccuracyBar key={r.key} label={r.label} rate={r.rate} total={r.total} />
      ))}
      {weak ? (
        <LinkBox href={TRAINER_ROUTE[weak.game]} label={weakText} style={styles.weak}>
          <View style={styles.weakWash} />
          <Crosshair size={16} color={colors.mistake} strokeWidth={2} />
          <Text style={[ui(13, 600), { color: colors.mistake, flex: 1 }]}>{weakText}</Text>
        </LinkBox>
      ) : (
        <Text style={[ui(13), styles.muted]}>
          {rows.every((r) => r.total === 0)
            ? "Your accuracy by decision type appears after your first graded hands."
            : "No weak spot yet: a category needs 10 decisions to count."}
        </Text>
      )}
    </Panel>
  );
}

function BankrollCard({
  data,
  scope,
  window,
}: {
  data: Parameters<typeof mastery>[0];
  scope: Tab;
  window: ReturnType<typeof rangeWindow>;
}) {
  const series = bankrollSeries(data, scope, window);
  return (
    <Panel
      title="Practice bankroll"
      aside={`Started at ${formatMoney(series.start)} · now ${formatMoney(series.now)}`}
      gap={18}
    >
      {series.points.length > 1 ? (
        <BankrollChart points={series.points} />
      ) : (
        <View style={styles.chartEmpty}>
          <Text style={[ui(13), styles.muted]}>
            No hands in this range. Your bankroll line starts with your first hand.
          </Text>
        </View>
      )}
      <Text style={[ui(12), styles.muted]}>
        Practice chips only. Results here don't predict casino outcomes; the house edge still
        applies at a real table.
      </Text>
    </Panel>
  );
}

const COLS = { date: 120, game: 130, hands: 80, acc: 100, net: 120 } as const;

function RecentSessions({
  data,
  scope,
  window,
  today,
  narrow,
}: {
  data: Parameters<typeof mastery>[0];
  scope: Tab;
  window: ReturnType<typeof rangeWindow>;
  today: string;
  narrow: boolean;
}) {
  const [all, setAll] = useState(false);
  const rows = sessionRows(data, scope, window);
  useEffect(() => setAll(false), [scope]);
  const shown = rows.slice(0, all ? 50 : 4);
  const cell = (w: number) => (narrow ? { flex: 1 } : { width: w });
  return (
    <View style={styles.table}>
      <View style={[styles.between, styles.tableHead]}>
        <Text accessibilityRole="header" style={[ui(17, 600), styles.fg]}>
          Recent sessions
        </Text>
        {rows.length > 4 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={all ? "Show fewer sessions" : `View all ${rows.length} sessions`}
            onPress={() => setAll((v) => !v)}
            hitSlop={10}
          >
            <Text style={[ui(13), styles.muted]}>
              {all ? "Show fewer" : `View all ${rows.length}`}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <View style={[styles.tr, styles.thRow]} role="row">
        <Text style={[styles.th, cell(COLS.date)]}>Date</Text>
        <Text style={[styles.th, cell(COLS.game)]}>Game</Text>
        {narrow ? null : <Text style={[styles.th, styles.flex]}>Strategy</Text>}
        <Text style={[styles.th, styles.right_, cell(COLS.hands)]}>Hands</Text>
        <Text style={[styles.th, styles.right_, cell(COLS.acc)]}>Accuracy</Text>
        <Text style={[styles.th, styles.right_, cell(COLS.net)]}>
          {narrow ? "Net" : "Net (practice)"}
        </Text>
      </View>
      {shown.length === 0 ? (
        <View style={[styles.tr, styles.td]}>
          <Text style={[ui(14), styles.muted]}>No sessions in this range yet.</Text>
        </View>
      ) : (
        shown.map((r) => {
          const weakAcc = r.accuracy !== null && r.accuracy < 0.9;
          return (
            <View key={r.id} style={[styles.tr, styles.td]} role="row">
              <Text style={[ui(14), styles.fg, cell(COLS.date)]}>
                {relativeDayLabel(r.day, today)}
              </Text>
              <Text style={[ui(14), styles.fg, cell(COLS.game)]}>{GAME_NAMES[r.game]}</Text>
              {narrow ? null : (
                <Text style={[ui(14), styles.fg, styles.flex]} numberOfLines={1}>
                  {r.strategyName ?? "—"}
                </Text>
              )}
              <Text style={[ui(14), styles.fg, styles.right_, cell(COLS.hands)]}>{r.hands}</Text>
              <Text
                style={[
                  ui(14, 600),
                  styles.right_,
                  cell(COLS.acc),
                  { color: weakAcc ? colors.mistake : colors.foreground },
                ]}
              >
                {percent(r.accuracy)}
              </Text>
              <Text
                style={[
                  ui(14),
                  styles.right_,
                  cell(COLS.net),
                  {
                    color:
                      r.net > 0
                        ? colors.correct
                        : r.net < 0
                          ? colors.mistake
                          : colors.mutedForeground,
                  },
                ]}
              >
                {signedMoney(r.net)}
              </Text>
            </View>
          );
        })
      )}
    </View>
  );
}

const BADGE: Record<string, { bg: string; fg: string; icon: LucideIcon }> = {
  "table-ready": { bg: colors.primary, fg: colors.primaryForeground, icon: ShieldCheck },
  "ice-cold": { bg: colors.chip1k, fg: colors.primaryForeground, icon: Flame },
  "hard-way": { bg: colors.chip5, fg: surfaces.chipInkLight, icon: Dices },
  remixed: { bg: colors.chip500, fg: surfaces.chipInkLight, icon: icons.GitFork },
  "no-nudges": { bg: colors.correct, fg: colors.primaryForeground, icon: icons.BadgeCheck },
  "royal-hold": { bg: colors.chip100, fg: colors.primary, icon: icons.LayoutGrid },
};

function Achievements({ data }: { data: Parameters<typeof mastery>[0] }) {
  const list = achievements(data);
  const unlocked = list.filter((a) => a.unlocked).length;
  return (
    <Panel title="Achievements" aside={`${unlocked} of ${list.length}`}>
      {list.map((a) => {
        const b = BADGE[a.id]!;
        const Icon = a.unlocked ? b.icon : Lock;
        return (
          <View
            key={a.id}
            style={styles.ach}
            accessible
            accessibilityLabel={`${a.title}: ${a.unlocked ? "earned" : `locked, ${Math.round(a.progress * 100)}%`}. ${a.description}`}
          >
            <View
              style={[
                styles.badge,
                a.unlocked
                  ? { backgroundColor: b.bg, borderWidth: 2, borderColor: surfaces.hairline }
                  : { backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border },
              ]}
            >
              <Icon size={20} color={a.unlocked ? b.fg : colors.mutedForeground} strokeWidth={2} />
            </View>
            <View style={styles.achText}>
              <Text
                style={[
                  ui(14, 600),
                  { color: a.unlocked ? colors.foreground : colors.mutedForeground },
                ]}
              >
                {a.title}
              </Text>
              <Text style={[ui(12, 400, { lineHeight: 16 }), styles.muted]}>{a.description}</Text>
              {!a.unlocked && a.progress > 0 ? (
                <View style={styles.achTrack}>
                  <View
                    style={{
                      width: `${a.progress * 100}%`,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: colors.mutedForeground,
                    }}
                  />
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
    </Panel>
  );
}

function SessionStatsCard({
  data,
  scope,
  window,
  label,
}: {
  data: Parameters<typeof mastery>[0];
  scope: Tab;
  window: ReturnType<typeof rangeWindow>;
  label: string;
}) {
  const s = sessionStats(data, scope, window);
  const rows: Array<[string, string]> = [
    ["Sessions", String(s.sessions)],
    ["Avg. session", s.avgMinutes === null ? "—" : `${Math.max(1, Math.round(s.avgMinutes))} min`],
    ["Longest win streak", `${s.longestWinStreak} ${s.longestWinStreak === 1 ? "hand" : "hands"}`],
    [
      "Longest losing streak",
      `${s.longestLosingStreak} ${s.longestLosingStreak === 1 ? "hand" : "hands"}`,
    ],
    [
      "Coach corrections",
      s.decisionsPerCorrection === null
        ? s.decisions
          ? "None"
          : "—"
        : `1 per ${s.decisionsPerCorrection} decisions`,
    ],
  ];
  return (
    <Panel title="Session stats" aside={label}>
      {rows.map(([k, v], i) => (
        <View
          key={k}
          style={[styles.between, styles.statRow, i === rows.length - 1 && styles.noBorder]}
        >
          <Text style={[ui(14), styles.muted]}>{k}</Text>
          <Text style={[ui(14, 600), styles.fg]}>{v}</Text>
        </View>
      ))}
    </Panel>
  );
}

const styles = StyleSheet.create({
  fg: { color: colors.foreground },
  muted: { color: colors.mutedForeground },
  flex: { flex: 1, minWidth: 0 },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 16,
    zIndex: 2,
  },
  headNarrow: { flexDirection: "column", alignItems: "flex-start" },
  headLeft: { gap: 14, flexShrink: 1, maxWidth: "100%" },
  rangeWrap: { position: "relative", zIndex: 3 },
  rangeButton: { height: 40, paddingHorizontal: 20 },
  menu: {
    position: "absolute",
    top: 46,
    right: 0,
    minWidth: 180,
    padding: 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.popover,
    boxShadow: shadow.note,
  },
  menuItem: {
    minHeight: 40,
    paddingHorizontal: 12,
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  menuItemOn: { backgroundColor: colors.muted },
  loading: { paddingVertical: 64, alignItems: "center" },
  body: { gap: 28, marginTop: 28 },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 32,
    padding: 28,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  heroNarrow: { flexDirection: "column", alignItems: "flex-start", gap: 20, padding: 20 },
  heroText: { flex: 1, gap: 8, minWidth: 0 },
  heroBody: { maxWidth: 640 },
  emptyActions: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 8 },
  primaryLink: {
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    justifyContent: "center",
  },
  secondaryLink: {
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.secondary,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  criteria: { width: 300, gap: 10 },
  criteriaNarrow: { width: "100%" },
  criterion: { gap: 6 },
  criterionTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: surfaces.track,
    overflow: "hidden",
  },
  stats: { flexDirection: "row", gap: 16 },
  wrap: { flexWrap: "wrap" },
  halfCard: { flexBasis: "45%", flexGrow: 1 },
  grid: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
  stack: { flexDirection: "column", alignItems: "stretch" },
  left: { flex: 1, gap: 16, minWidth: 0, alignSelf: "stretch" },
  right: { width: 400, gap: 16 },
  rightStacked: { width: "100%" },
  row: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
  fixed380: { width: 380 },
  overlay: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  weak: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    minHeight: 44,
    overflow: "hidden",
  },
  weakWash: { ...StyleSheet.absoluteFill, backgroundColor: colors.mistake, opacity: 0.1 },
  chartEmpty: {
    height: 180,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    paddingHorizontal: 16,
  },
  table: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  tableHead: { paddingVertical: 20, paddingHorizontal: 24 },
  tr: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
  },
  thRow: { backgroundColor: colors.muted, paddingVertical: 10, paddingHorizontal: 24 },
  th: { ...ui(12, 600), color: colors.mutedForeground },
  td: { paddingVertical: 14, paddingHorizontal: 24 },
  right_: { textAlign: "right" },
  ach: { flexDirection: "row", alignItems: "center", gap: 14 },
  badge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  achText: { flex: 1, gap: 3 },
  achTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.muted,
    overflow: "hidden",
    marginTop: 3,
  },
  statRow: { paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  noBorder: { borderBottomWidth: 0 },
});
