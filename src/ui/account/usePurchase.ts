import { ConvexError } from "convex/values";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform } from "react-native";
import type { Billing, PlanId } from "@/ui/pricing/pricing";
import { useAccount } from "./account";
import { billingFailure, startWebCheckout, syncStorePurchases } from "./billing";
import { buyInStore, restoreStorePurchases, STORE_AVAILABLE } from "./storePurchases";

export interface PurchaseNotice {
  readonly title: string;
  readonly body: string;
}

export const PURCHASES_UNAVAILABLE: PurchaseNotice = {
  title: "Purchases aren't available in this build",
  body: "Nothing was charged and no card details were asked for. Every game and the coach are free to use right now.",
};

/**
 * Buying Plus or Lifetime (ADR-0007). Signed out, it goes to sign-in first and comes back to
 * the same plan; on the web it leaves for Stripe Checkout; in the apps it buys from the App
 * Store or Google Play. A build that can't sell says so in place and charges nothing.
 */
export function usePurchase() {
  const router = useRouter();
  const account = useAccount();
  const [notice, setNotice] = useState<PurchaseNotice | null>(null);
  const [busy, setBusy] = useState(false);

  const current: PlanId = account.status === "signed-in" ? account.account.plan.plan : "free";
  const canSell = Platform.OS === "web" || STORE_AVAILABLE;

  const buy = async (plan: "plus" | "lifetime", billing: Billing) => {
    setNotice(null);
    if (account.status === "unavailable" || !canSell) return setNotice(PURCHASES_UNAVAILABLE);
    if (account.status === "loading") return;
    if (account.status === "signed-out") {
      const back = `/pricing?plan=${plan}&billing=${billing}`;
      return router.push(`/sign-in?next=${encodeURIComponent(back)}`);
    }
    setBusy(true);
    try {
      if (Platform.OS === "web") {
        // Stays busy while the page leaves for Stripe.
        return window.location.assign(await startWebCheckout(plan, billing));
      }
      const outcome = await buyInStore(account.account.id, plan, billing);
      if (outcome === "purchased") {
        await syncStorePurchases();
        router.push("/account?checkout=success");
      }
    } catch (e) {
      setNotice({ title: "Nothing was charged", body: failure(e) });
    }
    setBusy(false);
  };

  /** Restores App Store / Google Play purchases to the signed-in Account (apps only). */
  const restore =
    Platform.OS !== "web" && STORE_AVAILABLE && account.status === "signed-in"
      ? async () => {
          setBusy(true);
          setNotice(null);
          try {
            await restoreStorePurchases(account.account.id);
            await syncStorePurchases();
            setNotice({ title: "Purchases restored", body: "Your plan is up to date." });
          } catch (e) {
            setNotice({ title: "Nothing was restored", body: failure(e) });
          }
          setBusy(false);
        }
      : null;

  return { current, buy, restore, busy, notice, clearNotice: () => setNotice(null) };
}

/**
 * A store's own message where there is one (StoreKit and Play Billing explain themselves);
 * the billing copy for anything from the backend, whose raw text is not for players.
 */
function failure(e: unknown): string {
  const fromBackend =
    e instanceof ConvexError || (e instanceof Error && e.message.includes("[CONVEX"));
  return !fromBackend && e instanceof Error ? e.message : billingFailure(e);
}
