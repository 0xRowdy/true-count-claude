/**
 * The Lobby (design frame ZDK1x): the app's home after onboarding.
 *
 * Greeting, trip line and practice streak from the profile and the progress store; the
 * "Up next" hero picks the weakest category; "Your games" shows each game's accuracy, level
 * and next step. Live tables, the community feed and followed strategies are simulated in
 * this build (fixtures, labelled as such).
 *
 * Hydration: the time of day, the profile and stored progress are all read after mount, so
 * the prerendered page is the neutral loading state.
 */

import { StyleSheet, Text, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { useId, useState } from "react";
import { GAMES, GAME_NAMES, type GameId, daysUntilTrip } from "@/state/profile";
import {
  type Mastery,
  addDays,
  handsIn,
  mastery,
  practiceStreak,
  recentAccuracy,
  weakestCategory,
  weekTicks,
} from "@/state/progressSelectors";
import { useProfile } from "@/ui/profile/profileStore";
import {
  AppShell,
  Badge,
  PlayingCard,
  colors,
  display,
  icons,
  radius,
  surfaces,
  ui,
} from "@/ui/ds";
import {
  COMMUNITY,
  FOLLOWING,
  GAME_ROUTE,
  LIVE_TABLES,
  dailyDrill,
  gameList,
  greeting,
  upNext,
} from "@/ui/progress/copy";
import {
  Armchair,
  BookOpenCheck,
  ChevronRight,
  Flame,
  Shuffle,
  Timer,
  Trophy,
} from "@/ui/ds/icons";
import { GAME_ICON, GameIcon, LinkBox, SampleBanner, TextLink } from "@/ui/progress/parts";
import { useChipBalance, useProgressView } from "@/ui/progress/progressStore";

const WIDE = 1100;
const NARROW = 640;

export function LobbyScreen({ demo }: { demo: boolean }) {
  const view = useProgressView(demo);
  const chips = useChipBalance(view);
  const { profile, ready: profileReady } = useProfile();
  const [width, setWidth] = useState(1376);
  const wide = width >= WIDE;
  const narrow = width < NARROW;

  const ready = view.ready && profileReady && view.today !== null;
  const data = view.data;
  const today = view.today;
  const masteries = Object.fromEntries(GAMES.map((g) => [g, mastery(data, g)])) as Record<
    GameId,
    Mastery
  >;
  const myGames = profile.games.length ? profile.games : (["blackjack"] as GameId[]);

  const hello = ready && view.hour !== null ? greeting(view.hour, profile.name) : "Welcome";
  const tripLine = ready && today ? tripText(myGames, masteries, profile, today) : " ";
  const streak = ready && today ? practiceStreak(data, today) : 0;
  const anyStarted = GAMES.some((g) => masteries[g].started);

  return (
    <AppShell active="lobby" chips={chips}>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {view.demo ? <SampleBanner exitHref="/lobby" /> : null}
        <View style={[styles.content, !wide && styles.stack]}>
          <View style={styles.main}>
            <View style={[styles.greeting, narrow && styles.stackStart]}>
              <View style={styles.greetText}>
                <Text accessibilityRole="header" style={[display(36, 500), styles.fg]}>
                  {hello}
                </Text>
                <Text style={[ui(15), styles.muted]}>{tripLine}</Text>
              </View>
              {ready ? (
                <View style={styles.streak} accessible accessibilityLabel={streakText(streak)}>
                  <Flame size={16} color={colors.chip1k} strokeWidth={2} />
                  <Text style={[ui(13, 500), styles.fg]}>{streakText(streak)}</Text>
                </View>
              ) : null}
            </View>

            {ready ? (
              <UpNextHero
                data={data}
                games={myGames}
                started={anyStarted}
                narrow={narrow}
                empty={!anyStarted && !view.demo}
              />
            ) : (
              <View style={[styles.hero, styles.heroLoading]} accessibilityLabel="Loading" />
            )}

            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Text accessibilityRole="header" style={[ui(20, 600), styles.fg]}>
                  Your games
                </Text>
                <TextLink href="/rules" text="Rules & variants" />
              </View>
              <View style={[styles.gameGrid, !wide && styles.wrap]}>
                {GAMES_IN_DESIGN_ORDER.map((g) => (
                  <GameCard
                    key={g}
                    m={ready ? masteries[g] : null}
                    game={g}
                    acc={ready ? recentAccuracy(data, g, 500).rate : null}
                    wrap={!wide}
                  />
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Text accessibilityRole="header" style={[ui(20, 600), styles.fg]}>
                  Strategies you're following
                </Text>
                <TextLink href="/strategies" text="Browse community" />
              </View>
              <View style={styles.list}>
                {FOLLOWING.map((s, i) => {
                  const acc =
                    ready && s.action === "Practice"
                      ? recentAccuracy(data, s.game, 500).rate
                      : null;
                  const meta =
                    s.curated && ready && today
                      ? `${s.meta} · ${handsIn(data, "blackjack", { from: addDays(today, -6), to: today }).length} hands this week`
                      : s.meta;
                  return (
                    <View
                      key={s.id}
                      style={[styles.followRow, i < FOLLOWING.length - 1 && styles.rowBorder]}
                    >
                      <View
                        style={[
                          styles.followIcon,
                          { backgroundColor: s.curated ? surfaces.primaryWash : colors.muted },
                        ]}
                      >
                        {s.curated ? (
                          <BookOpenCheck size={18} color={colors.primary} strokeWidth={2} />
                        ) : (
                          <icons.GitFork size={18} color={colors.mutedForeground} strokeWidth={2} />
                        )}
                      </View>
                      <LinkBox
                        href={s.href}
                        label={`Strategy: ${s.title}`}
                        style={styles.followText}
                      >
                        <Text style={[ui(15, 600), styles.fg]} numberOfLines={1}>
                          {s.title}
                        </Text>
                        <Text style={[ui(13), styles.muted]} numberOfLines={narrow ? 2 : 1}>
                          {meta}
                        </Text>
                      </LinkBox>
                      {narrow ? null : <Badge label={GAME_NAMES[s.game]} showIcon={false} />}
                      {narrow ? null : (
                        <Text
                          style={[
                            ui(15, 600),
                            styles.acc,
                            { color: acc === null ? colors.mutedForeground : colors.foreground },
                          ]}
                        >
                          {acc === null ? "—" : `${Math.round(acc * 100)}%`}
                        </Text>
                      )}
                      <LinkBox
                        href={s.practiceHref}
                        label={`${s.action} ${s.title}`}
                        style={styles.secondaryButton}
                      >
                        <Text style={[ui(14, 600), styles.fg]}>{s.action}</Text>
                      </LinkBox>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>

          <View style={[styles.rail, !wide && styles.railStacked]}>
            <LiveTables />
            <TodaysDrill
              ticks={ready && today ? weekTicks(data, today) : null}
              drill={today ? dailyDrill(myGames, today) : null}
            />
            <Community />
          </View>
        </View>
      </View>
    </AppShell>
  );
}

const GAMES_IN_DESIGN_ORDER: readonly GameId[] = [
  "blackjack",
  "craps",
  "video-poker",
  "roulette",
  "baccarat",
];

function streakText(n: number): string {
  return n > 0 ? `${n}-day practice streak` : "Start a practice streak today";
}

function tripText(
  games: readonly GameId[],
  masteries: Record<GameId, Mastery>,
  profile: ReturnType<typeof useProfile>["profile"],
  today: string,
): string {
  const started = games.some((g) => masteries[g].started);
  const ready = Math.round(
    (games.reduce((s, g) => s + masteries[g].tableReadiness, 0) / games.length) * 100,
  );
  const readiness = started
    ? `you're ${ready}% table-ready for ${gameList(games)}`
    : `let's get you table-ready for ${gameList(games)}`;
  const days = daysUntilTrip(profile, today);
  if (days !== null && days >= 0) {
    const when =
      days === 0
        ? "Your trip is today"
        : days === 1
          ? "Your trip is tomorrow"
          : `Your trip is in ${days} days`;
    return `${when} · ${readiness}`;
  }
  return `${readiness[0]!.toUpperCase()}${readiness.slice(1)}.`;
}

function UpNextHero({
  data,
  games,
  started,
  narrow,
  empty,
}: {
  data: Parameters<typeof mastery>[0];
  games: readonly GameId[];
  started: boolean;
  narrow: boolean;
  empty: boolean;
}) {
  const weak = weakestCategory(data, games);
  const next = upNext(weak, games[0] ?? "blackjack", started);
  const id = `un${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const Icon = GAME_ICON[next.game];
  return (
    <View style={[styles.hero, narrow && styles.heroNarrow]}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient
              id={id}
              cx="0.85"
              cy="0.5"
              rx="0.6"
              ry="1"
              gradientUnits="objectBoundingBox"
            >
              <Stop offset="0" stopColor={colors.felt} />
              <Stop offset="0.55" stopColor={colors.feltDeep} />
              <Stop offset="1" stopColor={colors.card} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
        </Svg>
      </View>
      <View style={[styles.heroCopy, narrow && styles.heroCopyNarrow]}>
        <Text style={[ui(11, 700, { letterSpacing: 1.5 }), { color: colors.primary }]}>
          {next.eyebrow}
        </Text>
        <Text style={[display(30, 500, { lineHeight: 34.5 }), { color: colors.feltText }]}>
          {next.title}
        </Text>
        <Text style={[ui(15, 400, { lineHeight: 22.5 }), { color: surfaces.feltTextMuted }]}>
          {next.why}
        </Text>
        <View style={styles.heroActions}>
          <LinkBox href={next.primaryHref} label={next.primaryLabel} style={styles.primaryButton}>
            <icons.Play size={18} color={colors.primaryForeground} strokeWidth={2} />
            <Text style={[ui(15, 600), { color: colors.primaryForeground }]}>
              {next.primaryLabel}
            </Text>
          </LinkBox>
          <LinkBox href={next.secondaryHref} label={next.secondaryLabel} style={styles.tableButton}>
            <Shuffle size={18} color={colors.feltText} strokeWidth={2} />
            <Text style={[ui(15, 600), { color: colors.feltText }]}>{next.secondaryLabel}</Text>
          </LinkBox>
          {empty ? (
            <LinkBox
              href="/lobby?demo=1"
              label="Load sample data (demo, not saved)"
              style={styles.demoLink}
            >
              <Text style={[ui(13, 500), { color: surfaces.feltTextMuted }]}>
                Load sample data · demo, not saved
              </Text>
            </LinkBox>
          ) : null}
        </View>
      </View>
      {narrow ? null : (
        <View style={styles.heroVisual}>
          {next.hand ? (
            <View style={styles.handVisual}>
              <View style={styles.playerCards}>
                <View style={{ transform: [{ rotate: "6deg" }], marginTop: 6 }}>
                  <PlayingCard
                    rank={next.hand.player[0]![0]}
                    suit={next.hand.player[0]![1]}
                    size="lg"
                  />
                </View>
                <View style={{ transform: [{ rotate: "-4deg" }], marginLeft: -22 }}>
                  <PlayingCard
                    rank={next.hand.player[1]![0]}
                    suit={next.hand.player[1]![1]}
                    size="lg"
                  />
                </View>
              </View>
              <View style={styles.dealer}>
                <Text
                  style={[ui(11, 700, { letterSpacing: 1.5 }), { color: surfaces.feltTextMuted }]}
                >
                  DEALER
                </Text>
                <PlayingCard rank={next.hand.dealer[0]} suit={next.hand.dealer[1]} />
              </View>
              <View style={styles.caption}>
                <Text style={[ui(13, 600), { color: colors.feltText }]}>{next.hand.caption}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.bigIcon}>
              <Icon size={56} color={colors.feltText} strokeWidth={1.5} />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function GameCard({
  m,
  game,
  acc,
  wrap,
}: {
  m: Mastery | null;
  game: GameId;
  acc: number | null;
  wrap: boolean;
}) {
  const started = m?.started ?? false;
  const levelText = !m ? " " : started ? `Level ${m.level} · ${m.title}` : "Not started";
  const nextStep = m?.nextStep ?? " ";
  return (
    <LinkBox
      href={GAME_ROUTE[game]}
      label={`${GAME_NAMES[game]}: ${m ? levelText : ""}${acc !== null ? `, ${Math.round(acc * 100)}% accuracy` : ""}. ${m ? nextStep : ""}`}
      style={[styles.gameCard, wrap && styles.gameCardWrap]}
    >
      <View style={styles.between}>
        <GameIcon game={game} active={started} />
        {acc !== null ? (
          <Text style={[ui(12, 600), { color: colors.correct }]}>
            {Math.round(acc * 100)}% acc.
          </Text>
        ) : null}
      </View>
      <View style={styles.gameText}>
        <Text style={[ui(17, 600), styles.fg]}>{GAME_NAMES[game]}</Text>
        <Text style={[ui(13), styles.muted]}>{levelText}</Text>
      </View>
      <View style={styles.gameBar}>
        {started && m?.next ? (
          <View style={[styles.gameBarFill, { width: `${m.next.progress * 100}%` }]} />
        ) : started ? (
          <View style={[styles.gameBarFill, { width: "100%" }]} />
        ) : null}
      </View>
      <View style={styles.nextRow}>
        <Text style={[ui(13, 500), styles.fg, styles.flex]}>{nextStep}</Text>
        <ChevronRight size={16} color={colors.mutedForeground} strokeWidth={2} />
      </View>
    </LinkBox>
  );
}

function LiveTables() {
  return (
    <View style={styles.card}>
      <View style={[styles.between, styles.liveHead]}>
        <View style={styles.liveTitle}>
          <View style={styles.liveDot} />
          <Text accessibilityRole="header" style={[ui(17, 600), styles.fg]}>
            Live tables
          </Text>
        </View>
        <Text style={[ui(13), styles.muted]}>Simulated players</Text>
      </View>
      {LIVE_TABLES.map((t) => (
        <LinkBox
          key={t.title}
          href={t.href}
          label={`Join ${t.title} (simulated table)`}
          style={styles.liveRow}
        >
          <GameIcon game={t.game} active size={40} />
          <View style={styles.flex}>
            <Text style={[ui(14, 600), styles.fg]} numberOfLines={1}>
              {t.title}
            </Text>
            <Text style={[ui(12), styles.muted]} numberOfLines={1}>
              {t.detail}
            </Text>
          </View>
          <View style={styles.join}>
            <View style={styles.seats}>
              <Armchair size={13} color={colors.mutedForeground} strokeWidth={2} />
              <Text style={[ui(12), styles.muted]}>{t.seats}</Text>
            </View>
            <Text style={[ui(14, 600), { color: colors.primary }]}>Join</Text>
          </View>
        </LinkBox>
      ))}
    </View>
  );
}

function TodaysDrill({
  ticks,
  drill,
}: {
  ticks: ReturnType<typeof weekTicks> | null;
  drill: ReturnType<typeof dailyDrill> | null;
}) {
  return (
    <View style={[styles.card, styles.padded]}>
      <View style={styles.between}>
        <Text accessibilityRole="header" style={[ui(17, 600), styles.fg]}>
          Today's drill
        </Text>
        <Text style={[ui(13), styles.muted]}>{drill ? `~${drill.minutes} min` : " "}</Text>
      </View>
      <Text style={[ui(14, 400, { lineHeight: 21 }), styles.muted]}>
        {drill?.description ?? " "}
      </Text>
      <View style={styles.week} accessibilityLabel="This week's practice" role="list">
        {(ticks ?? PLACEHOLDER_TICKS).map((t, i) => (
          <View
            key={i}
            style={styles.day}
            role="listitem"
            accessibilityLabel={`${DAY_NAMES[i]}: ${t.state === "done" ? "practised" : t.state === "today" ? "today" : t.state === "missed" ? "missed" : "upcoming"}`}
          >
            <View
              style={[
                styles.dot,
                t.state === "done" && styles.dotDone,
                t.state === "today" && styles.dotToday,
              ]}
            >
              {t.state === "done" ? (
                <icons.Check size={14} color={colors.primaryForeground} strokeWidth={2.5} />
              ) : null}
            </View>
            <Text style={[ui(11), styles.muted]}>{t.label}</Text>
          </View>
        ))}
      </View>
      <LinkBox
        href={drill?.href ?? "/drills"}
        label="Start today's drill"
        style={[styles.secondaryButton, styles.fullButton]}
      >
        <Timer size={18} color={colors.foreground} strokeWidth={2} />
        <Text style={[ui(15, 600), styles.fg]}>Start today's drill</Text>
      </LinkBox>
    </View>
  );
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const PLACEHOLDER_TICKS = ["M", "T", "W", "T", "F", "S", "S"].map((label) => ({
  day: "",
  label,
  state: "upcoming" as const,
}));

function Community() {
  const ICON = { fork: icons.GitFork, upvote: icons.ArrowBigUp, trophy: Trophy } as const;
  return (
    <View style={[styles.card, styles.padded]}>
      <View style={styles.between}>
        <Text accessibilityRole="header" style={[ui(17, 600), styles.fg]}>
          From the community
        </Text>
        <Text style={[ui(12), styles.muted]}>Simulated</Text>
      </View>
      {COMMUNITY.map((c) => {
        const Icon = ICON[c.icon];
        return (
          <View key={c.text} style={styles.item}>
            <Icon size={16} color={colors.primary} strokeWidth={2} />
            <Text style={[ui(13, 400, { lineHeight: 18.2 }), styles.fg, styles.flex]}>
              {c.text}
            </Text>
            <Text style={[ui(12), styles.muted]}>{c.time}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fg: { color: colors.foreground },
  muted: { color: colors.mutedForeground },
  flex: { flex: 1, minWidth: 0 },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  content: { flexDirection: "row", gap: 32, alignItems: "flex-start" },
  stack: { flexDirection: "column", alignItems: "stretch" },
  stackStart: { flexDirection: "column", alignItems: "flex-start", gap: 12 },
  main: { flex: 1, gap: 32, minWidth: 0, alignSelf: "stretch" },
  rail: { width: 360, gap: 24 },
  railStacked: { width: "100%" },
  greeting: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 16,
  },
  greetText: { gap: 6, flexShrink: 1 },
  streak: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.muted,
  },
  hero: {
    minHeight: 300,
    flexDirection: "row",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  heroNarrow: { minHeight: 0 },
  heroLoading: { backgroundColor: colors.card },
  heroCopy: { width: 560, maxWidth: "100%", padding: 36, gap: 14, justifyContent: "center" },
  heroCopyNarrow: { width: "100%", padding: 20 },
  heroActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
    paddingTop: 8,
  },
  primaryButton: {
    height: 48,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  tableButton: {
    height: 48,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.feltLine,
    backgroundColor: surfaces.tableButton,
  },
  demoLink: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
  heroVisual: { flex: 1, alignItems: "center", justifyContent: "center" },
  handVisual: { width: 400, height: 300, position: "relative" },
  playerCards: { position: "absolute", left: 110, top: 90, flexDirection: "row" },
  dealer: { position: "absolute", left: 300, top: 60, alignItems: "center", gap: 8 },
  caption: {
    position: "absolute",
    left: 120,
    top: 226,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.feltLine,
    backgroundColor: surfaces.tableButton,
  },
  bigIcon: {
    width: 128,
    height: 128,
    borderRadius: 64,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: surfaces.tableButton,
    borderWidth: 1,
    borderColor: colors.feltLine,
  },
  section: { gap: 16 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  gameGrid: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
  wrap: { flexWrap: "wrap" },
  gameCard: {
    flex: 1,
    minWidth: 0,
    padding: 18,
    gap: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  gameCardWrap: { minWidth: 160 },
  gameText: { gap: 2 },
  gameBar: { height: 6, borderRadius: 3, backgroundColor: colors.muted, overflow: "hidden" },
  gameBarFill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  nextRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  list: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  followRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  followIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  followText: { flex: 1, minWidth: 0, gap: 3 },
  acc: { width: 56, textAlign: "right" },
  secondaryButton: {
    height: 40,
    minWidth: 44,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.secondary,
  },
  fullButton: { height: 44, alignSelf: "stretch" },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  padded: { padding: 20, gap: 14 },
  liveHead: { paddingTop: 18, paddingBottom: 10, paddingHorizontal: 20 },
  liveTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.correct },
  liveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  join: { alignItems: "flex-end", gap: 4 },
  seats: { flexDirection: "row", alignItems: "center", gap: 4 },
  week: { flexDirection: "row", gap: 6 },
  day: { flex: 1, alignItems: "center", gap: 4 },
  dot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  dotDone: { backgroundColor: colors.primary },
  dotToday: { borderWidth: 2, borderColor: colors.primary },
  item: { flexDirection: "row", gap: 10 },
});
