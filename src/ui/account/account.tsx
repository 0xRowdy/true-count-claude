import { type AuthClient, ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import { authClient, refreshSession } from "./authClient";
import { ACCOUNTS_AVAILABLE, convex } from "./backend";

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
      {children}
    </ConvexBetterAuthProvider>
  );
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
  await authClient.signOut();
  await refreshSession();
}

/**
 * Deletes the Account and everything the backend holds for it (App Store guideline 5.1.1(v)).
 * A web subscription is canceled with it; a store subscription is the player's to cancel.
 * Practice history stays on this device: it was never the Account's.
 *
 * Better Auth asks for a sign-in from the last day first: `reauthenticate` means sign in again.
 */
export async function deleteAccount(): Promise<"deleted" | "reauthenticate"> {
  const { error } = await authClient.deleteUser();
  if (error) {
    if (error.code === "SESSION_EXPIRED") return "reauthenticate";
    throw new Error(error.message ?? "The account couldn't be deleted");
  }
  await refreshSession();
  return "deleted";
}
