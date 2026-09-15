/**
 * Signed count entry, as a keypad.
 *
 * Four separate users of one competitor were blocked from answering because its count field
 * could not take a minus sign or a second digit. A Running Count of -12 in a six-deck shoe is
 * ordinary, and a True Count of +14 at the bottom of a deep one is exactly when the bet is
 * biggest — so both are the normal case here, not the edge.
 *
 * The entry is a keypad of buttons rather than a text field. A phone's numeric keyboard hides
 * the minus sign on some platforms, and a gesture or a long-press is invariant 7's "buttons,
 * not gestures" broken. The sign is a key of its own and can be pressed at any point — before
 * the digits, after them, or twice — because people say "minus twelve" and "twelve, minus"
 * both.
 *
 * Wong Halves keeps half-point tags, so its player really does hold a Running Count of +7.5.
 * Screens that can take one enable the half key; everywhere else a half cannot be entered at
 * all rather than being rounded away behind the user's back.
 *
 * Pure: a value in, a value out, no React.
 */

export interface CountEntry {
  readonly negative: boolean;
  /** Whole-number digits as typed, without leading zeros. Empty means nothing typed yet. */
  readonly digits: string;
  /** A trailing ".5". */
  readonly half: boolean;
}

export const EMPTY_ENTRY: CountEntry = { negative: false, digits: "", half: false };

/** Three digits covers every count a shoe can hold (an eight-deck Wong Halves shoe tops out in the low hundreds). */
export const MAX_DIGITS = 3;

export type EntryKey =
  | { readonly kind: "digit"; readonly digit: number }
  | { readonly kind: "sign" }
  | { readonly kind: "half" }
  | { readonly kind: "backspace" }
  | { readonly kind: "clear" };

export function pressKey(entry: CountEntry, key: EntryKey): CountEntry {
  switch (key.kind) {
    case "digit": {
      if (!Number.isInteger(key.digit) || key.digit < 0 || key.digit > 9) return entry;
      // A lone zero is replaced rather than extended: "05" is not a number anyone means.
      const base = entry.digits === "0" ? "" : entry.digits;
      if (base.length >= MAX_DIGITS) return entry;
      return { ...entry, digits: `${base}${key.digit}` };
    }
    case "sign":
      return { ...entry, negative: !entry.negative };
    case "half":
      return { ...entry, half: !entry.half };
    case "backspace":
      if (entry.half) return { ...entry, half: false };
      if (entry.digits.length > 0) return { ...entry, digits: entry.digits.slice(0, -1) };
      return { ...entry, negative: false };
    case "clear":
      return EMPTY_ENTRY;
  }
}

/** Presses a sequence of keys — `"-12"`, `"14-"`, `"7.5"` — for tests and for typed input. */
export function typeKeys(entry: CountEntry, text: string): CountEntry {
  let next = entry;
  for (const character of text) {
    if (character === "-" || character === "−") next = pressKey(next, { kind: "sign" });
    else if (character === "+") next = next.negative ? pressKey(next, { kind: "sign" }) : next;
    else if (character === "." || character === "½") next = next.half ? next : pressKey(next, { kind: "half" });
    else if (character === "5" && next.half) continue;
    else if (/^[0-9]$/.test(character)) next = pressKey(next, { kind: "digit", digit: Number(character) });
  }
  return next;
}

/**
 * The number entered, or `null` when there is nothing to submit yet. A bare half is 0.5 and a
 * bare minus is still nothing — "−" is not a count.
 */
export function entryValue(entry: CountEntry): number | null {
  if (entry.digits === "" && !entry.half) return null;
  const magnitude = (entry.digits === "" ? 0 : Number(entry.digits)) + (entry.half ? 0.5 : 0);
  if (magnitude === 0) return 0;
  return entry.negative ? -magnitude : magnitude;
}

/**
 * What the display shows while typing. The sign is always visible once chosen — a real minus
 * sign, not a hyphen — so a user can see the "−" they pressed before a digit follows it.
 */
export function entryDisplay(entry: CountEntry): string {
  const sign = entry.negative ? "−" : "";
  if (entry.digits === "" && !entry.half) return entry.negative ? "−" : "";
  const whole = entry.digits === "" ? "0" : entry.digits;
  return `${sign}${whole}${entry.half ? ".5" : ""}`;
}

/** An entry holding a value, for "try again from what I said". */
export function entryFor(value: number): CountEntry {
  const magnitude = Math.abs(value);
  const whole = Math.floor(magnitude);
  return {
    negative: value < 0,
    digits: String(whole),
    half: magnitude - whole >= 0.5,
  };
}
