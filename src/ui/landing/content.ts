/**
 * The landing page's content: the five tables and the example community strategies.
 *
 * The strategies are fixed, seeded example data (no backend, ADR-0003). The page labels them
 * as examples; nothing here claims to be a live feed.
 */

import type { ImageSourcePropType } from "react-native";
import baccarat from "../../../assets/games/baccarat.jpg";
import blackjack from "../../../assets/games/blackjack.jpg";
import craps from "../../../assets/games/craps.jpg";
import roulette from "../../../assets/games/roulette.jpg";
import videoPoker from "../../../assets/games/video-poker.jpg";
import type { GameId } from "@/state/profile";
import { colors } from "@/ui/ds";

export interface TableTile {
  id: GameId;
  name: string;
  rules: string;
  learn: string;
  /** Route from the fixed route map. */
  href: string;
  image: ImageSourcePropType;
}

/** The five games, in the design's order (Do2ZB › Tiles). */
export const TABLES: readonly TableTile[] = [
  {
    id: "blackjack",
    name: "Blackjack",
    rules: "3:2 · S17/H17 · 1–8 decks",
    learn: "Basic strategy, deviations, Hi-Lo counting",
    href: "/play",
    image: blackjack,
  },
  {
    id: "roulette",
    name: "Roulette",
    rules: "American & European · La Partage",
    learn: "Every bet type, payouts, table etiquette",
    href: "/games/roulette",
    image: roulette,
  },
  {
    id: "craps",
    name: "Craps",
    rules: "Full layout · 3-4-5x to 100x odds",
    learn: "Pass/come, odds, place bets, systems",
    href: "/games/craps",
    image: craps,
  },
  {
    id: "video-poker",
    name: "Video Poker",
    rules: "Jacks or Better · Deuces · Double Double",
    learn: "Optimal holds for 9 pay tables",
    href: "/games/video-poker",
    image: videoPoker,
  },
  {
    id: "baccarat",
    name: "Baccarat",
    rules: "Punto Banco · EZ Baccarat · 5% commission",
    learn: "Third-card rules, bet math, side-bet odds",
    href: "/games/baccarat",
    image: baccarat,
  },
];

export interface ExampleStrategy {
  rank: number;
  title: string;
  game: string;
  description: string;
  votes: string;
  forks: string;
  accuracy: string;
  author: string;
  authorColor: string;
}

/** Example strategies (seeded fixtures, labelled as examples on the page). */
export const EXAMPLE_STRATEGIES: readonly ExampleStrategy[] = [
  {
    rank: 1,
    title: "Hi-Lo with Illustrious 18",
    game: "Blackjack · 6 deck · S17",
    description:
      "Basic strategy plus the 18 index plays that matter most. Drills true-count conversion before every bet.",
    votes: "2.4k",
    forks: "318",
    accuracy: "91% avg.",
    author: "@shoe_reader",
    authorColor: colors.chip500,
  },
  {
    rank: 2,
    title: "Iron Cross, explained",
    game: "Craps · 3-4-5x odds",
    description:
      "Field plus place 5, 6 and 8. Shows exactly what the house edge costs you per roll before you commit.",
    votes: "1.1k",
    forks: "204",
    accuracy: "88% avg.",
    author: "@dicecontrol_dee",
    authorColor: colors.chip5,
  },
];

export const EXAMPLE_FORK = {
  title: "“Hi-Lo for H17 shoes” by @mtn_mike",
  lineage: "Forked from Hi-Lo with Illustrious 18 by @shoe_reader · changed 4 index plays",
  badge: "Rising #7",
} as const;
