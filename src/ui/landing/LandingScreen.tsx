import { Link, Stack, useRouter } from "expo-router";
import { useRef, useState, type ReactNode } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { Badge, Button, colors, display, Gradient, radius, StrategyCard, ui } from "@/ui/ds";
import {
  ArrowBigUp,
  BadgeCheck,
  GitFork,
  Play,
  RotateCcw,
  TrendingUp,
  type LucideIcon,
} from "@/ui/ds/icons";
import {
  ArrowRight,
  Ban,
  BookOpenCheck,
  ChartNoAxesColumn,
  CirclePlay,
  EyeOff,
  MapPin,
  ShieldCheck,
  Smartphone,
} from "@/ui/marketing/icons";
import { Logo } from "@/ui/marketing/Logo";
import { Notice } from "@/ui/marketing/Notice";
import { RadialFill } from "@/ui/marketing/RadialFill";
import { Tag } from "@/ui/marketing/Tag";
import { marketing } from "@/ui/marketing/surfaces";
import { usePlayFreeHref } from "@/ui/marketing/usePlayFreeHref";
import { EXAMPLE_FORK, EXAMPLE_STRATEGIES, TABLES, type TableTile } from "./content";
import { FELT_ONLY_WIDTH, HERO_TABLE_WIDTH, HeroCoachNote, HeroTable } from "./HeroTable";

type Section = "how" | "games" | "community";
type Layout = "wide" | "mid" | "narrow";

/** Design width 1440: 64pt gutters. Below WIDE the two-column sections stack. */
const WIDE = 1200;
const NARROW = 760;
const GUTTER: Record<Layout, number> = { wide: 64, mid: 32, narrow: 16 };

const STEPS: ReadonlyArray<{ num: string; title: string; body: string; icon: LucideIcon }> = [
  {
    num: "01",
    title: "Pick the table you'll actually sit at",
    body: "Choose the rules from your next trip: 6-deck S17, 3:2; European single zero; 10x odds craps; 9/6 Jacks or Better. Payouts match to the penny.",
    icon: MapPin,
  },
  {
    num: "02",
    title: "Follow a strategy, curated or community-built",
    body: "Start with house basic strategy or load one ranked by the community. The coach knows every decision it calls for.",
    icon: BookOpenCheck,
  },
  {
    num: "03",
    title: "Get caught, then replay it right",
    body: "Off-strategy? The hand pauses. You see the right move, the reason in one sentence, and a Take it back button. No scolding, no lost progress.",
    icon: RotateCcw,
  },
  {
    num: "04",
    title: "Watch the habit stick",
    body: "Accuracy is tracked per decision type, so you'll see when soft doubles finally click.",
    icon: TrendingUp,
  },
];

const PLANS = [
  {
    name: "Free",
    amount: "$0",
    per: "forever",
    desc: "All 5 games, every rule set, the coach on basic strategy, community strategies and live tables.",
  },
  {
    name: "Tableside Plus",
    amount: "$5.99",
    per: "per month, or $49 a year",
    desc: "Advanced trainers (counting, craps systems, every video poker pay table), full progress history, private tables.",
    featured: true,
  },
  {
    name: "Lifetime",
    amount: "$119",
    per: "one payment, yours for good",
    desc: "Everything in Plus with no subscription. Good if you just want to own it.",
  },
] as const;

/**
 * The marketing landing page (design frame Do2ZB): nav, hero with the table vignette,
 * "How it teaches", the five tables, community strategies (examples), a pricing teaser and
 * the responsible-gaming footer.
 *
 * Width is measured after mount (onLayout), so the prerendered page is the 1440 layout and
 * narrower screens collapse in place without a hydration mismatch.
 */
