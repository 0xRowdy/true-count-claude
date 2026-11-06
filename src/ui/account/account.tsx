import { type AuthClient, ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import { Platform } from "react-native";
import { appleAuthorizationCode, authClient, refreshSession } from "./authClient";
import { ACCOUNTS_AVAILABLE, convex } from "./backend";
import { identifyStoreUser } from "./storePurchases";

/**
 * The signed-in Account, for screens (ADR-0007). Optional by design (invariant 8): no screen
 * waits on it, and a build without a backend reports `unavailable` and nothing else.
 */

export type Account = NonNullable<FunctionReturnType<typeof api.account.me>>;

export type AccountState =
  | { readonly status: "unavailable" }
  | { readonly status: "loading" }
  | { readonly status: "signed-out" }
  | { readonly status: "signed-in"; readonly account: Account };

const UNAVAILABLE: AccountState = { status: "unavailable" };
const LOADING: AccountState = { status: "loading" };
const SIGNED_OUT: AccountState = { status: "signed-out" };

/**
 * The component's `AuthClient` type infers `useSession().data` as `never` against
 * better-auth 1.6, which no real client satisfies; the runtime contract (useSession,
 * convex.token, crossDomain) is met, so the type is asserted once, here.
 */
const providerAuthClient = authClient as unknown as AuthClient;

/** Wraps the app once, in the root layout. Without a backend it is a pass-through. */
export function AccountProvider({ children }: { children: ReactNode }) {
  if (!convex) return <>{children}</>;
  return (
    <ConvexBetterAuthProvider client={convex} authClient={providerAuthClient}>
      <StoreIdentity />
      {children}
    </ConvexBetterAuthProvider>
  );
}

/**
 * Starts RevenueCat as the signed-in Account once sign-in has settled, at launch rather than
 * at the first purchase, so a purchase interrupted last time is finished now. Apps only.
 */
function StoreIdentity() {
  const userId = storeUserId(useAccount());
  useEffect(() => {
    // A failure here is retried by the next purchase, restore or Pricing visit.
    if (userId !== undefined) identifyStoreUser(userId).catch(() => {});
  }, [userId]);
  return null;
}

/** Who the store should buy for: the Account's id, null signed out, undefined while unknown. */
export function storeUserId(account: AccountState): string | null | undefined {
  if (account.status === "signed-in") return account.account.id;
  return account.status === "signed-out" ? null : undefined;
}

/**
 * `loading` until after mount whatever the session says, so the prerendered HTML and the first
 * client render agree (hydration); then the live answer.
 */
function useLiveAccount(): AccountState {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { isLoading, isAuthenticated } = useConvexAuth();
  const me = useQuery(api.account.me, mounted && isAuthenticated ? {} : "skip");
  if (!mounted || isLoading) return LOADING;
  if (!isAuthenticated || me === null) return SIGNED_OUT;
  if (me === undefined) return LOADING;
  return { status: "signed-in", account: me };
}

// Chosen once per build (ACCOUNTS_AVAILABLE is inlined at build time), so the hooks inside
// are called unconditionally for the life of the app.
export const useAccount: () => AccountState = ACCOUNTS_AVAILABLE
  ? useLiveAccount
  : () => UNAVAILABLE;

export async function signOut(): Promise<void> {
  const { error } = await authClient.signOut();
  if (error) throw new Error(error.message ?? "We couldn't sign you out. Please try again.");
  await refreshSession();
}

/** Whether the signed-in Account has an Apple sign-in linked. */
export async function signsInWithApple(): Promise<boolean> {
  const { data } = await authClient.listAccounts();
  return data?.some((a) => a.providerId === "apple") ?? false;
}

/**
 * Deletes the Account and everything the backend holds for it (App Store guideline 5.1.1(v)).
 * A web subscription is canceled with it; a store subscription is the player's to cancel.
 * Practice history stays on this device: it was never the Account's.
 *
 * On iOS, an Account that signs in with Apple shows Apple's sheet first, and the code it gives
 * revokes the app's Sign in with Apple once the Account is gone (#62). Closing the sheet keeps
 * the Account (`canceled`). If the sheet itself fails, the Account is still deleted: the player
 * can remove the app in Settings, which is better than being unable to delete.
 *
 * Better Auth asks for a sign-in from the last day first: `reauthenticate` means sign in again.
 */
export async function deleteAccount(): Promise<"deleted" | "reauthenticate" | "canceled"> {
  let appleCode: string | null = null;
  if (Platform.OS === "ios" && (await signsInWithApple())) {
    try {
      appleCode = await appleAuthorizationCode();
      if (appleCode === null) return "canceled";
    } catch {
      // No code (signed out of iCloud, say): delete anyway, unrevoked.
    }
  }
  const { error } = await authClient.deleteUser();
  if (error) {
    if (error.code === "SESSION_EXPIRED") return "reauthenticate";
    throw new Error(error.message ?? "The account couldn't be deleted");
  }
  if (appleCode && convex) {
    // The Account is gone either way; the backend logs a failure.
    await convex
      .action(api.apple.revokeFromDevice, { authorizationCode: appleCode })
      .catch(() => {});
  }
  await refreshSession();
  return "deleted";
}
