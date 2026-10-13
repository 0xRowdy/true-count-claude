/**
 * The Tableside design-system sheet: every token and component on one page, laid out like
 * the design's "Design System — Tableside" frame (bi8Au), then the variants and shared
 * primitives the sheet does not show. It is the visual test bed for src/ui/ds.
 */

import { useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
  AppHeader,
  AppShell,
  Avatar,
  Badge,
  BetSpot,
  Button,
  CardBack,
  Chip,
  ChipRack,
  CoachNote,
  Die,
  ListRow,
  Panel,
  PhaseStepper,
  PhoneStatusBar,
  PlayingCard,
  ProgressBar,
  SegmentedControl,
  SelectableCard,
  StatCard,
  StrategyCard,
  TableTopBar,
  Tabs,
  ToggleChip,
  colors,
  display,
  icons,
  penVariables,
  portraits,
  space,
  surfaces,
  type,
  ui,
  type ChipValue,
} from "@/ui/ds";

type PenColor = keyof typeof penVariables;

const SWATCH_GROUPS: ReadonlyArray<{ name: string; tokens: ReadonlyArray<PenColor> }> = [
  {
    name: "App surface",
    tokens: [
      "--background",
      "--card",
      "--muted",
      "--border",
      "--foreground",
      "--muted-foreground",
      "--primary",
    ],
  },
  {
    name: "Table",
    tokens: ["--felt", "--felt-deep", "--felt-line", "--rail", "--paper", "--ink"],
  },
  { name: "Coach & feedback", tokens: ["--coach", "--coach-accent", "--correct", "--mistake"] },
  {
    name: "Suits (4-colour deck)",
    tokens: ["--suit-spade", "--suit-heart", "--suit-diamond", "--suit-club"],
  },
  {
    name: "Chips",
    tokens: ["--chip-1", "--chip-5", "--chip-25", "--chip-100", "--chip-500", "--chip-1k"],
  },
];

/** The remaining colour variables, which the design sheet does not draw. */
const SUPPORTING: ReadonlyArray<PenColor> = [
  "--card-foreground",
  "--popover",
  "--input",
  "--ring",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--accent",
  "--destructive",
  "--felt-text",
  "--paper-2",
  "--ink-muted",
  "--paper-border",
  "--correct-ink",
  "--mistake-ink",
];

const SPACING = [1, 2, 3, 4, 6, 8, 12, 16] as const;

export function DesignSystemSheet() {
  const [narrow, setNarrow] = useState(false);
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.sheet, narrow && styles.sheetNarrow]}
      onLayout={(e) => setNarrow(e.nativeEvent.layout.width < 720)}
    >
      <Header />
      <ColorTokens />
      <View style={styles.typeAndSpacing}>
        <TypeScale />
        <SpacingScale />
      </View>
      <Components />
      <Variants />
    </ScrollView>
  );
}

function Header() {
  return (
    <View style={{ gap: space[2] }}>
      <Text style={[type.eyebrow, { color: colors.primary }]}>Design system · v1</Text>
      <Text accessibilityRole="header" style={[type.display, { color: colors.foreground }]}>
        Tableside
      </Text>
      <Text style={[ui(16, 400, { lineHeight: 24 }), styles.sub]}>
        Premium · instructional · social. Tokens follow shadcn naming so the web build maps 1:1;
        casino tokens (felt, suits, chips, coach) extend it for every game.
      </Text>
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text accessibilityRole="header" style={[type.section, { color: colors.foreground }]}>
      {children}
    </Text>
  );
}

function Swatch({ token }: { token: PenColor }) {
  const hex = String(penVariables[token]);
  return (
    <View style={styles.swatch} accessible accessibilityLabel={`${token} ${hex}`}>
      <View style={[styles.swatchChip, { backgroundColor: hex }]} />
      <Text style={[ui(10), { color: colors.mutedForeground }]}>{token.slice(2)}</Text>
      <Text style={[ui(10), { color: surfaces.caption }]}>{hex}</Text>
    </View>
  );
}

function SwatchGroup({ name, tokens }: { name: string; tokens: ReadonlyArray<PenColor> }) {
  return (
    <View style={{ gap: 10 }}>
      <Text style={[ui(12, 600), { color: colors.mutedForeground }]}>{name}</Text>
      <View style={styles.swatchRow}>
        {tokens.map((t) => (
          <Swatch key={t} token={t} />
        ))}
      </View>
    </View>
  );
}

