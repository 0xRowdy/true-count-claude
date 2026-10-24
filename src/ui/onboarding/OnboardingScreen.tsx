import { Link, Stack, useRouter } from "expo-router";
import { TripDatePicker } from "./TripDatePicker";
import { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  COACH_LEVELS,
  GAME_NAMES,
  GAMES,
  isIsoDate,
  localIsoDate,
  type CoachLevel,
  type GameId,
  type Goal,
  type Skill,
} from "@/state/profile";
import {
  Button,
  colors,
  display,
  Logo,
  marketing,
  RadialFill,
  radius,
  SegmentedControl,
  SelectableCard,
  surfaces,
  ToggleChip,
  ui,
} from "@/ui/ds";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Dices,
  GraduationCap,
  Hand,
  PartyPopper,
  Plane,
  Spade,
  Sprout,
  Target,
  Trophy,
  type LucideIcon,
} from "@/ui/ds/icons";
import { updateProfile, useProfile } from "@/ui/profile/profileStore";
import {
  addDays,
  GOAL_TITLE,
  SKILL_LABEL,
  startingStops,
  tripLine,
  type StopIcon,
} from "./startingPoint";

type Step = 1 | 2 | 3;
const STEPS = 3;

const SKILL_OPTIONS: ReadonlyArray<{ value: Skill; desc: string; icon: LucideIcon }> = [
  {
    value: "new",
    desc: "Never played, or only watched. We'll start with how a hand plays.",
    icon: Sprout,
  },
  {
    value: "few-times",
    desc: "You know the basics but guess on the close calls.",
    icon: Dices,
  },
  {
    value: "regular",
    desc: "You know basic strategy. Show me where I still give up an edge.",
    icon: Trophy,
  },
];

const GOAL_OPTIONS: ReadonlyArray<{
  value: Goal;
  title: string;
  desc: string;
  icon: LucideIcon;
}> = [
  {
    value: "fun",
    title: "Have fun",
    desc: "Jump into a table. The coach stays quiet unless you ask.",
    icon: PartyPopper,
  },
  {
    value: "trip",
    title: "Learn before a trip",
    desc: "Get table-ready fast: rules, etiquette and the core strategy for the games you'll play.",
    icon: Plane,
  },
  {
    value: "master",
    title: "Master strategy",
    desc: "Drill decisions until they're automatic. Counting, systems and every variant.",
    icon: Target,
  },
];

const COACH_OPTIONS: ReadonlyArray<{ value: CoachLevel; label: string }> = [
  { value: "asked", label: "Only if asked" },
  { value: "mistakes", label: "On mistakes" },
  { value: "every", label: "Every decision" },
];

const STOP_ICONS: Record<StopIcon, LucideIcon> = {
  hand: Hand,
  cap: GraduationCap,
  dice: Dices,
  cards: Spade,
  target: Target,
};

const NATIVE = Platform.OS !== "web";
const TRIP_PRESETS = [
  { label: "In 2 weeks", days: 14 },
  { label: "In a month", days: 30 },
  { label: "In 3 months", days: 91 },
] as const;

const WIDE = 1040;

/**
 * Onboarding (design frame aLrYu shows step 2): skill, then goal and games, then an optional
 * trip date and name. Every answer is written to the player profile as it is made, and the
 * "Your starting point" panel follows it live. Finishing or skipping marks the player
 * onboarded and goes to the lobby.
 */
