/**
 * Whole-dollar formatting, locale-free.
 *
 * `toLocaleString` would differ between the prerendered web export and the browser, which is a
 * hydration error waiting to happen; these helpers always produce the same string.
 */

/** "$2,596", "-$78" for negatives. */
export function formatDollars(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${groupThousands(Math.abs(Math.round(amount)))}`;
}

/** "+$46", "−$78" (true minus sign), "$0" — for wins and losses. */
export function formatSignedDollars(amount: number): string {
  const rounded = Math.round(amount);
  if (rounded === 0) return "$0";
  return `${rounded > 0 ? "+" : "−"}$${groupThousands(Math.abs(rounded))}`;
}

/** "1.41%", "0%", "16.67%" — an edge as a percentage with up to two decimals. */
export function formatPercent(fraction: number, decimals = 2): string {
  const value = fraction * 100;
  const fixed = value.toFixed(decimals);
  const trimmed = fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
  return `${trimmed === "-0" ? "0" : trimmed}%`;
}

function groupThousands(n: number): string {
  const digits = String(n);
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ",";
    out += digits[i];
  }
  return out;
}