function ColorTokens() {
  return (
    <View style={{ gap: 20 }}>
      <SectionTitle>Color</SectionTitle>
      <View style={styles.swatchGroups}>
        {SWATCH_GROUPS.map((g) => (
          <SwatchGroup key={g.name} name={g.name} tokens={g.tokens} />
        ))}
      </View>
      <SwatchGroup name="Supporting" tokens={SUPPORTING} />
    </View>
  );
}

function TypeScale() {
  const sample = (style: object, text: string) => (
    <Text style={[style, { color: colors.foreground }]}>{text}</Text>
  );
  return (
    <View style={{ gap: 12, flexShrink: 1 }}>
      <SectionTitle>Type</SectionTitle>
      {sample(type.display, "Display 56 / Fraunces")}
      {sample(type.heading, "Heading 32 / Fraunces")}
      {sample(type.title, "Title 20 / Inter Semibold")}
      {sample(ui(16), "Body 16 / Inter — minimum body size for 50+ readers")}
      {sample(type.label, "Label 13 / Inter Medium")}
    </View>
  );
}

function SpacingScale() {
  return (
    <View style={{ gap: 12 }}>
      <SectionTitle>Spacing & radius</SectionTitle>
      <View style={styles.steps}>
        {SPACING.map((k) => (
          <View key={k} style={styles.step}>
            <View style={[styles.stepBar, { height: space[k] }]} />
            <Text style={[ui(11), { color: colors.mutedForeground }]}>{space[k]}</Text>
          </View>
        ))}
      </View>
      <Text style={[ui(13), { color: colors.mutedForeground }]}>
        4-pt grid · radius sm 6 / md 10 / lg 16 / pill · minimum tap target 44 × 44
      </Text>
    </View>
  );
}

function Row({ children, gap = 24, align = "center" }: RowProps) {
  return <View style={[styles.row, { gap, alignItems: align }]}>{children}</View>;
}
type RowProps = { children: ReactNode; gap?: number; align?: "center" | "flex-start" };

function Components() {
  return (
    <View style={{ gap: 24 }}>
      <SectionTitle>Components</SectionTitle>
      <Row>
        <Button label="Primary" icon={icons.Play} variant="primary" />
        <Button label="Secondary" icon={icons.Play} variant="secondary" />
        <Button label="Ghost" icon={icons.Play} variant="ghost" />
        <Button label="Table" icon={icons.Play} variant="table" />
        <Badge label="Badge" />
      </Row>

      <View style={styles.felt}>
        <Chip value={5} />
        <Row gap={8}>
          {([1, 25, 100, 500, 1000] as const).map((v) => (
            <Chip key={v} value={v} />
          ))}
        </Row>
        <PlayingCard rank="A" suit="s" />
        <Row gap={6}>
          <PlayingCard rank="K" suit="h" />
          <PlayingCard rank="10" suit="d" />
          <PlayingCard rank="7" suit="c" />
        </Row>
        <CardBack />
        <BetSpot label="PASS LINE" pays="pays 1:1" />
      </View>

      <Row gap={32} align="flex-start">
        <CoachNote
          title="Hit. 12 against a dealer 7 is a hit."
          body="A 7 means the dealer likely makes 17+. Standing on 12 wins only ~26% of the time; hitting gives you a real chance to improve."
          primary={{ label: "Hit" }}
          secondary={{ label: "Show the chart" }}
        />
        <CoachNote
          variant="mistake"
          title="You stood on soft 17. The chart says double vs 5."
          body="An Ace counts as 1 or 11, so you can't bust with one card. Against a weak 5 the dealer busts ~43% of the time — that's when you put more money out."
          primary={{ label: "Take it back & double" }}
          secondary={{ label: "Keep my move" }}
        />
        <StatCard label="Decision accuracy" value="94.2%" delta="+3.1 pts this week" />
      </Row>

      <View style={styles.headerFrame}>
        <AppHeader active="lobby" chips={12450} />
      </View>

      <StrategyCard
        rank={1}
        title="Hi-Lo with Illustrious 18"
        game="Blackjack · 6 deck · S17"
        description="Basic strategy plus the 18 index plays that matter most. Drills true-count conversion before every bet."
        votes="2.4k"
        forks="318"
        accuracy="Avg. learner 91%"
        author="@shoe_reader"
        verified
      />

      <Row gap={32} align="flex-start">
        <PhoneStatusBar />
        <View style={styles.phone}>
          <TableTopBar title="Blackjack" subtitle="6 deck · S17 · 3:2 · $10–$500" bankroll={2450} />
        </View>
        <View style={styles.phone}>
          <PhaseStepper current={0} />
        </View>
        <View style={styles.phone}>
          <ChipRack selected={25} />
        </View>
      </Row>
    </View>
  );
}

