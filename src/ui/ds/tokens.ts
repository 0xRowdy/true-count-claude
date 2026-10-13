/**
 * Tableside design tokens.
 *
 * `penVariables` mirrors every variable of the Tableside design file (`design/Tableside-claude.pen`,
 * `GetVariables()`) 1:1, under the same shadcn-style names. Everything else in this file is derived
 * from it, so a token changed in the design is changed here in exactly one place.
 *
 * Screens import `colors`, `space`, `radius` and `type` — never a raw hex value.
 */

import type { TextStyle } from "react-native";

export const penVariables = {
  "--background": "#0E1311",
  "--foreground": "#F3EFE6",
  "--card": "#161D1A",
  "--card-foreground": "#F3EFE6",
  "--popover": "#1B2420",
  "--muted": "#1E2723",
  "--muted-foreground": "#A9B2AC",
  "--border": "#2C3832",
  "--input": "#2C3832",
  "--ring": "#D4AE62",
  "--primary": "#D4AE62",
  "--primary-foreground": "#1A1406",
  "--secondary": "#26312C",
  "--secondary-foreground": "#F3EFE6",
  "--accent": "#24302B",
  "--destructive": "#E07A5F",
  "--felt": "#1B5A43",
  "--felt-deep": "#123F2F",
  "--felt-line": "#EDE4CC99",
  "--felt-text": "#F1EAD6",
  "--rail": "#3A2A1E",
  "--paper": "#F6F1E4",
  "--paper-2": "#EDE6D4",
  "--ink": "#1E1A14",
  "--ink-muted": "#5E574B",
  "--paper-border": "#DCD3BE",
  "--coach": "#F6F1E4",
  "--coach-accent": "#2D6CDF",
  "--correct": "#3FA877",
  "--correct-ink": "#1F7A50",
  "--mistake": "#E07A5F",
  "--mistake-ink": "#B4472C",
  "--suit-spade": "#15171A",
  "--suit-heart": "#C8312F",
  "--suit-diamond": "#1F5FBF",
  "--suit-club": "#1C7A3E",
  "--chip-1": "#EDE7D8",
  "--chip-5": "#B83A33",
  "--chip-25": "#2E7D4F",
  "--chip-100": "#1D1F22",
  "--chip-500": "#6A3FA0",
  "--chip-1k": "#D99A2B",
  "--font-display": "Fraunces",
  "--font-ui": "Inter",
  "--space-1": 4,
  "--space-2": 8,
  "--space-3": 12,
  "--space-4": 16,
  "--space-6": 24,
  "--space-8": 32,
  "--space-12": 48,
  "--space-16": 64,
  "--radius-sm": 6,
  "--radius-md": 10,
  "--radius-lg": 16,
  "--radius-pill": 999,
} as const;

const v = penVariables;

/** Colour tokens: the design's variables in camelCase. */
export const colors = {
  background: v["--background"],
  foreground: v["--foreground"],
  card: v["--card"],
  cardForeground: v["--card-foreground"],
  popover: v["--popover"],
  muted: v["--muted"],
  mutedForeground: v["--muted-foreground"],
  border: v["--border"],
  input: v["--input"],
  ring: v["--ring"],
  primary: v["--primary"],
  primaryForeground: v["--primary-foreground"],
  secondary: v["--secondary"],
  secondaryForeground: v["--secondary-foreground"],
  accent: v["--accent"],
  destructive: v["--destructive"],
  felt: v["--felt"],
  feltDeep: v["--felt-deep"],
  feltLine: v["--felt-line"],
  feltText: v["--felt-text"],
  rail: v["--rail"],
  paper: v["--paper"],
  paper2: v["--paper-2"],
  ink: v["--ink"],
  inkMuted: v["--ink-muted"],
  paperBorder: v["--paper-border"],
  coach: v["--coach"],
  coachAccent: v["--coach-accent"],
  correct: v["--correct"],
  correctInk: v["--correct-ink"],
  mistake: v["--mistake"],
  mistakeInk: v["--mistake-ink"],
  suitSpade: v["--suit-spade"],
  suitHeart: v["--suit-heart"],
  suitDiamond: v["--suit-diamond"],
  suitClub: v["--suit-club"],
  chip1: v["--chip-1"],
  chip5: v["--chip-5"],
  chip25: v["--chip-25"],
  chip100: v["--chip-100"],
  chip500: v["--chip-500"],
  chip1k: v["--chip-1k"],
} as const;

/**
 * Colours the design's components use as literals rather than variables. Named here so that
 * components (and screens) still never carry a raw hex value.
 */
