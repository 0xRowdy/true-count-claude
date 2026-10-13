/**
 * The strategy library: curated and community strategies, the design's three example drafts,
 * forking, new drafts, and the share export.
 *
 * There is no backend (ADR-0003), so the curated and community strategies are deterministic
 * fixture data, labelled in the UI as examples. Their numbers (upvotes, forks, learner
 * accuracy) are illustrative, not live.
 *
 * React-free, so it runs under vitest.
 */

import { DEFAULT_RULES, type RuleSet } from "@/engine";
import {
  type BetPlan,
  CRAPS_PRESETS,
  DOWNTOWN_RULES,
  ironCrossPlan,
  lowEdgePlaceSixEightPlan,
  passAndOddsPlan,
  pressTheSixEightPlan,
} from "@/games/craps";
import { AMERICAN_RULES, EUROPEAN_RULES, FRENCH_RULES } from "@/games/roulette";
import {
  type BlackjackDraft,
  type CrapsDraft,
  type RouletteDraft,
  type RouletteLayoutPlan,
  type StrategyDraft,
  type StrategyGame,
  uniqueDraftId,
} from "@/state/strategies";
import { chartChanges, draftOverrides, resetToBasic, rulesCardLine } from "./blackjack";
import { changeCount } from "./craps";
import { layoutChanges } from "./roulette";

export const GAME_NAMES: Readonly<Record<StrategyGame, string>> = {
  blackjack: "Blackjack",
  craps: "Craps",
  roulette: "Roulette",
};

export const BUILDER_ROUTES: Readonly<Record<StrategyGame, string>> = {
  blackjack: "/strategies/blackjack",
  craps: "/strategies/craps",
  roulette: "/strategies/roulette",
};

/** Where "Test in trainer" goes: the game's table, with the strategy id. */
export const TABLE_ROUTES: Readonly<Record<StrategyGame, string>> = {
  blackjack: "/play",
  craps: "/games/craps",
  roulette: "/games/roulette",
};

export function testInTrainerHref(draft: StrategyDraft): string {
  return `${TABLE_ROUTES[draft.game]}?strategy=${encodeURIComponent(draft.id)}`;
}

export function builderHref(game: StrategyGame, id: string): string {
  return `${BUILDER_ROUTES[game]}?id=${encodeURIComponent(id)}`;
}

/** A strategy someone else published (fixture data in this build). */
export interface LibraryStrategy {
  readonly id: string;
  readonly kind: "curated" | "community";
  readonly title: string;
  readonly author: string;
  readonly version: number;
  readonly description: string;
  readonly votes: number;
  readonly forks: number;
  /** Average learner accuracy, percent. */
  readonly accuracy: number;
  readonly verified: boolean;
  readonly draft: StrategyDraft;
}

const S17: RuleSet = { ...DEFAULT_RULES, dealerSoft17: "stand" };
const H17: RuleSet = DEFAULT_RULES;
const DOUBLE_DECK: RuleSet = { ...DEFAULT_RULES, decks: 2, dealerSoft17: "stand" };

function blackjack(id: string, title: string, rules: RuleSet): BlackjackDraft {
  return {
    id,
    game: "blackjack",
    title,
    forkedFrom: null,
    notes: {},
    savedAt: null,
    rules,
    base: { rules, cells: {} },
    cells: {},
  };
}

function craps(id: string, plan: BetPlan): CrapsDraft {
  return { id, game: "craps", title: plan.name, forkedFrom: null, notes: {}, savedAt: null, plan, original: plan };
}

function roulette(id: string, title: string, layout: RouletteLayoutPlan): RouletteDraft {
  return { id, game: "roulette", title, forkedFrom: null, notes: {}, savedAt: null, layout, original: layout };
}

/** "Low-Edge Place 6 & 8" as @rail_rita published it: place both numbers, collect every hit. */
const LOW_EDGE: BetPlan = (() => {
  const plan = lowEdgePlaceSixEightPlan(DOWNTOWN_RULES);
  return {
    ...plan,
    pointOn: plan.pointOn.map((r) => (r.kind === "place" ? { ...r, skipPoint: false } : r)),
  };
})();

