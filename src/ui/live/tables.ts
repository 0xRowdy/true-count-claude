/**
 * The live tables list (`/live`), as the lobby's "Live tables" panel names them (ZDK1x).
 *
 * Only craps has a simulated multiplayer table; its seat count comes from the engine's table.
 * Blackjack and roulette are not simulated yet, so they say "Opens soon" and point at the
 * single-player tables rather than showing a seat count nobody is sitting in.
 */

import { createLiveTable } from "@/games/craps";
import { FIXTURE_SEED } from "./session";

export type TableIcon = "dices" | "spade" | "circle-dot";

export interface LiveTableEntry {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly icon: TableIcon;
  /** "6/8" for an open table; null when it has not opened. */
  readonly seats: string | null;
  /** Where Join goes; null when the table has not opened. */
  readonly href: string | null;
  /** The single-player table for the same game. */
  readonly soloHref: string;
}

export function liveTables(): LiveTableEntry[] {
  const craps = createLiveTable({ seed: FIXTURE_SEED });
  return [
    {
      id: "craps",
      title: "Craps · Downtown rules",
      description: "3-4-5x odds · Hosted by @rail_rita · simulated players",
      icon: "dices",
      seats: `${craps.seats.length}/${craps.capacity}`,
      href: "/live/craps",
      soloHref: "/games/craps",
    },
    {
      id: "blackjack",
      title: "Blackjack · 6 deck, S17",
      description: "Counting practice · coach on mistakes",
      icon: "spade",
      seats: null,
      href: null,
      soloHref: "/play",
    },
    {
      id: "roulette",
      title: "Roulette · European",
      description: "La Partage · casual",
      icon: "circle-dot",
      seats: null,
      href: null,
      soloHref: "/games/roulette",
    },
  ];
}

/** Carries `?seed=` and `?pace=` from the list to the table, so a run can be replayed. */
export function withReplayParams(href: string, search: string): string {
  const from = new URLSearchParams(search);
  const keep = new URLSearchParams();
  for (const key of ["seed", "pace"]) {
    const v = from.get(key);
    if (v && /^[a-z0-9]{1,16}$/i.test(v)) keep.set(key, v);
  }
  const q = keep.toString();
  return q ? `${href}?${q}` : href;
}
