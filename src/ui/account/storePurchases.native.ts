import { Platform } from "react-native";
import Purchases, { PURCHASES_ERROR_CODE } from "react-native-purchases";
import type { Billing } from "@/ui/pricing/pricing";

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

export type StoreOutcome = "purchased" | "cancelled";

let configuredFor: string | null = null;

async function asUser(userId: string): Promise<void> {
  if (configuredFor === userId) return;
  if (configuredFor === null) Purchases.configure({ apiKey: API_KEY!, appUserID: userId });
  else await Purchases.logIn(userId);
  configuredFor = userId;
}

/** The current RevenueCat offering's packages: `$rc_monthly`, `$rc_annual`, `$rc_lifetime`. */
export async function buyInStore(
  userId: string,
  plan: "plus" | "lifetime",
  billing: Billing,
): Promise<StoreOutcome> {
  await asUser(userId);
  const offering = (await Purchases.getOfferings()).current;
  const pkg =
    plan === "lifetime"
      ? offering?.lifetime
      : billing === "yearly"
        ? offering?.annual
        : offering?.monthly;
  if (!pkg) throw new Error("This plan isn't set up in the store yet");
  try {
    await Purchases.purchasePackage(pkg);
    return "purchased";
  } catch (e) {
    if ((e as { code?: string }).code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
      return "cancelled";
    }
    throw e;
  }
}

/** Apple requires a way to restore purchases (Lifetime above all) on a new device. */
export async function restoreStorePurchases(userId: string): Promise<void> {
  await asUser(userId);
  await Purchases.restorePurchases();
}
