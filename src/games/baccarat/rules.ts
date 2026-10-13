/**
 * Baccarat variants and pay tables.
 *
 * Two house games are modelled, matching the design's "Punto Banco · EZ Baccarat · 5%
 * commission":
 *
 * - **Punto Banco** — the classic commission game. A winning Banker bet pays 0.95:1 (the
 *   house keeps 5% of the win).
 * - **EZ Baccarat** — the no-commission game. Banker pays 1:1, except a Banker win with a
 *   three-card 7 (a "Dragon 7"), which pushes. EZ tables offer the Dragon 7 and Panda 8
 *   side bets.
 *
 * Pure data (ADR-0002). There is no global "current variant" — every settlement and house
 * edge lookup takes one of these.
 */

export type VariantId = "punto-banco" | "ez";

/** Every bet a baccarat layout in this trainer can carry. */
export const BET_KINDS = [
  "player",
  "banker",
  "tie",
  "playerPair",
  "bankerPair",
  "dragon7",
  "panda8",
] as const;
export type BetKind = (typeof BET_KINDS)[number];

export const MAIN_BETS = ["player", "banker", "tie"] as const satisfies readonly BetKind[];
export const SIDE_BETS = [
  "playerPair",
  "bankerPair",
  "dragon7",
  "panda8",
] as const satisfies readonly BetKind[];
export type SideBetKind = (typeof SIDE_BETS)[number];

/** Tie pays 8:1 at most tables; some pay 9:1. */
export type TiePays = 8 | 9;

export interface BaccaratRules {
  readonly variant: VariantId;
  /** Number of 52-card decks. Eight is the standard shoe. */
  readonly decks: number;
  /** Tie bet pays this many to one. */
  readonly tiePays: TiePays;
  /**
   * Commission taken from a winning Banker bet, as a fraction (0.05 = 5%). Always 0 for EZ
   * Baccarat, which pushes the Dragon 7 instead.
   */
  readonly commission: number;
  /** Side bets offered on the layout. An empty list means main bets only. */
  readonly sideBets: readonly SideBetKind[];
  /** Cards left behind the cut card when the shoe is shuffled. */
  readonly cardsBehindCut: number;
  /** Burn cards at the top of each shoe, per the casino burn procedure. */
  readonly burn: boolean;
  readonly minBet: number;
  readonly maxBet: number;
}

/** Side-bet pay odds (X to 1). Fixed by the common pay tables; listed in one place. */
export const SIDE_BET_PAYS: Readonly<Record<SideBetKind, number>> = {
  playerPair: 11,
  bankerPair: 11,
  dragon7: 40,
  panda8: 25,
};

/** Side bets that only make sense on an EZ table (they key off the Dragon 7 / Panda 8 hands). */
export const EZ_ONLY_SIDE_BETS: readonly SideBetKind[] = ["dragon7", "panda8"];

export const PUNTO_BANCO: BaccaratRules = {
  variant: "punto-banco",
  decks: 8,
  tiePays: 8,
  commission: 0.05,
  sideBets: [],
  cardsBehindCut: 16,
  burn: true,
  minBet: 10,
  maxBet: 5000,
};

export const EZ_BACCARAT: BaccaratRules = {
  variant: "ez",
  decks: 8,
  tiePays: 8,
  commission: 0,
  sideBets: ["dragon7", "panda8"],
  cardsBehindCut: 16,
  burn: true,
  minBet: 10,
  maxBet: 5000,
};

/** The design's table: "Punto Banco · 8 decks · 5% commission". */
export const DEFAULT_BACCARAT_RULES = PUNTO_BANCO;

/** Returns the reasons a rule set is invalid, or an empty array if it is sound. */
export function validateBaccaratRules(rules: BaccaratRules): string[] {
  const problems: string[] = [];
  if (!Number.isInteger(rules.decks) || rules.decks < 1 || rules.decks > 8) {
    problems.push("decks must be an integer from 1 to 8");
  }
  if (rules.tiePays !== 8 && rules.tiePays !== 9) problems.push("tie must pay 8:1 or 9:1");
  if (rules.variant === "ez" && rules.commission !== 0) {
    problems.push("EZ Baccarat takes no commission");
  }
  if (rules.variant === "punto-banco" && (rules.commission <= 0 || rules.commission >= 1)) {
    problems.push("Punto Banco commission must be between 0 and 1");
  }
  for (const bet of rules.sideBets) {
    if (rules.variant !== "ez" && EZ_ONLY_SIDE_BETS.includes(bet)) {
      problems.push(`${bet} is only offered on EZ Baccarat`);
    }
  }
  if (new Set(rules.sideBets).size !== rules.sideBets.length) {
    problems.push("side bets must not repeat");
  }
  // A coup uses at most six cards and the cut card allows one more coup after it appears,
  // so twelve cards behind the cut is the floor that keeps the shoe from running dry.
  if (!Number.isInteger(rules.cardsBehindCut) || rules.cardsBehindCut < 12) {
    problems.push("at least 12 cards must sit behind the cut card");
  }
  if (rules.cardsBehindCut >= rules.decks * 52) {
    problems.push("the cut card must sit inside the shoe");
  }
  if (rules.minBet <= 0 || rules.maxBet < rules.minBet) {
    problems.push("table limits must satisfy 0 < min ≤ max");
  }
  return problems;
}

/** Whether a bet can be placed under these rules. */
export function isBetOffered(rules: BaccaratRules, bet: BetKind): boolean {
  return (
    (MAIN_BETS as readonly BetKind[]).includes(bet) || rules.sideBets.includes(bet as SideBetKind)
  );
}

/** "Punto Banco · 8 decks · 5% commission" / "EZ Baccarat · 8 decks · no commission". */
export function describeRules(rules: BaccaratRules): string {
  const name = rules.variant === "ez" ? "EZ Baccarat" : "Punto Banco";
  const decks = `${rules.decks} deck${rules.decks === 1 ? "" : "s"}`;
  const commission =
    rules.variant === "ez"
      ? "no commission"
      : `${formatPercent(rules.commission * 100, 0)} commission`;
  return `${name} · ${decks} · ${commission}`;
}

/** The odds label printed under each bet spot: "pays 1:1", "pays 0.95:1", "pays 8:1". */
export function payLabel(rules: BaccaratRules, bet: BetKind): string {
  switch (bet) {
    case "player":
      return "pays 1:1";
    case "banker":
      return rules.variant === "ez" ? "pays 1:1" : `pays ${formatRatio(1 - rules.commission)}:1`;
    case "tie":
      return `pays ${rules.tiePays}:1`;
    default:
      return `pays ${SIDE_BET_PAYS[bet]}:1`;
  }
}

/** Display names for bet spots, as printed on the layout. */
export const BET_LABELS: Readonly<Record<BetKind, string>> = {
  player: "Player",
  banker: "Banker",
  tie: "Tie",
  playerPair: "Player Pair",
  bankerPair: "Banker Pair",
  dragon7: "Dragon 7",
  panda8: "Panda 8",
};

/** Locale-free percent formatting, so prerendered and hydrated text match. */
export function formatPercent(value: number, digits = 2): string {
  return `${value.toFixed(digits)}%`;
}

function formatRatio(value: number): string {
  return String(Math.round(value * 100) / 100);
}
