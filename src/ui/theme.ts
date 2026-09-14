/**
 * Design tokens.
 *
 * ADR-0005: we compete on explanation quality, not visual fidelity. The interface is
 * dark, quiet, and legible — a precision instrument, not a simulated casino floor.
 */

export const colors = {
  background: "#0B0F14",
  surface: "#141A22",
  surfaceRaised: "#1D2530",
  border: "#2A3543",
  text: "#E8EDF2",
  textMuted: "#8FA0B3",
  accent: "#4ADE80",
  accentMuted: "#1F3D2B",
  danger: "#F87171",
  warning: "#FBBF24",
  info: "#60A5FA",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
} as const;

export const type = {
  mono: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
  title: { fontSize: 28, fontWeight: "700" as const, letterSpacing: -0.5 },
  heading: { fontSize: 18, fontWeight: "600" as const },
  body: { fontSize: 15, lineHeight: 22 },
  caption: { fontSize: 13 },
} as const;
