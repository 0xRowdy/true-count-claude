/**
 * The video poker machine's own palette (frame xfJEh): a dark-blue cabinet instead of felt.
 * The design uses these as literals rather than variables, so they are named here once and the
 * screen never carries a raw hex value.
 */
export const machine = {
  /** Cabinet gradient, top → bottom. */
  from: "#14233F",
  to: "#0C1428",
  payPanel: "#00000040",
  payPanelEdge: "#FFFFFF1A",
  /** The lit pay line: coach blue at 33%. */
  payLineLit: "#2D6CDF55",
  label: "#C9D4EA",
  gold: "#F2C94C",
  lit: "#FFFFFF",
  holdFill: "#FFFFFF14",
  holdEdge: "#FFFFFF33",
  holdInk: "#E6ECF7",
} as const;