export function LandingScreen() {
  const router = useRouter();
  const playHref = usePlayFreeHref();
  const scroller = useRef<ScrollView>(null);
  const offsets = useRef<Partial<Record<Section, number>>>({});
  const [width, setWidth] = useState<number | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);

  const layout: Layout =
    width === null || width >= WIDE ? "wide" : width >= NARROW ? "mid" : "narrow";
  const wide = layout === "wide";
  const narrow = layout === "narrow";
  const gutter = GUTTER[layout];
  const content = (width ?? 1440) - gutter * 2;

  const mark = (section: Section) => (e: LayoutChangeEvent) => {
    offsets.current[section] = e.nativeEvent.layout.y;
  };
  const scrollTo = (section: Section) =>
    scroller.current?.scrollTo({ y: offsets.current[section] ?? 0, animated: true });

  // The vignette keeps its drawn proportions; it scales down when the column is narrower.
  // On phones the note leaves the table and sits full width under it, so it stays readable.
  const feltOnly = !wide && content - 12 < HERO_TABLE_WIDTH;
  const tableScale = wide
    ? 1
    : Math.min(1, (content - 24) / (feltOnly ? FELT_ONLY_WIDTH : HERO_TABLE_WIDTH));
  const pad = { paddingHorizontal: gutter };

  const tileColumns = wide ? 5 : narrow ? 1 : 3;
  const tileWidth = (content - 16 * (tileColumns - 1)) / tileColumns;

  return (
    <View style={styles.root} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView ref={scroller} style={styles.root}>
        {/* Nav */}
        <View
          style={[styles.nav, pad, { gap: narrow ? 12 : 40 }]}
          role="navigation"
          accessibilityLabel="Site"
        >
          <Logo />
          <View style={styles.navLinks}>
            {narrow ? null : (
              <>
                <NavLink label="Games" onPress={() => scrollTo("games")} />
                {wide ? (
                  <>
                    <NavLink label="How coaching works" onPress={() => scrollTo("how")} />
                    <NavLink label="Community strategies" onPress={() => scrollTo("community")} />
                  </>
                ) : null}
                <NavLink label="Pricing" href="/pricing" />
              </>
            )}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign in"
            aria-expanded={signInOpen}
            onPress={() => setSignInOpen((open) => !open)}
            style={styles.navTap}
          >
            <Text style={[ui(15, 500), { color: colors.foreground }]}>Sign in</Text>
          </Pressable>
          <Link href={playHref} asChild>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Play free"
              style={styles.navCta}
            >
              <Text style={[ui(15, 600), { color: colors.primaryForeground }]}>Play free</Text>
            </Pressable>
          </Link>
        </View>
        {signInOpen ? (
          <View style={[pad, styles.signInRow]}>
            <Notice
              style={styles.signIn}
              title="No account needed: your progress stays on this device"
              body="Tableside has no sign-in in this build. Everything you play, your profile and your stats are saved locally, and nothing is sent anywhere."
              onClose={() => setSignInOpen(false)}
            />
          </View>
        ) : null}

        {/* Hero */}
        <View
          style={[
            styles.hero,
            pad,
            wide ? styles.heroWide : styles.heroStacked,
            narrow && { paddingTop: 32, paddingBottom: 48 },
          ]}
        >
          <RadialFill
            from={colors.felt}
            fromOpacity={0.8}
            to={colors.background}
            toOpacity={0}
            center={{ x: 0.78, y: 0.45 }}
            size={{ width: 1.1, height: 1.5 }}
          />
          <View style={[styles.heroCopy, wide && { width: 600 }]}>
            <Badge
              icon={ShieldCheck}
              tone="correct"
              label="Practice only · no real-money wagering, ever"
              labelColor={colors.foreground}
              style={styles.eyebrowBadge}
            />
            <Text
              accessibilityRole="header"
              aria-level={1}
              style={[
                display(narrow ? 42 : 64, 500, {
                  lineHeight: (narrow ? 42 : 64) * 1.05,
                  letterSpacing: -1,
                }),
                { color: colors.foreground },
              ]}
            >
              Walk up to the table already knowing the move.
            </Text>
            <Text
              style={[
                ui(narrow ? 17 : 19, 400, { lineHeight: (narrow ? 17 : 19) * 1.5 }),
                { color: colors.mutedForeground },
              ]}
            >
              Real casino rules and payouts for blackjack, roulette, craps, video poker and baccarat
              — with a dealer-coach who catches every mistake, explains why, and lets you take it
              back.
            </Text>
            <View style={styles.ctas}>
              <Link href={playHref} asChild>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="Play free now — no signup"
                  style={styles.heroCta}
                >
                  <Play size={20} color={colors.primaryForeground} strokeWidth={2} />
                  <Text style={[ui(17, 600), { color: colors.primaryForeground }]}>
                    Play free now — no signup
                  </Text>
                </Pressable>
              </Link>
              <Button
                variant="ghost"
                icon={CirclePlay}
                label="See the coach in 40s"
                accessibilityHint="Opens the blackjack table, where the coach explains every decision"
                onPress={() => router.push("/play")}
                style={{ height: 56 }}
              />
            </View>
            <View style={styles.trust}>
              <Trust icon={Ban} label="No chips to buy" />
              <Trust icon={EyeOff} label="No ads" />
              <Trust icon={Smartphone} label="Web, iOS & Android" />
            </View>
          </View>
          <View style={[wide ? styles.heroTableWide : { marginLeft: 12 * tableScale }]}>
            <HeroTable scale={tableScale} feltOnly={feltOnly} />
          </View>
          {feltOnly ? <HeroCoachNote width="100%" /> : null}
        </View>

        {/* How it teaches */}
        <View
          onLayout={mark("how")}
          style={[
            styles.paper,
            pad,
            styles.section,
            wide ? styles.row : styles.column,
            { gap: wide ? 80 : 40 },
            narrow && styles.sectionNarrow,
          ]}
        >
          <View style={[styles.intro, wide && { width: 440 }]}>
            <Text style={[styles.eyebrow, { color: colors.mistakeInk }]}>HOW IT TEACHES</Text>
            <Text
              accessibilityRole="header"
              aria-level={2}
              style={[styles.sectionTitle, narrow && styles.sectionTitleNarrow, styles.ink]}
            >
              A dealer at your shoulder, not a pop-up.
            </Text>
            <Text style={[ui(18, 400, { lineHeight: 18 * 1.55 }), { color: colors.inkMuted }]}>
              Most trainers flash red when you&apos;re wrong. Tableside stops the hand, tells you
              what a good player would do and why, then lets you replay it. You learn the move
              instead of memorising a chart.
            </Text>
          </View>
          <View style={styles.flex}>
            {STEPS.map((step, i) => (
              <View
                key={step.num}
                style={[styles.step, i > 0 && styles.stepRule, { gap: narrow ? 16 : 28 }]}
              >
                <Text style={[display(28, 400), styles.stepNum]}>{step.num}</Text>
                <View style={styles.stepCopy}>
                  <Text style={[ui(21, 600, { lineHeight: 25 }), styles.ink]}>{step.title}</Text>
                  <Text
                    style={[ui(16, 400, { lineHeight: 16 * 1.55 }), { color: colors.inkMuted }]}
                  >
                    {step.body}
                  </Text>
                </View>
                {narrow ? null : <step.icon size={24} color={colors.inkMuted} strokeWidth={2} />}
              </View>
            ))}
          </View>
        </View>

        {/* The tables */}
        <View
          onLayout={mark("games")}
          style={[pad, styles.section, styles.lineup, narrow && styles.sectionNarrow]}
        >
          <View style={[styles.lineupHead, !wide && styles.column]}>
            <View style={styles.headCopy}>
              <Text style={[styles.eyebrow, { color: colors.primary }]}>THE TABLES</Text>
              <Text
                accessibilityRole="header"
                aria-level={2}
                style={[styles.sectionTitle, narrow && styles.sectionTitleNarrow, styles.light]}
              >
                Five games. Real rules. Real payouts.
              </Text>
            </View>
            <Text
              style={[
                ui(16, 400, { lineHeight: 24 }),
                { color: colors.mutedForeground, maxWidth: 360 },
              ]}
            >
              Every table is free to play. Rules are configurable to match the casino you&apos;re
              visiting.
            </Text>
          </View>
          <View style={styles.tiles}>
            {TABLES.map((table) => (
              <Tile key={table.id} table={table} width={tileWidth} />
            ))}
          </View>
        </View>

        {/* Community strategies */}
        <View
          onLayout={mark("community")}
          style={[
            pad,
            styles.section,
            wide ? styles.row : styles.column,
            { gap: wide ? 72 : 40, alignItems: wide ? "center" : "stretch" },
            narrow && styles.sectionNarrow,
          ]}
        >
          <Gradient from={colors.feltDeep} to={colors.background} />
          <View style={[styles.intro, wide && { width: 480 }]}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>COMMUNITY STRATEGIES</Text>
            <Text
              accessibilityRole="header"
              aria-level={2}
              style={[styles.sectionTitle, narrow && styles.sectionTitleNarrow, styles.light]}
            >
              Learn the playbook. Then write your own.
            </Text>
            <Text
              style={[ui(18, 400, { lineHeight: 18 * 1.55 }), { color: colors.mutedForeground }]}
            >
              Players publish strategies for every game. Load one and the coach checks every
              decision against it, just like house basic strategy.
            </Text>
            <View style={styles.points}>
              <Point icon={GitFork}>
                Fork any strategy. The original author stays credited on every copy.
              </Point>
              <Point icon={BadgeCheck}>
                Every submission is rules-checked against the game engine.
              </Point>
              <Point icon={ChartNoAxesColumn}>
                Ranked by how well learners play it, not by hype.
              </Point>
            </View>
          </View>
          <View style={[styles.flex, styles.cards]}>
            <View style={[narrow ? styles.column : styles.row, { gap: 16 }]}>
              {EXAMPLE_STRATEGIES.map((s) => (
                <StrategyCard
                  key={s.title}
                  rank={s.rank}
                  title={s.title}
                  game={s.game}
                  description={s.description}
                  votes={s.votes}
                  forks={s.forks}
                  accuracy={s.accuracy}
                  author={s.author}
                  authorColor={s.authorColor}
                  verified
                  width="auto"
                />
              ))}
            </View>
            <View style={styles.fork}>
              <GitFork size={20} color={colors.primary} strokeWidth={2} />
              <View style={styles.forkText}>
                <Text style={[ui(15, 600), styles.light]}>{EXAMPLE_FORK.title}</Text>
                <Text style={[ui(13), { color: colors.mutedForeground }]}>
                  {EXAMPLE_FORK.lineage}
                </Text>
              </View>
              <Badge
                icon={ArrowBigUp}
                tone="primary"
                labelColor={colors.foreground}
                label={EXAMPLE_FORK.badge}
              />
            </View>
            <Text style={[ui(12), { color: colors.mutedForeground }]}>
              Example strategies, shown to illustrate the library. They are sample data, not live
              community posts.
            </Text>
          </View>
        </View>

        {/* Pricing teaser */}
        <View
          style={[
            styles.paper,
            pad,
            styles.section,
            styles.pricing,
            narrow && styles.sectionNarrow,
          ]}
        >
          <View style={styles.pricingHead}>
            <Text
              accessibilityRole="header"
              aria-level={2}
              style={[
                styles.sectionTitle,
                narrow && styles.sectionTitleNarrow,
                styles.ink,
                styles.center,
              ]}
            >
              Free to play. Pay only to go deeper.
            </Text>
            <Text
              style={[ui(18, 400, { lineHeight: 26 }), styles.center, { color: colors.inkMuted }]}
            >
              No chips to buy, no ads, no real-money wagering, now or later.
            </Text>
          </View>
          <View style={[wide || layout === "mid" ? styles.planRow : styles.column, { gap: 16 }]}>
            {PLANS.map((plan) => {
              const featured = "featured" in plan;
              const fg = featured ? colors.paper : colors.ink;
              return (
                <View key={plan.name} style={[styles.plan, featured && styles.planFeatured]}>
                  <View style={styles.planTop}>
                    <Text style={[ui(16, 600), { color: fg }]}>{plan.name}</Text>
                    {featured ? <Tag label="7-day free trial" /> : null}
                  </View>
                  <View style={styles.planPrice}>
                    <Text style={[display(44, 500, { lineHeight: 44 }), { color: fg }]}>
                      {plan.amount}
                    </Text>
                    <Text
                      style={[ui(14), { color: featured ? marketing.paperMuted : colors.inkMuted }]}
                    >
                      {plan.per}
                    </Text>
                  </View>
                  <Text
                    style={[
                      ui(15, 400, { lineHeight: 22 }),
                      { color: featured ? marketing.paperSoft : colors.inkMuted },
                    ]}
                  >
                    {plan.desc}
                  </Text>
                </View>
              );
            })}
          </View>
          <View style={styles.pricingCtas}>
            <Link href={playHref} asChild>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="Play free now, no signup"
                style={styles.inkCta}
              >
                <Play size={18} color={colors.paper} strokeWidth={2} />
                <Text style={[ui(15, 600), { color: colors.paper }]}>Play free now, no signup</Text>
              </Pressable>
            </Link>
            <Link href="/pricing" asChild>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="See full pricing"
                style={styles.navTap}
              >
                <Text style={[ui(15, 600), styles.ink]}>See full pricing</Text>
              </Pressable>
            </Link>
          </View>
        </View>

        {/* Footer */}
        <View style={[pad, styles.footer, !wide && styles.column]}>
          <View style={[styles.responsible, wide && { width: 620 }]}>
            <Text style={[display(22, 600), styles.light]}>Tableside</Text>
            <Text
              style={[ui(14, 400, { lineHeight: 14 * 1.6 }), { color: colors.mutedForeground }]}
            >
              Tableside is a training tool for casino table games. It offers no real-money gambling,
              and nothing here can make you win at a casino. The house always keeps its edge. If
              gambling stops being fun, call 1-800-GAMBLER or visit ncpgambling.org.
            </Text>
          </View>
          <View style={styles.footerLinks}>
            <FooterLink label="Games" onPress={() => scrollTo("games")} />
            <FooterLink label="Pricing" href="/pricing" />
            <FooterLink label="Community guidelines" onPress={() => scrollTo("community")} />
            {/* No pages yet for these; shown as plain text rather than links that go nowhere. */}
            <FooterLink label="Privacy" />
            <FooterLink label="Terms" />
            <FooterLink label="Accessibility" />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function NavLink({ label, href, onPress }: { label: string; href?: string; onPress?: () => void }) {
  const text = <Text style={[ui(15, 500), { color: colors.mutedForeground }]}>{label}</Text>;
  if (href) {
    return (
      <Link href={href} asChild>
        <Pressable accessibilityRole="link" accessibilityLabel={label} style={styles.navTap}>
          {text}
        </Pressable>
      </Link>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.navTap}
    >
      {text}
    </Pressable>
  );
}

function FooterLink({
  label,
  href,
  onPress,
}: {
  label: string;
  href?: string;
  onPress?: () => void;
}) {
  const text = <Text style={[ui(14), { color: colors.mutedForeground }]}>{label}</Text>;
  if (href) {
    return (
      <Link href={href} asChild>
        <Pressable accessibilityRole="link" accessibilityLabel={label} style={styles.navTap}>
          {text}
        </Pressable>
      </Link>
    );
  }
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={styles.navTap}
      >
        {text}
      </Pressable>
    );
  }
  return <View style={styles.navTap}>{text}</View>;
}

