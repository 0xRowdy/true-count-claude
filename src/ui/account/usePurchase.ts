import { ConvexError } from "convex/values";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import {
  offerFor,
  PRICES,
  type Billing,
  type Offer,
  type PlanId,
  type StoreOffer,
} from "@/ui/pricing/pricing";
import { storeUserId, useAccount } from "./account";
import { ACCOUNTS_AVAILABLE } from "./backend";
import { billingFailure, startWebCheckout, syncStorePurchases } from "./billing";
import {
  buyInStore,
  loadStoreOffer,
  restoreStorePurchases,
  STORE_AVAILABLE,
} from "./storePurchases";

export interface PurchaseNotice {
  readonly title: string;
  readonly body: string;
}

/**
 * Whether this build can take a payment: a backend, and on native a store key too. Fixed at
 * build time, so the prerendered page and the client agree. Without it, Pricing and Landing
 * show the labelled preview.
 */
export const CAN_SELL = ACCOUNTS_AVAILABLE && (Platform.OS === "web" || STORE_AVAILABLE);

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
  // Signed out it isn't known yet: sign-in comes back to this page before anything is charged.
  const trialUsed = account.status === "signed-in" && account.account.trialUsed;

  // In the apps the store sets the price, the currency and who gets a trial.
  const [store, setStore] = useState<StoreOffer | null>(null);
  const storeUser = storeUserId(account);
  useEffect(() => {
    if (!STORE_AVAILABLE || storeUser === undefined) return;
    let live = true;
    loadStoreOffer(storeUser).then(
      (o) => live && setStore(o),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [storeUser]);
  const prices = store?.prices ?? PRICES;
  const offer = (billing: Billing): Offer =>
    offerFor({
      canSell: CAN_SELL,
      web: Platform.OS === "web",
      trialUsed,
      storeTrial: store?.trial[billing],
    });

  const buy = async (plan: "plus" | "lifetime", billing: Billing) => {
    setNotice(null);
    if (account.status === "unavailable" || !CAN_SELL) return setNotice(PURCHASES_UNAVAILABLE);
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
        await syncAfterStore(PURCHASE_NOT_SYNCED);
        router.push("/account?checkout=success");
      }
    } catch (e) {
      setNotice(
        e instanceof SyncFailed ? e.notice : { title: "Nothing was charged", body: failure(e) },
      );
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
            await syncAfterStore(RESTORE_NOT_SYNCED);
            setNotice({ title: "Purchases restored", body: "Your plan is up to date." });
          } catch (e) {
            setNotice(
              e instanceof SyncFailed
                ? e.notice
                : { title: "Nothing was restored", body: failure(e) },
            );
          }
          setBusy(false);
        }
      : null;

  return {
    current,
    prices,
    offer,
    buy,
    restore,
    busy,
    notice,
    clearNotice: () => setNotice(null),
  };
}

const PURCHASE_NOT_SYNCED: PurchaseNotice = {
  title: "Your purchase went through",
  body: "We couldn't update your plan yet. It should appear shortly; if it doesn't, use Restore purchases. You won't be charged again.",
};

const RESTORE_NOT_SYNCED: PurchaseNotice = {
  title: "Your purchases were found",
  body: "We couldn't update your plan yet. It should appear shortly; if it doesn't, try Restore purchases again.",
};

/** The store has already taken the payment by now, so this failure says something different. */
class SyncFailed extends Error {
  constructor(readonly notice: PurchaseNotice) {
    super(notice.title);
  }
}

async function syncAfterStore(notice: PurchaseNotice): Promise<void> {
  try {
    await syncStorePurchases();
  } catch {
    throw new SyncFailed(notice);
  }
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
