import { Platform } from "react-native";
import Purchases, {
  INTRO_ELIGIBILITY_STATUS,
  PURCHASES_ERROR_CODE,
  type PurchasesStoreProduct,
} from "react-native-purchases";
import {
  storeTrial,
  type Billing,
  type IntroEligibility,
  type StoreOffer,
} from "@/ui/pricing/pricing";

/**
 * App Store and Google Play purchases through RevenueCat (ADR-0007). RevenueCat's app user id
 * is always the signed-in Account's id, so a purchase belongs to the Account, follows it to
 * the web, and restores on any device. Nothing is bought anonymously.
 *
 * Purchases need a development or store build; Expo Go runs RevenueCat's preview mode.
 */
const API_KEY =
  Platform.OS === "ios"
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
    : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

export const STORE_AVAILABLE = Boolean(API_KEY);

/** `unsure`: the store reported a problem of its own, and may or may not have charged. */
export type StoreOutcome = "purchased" | "cancelled" | "unsure";

let configured = false;
/** The app user id RevenueCat has confirmed (null: anonymous). */
let current: string | null = null;
/** Identity changes run one at a time, so a purchase never starts mid-switch. */
let queue: Promise<void> = Promise.resolve();

/**
 * Who RevenueCat buys for. The first call configures the SDK, which also finishes any purchase
 * a crash or a lost connection interrupted. Signed out (`null`) keeps the last id: nothing is
 * bought signed out, and a later sign-in switches with `logIn`. A failed switch is retried by
 * the next call.
 */
function asUser(userId: string | null): Promise<void> {
  queue = queue
    .catch(() => {})
    .then(async () => {
      if (!configured) {
        Purchases.configure({ apiKey: API_KEY!, appUserID: userId });
        configured = true;
        current = userId;
      } else if (userId !== null && userId !== current) {
        await Purchases.logIn(userId);
        current = userId;
      }
    });
  return queue;
}

/** Called at launch, once sign-in has settled (RevenueCat asks to configure early). */
export async function identifyStoreUser(userId: string | null): Promise<void> {
  if (STORE_AVAILABLE) await asUser(userId);
}

/** The current offering's packages: `$rc_monthly`, `$rc_annual`, `$rc_lifetime`. */
async function packages() {
  const offering = (await Purchases.getOfferings()).current;
  return { monthly: offering?.monthly, yearly: offering?.annual, lifetime: offering?.lifetime };
}

function iosEligibility(status: INTRO_ELIGIBILITY_STATUS | undefined): IntroEligibility {
  if (status === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE) return "eligible";
  if (
    status === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_INELIGIBLE ||
    status === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_NO_INTRO_OFFER_EXISTS
  ) {
    return "ineligible";
  }
  return "unknown";
}

/** Null until the store has all three products. */
export async function loadStoreOffer(userId: string | null): Promise<StoreOffer | null> {
  await asUser(userId);
  const { monthly, yearly, lifetime } = await packages();
  if (!monthly || !yearly || !lifetime) return null;
  const m = monthly.product;
  const y = yearly.product;
  // iOS: StoreKit knows who has had an introductory offer. Play lists only offers the player
  // can take, so a free phase there is one they're eligible for.
  const eligible =
    Platform.OS === "ios"
      ? await Purchases.checkTrialOrIntroductoryPriceEligibility([m.identifier, y.identifier])
      : {};
  const freeTrial = (p: PurchasesStoreProduct) =>
    Platform.OS === "ios"
      ? storeTrial({
          freeIntro: p.introPrice?.price === 0,
          eligibility: iosEligibility(eligible[p.identifier]?.status),
        })
      : storeTrial({ freeIntro: p.defaultOption?.freePhase != null, eligibility: "eligible" });
  return {
    prices: {
      currency: m.currencyCode,
      plusMonthly: m.price,
      plusYearly: y.price,
      lifetime: lifetime.product.price,
    },
    trial: { monthly: freeTrial(m), yearly: freeTrial(y) },
  };
}

export async function buyInStore(
  userId: string,
  plan: "plus" | "lifetime",
  billing: Billing,
): Promise<StoreOutcome> {
  await asUser(userId);
  const pkg = (await packages())[plan === "lifetime" ? "lifetime" : billing];
  if (!pkg) throw new Error("This plan isn't set up in the store yet");
  try {
    await Purchases.purchasePackage(pkg);
    return "purchased";
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return "cancelled";
    // The one failure RevenueCat says may still have charged the player.
    if (code === PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR) return "unsure";
    throw e;
  }
}

/** Apple requires a way to restore purchases (Lifetime above all) on a new device. */
export async function restoreStorePurchases(userId: string): Promise<void> {
  await asUser(userId);
  await Purchases.restorePurchases();
}
