import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { CardBack, Chip, CoachNote, colors, display, PlayingCard, surfaces, ui } from "@/ui/ds";
import { GraduationCap } from "@/ui/ds/icons";
import { marketing } from "@/ui/marketing/surfaces";
import { RadialFill } from "@/ui/marketing/RadialFill";

/** The vignette's own coordinate space, as drawn in the design (frame NwWF2). */
export const HERO_TABLE_WIDTH = 664;
export const HERO_TABLE_HEIGHT = 560;
/** Without the pill and the coach note (phones show the note full width under the table). */
export const FELT_ONLY_WIDTH = 612;
const FELT_ONLY_HEIGHT = 536;

const FELT = { w: 600, h: 500, top: 24, rail: 12 };

/**
 * The hero's table vignette (Do2ZB › NwWF2), built from design-system parts: a felt half-table
 * with the dealer's 7 up, the player's 12, a $25 bet, the session pill and the coach's hint.
 * Laid out in absolute design coordinates and scaled as a whole to fit narrower screens.
 */
export function HeroTable({ scale = 1, feltOnly = false }: { scale?: number; feltOnly?: boolean }) {
  const w = feltOnly ? FELT_ONLY_WIDTH : HERO_TABLE_WIDTH;
  const h = feltOnly ? FELT_ONLY_HEIGHT : HERO_TABLE_HEIGHT;
  return (
    <View
      style={{ width: w * scale, height: h * scale }}
      accessibilityLabel="A blackjack table: the dealer shows a 7, you hold 12, and the coach suggests a hit"
    >
      <View
        style={[styles.stage, { transform: [{ scale }], transformOrigin: "top left" } as object]}
      >
        <View style={styles.rail} />
        <View style={styles.felt}>
          <RadialFill
            from={marketing.feltGlow}
            to={colors.feltDeep}
            center={{ x: 0.5, y: 0.35 }}
            size={{ width: 1.3, height: 1.2 }}
          />
          <Svg width={FELT.w} height={FELT.h} style={StyleSheet.absoluteFill} pointerEvents="none">
            {/* The chalk arc: 140° of a 460 circle, centred under the betting line. */}
            <Path
              d="M 516.13 301.33 A 230 230 0 0 0 83.87 301.33"
              stroke={colors.feltLine}
              strokeWidth={1.2}
              fill="none"
            />
          </Svg>
          <Text style={[styles.centered, { top: 42 }, styles.dealerLabel]}>DEALER SHOWS 7</Text>
          <View style={[styles.at, { left: 236, top: 70 }]}>
            <CardBack />
          </View>
          <View style={[styles.at, { left: 300, top: 70 }]}>
            <PlayingCard rank="7" suit="c" />
          </View>
          <Text style={[styles.centered, { top: 198 }, styles.pays]}>BLACKJACK PAYS 3 TO 2</Text>
          <Text style={[styles.centered, { top: 232 }, styles.rule]}>
            Dealer must stand on all 17s · Insurance pays 2 to 1
          </Text>
          <View style={[styles.at, { left: 240, top: 300, transform: [{ rotate: "4deg" }] }]}>
            <PlayingCard rank="7" suit="s" />
          </View>
          <View style={[styles.at, { left: 282, top: 296, transform: [{ rotate: "-3deg" }] }]}>
            <PlayingCard rank="5" suit="d" />
          </View>
          <View style={[styles.at, styles.total]} accessibilityLabel="Your total: 12">
            <Text style={[ui(14, 700), { color: colors.feltText }]}>12</Text>
          </View>
          <View style={[styles.at, styles.betCircle]} />
          <View style={[styles.at, { left: 274, top: 422 }]}>
            <Chip value={25} />
          </View>
          <View style={[styles.at, { left: 274, top: 416 }]}>
            <Chip value={25} />
          </View>
        </View>

        {feltOnly ? null : (
          <>
            <View style={[styles.at, styles.pill]}>
              <GraduationCap size={18} color={colors.primary} strokeWidth={2} />
              <View style={{ gap: 2 }}>
                <Text style={[ui(13, 600), { color: colors.foreground }]}>
                  Training: Basic Strategy · 6 deck, S17
                </Text>
                <Text style={[ui(12), { color: colors.correct }]}>
                  18 of 19 correct this session
                </Text>
              </View>
            </View>

            <View style={[styles.at, { left: 356, top: 318 }]}>
              <HeroCoachNote width={308} />
            </View>
          </>
        )}
      </View>
    </View>
  );
}

/** The coach's hint on the hero hand. Its buttons open the real table and the drills. */
export function HeroCoachNote({ width }: { width: number | "100%" }) {
  const router = useRouter();
  return (
    <CoachNote
      width={width}
      title="Hit. 12 against a dealer 7 is a hit."
      body="A 7 means the dealer likely makes 17+. Standing on 12 wins only ~26% of the time; hitting gives you a real chance to improve."
      primary={{
        label: "Hit",
        accessibilityLabel: "Hit: try this hand at the table",
        onPress: () => router.push("/play"),
      }}
      secondary={{ label: "Show the chart", onPress: () => router.push("/drills") }}
    />
  );
}

const styles = StyleSheet.create({
  stage: {
    position: "absolute",
    left: 0,
    top: 0,
    width: HERO_TABLE_WIDTH,
    height: HERO_TABLE_HEIGHT,
  },
  at: { position: "absolute" },
  rail: {
    position: "absolute",
    left: -FELT.rail,
    top: FELT.top - FELT.rail,
    width: FELT.w + FELT.rail * 2,
    height: FELT.h + FELT.rail * 2,
    backgroundColor: colors.rail,
    borderTopLeftRadius: 312,
    borderTopRightRadius: 312,
    borderBottomLeftRadius: 52,
    borderBottomRightRadius: 52,
  },
  felt: {
    position: "absolute",
    left: 0,
    top: FELT.top,
    width: FELT.w,
    height: FELT.h,
    overflow: "hidden",
    borderTopLeftRadius: 300,
    borderTopRightRadius: 300,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  centered: { position: "absolute", left: 0, width: FELT.w, textAlign: "center" },
  dealerLabel: { ...ui(11, 700, { letterSpacing: 1.5 }), color: surfaces.feltTextMuted },
  pays: { ...display(22, 500, { letterSpacing: 3 }), color: colors.feltLine },
  rule: { ...ui(12, 400, { letterSpacing: 1.5 }), color: marketing.feltRule },
  total: {
    left: 188,
    top: 330,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.feltLine,
    backgroundColor: marketing.feltPill,
  },
  betCircle: {
    left: 262,
    top: 405,
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1.5,
    borderColor: colors.feltLine,
    backgroundColor: surfaces.betSpot,
  },
  pill: {
    left: 0,
    top: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    boxShadow: marketing.pillShadow,
  },
});
