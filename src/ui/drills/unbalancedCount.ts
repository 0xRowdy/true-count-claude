/**
 * The two reference numbers an unbalanced count carries, each with a label that says what it is.
 *
 * #25: under KO the play table printed "Raise bets from -4" while the Explanation beside it said
 * "pivot of 4". Both were right — the Key Count and the pivot are different numbers for
 * different jobs — but unlabelled they read as the app contradicting itself about one number,
 * which is how "this app's math is wrong" reviews get written about math that is right.
 *
 * - **Key Count** — the Running Count at which a KO player starts raising bets. Published per
 *   deck count, and absent for deck counts the authors did not publish (never interpolated).
 * - **Pivot** — the one Running Count that signals the same edge at every depth of the shoe.
 *   For a system with `t` tag points per deck, a Running Count `RC` with `r` decks left is
 *   worth a balanced true count of `(RC - pivot) / r + t`; at `RC = pivot` that is `t` whatever
 *   `r` is. KO's pivot of +4 always reads as +4; Red 7's pivot of 0 always reads as +2.
 *
 * Red 7 publishes no separate Key Count: its pivot is also where its player raises bets
 * (`src/engine/counting.ts`), so it has one number and one label, and never the two-number
 * problem KO has.
 *
 * Every screen that shows either number takes its label from here, so the words cannot drift
 * apart between the play table, the drills, and the Explanation.
 */

import { type CountingSystem, keyCount } from "@/engine/counting";

export interface UnbalancedCountRow {
  readonly kind: "key-count" | "pivot";
  readonly label: string;
  /** `null` for a Key Count the authors did not publish at this deck count. */
  readonly value: number | null;
  /** One sentence, for a screen with room to say it. */
  readonly meaning: string;
}

export const NONE_PUBLISHED = "none published";

/**
 * The labelled reference rows for a system at a known deck count. Empty for a balanced system,
 * which reads a True Count against an index instead.
 */
export function unbalancedCountRows(system: CountingSystem, decks: number): readonly UnbalancedCountRow[] {
  return rowsFor(system, keyCount(system, decks) ?? null, decks);
}

/**
 * The same rows, recovered from the play table's `CountReadout.pivot`.
 *
 * That field holds the Key Count when one is published for the deck count in play and falls back
 * to the pivot when none is. The count panel is not handed the deck count, so the two cases are
 * told apart by value — which is exact rather than a guess: a Key Count is where bets go up
 * *before* the shoe reaches the pivot's edge, so a published Key Count is always below the pivot
 * (KO: +2, +1, -4 and -6 against a pivot of +4). A readout equal to the pivot is the fallback.
 */
export function unbalancedCountRowsFromReadout(
  system: CountingSystem,
  readoutPivot: number | null,
): readonly UnbalancedCountRow[] {
  const published = readoutPivot !== null && readoutPivot !== system.pivot ? readoutPivot : null;
  return rowsFor(system, published, null);
}

function rowsFor(
  system: CountingSystem,
  published: number | null,
  decks: number | null,
): readonly UnbalancedCountRow[] {
  if (system.balanced) return [];

  const pivotMeaning = `The one Running Count that signals the same edge at every depth of the shoe.`;

  if (system.keyCounts === undefined) {
    return [
      {
        kind: "pivot",
        label: "Pivot · also where bets go up",
        value: system.pivot,
        meaning: `${pivotMeaning} ${system.name} publishes no separate Key Count: its player raises bets from the pivot.`,
      },
    ];
  }

  const deckWords = decks === null ? "this deck count" : `${decks} deck${decks === 1 ? "" : "s"}`;
  return [
    {
      kind: "key-count",
      label: "Key count · raise bets from",
      value: published,
      meaning:
        published === null
          ? `${system.name}'s authors published no Key Count for ${deckWords}, so none is shown rather than one invented.`
          : `The Running Count at which a ${system.name} player starts raising bets, published for ${deckWords}.`,
    },
    {
      kind: "pivot",
      label: "Pivot · same edge at any depth",
      value: system.pivot,
      meaning: `${pivotMeaning} Not a betting trigger — bets go up earlier, at the Key Count.`,
    },
  ];
}