export function OnboardingScreen() {
  const router = useRouter();
  const { profile, ready } = useProfile();
  const [step, setStep] = useState<Step>(1);
  const [width, setWidth] = useState<number | null>(null);
  // Today's date is a clock read: after mount only, so the prerendered page has none.
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(localIsoDate(new Date())), []);

  // The text fields keep what the player types; the profile keeps the cleaned value.
  const [name, setName] = useState("");
  const [trip, setTrip] = useState("");
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (!ready || seeded) return;
    setSeeded(true);
    setName(profile.name ?? "");
    setTrip(profile.tripDate ?? "");
  }, [ready, seeded, profile.name, profile.tripDate]);

  const wide = width === null || width >= WIDE;
  const narrow = width !== null && width < 640;

  const finish = () => {
    updateProfile({ onboarded: true });
    router.replace("/lobby");
  };
  const back = () => {
    if (step > 1) setStep((step - 1) as Step);
    else if (router.canGoBack()) router.back();
    else router.replace("/");
  };
  const next = () => (step === STEPS ? finish() : setStep((step + 1) as Step));

  const toggleGame = (game: GameId) => {
    const on = profile.games.includes(game);
    // At least one game stays chosen: the plan needs a table to start at.
    if (on && profile.games.length === 1) return;
    updateProfile({
      games: on
        ? profile.games.filter((g) => g !== game)
        : GAMES.filter((g) => g === game || profile.games.includes(g)),
    });
  };

  // Boolean(): a plain boolean, so `trip` is not narrowed by the type guard below.
  const tripValid = trip === "" || Boolean(isIsoDate(trip));
  // While a typed date is partial or invalid there is no trip date: the panel and the preset
  // chips clear rather than keep showing the previous one.
  const typing = trip !== "" && !tripValid;
  const tripPast = trip !== "" && tripValid && today !== null && trip < today;
  const setTripText = (text: string) => {
    setTrip(text);
    updateProfile({ tripDate: isIsoDate(text) ? text : null });
  };

  const stops = startingStops(profile);
  const tripRow = tripLine(profile, today);
  const owner = profile.name
    ? `${profile.name.toUpperCase()}'S STARTING POINT`
    : "YOUR STARTING POINT";

  return (
    <View style={styles.root} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.top, narrow && styles.topNarrow]}>
        <Link href="/" asChild>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Tableside home"
            style={styles.tap}
          >
            <Logo wordmark={!narrow} />
          </Pressable>
        </Link>
        <View
          style={styles.progress}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`Step ${step} of ${STEPS}`}
          accessibilityValue={{ min: 1, max: STEPS, now: step }}
        >
          {[1, 2, 3].map((n) => (
            <View
              key={n}
              style={[
                styles.seg,
                narrow && styles.segNarrow,
                { backgroundColor: n <= step ? colors.primary : colors.border },
              ]}
            />
          ))}
          <Text style={[ui(13), { color: colors.mutedForeground }]}>
            Step {step} of {STEPS}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip — just let me play"
          onPress={finish}
          style={styles.tap}
        >
          <Text style={[ui(14, 500), { color: colors.mutedForeground }]}>
            {narrow ? "Skip" : "Skip — just let me play"}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View
          style={[
            styles.body,
            wide ? styles.bodyWide : styles.bodyStacked,
            narrow && styles.bodyNarrow,
          ]}
        >
          <View style={[styles.question, wide && styles.questionWide]}>
            {step === 2 ? (
              <Previous
                label={`Skill: ${SKILL_LABEL[profile.skill]}`}
                onChange={() => setStep(1)}
              />
            ) : step === 3 ? (
              <Previous
                label={`Goal: ${GOAL_OPTIONS.find((g) => g.value === profile.goal)?.title}`}
                onChange={() => setStep(2)}
              />
            ) : null}

            <Text
              accessibilityRole="header"
              aria-level={1}
              style={[
                display(narrow ? 34 : 44, 500, { lineHeight: (narrow ? 34 : 44) * 1.15 }),
                { color: colors.foreground },
              ]}
            >
              {step === 1
                ? "How well do you know the tables?"
                : step === 2
                  ? "What brings you to the table?"
                  : profile.goal === "trip"
                    ? "When's the trip?"
                    : "Planning a casino trip?"}
            </Text>
            <Text style={[ui(17, 400, { lineHeight: 25 }), { color: colors.mutedForeground }]}>
              {step === 1
                ? "No wrong answers. The coach pitches every explanation to where you are."
                : step === 2
                  ? "We'll set up your first table and how much the coach chimes in. You can change this any time."
                  : "Both are optional. A date paces your plan; a name is just for the coach to use."}
            </Text>

            {step === 1 ? (
              <View
                style={styles.options}
                accessibilityRole="radiogroup"
                accessibilityLabel="Skill"
              >
                {SKILL_OPTIONS.map((o) => (
                  <SelectableCard
                    key={o.value}
                    title={SKILL_LABEL[o.value]}
                    description={o.desc}
                    icon={o.icon}
                    selected={profile.skill === o.value}
                    onPress={() => updateProfile({ skill: o.value })}
                  />
                ))}
              </View>
            ) : null}

            {step === 2 ? (
              <>
                <View
                  style={styles.options}
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Goal"
                >
                  {GOAL_OPTIONS.map((o) => (
                    <SelectableCard
                      key={o.value}
                      title={o.title}
                      description={o.desc}
                      icon={o.icon}
                      selected={profile.goal === o.value}
                      onPress={() => updateProfile({ goal: o.value })}
                    />
                  ))}
                </View>
                <View style={styles.followUp}>
                  <Text style={[ui(15, 600), { color: colors.foreground }]}>
                    Which games are you planning to play?
                  </Text>
                  <View style={styles.chips}>
                    {GAMES.map((g) => (
                      <ToggleChip
                        key={g}
                        label={GAME_NAMES[g]}
                        selected={profile.games.includes(g)}
                        onPress={() => toggleGame(g)}
                      />
                    ))}
                  </View>
                </View>
              </>
            ) : null}

            {step === 3 ? (
              <View style={styles.options}>
                <View style={styles.field}>
                  <Text nativeID="trip-label" style={[ui(15, 600), { color: colors.foreground }]}>
                    Trip date <Text style={{ color: colors.mutedForeground }}>(optional)</Text>
                  </Text>
                  <View style={styles.chips}>
                    {TRIP_PRESETS.map((p) => {
                      const date = today ? addDays(today, p.days) : null;
                      return (
                        <ToggleChip
                          key={p.label}
                          label={p.label}
                          selected={!typing && date !== null && profile.tripDate === date}
                          onPress={() => date && setTripText(date)}
                        />
                      );
                    })}
                    <ToggleChip
                      label="No date yet"
                      selected={!typing && profile.tripDate === null}
                      onPress={() => setTripText("")}
                    />
                  </View>
                  {NATIVE ? (
                    today ? (
                      <TripDatePicker
                        value={profile.tripDate}
                        today={today}
                        onChange={setTripText}
                      />
                    ) : null
                  ) : (
                    <TextInput
                      value={trip}
                      onChangeText={setTripText}
                      placeholder="Or type a date: YYYY-MM-DD"
                      placeholderTextColor={colors.mutedForeground}
                      accessibilityLabel="Trip date"
                      aria-labelledby="trip-label"
                      aria-invalid={!tripValid}
                      autoCorrect={false}
                      maxLength={10}
                      style={[styles.input, !tripValid && styles.inputError]}
                    />
                  )}
                  {!tripValid && trip.length === 10 ? (
                    <Text role="alert" style={[ui(13), { color: colors.mistake }]}>
                      That isn&apos;t a calendar date. Use YYYY-MM-DD, like 2026-11-14.
                    </Text>
                  ) : null}
                  {tripPast ? (
                    <Text role="alert" style={[ui(13), { color: colors.mistake }]}>
                      That date has already passed. Pick an upcoming one, or leave it empty.
                    </Text>
                  ) : null}
                </View>
                <View style={styles.field}>
                  <Text style={[ui(15, 600), { color: colors.foreground }]}>
                    Your first name{" "}
                    <Text style={{ color: colors.mutedForeground }}>(optional)</Text>
                  </Text>
                  <TextInput
                    value={name}
                    onChangeText={(text) => {
                      setName(text);
                      updateProfile({ name: text.trim() === "" ? null : text });
                    }}
                    placeholder="What should the coach call you?"
                    placeholderTextColor={colors.mutedForeground}
                    accessibilityLabel="Your first name"
                    autoComplete="given-name"
                    maxLength={40}
                    style={styles.input}
                  />
                  <Text style={[ui(13), { color: colors.mutedForeground }]}>
                    Stays on this device. There is no account.
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={styles.actions}>
              <Button variant="secondary" size="lg" icon={ArrowLeft} label="Back" onPress={back} />
              <Button size="lg" label={step === STEPS ? "Finish" : "Continue"} onPress={next} />
            </View>
          </View>

          {/* Your starting point: follows every answer. */}
          <View
            style={[styles.preview, wide && styles.previewWide]}
            role="region"
            accessibilityLabel="Your starting point"
          >
            <View style={styles.feltHeader}>
              <RadialFill
                from={marketing.feltGlow}
                to={colors.feltDeep}
                center={{ x: 0.3, y: 0 }}
                size={{ width: 2, height: 2.4 }}
              />
              <Text
                style={[ui(11, 700, { letterSpacing: 1.5 }), { color: surfaces.feltTextMuted }]}
              >
                {owner}
              </Text>
              <Text style={[display(28, 500), { color: colors.feltText }]}>
                {GOAL_TITLE[profile.goal]}
              </Text>
              <Text style={[ui(13), { color: surfaces.feltTextMuted }]}>Updates as you answer</Text>
            </View>
            <View style={styles.plan}>
              {stops.map((s, i) => {
                const Icon = STOP_ICONS[s.icon];
                return (
                  <View
                    key={s.title}
                    style={[styles.stop, i < stops.length - 1 && styles.stopRule]}
                  >
                    <View style={[styles.num, i === 0 && styles.numOn]}>
                      <Text
                        style={[
                          ui(14, 700),
                          { color: i === 0 ? colors.primaryForeground : colors.foreground },
                        ]}
                      >
                        {i + 1}
                      </Text>
                    </View>
                    <View style={styles.stopText}>
                      <Text style={[ui(15, 600), { color: colors.foreground }]}>{s.title}</Text>
                      <Text style={[ui(13), { color: colors.mutedForeground }]}>{s.desc}</Text>
                    </View>
                    <Icon size={18} color={colors.mutedForeground} strokeWidth={2} />
                  </View>
                );
              })}
            </View>
            <View style={styles.coach}>
              <Text style={[ui(13, 600), { color: colors.mutedForeground }]}>
                How often the coach speaks up
              </Text>
              <SegmentedControl
                accessibilityLabel="How often the coach speaks up"
                options={COACH_OPTIONS}
                value={profile.coach}
                onChange={(coach) => {
                  if ((COACH_LEVELS as readonly string[]).includes(coach)) updateProfile({ coach });
                }}
              />
            </View>
            {tripRow ? (
              <View style={styles.trip}>
                <CalendarDays size={20} color={colors.primary} strokeWidth={2} />
                <View style={styles.stopText}>
                  <Text style={[ui(14, 600), { color: colors.foreground }]}>{tripRow.title}</Text>
                  <Text style={[ui(13), { color: colors.mutedForeground }]}>{tripRow.detail}</Text>
                </View>
                {step === 3 ? null : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Edit trip date"
                    onPress={() => setStep(3)}
                    style={styles.tap}
                  >
                    <Text style={[ui(13, 600), { color: colors.foreground }]}>
                      {profile.tripDate ? "Edit" : "Add"}
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Previous({ label, onChange }: { label: string; onChange: () => void }) {
  return (
    <View style={styles.previous}>
      <Check size={14} color={colors.correct} strokeWidth={2} />
      <Text style={[ui(13), { color: colors.mutedForeground }]}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Change ${(label.split(":")[0] ?? label).toLowerCase()}`}
        onPress={onChange}
        style={styles.change}
      >
        <Text style={[ui(13, 600), { color: colors.foreground }]}>Change</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1 },
  tap: { minHeight: 44, justifyContent: "center" },
  // A 44pt tap target that keeps the design's 28pt chip: the padding is taken back by margins.
  change: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 8,
    marginHorizontal: -8,
    marginVertical: -14,
  },
  top: {
    height: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 40,
    gap: 12,
  },
  topNarrow: { paddingHorizontal: 16 },
  progress: { flexDirection: "row", alignItems: "center", gap: 6 },
  seg: { width: 56, height: 4, borderRadius: 2 },
  segNarrow: { width: 28 },

  body: { flexGrow: 1, padding: 40, gap: 40 },
  bodyWide: { flexDirection: "row" },
  bodyStacked: { flexDirection: "column" },
  bodyNarrow: { paddingHorizontal: 16, paddingTop: 16, gap: 32 },
  question: { gap: 28 },
  questionWide: { flex: 1, paddingTop: 24, paddingLeft: 80 },
  previous: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.muted,
    alignSelf: "flex-start",
  },
  options: { gap: 12, maxWidth: 640, width: "100%" },
  followUp: { gap: 12, maxWidth: 640 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  field: { gap: 12 },
  input: {
    height: 52,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    color: colors.foreground,
    ...ui(16),
  },
  inputError: { borderColor: colors.mistake },
  actions: { flexDirection: "row", gap: 12, paddingTop: 8, alignItems: "center" },

  preview: {
    overflow: "hidden",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  previewWide: { width: 480, alignSelf: "stretch" },
  feltHeader: { gap: 6, paddingVertical: 24, paddingHorizontal: 28, overflow: "hidden" },
  plan: { paddingVertical: 8, paddingHorizontal: 28 },
  stop: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 18 },
  stopRule: { borderBottomWidth: 1, borderBottomColor: colors.border },
  num: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  numOn: { backgroundColor: colors.primary },
  stopText: { flex: 1, gap: 3 },
  coach: { gap: 10, paddingVertical: 12, paddingHorizontal: 28 },
  trip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 16,
    paddingHorizontal: 28,
    paddingBottom: 28,
  },
});