function Variants() {
  const [chip, setChip] = useState<ChipValue>(25);
  const [coach, setCoach] = useState<"asked" | "mistakes" | "every">("every");
  const [game, setGame] = useState("blackjack");
  const [goal, setGoal] = useState("trip");
  const [games, setGames] = useState<ReadonlyArray<string>>(["Blackjack", "Craps"]);
  const toggle = (g: string) =>
    setGames((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]));

  return (
    <View style={{ gap: 24 }}>
      <SectionTitle>Variants & primitives</SectionTitle>

      <Label>Button sizes · without icon · disabled (unavailable, never a legal action)</Label>
      <Row gap={16}>
        <Button label="Small" size="sm" variant="secondary" />
        <Button label="Medium" />
        <Button label="Continue" size="lg" />
        <Button label="Back" size="lg" variant="secondary" icon={icons.ArrowLeft} />
        <Button label="Deal" disabled accessibilityHint="Place a bet first" />
      </Row>

      <Label>Badge tones</Label>
      <Row gap={12}>
        <Badge label="Muted" />
        <Badge label="Practice" tone="primary" />
        <Badge label="Correct" tone="correct" icon={icons.Check} />
        <Badge label="Mistake" tone="mistake" icon={icons.RotateCcw} />
      </Row>

      <Label>Cards · sm / md / lg · face down</Label>
      <Row gap={12}>
        <PlayingCard rank="Q" suit="h" size="sm" />
        <PlayingCard rank="Q" suit="h" />
        <PlayingCard rank="Q" suit="h" size="lg" />
        <PlayingCard rank="J" suit="c" faceDown />
        <PlayingCard rank="J" suit="c" size="sm" faceDown />
      </Row>

      <Label>Selectable chips (tap) · chip rack</Label>
      <View style={[styles.felt, { paddingVertical: 16 }]}>
        <Row gap={12}>
          {([1, 5, 25, 100, 500, 1000] as const).map((v) => (
            <Chip key={v} value={v} selected={v === chip} onPress={() => setChip(v)} />
          ))}
        </Row>
        <BetSpot label="BET" pays="pays 3:2" onPress={() => undefined} active />
      </View>
      <View style={styles.phone}>
        <ChipRack selected={chip} onSelect={setChip} />
      </View>

      <Label>Coach note · good call</Label>
      <CoachNote
        variant="good"
        title="Right call. Doubling 11 against a 6 is the strongest play at the table."
        body="The dealer busts often from a 6, and one more card gives you a strong total."
        primary={{ label: "Next hand" }}
      />

      <Label>Phase stepper · step 3 (two complete)</Label>
      <View style={styles.phone}>
        <PhaseStepper current={2} />
      </View>

      <Label>Avatars · progress</Label>
      <Row gap={12}>
        <Avatar name="Marcus" source={portraits.dealer} size={40} />
        <Avatar name="You" source={portraits.player} size={40} />
        <Avatar name="@shoe_reader" size={40} />
        <Avatar name="Dice Control Dee" color={colors.chip25} size={40} />
        <Avatar name="Plain" color={colors.chip1k} size={22} plain />
      </Row>
      <View style={{ gap: 12, maxWidth: 300 }}>
        <ProgressBar value={1} color={colors.correct} accessibilityLabel="Hard totals" />
        <ProgressBar value={0.56} accessibilityLabel="Soft totals" />
        <ProgressBar value={0.3} color={colors.mistake} accessibilityLabel="Doubles" />
      </View>

      <Label>Segmented control · tabs</Label>
      <View style={{ maxWidth: 420 }}>
        <SegmentedControl
          accessibilityLabel="How often the coach speaks up"
          value={coach}
          onChange={setCoach}
          options={[
            { value: "asked", label: "Only if asked" },
            { value: "mistakes", label: "On mistakes" },
            { value: "every", label: "Every decision" },
          ]}
        />
      </View>
      <Tabs
        accessibilityLabel="Game"
        value={game}
        onChange={setGame}
        options={[
          { value: "all", label: "All games" },
          { value: "blackjack", label: "Blackjack" },
          { value: "craps", label: "Craps" },
          { value: "video-poker", label: "Video Poker" },
          { value: "roulette", label: "Roulette" },
          { value: "baccarat", label: "Baccarat" },
        ]}
      />

      <Label>Selectable cards · toggle chips</Label>
      <View style={{ gap: 12, maxWidth: 640 }} accessibilityRole="radiogroup">
        <SelectableCard
          icon={icons.PartyPopper}
          title="Have fun"
          description="Jump into a table. The coach stays quiet unless you ask."
          selected={goal === "fun"}
          onPress={() => setGoal("fun")}
        />
        <SelectableCard
          icon={icons.Plane}
          title="Learn before a trip"
          description="Get table-ready fast: rules, etiquette and the core strategy for the games you'll play."
          selected={goal === "trip"}
          onPress={() => setGoal("trip")}
        />
        <SelectableCard
          icon={icons.Target}
          title="Master strategy"
          description="Drill decisions until they're automatic. Counting, systems and every variant."
          selected={goal === "master"}
          onPress={() => setGoal("master")}
        />
      </View>
      <Row gap={8}>
        {["Blackjack", "Craps", "Roulette", "Video Poker", "Baccarat"].map((g) => (
          <ToggleChip key={g} label={g} selected={games.includes(g)} onPress={() => toggle(g)} />
        ))}
      </Row>

      <Label>Panel · list rows · dice</Label>
      <Row gap={32} align="flex-start">
        <Panel title="Session stats" aside="This month" style={{ width: 360 }}>
          <ListRow label="Sessions" value="38" />
          <ListRow label="Avg. session" value="14 min" />
          <ListRow label="Longest win streak" value="7 hands" tone="correct" />
          <ListRow label="Coach corrections" value="1 per 31 decisions" divider={false} />
        </Panel>
        <View style={[styles.felt, { gap: 12 }]}>
          {([1, 2, 3, 4, 5, 6] as const).map((v, i) => (
            <Die key={v} value={v} rotation={i % 2 ? -10 : -8} />
          ))}
        </View>
      </Row>

      <Label>App shell (header + padded content)</Label>
      <View style={styles.shellFrame}>
        <AppShell active="progress" chips={12450}>
          <Text style={[display(40, 600), { color: colors.foreground }]}>Your progress</Text>
          <Text style={[type.body, { color: colors.mutedForeground }]}>
            Pages wrap themselves in AppShell with their nav item active.
          </Text>
        </AppShell>
      </View>
    </View>
  );
}

function Label({ children }: { children: string }) {
  return <Text style={[ui(12, 600), { color: colors.mutedForeground }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  sheet: { padding: 64, gap: 48 },
  sheetNarrow: { padding: 16, gap: 32 },
  sub: { color: colors.mutedForeground, maxWidth: 820 },
  swatchGroups: { flexDirection: "row", flexWrap: "wrap", columnGap: 32, rowGap: 24 },
  swatchRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  swatch: { width: 64, gap: 6 },
  swatchChip: {
    width: 64,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: surfaces.hairline,
  },
  typeAndSpacing: { flexDirection: "row", flexWrap: "wrap", gap: 64 },
  steps: { flexDirection: "row", alignItems: "flex-end", gap: 16 },
  step: { alignItems: "center", gap: 6 },
  stepBar: { width: 24, borderRadius: 2, backgroundColor: colors.primary },
  row: { flexDirection: "row", flexWrap: "wrap" },
  felt: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 28,
    padding: 24,
    borderRadius: 12,
    backgroundColor: colors.felt,
  },
  headerFrame: { width: 1440, maxWidth: "100%" },
  phone: { width: 390, maxWidth: "100%" },
  shellFrame: {
    height: 320,
    maxWidth: 1440,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    overflow: "hidden",
  },
});
