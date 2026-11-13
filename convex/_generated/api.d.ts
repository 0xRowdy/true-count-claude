/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as apple from "../apple.js";
import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
import type * as cleanup from "../cleanup.js";
import type * as http from "../http.js";
import type * as lib_appleSecret from "../lib/appleSecret.js";
import type * as lib_plan from "../lib/plan.js";
import type * as lib_stores from "../lib/stores.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  apple: typeof apple;
  auth: typeof auth;
  billing: typeof billing;
  cleanup: typeof cleanup;
  http: typeof http;
  "lib/appleSecret": typeof lib_appleSecret;
  "lib/plan": typeof lib_plan;
  "lib/stores": typeof lib_stores;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  stripe: import("@convex-dev/stripe/_generated/component.js").ComponentApi<"stripe">;
  actionRetrier: import("@convex-dev/action-retrier/_generated/component.js").ComponentApi<"actionRetrier">;
};
