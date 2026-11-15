/**
 * How the copy names the platforms Tableside runs on, by `Platform.OS`. Pure (React Native
 * only as a type): the screens pass the OS in.
 *
 * App Store guideline 2.3.10 forbids naming other mobile platforms in an iOS app, so on iOS
 * these say "every device" and "the App Store" and never Android or Google Play (#80). The web
 * and Android keep naming every platform.
 */

import type { Platform } from "react-native";

/** `Platform.OS`, so a misspelt "iOS" fails typechecking instead of naming Android. */
export type OS = (typeof Platform)["OS"];

export interface PlatformCopy {
  /** Where a plan works, after "on": "the web, iPhone and Android". */
  readonly reach: string;
  /** The order summary's line under a paid plan. */
  readonly orderDetail: string;
  /** Pricing's pointer for a store purchase, which is managed in the store. */
  readonly manageStorePurchase: string;
  /** Where the apps cancel a store subscription, after "or": "your … settings in the apps". */
  readonly storeSettings: string;
  /** The stores that sell in the apps, after "in": "the App Store or Google Play". */
  readonly stores: string;
}

const EVERY_PLATFORM: PlatformCopy = {
  reach: "the web, iPhone and Android",
  orderDetail: "Web, iOS and Android, one account",
  manageStorePurchase: "Bought on iPhone or Android? Manage it in your app store.",
  storeSettings: "your App Store or Google Play subscription settings in the apps",
  stores: "the App Store or Google Play",
};

const IOS: PlatformCopy = {
  reach: "every device",
  orderDetail: "One account, every device",
  manageStorePurchase: "Bought in the App Store? Manage it in your App Store subscriptions.",
  storeSettings: "your App Store subscription settings in the app",
  stores: "the App Store",
};

export function platformCopy(os: OS): PlatformCopy {
  return os === "ios" ? IOS : EVERY_PLATFORM;
}
