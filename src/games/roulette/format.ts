/**
 * Money, percentage and payout formatting for roulette copy, and the cent arithmetic money
 * is settled in.
 *
 * Done by hand rather than with `toLocaleString`: the web export is prerendered, and
 * locale-dependent output is a hydration mismatch waiting to happen. These strings read the
 * same on the server, in the browser, and in tests.
 */

/** Money is settled in whole cents so sums never carry float noise. */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

const MINUS = "−";

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** "$6,400", "$2.70", "$12.50". Cents shown only when the amount is not whole. */
export function formatDollars(amount: number): string {
  const cents = Math.round(Math.abs(amount) * 100);
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  const body = `$${groupThousands(String(whole))}${frac === 0 ? "" : `.${String(frac).padStart(2, "0")}`}`;
  return amount < 0 && cents !== 0 ? `${MINUS}${body}` : body;
}

/** "+$40", "−$100", "$0". Uses a true minus sign, as the design does. */
export function formatSignedDollars(amount: number): string {
  const cents = Math.round(amount * 100);
  if (cents === 0) return "$0";
  return cents > 0 ? `+${formatDollars(amount)}` : formatDollars(amount);
}

/** "48.6%", "2.7%", "5.26%" (with `digits = 2`). Trailing zeros are kept to `digits`. */
export function formatPercent(probability: number, digits = 1): string {
  return `${(probability * 100).toFixed(digits)}%`;
}

/** A house edge the way casinos publish it: 2.7%, 5.26%, 1.35%, 7.89%. */
export function formatHouseEdge(edge: number): string {
  const pct = edge * 100;
  const two = pct.toFixed(2);
  return two.endsWith("0") ? `${pct.toFixed(1)}%` : `${two}%`;
}

/** "35:1" for the bet loupe. */
export function formatPayoutRatio(payout: number): string {
  return `${payout}:1`;
}

/** "5 to 1" for the Strategy Builder. */
export function formatPayoutOdds(payout: number): string {
  return `${payout} to 1`;
}
