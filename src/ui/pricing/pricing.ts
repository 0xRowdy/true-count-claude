/**
 * Pricing: the plans, the billing toggle and the order summary. Pure (no React, no clock): the
 * trial timeline takes today's date from the caller, read after mount.
 *
 * Nothing here processes a payment. The `Offer` says what the player can actually do (ADR-0007):
 * a build that can't sell shows the same prices as a labelled preview that offers no trial or
 * purchase. On the web, an Account that has had Plus anywhere gets no second trial; in the
 * apps, the store says who gets one.
 */

export type Billing = "monthly" | "yearly";
export type PlanId = "free" | "plus" | "lifetime";
export type Offer = "preview" | "trial" | "paid";

/** What the plans cost, and in which currency. */
export interface Prices {
  readonly currency: string;
  /** Unset: the device's own. The web fixes it, so the prerendered page and the client agree. */
  readonly locale?: string;
  readonly plusMonthly: number;
  readonly plusYearly: number;
  readonly lifetime: number;
}

/** The web's prices (Stripe). The apps show the store's own, in the player's currency. */
export const PRICES: Prices = {
  currency: "USD",
  locale: "en-US",
  plusMonthly: 5.99,
  plusYearly: 49,
  lifetime: 199.99,
};

/** What an app store charges this player, and whether it starts each Plus billing with a trial. */
export interface StoreOffer {
  readonly prices: Prices;
  readonly trial: Readonly<Record<Billing, boolean>>;
}

/**
 * What Pricing offers this player (ADR-0007). On the web, an Account's first Plus starts with a
 * trial. In the apps the store decides, and until it answers (`storeOffersTrial` undefined)
 * nobody is promised one.
 */
export function offerFor(o: {
  canSell: boolean;
  seller: "web" | "store";
  trialUsed: boolean;
  storeOffersTrial: boolean | undefined;
}): Offer {
  if (!o.canSell) return "preview";
  return (o.seller === "web" ? !o.trialUsed : o.storeOffersTrial) ? "trial" : "paid";
}

/** What a store says about one player and one subscription's introductory offer. */
export type IntroEligibility = "eligible" | "ineligible" | "unknown";

/**
 * Whether the store starts this player's subscription with a free trial: a free introductory
 * offer they are eligible for. "Unknown" is no trial, as RevenueCat advises, so nobody is
 * promised a trial and then charged.
 */
export function storeTrial(p: { freeIntro: boolean; eligibility: IntroEligibility }): boolean {
  return p.freeIntro && p.eligibility === "eligible";
}

// ponytail: the stores' trial length is assumed to match (the setup guide asks for 7 days);
// read it from the product's intro offer if they ever differ.
export const TRIAL_DAYS = 7;
/** The preview places a hypothetical reminder this many days before the trial ends. */
export const REMINDER_DAYS_BEFORE = 2;

/** "$49", "$5.99", "$0": whole amounts without cents; `cents` always shows them ("$49.00"). */
export function money(amount: number, p: Prices = PRICES, cents = false): string {
  return new Intl.NumberFormat(p.locale, {
    style: "currency",
    currency: p.currency,
    ...(!cents && Number.isInteger(amount) ? { minimumFractionDigits: 0 } : {}),
  }).format(amount);
}

/** Yearly vs twelve months, to the nearest whole percent (design: "Save 32%"). */
export function yearlySaving(p: Prices = PRICES): number {
  return Math.round((1 - p.plusYearly / (p.plusMonthly * 12)) * 100);
}

export interface PlanView {
  price: string;
  sub: string;
}

/** The price and sub line of each plan card under the chosen billing. */
export function planView(
  plan: PlanId,
  billing: Billing,
  offer: Offer,
  p: Prices = PRICES,
): PlanView {
  const trial = {
    preview: ` · example ${TRIAL_DAYS}-day trial`,
    trial: ` · ${TRIAL_DAYS}-day free trial`,
    paid: "",
  }[offer];
  switch (plan) {
    case "free":
      return { price: money(0, p), sub: "Your current plan" };
    case "plus":
      return billing === "yearly"
        ? {
            price: `${money(p.plusYearly, p)} / year`,
            sub: `${money(Math.floor((p.plusYearly / 12) * 100) / 100, p, true)} a month, billed yearly${trial}`,
          }
        : {
            price: `${money(p.plusMonthly, p)} / month`,
            sub: `Billed monthly${trial}`,
          };
    case "lifetime":
      return {
        price: `${money(p.lifetime, p)} once`,
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
  /** Whether this plan comes with a trial, or shows one as an example (its button says which). */
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
export function order(
  plan: PlanId,
  billing: Billing,
  today: string | null,
  offer: Offer,
  p: Prices = PRICES,
): Order {
  const detail =
    offer === "preview"
      ? "Example price only. Training stays free in this build."
      : "Web, iOS and Android, one account";
  if (plan === "free") {
    return {
      name: "Tableside Free",
      detail: "Every game, every rule set, no card needed",
      total: money(0, p, true),
      dueToday: money(0, p, true),
      timeline: [{ when: "Today", text: "You're already on Free. Nothing to pay, ever." }],
      trial: false,
      purchasable: false,
    };
  }
  if (plan === "lifetime") {
    return {
      name: "Tableside Lifetime",
      detail,
      total: money(p.lifetime, p, true),
      dueToday: money(p.lifetime, p, true),
      timeline: [
        {
          when: "Today",
          text:
            offer === "preview"
              ? `Example: one payment of ${money(p.lifetime, p)} with no renewals. Purchases are unavailable.`
              : `One payment of ${money(p.lifetime, p)}. No renewals.`,
        },
      ],
      trial: false,
      purchasable: true,
    };
  }
  const yearly = billing === "yearly";
  const amount = yearly ? p.plusYearly : p.plusMonthly;
  const base = { name: `Tableside Plus, ${billing}`, detail, total: money(amount, p, true) };
  const per = yearly ? "for the year" : "a month";
  if (offer === "paid") {
    return {
      ...base,
      dueToday: money(amount, p, true),
      timeline: [
        {
          when: "Today",
          text: `${money(amount, p)} ${per}, renewing until you cancel. Trials are for a first subscription.`,
        },
      ],
      trial: false,
      purchasable: true,
    };
  }
  return {
    ...base,
    dueToday: money(0, p, true),
    timeline:
      offer === "trial"
        ? [
            { when: "Today", text: "Free trial starts. Nothing charged." },
            {
              when: dayLabel(today, TRIAL_DAYS),
              text: `Trial ends. ${money(amount, p)} ${per} unless you cancel.`,
            },
          ]
        : [
            {
              when: "Today",
              text: "Example: a seven-day trial would start. No trial starts here.",
            },
            {
              when: dayLabel(today, TRIAL_DAYS - REMINDER_DAYS_BEFORE),
              text: `Example: a reminder would arrive ${REMINDER_DAYS_BEFORE} days before. No reminders are sent.`,
            },
            {
              when: dayLabel(today, TRIAL_DAYS),
              text: `Example: ${money(amount, p)} ${per} after the trial. No subscription starts here.`,
            },
          ],
    trial: true,
    purchasable: true,
  };
}
