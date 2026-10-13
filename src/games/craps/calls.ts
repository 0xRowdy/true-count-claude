/**
 * What the stickman and dealer say — roll calls, history labels and payout calls.
 *
 * Copy follows the design: the 06 roll result ("Six, the hard way" / "Point made · front line
 * winner", history chips "6 hard", "6 point") and the 11 live table ("Six, easy six. Point is
 * still 8.", "Place 6 pays: Rita +$14, Mike +$14").
 */

import { betName } from "./bets";
import { type BetResolution, type RollRecord } from "./table";
import { formatDollars, formatSignedDollars } from "./money";

/** The tag on a roll-history chip. */
export type RollTag = "hard" | "point" | "out" | null;

export interface RollLabel {
  readonly total: number;
  readonly tag: RollTag;
  /** "6 hard", "6 point", "8", "7 out". */
  readonly text: string;
}

/**
 * The roll-history chip. A come-out roll that set the point reads "6 point"; a pair on a
 * hardway number reads "6 hard"; a seven-out reads "7 out"; everything else is the bare total.
 */
export function rollLabel(record: RollRecord): RollLabel {
  let tag: RollTag = null;
  if (record.event === "point-set") tag = "point";
  else if (record.hard) tag = "hard";
  else if (record.event === "seven-out") tag = "out";
  return { total: record.total, tag, text: tag ? `${record.total} ${tag}` : String(record.total) };
}

/** History chips, most recent first, as the 06 frame shows them. */
export function rollHistoryLabels(history: readonly RollRecord[], limit = 6): RollLabel[] {
  return history.slice(-limit).reverse().map(rollLabel);
}

/** The stickman's call for the dice alone: "Six, the hard way", "Six, easy six", "Yo-leven". */
export function rollHeadline(record: Pick<RollRecord, "total" | "hard" | "event">): string {
  const { total, hard, event } = record;
  switch (total) {
    case 2:
      return "Aces, snake eyes";
    case 3:
      return "Three, ace-deuce";
    case 5:
      return "Five, no field five";
    case 7:
      return event === "seven-out" ? "Seven out" : "Seven, winner seven";
    case 9:
      return "Nine, center field nine";
    case 11:
      return "Yo-leven";
    case 12:
      return "Twelve, boxcars";
    default: {
      const word = NUMBER_NAMES[total] ?? String(total);
      return hard ? `${word}, the hard way` : `${word}, easy ${word.toLowerCase()}`;
    }
  }
}

const NUMBER_NAMES: Readonly<Record<number, string>> = {
  4: "Four",
  6: "Six",
  8: "Eight",
  10: "Ten",
};

/** The line under the headline: "Point made · front line winner", "Point is still 8". */
export function rollDetail(record: RollRecord): string {
  switch (record.event) {
    case "point-made":
      return "Point made · front line winner";
    case "point-set":
      return `Point is ${record.total} · the puck is on`;
    case "natural":
      return record.total === 7 ? "Front line winner" : "Yo · front line winner";
    case "craps":
      return record.total === 12
        ? "Craps · line away · bar 12 for the don't"
        : "Craps · line away · don't pass wins";
    case "seven-out":
      return "Seven out · line away · new shooter";
    case "roll":
      return `Point is still ${record.pointBefore}`;
  }
}

/** The one-sentence table call: "Six, easy six. Point is still 8." */
export function rollCall(record: RollRecord): string {
  const head = rollHeadline(record);
  switch (record.event) {
    case "roll":
      return `${head}. Point is still ${record.pointBefore}.`;
    case "point-set":
      return `${head}. The point is ${record.total}.`;
    case "point-made":
      return `${head}. Point made, pay the line.`;
    case "seven-out":
      return `${head}. Line away, new shooter.`;
    case "natural":
      return `${head}. Front line winner.`;
    case "craps":
      return `${head}. Craps, line away.`;
  }
}

/** "@dicecontrol_dee rolled 4 · 2". */
export function rolledBy(handle: string, record: RollRecord): string {
  return `${handle} rolled ${record.dice.d1} · ${record.dice.d2}`;
}

/** "Place 6 pays $14" — the dealer's call for one winning bet. */
export function payoutCall(r: BetResolution): string | null {
  if (r.outcome !== "win" || r.won <= 0) return null;
  return `${betName(r.bet)} pays ${formatDollars(r.won)}`;
}

/**
 * Groups winning bets by name, across players: "Place 6 pays: Rita +$14, Mike +$14".
 * `nameOf` maps an owner id to the short name to show. Groups come largest-first.
 */
export function tablePayoutCalls(
  resolutions: readonly BetResolution[],
  nameOf: (owner: string) => string,
): string[] {
  const groups = new Map<string, { owner: string; won: number }[]>();
  for (const r of resolutions) {
    if (r.outcome !== "win" || r.won <= 0) continue;
    const key = betName(r.bet);
    const list = groups.get(key) ?? [];
    const mine = list.find((x) => x.owner === r.bet.owner);
    if (mine) mine.won += r.won;
    else list.push({ owner: r.bet.owner, won: r.won });
    groups.set(key, list);
  }
  return [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(
      ([name, list]) =>
        `${name} pays: ${list.map((x) => `${nameOf(x.owner)} ${formatSignedDollars(x.won)}`).join(", ")}`,
    );
}

/** The dealer's chat line: "Dealer: Six, easy six. Place 6 pays $14". */
export function dealerLine(record: RollRecord, resolutions: readonly BetResolution[]): string {
  const head = `Dealer: ${rollHeadline(record)}.`;
  const first = resolutions.map(payoutCall).find((x) => x !== null);
  return first ? `${head} ${first}` : head;
}

/**
 * The win badge on a line bet: "+$46" with the breakdown "10 + 36 odds".
 * Returns null when the resolution is not a win.
 */
export function winBadge(r: BetResolution): { amount: string; breakdown: string } | null {
  if (r.outcome !== "win") return null;
  const breakdown = r.wonOdds > 0 ? `${r.wonFlat} + ${r.wonOdds} odds` : `${r.wonFlat}`;
  return { amount: formatSignedDollars(r.won), breakdown };
}
