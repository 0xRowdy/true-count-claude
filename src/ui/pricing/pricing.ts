/**
 * Pricing: the plans, the billing toggle and the order summary. Pure (no React, no clock): the
 * trial timeline takes today's date from the caller, read after mount.
 *
 * Nothing here processes a payment. This build shows the prices; purchase buttons only say
 * that purchases are not available.
 */

export type Billing = "monthly" | "yearly";
export type PlanId = "free" | "plus" | "lifetime";

export const PRICES = {
  plusMonthly: 5.99,
  plusYearly: 49,
  lifetime: 119,
} as const;

export const TRIAL_DAYS = 7;
/** The reminder goes out this many days before the trial ends. */
export const REMINDER_DAYS_BEFORE = 2;

/** "$49", "$5.99", "$0" — whole dollars without cents. */
export function dollars(amount: number): string {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

/** "$49.00": always with cents (order lines). */
export function dollarsCents(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/** Yearly vs twelve months, to the nearest whole percent (design: "Save 32%"). */
export function yearlySaving(): number {
  return Math.round((1 - PRICES.plusYearly / (PRICES.plusMonthly * 12)) * 100);
}

export interface PlanView {
  price: string;
  sub: string;
}

/** The price and sub line of each plan card under the chosen billing. */
export function planView(plan: PlanId, billing: Billing): PlanView {
  switch (plan) {
    case "free":
      return { price: "$0", sub: "Your current plan" };
    case "plus":
      return billing === "yearly"
        ? {
            price: `${dollars(PRICES.plusYearly)} / year`,
            sub: `${dollarsCents(Math.floor((PRICES.plusYearly / 12) * 100) / 100)} a month, billed yearly · ${TRIAL_DAYS}-day free trial`,
          }
        : {
            price: `${dollars(PRICES.plusMonthly)} / month`,
            sub: `Billed monthly · ${TRIAL_DAYS}-day free trial`,
          };
    case "lifetime":
      return {
        price: `${dollars(PRICES.lifetime)} once`,
        sub: "Everything in Plus, no subscription",
      };
  }
}

export interface TimelineEntry {
  /** "Today", "Oct 16"; before mount (no date yet) "In 5 days". */
  when: string;
  text: string;
}

export interface Order {
  name: string;
  detail: string;
  total: string;
  dueToday: string;
  timeline: TimelineEntry[];
  /** Whether this plan starts with a free trial (shows "Start free trial with card"). */
  trial: boolean;
  /** Free is already the player's plan: nothing to buy. */
  purchasable: boolean;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayLabel(today: string | null, offset: number): string {
  if (!today) return `In ${offset} days`;
  const d = new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86_400_000);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "Your order" for a plan and billing, with the trial timeline counted from `today`. */
export function order(plan: PlanId, billing: Billing, today: string | null): Order {
  if (plan === "free") {
    return {
      name: "Tableside Free",
      detail: "Every game, every rule set, no card needed",
      total: dollarsCents(0),
      dueToday: dollarsCents(0),
      timeline: [{ when: "Today", text: "You're already on Free. Nothing to pay, ever." }],
      trial: false,
      purchasable: false,
    };
  }
  if (plan === "lifetime") {
    return {
      name: "Tableside Lifetime",
      detail: "Example price only. Training stays free in this build.",
      total: dollarsCents(PRICES.lifetime),
      dueToday: dollarsCents(PRICES.lifetime),
      timeline: [
        { when: "Today", text: `One payment of ${dollars(PRICES.lifetime)}. No renewals.` },
      ],
      trial: false,
      purchasable: true,
    };
  }
  const yearly = billing === "yearly";
  const amount = yearly ? PRICES.plusYearly : PRICES.plusMonthly;
  return {
    name: `Tableside Plus, ${billing}`,
    detail: "Example price only. Training stays free in this build.",
    total: dollarsCents(amount),
    dueToday: dollarsCents(0),
    timeline: [
      { when: "Today", text: "Free trial starts. Nothing charged." },
      {
        when: dayLabel(today, TRIAL_DAYS - REMINDER_DAYS_BEFORE),
        text: `We'll email and notify you ${REMINDER_DAYS_BEFORE} days before.`,
      },
      {
        when: dayLabel(today, TRIAL_DAYS),
        text: yearly
          ? `Trial ends. ${dollars(amount)} for the year unless you cancel.`
          : `Trial ends. ${dollars(amount)} a month unless you cancel.`,
      },
    ],
    trial: true,
    purchasable: true,
  };
}
