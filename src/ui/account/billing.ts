import { ConvexError } from "convex/values";
import { api } from "../../../convex/_generated/api";
import type { BillingErrorCode } from "../../../convex/billing";
import type { Billing } from "@/ui/pricing/pricing";
import { convex } from "./backend";
import { billingErrorMessage } from "./planCopy";

/**
 * Billing calls, made on the Convex client directly rather than through hooks so a screen can
 * offer them whether or not this build has a backend. The client carries the session, so the
 * server knows whose purchase it is.
 */

function client() {
  if (!convex) throw new Error("This build has no backend");
  return convex;
}

/** A Stripe Checkout URL for Plus or Lifetime (web). */
export async function startWebCheckout(plan: "plus" | "lifetime", billing: Billing) {
  const { url } = await client().action(api.billing.startCheckout, { plan, billing });
  return url;
}

/** A Stripe customer portal URL for a plan bought on the web. */
export async function billingPortalUrl() {
  const { url } = await client().action(api.billing.openBillingPortal, {});
  return url;
}

/** Tells the backend to re-read the App Store / Google Play state now. */
export async function syncStorePurchases() {
  await client().action(api.billing.syncStorePurchases, {});
}

/** What to tell the player when a billing call fails. */
export function billingFailure(e: unknown): string {
  const code =
    e instanceof ConvexError
      ? (e.data as { code?: BillingErrorCode } | undefined)?.code
      : undefined;
  return billingErrorMessage(code);
}
