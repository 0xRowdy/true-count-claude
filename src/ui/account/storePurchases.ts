import type { Billing } from "@/ui/pricing/pricing";

/**
 * In-app purchases through the App Store and Google Play (RevenueCat). The web sells through
 * Stripe Checkout instead, so this web half has no store; `storePurchases.native.ts` is the
 * real one.
 */
export const STORE_AVAILABLE = false;

export type StoreOutcome = "purchased" | "cancelled";

export async function buyInStore(
  _userId: string,
  _plan: "plus" | "lifetime",
  _billing: Billing,
): Promise<StoreOutcome> {
  throw new Error("In-app purchases exist only in the iOS and Android apps");
}

export async function restoreStorePurchases(_userId: string): Promise<void> {
  throw new Error("In-app purchases exist only in the iOS and Android apps");
}