const BOND: RouletteLayoutPlan = {
  rules: EUROPEAN_RULES,
  bets: [
    { spotId: "high", amount: 140 },
    { spotId: "sixLine:13-14-15-16-17-18", amount: 50 },
    { spotId: "straight:0", amount: 10 },
  ],
  progression: "flat",
  session: { stopWhenUp: 200, stopWhenDown: 600, maxSpins: 60 },
};

export const LIBRARY: readonly LibraryStrategy[] = [
  {
    id: "curated-bj-6d-s17",
    kind: "curated",
    title: "Basic Strategy · 6 deck, S17",
    author: "Tableside Curated",
    version: 4,
    description: "The full chart for a six-deck shoe where the dealer stands on soft 17. Every cell checked by the EV engine.",
    votes: 4812,
    forks: 1240,
    accuracy: 91,
    verified: true,
    draft: blackjack("curated-bj-6d-s17", "Basic Strategy · 6 deck, S17", S17),
  },
  {
    id: "curated-bj-6d-h17",
    kind: "curated",
    title: "Basic Strategy · 6 deck, H17",
    author: "Tableside Curated",
    version: 3,
    description: "Six decks, dealer hits soft 17. Six cells move from the S17 chart, mostly against an ace.",
    votes: 3920,
    forks: 980,
    accuracy: 89,
    verified: true,
    draft: blackjack("curated-bj-6d-h17", "Basic Strategy · 6 deck, H17", H17),
  },
  {
    id: "curated-craps-pass-odds",
    kind: "curated",
    title: "Pass + Full Odds",
    author: "Tableside Curated",
    version: 2,
    description: "The lowest-edge way to play: a pass line bet with full odds behind it. Nothing else.",
    votes: 2210,
    forks: 640,
    accuracy: 94,
    verified: true,
    draft: craps("curated-craps-pass-odds", passAndOddsPlan(DOWNTOWN_RULES)),
  },
  {
    id: "curated-roulette-la-partage",
    kind: "curated",
    title: "Even Money with La Partage",
    author: "Tableside Curated",
    version: 1,
    description: "Flat $10 on red at a French table. La Partage halves the edge on even-money bets to 1.35%.",
    votes: 1430,
    forks: 210,
    accuracy: 96,
    verified: true,
    draft: roulette("curated-roulette-la-partage", "Even Money with La Partage", {
      rules: FRENCH_RULES,
      bets: [{ spotId: "red", amount: 10 }],
      progression: "flat",
      session: { stopWhenUp: 100, stopWhenDown: 100, maxSpins: 60 },
    }),
  },
  {
    id: "community-craps-low-edge",
    kind: "community",
    title: "Low-Edge Place 6 & 8",
    author: "@rail_rita",
    version: 2,
    description: "Pass line with full odds, then place the 6 and 8 for $12 each and collect every hit.",
    votes: 1876,
    forks: 512,
    accuracy: 88,
    verified: true,
    draft: craps("community-craps-low-edge", { ...LOW_EDGE, name: "Low-Edge Place 6 & 8" }),
  },
  {
    id: "community-roulette-bond",
    kind: "community",
    title: "Classic Bond Spread",
    author: "@wheelwatcher",
    version: 5,
    description: "$140 on 19–36, $50 on the 13–18 six line and $10 on zero. Wins on 25 of 37 numbers; the edge is still 2.7%.",
    votes: 1544,
    forks: 377,
    accuracy: 84,
    verified: true,
    draft: roulette("community-roulette-bond", "Classic Bond Spread", BOND),
  },
  {
    id: "community-bj-double-deck",
    kind: "community",
    title: "Double Deck S17 Chart",
    author: "@deckcounter",
    version: 3,
    description: "Basic strategy for the two-deck pitch game: more doubles on soft hands and 9 vs 2.",
    votes: 1180,
    forks: 301,
    accuracy: 86,
    verified: true,
    draft: blackjack("community-bj-double-deck", "Double Deck S17 Chart", DOUBLE_DECK),
  },
  {
    id: "community-craps-iron-cross",
    kind: "community",
    title: "Iron Cross",
    author: "@dice_doc",
    version: 1,
    description: "Field every roll plus place 5, 6 and 8: a win on every number but 7, at a higher blended edge.",
    votes: 905,
    forks: 188,
    accuracy: 79,
    verified: true,
    draft: craps("community-craps-iron-cross", ironCrossPlan(DOWNTOWN_RULES)),
  },
  {
    id: "community-roulette-american-dozens",
    kind: "community",
    title: "Two Dozens, Double Zero",
    author: "@vegasvic",
    version: 2,
    description: "$10 on each of the first two dozens. Covers 24 of 38 pockets, at the American wheel's 5.26%.",
    votes: 612,
    forks: 95,
    accuracy: 81,
    verified: true,
    draft: roulette("community-roulette-american-dozens", "Two Dozens, Double Zero", {
      rules: AMERICAN_RULES,
      bets: [
        { spotId: "dozen:1", amount: 10 },
        { spotId: "dozen:2", amount: 10 },
      ],
      progression: "flat",
      session: { stopWhenDown: 100, maxSpins: 60 },
    }),
  },
];