export const surfaces = {
  /** Button/Table fill: deep felt at 80%. */
  tableButton: "#0B2A20CC",
  /** Playing card face and card-back border. */
  cardFace: "#FBF8F1",
  cardEdge: "#00000022",
  cardBackFrom: "#7A2E2A",
  cardBackTo: "#5B1F1C",
  cardBackLine: "#D4AE6299",
  /** Bet spot wash on felt. */
  betSpot: "#FFFFFF08",
  feltTextMuted: "#F1EAD6B3",
  feltTextFaint: "#F1EAD6A6",
  /** Chip rack rail: gradient top → bottom, with a lighter top edge. */
  rackFrom: "#3A2A1E",
  rackTo: "#2A1E15",
  rackEdge: "#5A4330",
  /** Chip ink on light chips (1, 1K) and on dark ones. */
  chipInkDark: "#1E1A14",
  chipInkLight: "#FFFFFF",
  chipEdgeSpot: "#FFFFFFEE",
  chipInlay: "#FFFFFFB3",
  chipDotRing: "#FFFFFFAA",
  /** Finished Phase Stepper steps (primary at 40%). */
  primaryDim: "#D4AE6266",
  /** Selected option wash (primary at 8%). */
  primaryWash: "#D4AE6214",
  /** Progress track on dark surfaces. */
  track: "#FFFFFF1A",
  /** Hairline around swatches and avatars. */
  hairline: "#FFFFFF1F",
  /** Craps dice: red body, light edge, white pips. */
  die: "#C8312F",
  dieEdge: "#FFFFFF33",
  diePip: "#FFFFFF",
  /** Swatch hex captions on the design sheet. */
  caption: "#7E8882",
  transparent: "transparent",
} as const;

export type ColorToken = keyof typeof colors;

/** 4-pt spacing scale, keyed like the design (`--space-4` → `space[4]`). */
export const space = {
  1: v["--space-1"],
  2: v["--space-2"],
  3: v["--space-3"],
  4: v["--space-4"],
  6: v["--space-6"],
  8: v["--space-8"],
  12: v["--space-12"],
  16: v["--space-16"],
} as const;

export const radius = {
  sm: v["--radius-sm"],
  md: v["--radius-md"],
  lg: v["--radius-lg"],
  pill: v["--radius-pill"],
} as const;

/** Minimum tap target, both axes. */
export const MIN_TAP = 44;

/** The design's font families (the `.pen` values). */
export const fonts = {
  display: v["--font-display"],
  ui: v["--font-ui"],
} as const;

/**
 * Loaded font faces. `@expo-google-fonts` registers one family per weight, so a weight is
 * chosen by family name, not `fontWeight` (setting both makes browsers fake-bold a real face).
 */
export const fontFamily = {
  display: {
    400: "Fraunces_400Regular",
    500: "Fraunces_500Medium",
    600: "Fraunces_600SemiBold",
  },
  ui: {
    400: "Inter_400Regular",
    500: "Inter_500Medium",
    600: "Inter_600SemiBold",
    700: "Inter_700Bold",
    800: "Inter_800ExtraBold",
  },
} as const;

type UiWeight = keyof typeof fontFamily.ui;
type DisplayWeight = keyof typeof fontFamily.display;

/** An Inter text style at a size and weight. */
export function ui(fontSize: number, weight: UiWeight = 400, extra?: TextStyle): TextStyle {
  return { fontFamily: fontFamily.ui[weight], fontSize, ...extra };
}

/** A Fraunces text style at a size and weight. */
export function display(
  fontSize: number,
  weight: DisplayWeight = 600,
  extra?: TextStyle,
): TextStyle {
  return { fontFamily: fontFamily.display[weight], fontSize, ...extra };
}

/**
 * Type scale. The first five are the design sheet's named styles; the rest are the sizes the
 * components use.
 */
export const type = {
  display: display(56, 600),
  heading: display(32, 500),
  section: display(24, 400),
  title: ui(20, 600),
  body: ui(16, 400, { lineHeight: 24 }),
  label: ui(13, 500),

  statValue: display(34, 500),
  button: ui(15, 600),
  bodySm: ui(14, 400, { lineHeight: 20 }),
  caption: ui(12, 400),
  captionStrong: ui(12, 500),
  eyebrow: ui(12, 600, { letterSpacing: 2, textTransform: "uppercase" }),
  overline: ui(10, 700, { letterSpacing: 1, textTransform: "uppercase" }),
} as const satisfies Record<string, TextStyle>;

/** Shadows, as CSS box-shadow strings (supported by React Native 0.76+ and React Native Web). */
export const shadow = {
  chip: "0px 2px 4px #00000066",
  card: "0px 2px 6px #00000055",
  note: "0px 8px 24px #00000066",
  die: "0px 4px 8px #00000088",
} as const;