function Trust({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <View style={styles.trustItem}>
      <Icon size={16} color={colors.mutedForeground} strokeWidth={2} />
      <Text style={[ui(14), { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function Point({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <View style={styles.point}>
      <Icon size={20} color={colors.primary} strokeWidth={2} />
      <Text style={[ui(16, 400, { lineHeight: 22 }), styles.light, styles.flex]}>{children}</Text>
    </View>
  );
}

function Tile({ table, width }: { table: TableTile; width: number }) {
  return (
    <Link href={table.href} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Play ${table.name} free`}
        // Link asChild hands its child's style to the DOM: pass one flat object, not a function.
        style={StyleSheet.flatten([styles.tile, { width }])}
      >
        <Image source={table.image} style={styles.tileImage} resizeMode="cover" />
        <View style={styles.tileBody}>
          <Text style={[display(24, 500), styles.light]}>{table.name}</Text>
          <Text style={[ui(13, 600), { color: colors.primary }]}>{table.rules}</Text>
          <Text style={[ui(14, 400, { lineHeight: 20 }), { color: colors.mutedForeground }]}>
            {table.learn}
          </Text>
          <View style={styles.tileLink}>
            <Text style={[ui(15, 600), styles.light]}>Play free</Text>
            <ArrowRight size={16} color={colors.foreground} strokeWidth={2} />
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  row: { flexDirection: "row" },
  column: { flexDirection: "column" },
  center: { textAlign: "center" },
  ink: { color: colors.ink },
  light: { color: colors.foreground },

  nav: { height: 72, flexDirection: "row", alignItems: "center" },
  navLinks: { flex: 1, flexDirection: "row", alignItems: "center", gap: 28 },
  navTap: { minHeight: 44, justifyContent: "center" },
  navCta: {
    height: 44,
    paddingHorizontal: 20,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  signInRow: { alignItems: "flex-end", paddingBottom: 8 },
  signIn: { maxWidth: 440, width: "100%" },

  hero: { overflow: "hidden" },
  heroWide: {
    minHeight: 720,
    flexDirection: "row",
    alignItems: "center",
    gap: 48,
    paddingTop: 56,
    paddingBottom: 72,
  },
  heroStacked: { flexDirection: "column", gap: 40, paddingTop: 48, paddingBottom: 64 },
  heroCopy: { gap: 28 },
  heroTableWide: { flex: 1, height: 592, paddingTop: 0 },
  eyebrowBadge: { alignSelf: "flex-start" },
  ctas: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 },
  heroCta: {
    height: 56,
    paddingHorizontal: 28,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  trust: { flexDirection: "row", flexWrap: "wrap", gap: 24, rowGap: 12 },
  trustItem: { flexDirection: "row", alignItems: "center", gap: 8 },

  section: { paddingVertical: 96, overflow: "hidden" },
  sectionNarrow: { paddingVertical: 56 },
  paper: { backgroundColor: colors.paper },
  intro: { gap: 20 },
  eyebrow: { ...ui(12, 700, { letterSpacing: 2 }) },
  sectionTitle: { ...display(44, 500, { lineHeight: 44 * 1.1 }) },
  sectionTitleNarrow: { ...display(34, 500, { lineHeight: 34 * 1.1 }) },

  step: { flexDirection: "row", paddingVertical: 28 },
  stepRule: { borderTopWidth: 1, borderTopColor: colors.paperBorder },
  stepNum: { width: 48, color: colors.mistakeInk },
  stepCopy: { flex: 1, gap: 8 },

  lineup: { gap: 40 },
  lineupHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 16,
  },
  headCopy: { gap: 12, flexShrink: 1 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 16, alignItems: "flex-start" },
  tile: {
    overflow: "hidden",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  tileImage: { width: "100%", height: 180 },
  tileBody: { padding: 20, gap: 8 },
  tileLink: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 8 },

  points: { gap: 14, paddingTop: 8 },
  point: { flexDirection: "row", alignItems: "center", gap: 12 },
  cards: { gap: 16 },
  fork: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: marketing.wash,
  },
  forkText: { flex: 1, minWidth: 200, gap: 2 },

  pricing: { gap: 40 },
  pricingHead: { gap: 12, alignItems: "center" },
  plan: {
    flex: 1,
    gap: 14,
    padding: 28,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.paperBorder,
    backgroundColor: marketing.paperCard,
  },
  planRow: { flexDirection: "row", alignItems: "flex-start" },
  planFeatured: { backgroundColor: colors.ink, borderColor: colors.ink },
  planTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  planPrice: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  pricingCtas: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  inkCta: {
    height: 52,
    paddingHorizontal: 20,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 48,
    rowGap: 24,
    paddingVertical: 48,
  },
  responsible: { gap: 10, flexShrink: 1 },
  footerLinks: { flexDirection: "row", flexWrap: "wrap", columnGap: 28, alignItems: "flex-start" },
});