export function libraryStrategy(id: string): LibraryStrategy | undefined {
  return LIBRARY.find((s) => s.id === id);
}

/** Community strategies ranked by upvotes: #1, #2… */
export function communityRanked(): LibraryStrategy[] {
  return LIBRARY.filter((s) => s.kind === "community").sort((a, b) => b.votes - a.votes);
}

/** "4.8k", "905". */
export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  const k = Math.round(n / 100) / 10;
  return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
}

/** "Blackjack · 6 deck · S17", "Craps · 3-4-5x odds", "Roulette · European". */
export function gameLine(draft: StrategyDraft): string {
  switch (draft.game) {
    case "blackjack":
      return `Blackjack · ${rulesCardLine(draft.rules)}`;
    case "craps": {
      const odds = draft.plan.rules.odds;
      return `Craps · ${odds.kind === "3-4-5x" ? "3-4-5x" : `${odds.multiple}x`} odds`;
    }
    case "roulette":
      return `Roulette · ${draft.layout.rules.wheel === "american" ? "American" : draft.layout.rules.laPartage ? "French" : "European"}`;
  }
}

/** How many changes a draft has against the strategy it was forked from. */
export function draftChangeCount(draft: StrategyDraft): number {
  switch (draft.game) {
    case "blackjack":
      return chartChanges(draft).length;
    case "craps":
      return changeCount(draft.plan, draft.original);
    case "roulette":
      return layoutChanges(draft.layout, draft.original).length;
  }
}

// ---------------------------------------------------------------------------
// The design's three example drafts (frames RYP9O, GYRRl, D0h320)
// ---------------------------------------------------------------------------

export const EXAMPLE_IDS: Readonly<Record<StrategyGame, string>> = {
  blackjack: "example-blackjack",
  craps: "example-craps",
  roulette: "example-roulette",
};

const credit = (s: LibraryStrategy) => ({ id: s.id, title: s.title, author: s.author, version: s.version });

function mustFind(id: string): LibraryStrategy {
  const s = libraryStrategy(id);
  if (!s) throw new Error(`No library strategy "${id}".`);
  return s;
}

/** "Basic Strategy for H17 tables": the S17 chart, re-made for an H17 table. */
export function exampleBlackjack(): BlackjackDraft {
  const original = mustFind("curated-bj-6d-s17");
  const forked = resetToBasic({
    ...blackjack(EXAMPLE_IDS.blackjack, "Basic Strategy for H17 tables", H17),
    base: { rules: S17, cells: {} },
    forkedFrom: credit(original),
  });
  return {
    ...forked,
    notes: {
      "hard:11:11":
        "When the dealer hits soft 17, an ace up busts a little more. Your 11 is worth doubling even here.",
      "hard:15:11": "Against an ace on an H17 table, 15 loses so often that giving up half is cheaper.",
      "hard:17:11": "The one time a made 17 is given up: H17, late surrender, dealer ace.",
      "soft:19:6":
        "On tables where the dealer hits soft 17, a 6 is even weaker. Your soft 19 can't bust on one card, so put more money out.",
    },
  };
}

/** "Pass, Odds & Press the 6/8", forked from @rail_rita's "Low-Edge Place 6 & 8". */
export function exampleCraps(): CrapsDraft {
  const original = mustFind("community-craps-low-edge");
  if (original.draft.game !== "craps") throw new Error("expected a craps fixture");
  return {
    id: EXAMPLE_IDS.craps,
    game: "craps",
    title: "Pass, Odds & Press the 6/8",
    forkedFrom: credit(original),
    notes: {
      "point.1": "Placing the point number twice doubles your risk on one number. Place only the other one.",
      "hit.2":
        "Press once, then lock it in. You keep part of every win and only grow the bet with the house's money.",
    },
    savedAt: null,
    plan: pressTheSixEightPlan(DOWNTOWN_RULES),
    original: original.draft.plan,
  };
}

/** "High Side + Six Line + Zero": the Bond spread at half size with a tighter stop. */
export function exampleRoulette(): RouletteDraft {
  const original = mustFind("community-roulette-bond");
  if (original.draft.game !== "roulette") throw new Error("expected a roulette fixture");
  return {
    id: EXAMPLE_IDS.roulette,
    game: "roulette",
    title: "High Side + Six Line + Zero",
    forkedFrom: credit(original),
    notes: {
      spin: "Same shape at half the size: every bet keeps its share, so the payouts scale exactly.",
      "bet:sixLine:13-14-15-16-17-18":
        "The six line fills the gap below 19 and pays 5 to 1. Without it, 13–18 is a straight loss.",
    },
    savedAt: null,
    layout: {
      ...BOND,
      bets: [
        { spotId: "high", amount: 70 },
        { spotId: "sixLine:13-14-15-16-17-18", amount: 25 },
        { spotId: "straight:0", amount: 5 },
      ],
      session: { stopWhenUp: 200, stopWhenDown: 300, maxSpins: 60 },
    },
    original: original.draft.layout,
  };
}

export function exampleDraft(game: StrategyGame): StrategyDraft {
  return game === "blackjack" ? exampleBlackjack() : game === "craps" ? exampleCraps() : exampleRoulette();
}

export function isExampleId(id: string): boolean {
  return (Object.values(EXAMPLE_IDS) as string[]).includes(id);
}

// ---------------------------------------------------------------------------
// Fork and new
// ---------------------------------------------------------------------------

/** A local draft of a library strategy, credited to its author. */
export function forkStrategy(s: LibraryStrategy, taken: Iterable<string>): StrategyDraft {
  const id = uniqueDraftId(`fork-${s.id}`, taken);
  const title = `${s.title} (my copy)`;
  const forkedFrom = credit(s);
  const d = s.draft;
  switch (d.game) {
    case "blackjack":
      // The original's chart becomes the base, so "Compare" starts at 0 changes.
      return { ...d, id, title, forkedFrom, notes: {}, savedAt: null, base: { rules: d.rules, cells: draftOverrides(d) }, cells: {} };
    case "craps":
      return { ...d, id, title, forkedFrom, notes: {}, savedAt: null, original: d.plan };
    case "roulette":
      return { ...d, id, title, forkedFrom, notes: {}, savedAt: null, original: d.layout };
  }
}

/** A fresh strategy for a game: Basic Strategy, pass + odds, or a flat red bet. */
export function newStrategy(game: StrategyGame, taken: Iterable<string>): StrategyDraft {
  const id = uniqueDraftId(`new-${game}`, taken);
  switch (game) {
    case "blackjack":
      return blackjack(id, "New blackjack strategy", DEFAULT_RULES);
    case "craps":
      return { ...craps(id, { ...passAndOddsPlan(CRAPS_PRESETS["3-4-5x"]), name: "New craps plan" }), title: "New craps plan" };
    case "roulette":
      return roulette(id, "New roulette layout", {
        rules: EUROPEAN_RULES,
        bets: [{ spotId: "red", amount: 10 }],
        progression: "flat",
        session: { stopWhenUp: 100, stopWhenDown: 100, maxSpins: 60 },
      });
  }
}

// ---------------------------------------------------------------------------
// Share
// ---------------------------------------------------------------------------

/** The share export: plain JSON a person can paste anywhere (there is no server to post to). */
export function exportDraft(draft: StrategyDraft): string {
  const common = {
    format: "tableside-strategy",
    version: 1,
    game: draft.game,
    title: draft.title,
    forkedFrom: draft.forkedFrom,
    changes: draftChangeCount(draft),
    notes: draft.notes,
  };
  const body =
    draft.game === "blackjack"
      ? { rules: draft.rules, chart: { basicStrategyFor: "rules", overrides: draftOverrides(draft) } }
      : draft.game === "craps"
        ? { plan: draft.plan }
        : { layout: draft.layout };
  return JSON.stringify({ ...common, ...body }, null, 2);
}
