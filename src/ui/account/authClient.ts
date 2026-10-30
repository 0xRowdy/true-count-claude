import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { CONVEX_SITE_URL } from "./backend";
import type { Provider } from "./ProviderButton";

/**
 * Better Auth on the web. The app is a static site on its own origin and Better Auth lives on
 * the Convex deployment's, so the session travels as a token in localStorage, not a cookie
 * (the cross-domain plugin). `authClient.native.ts` is the iOS/Android counterpart; Metro
 * picks one per platform, so neither ships the other's dependencies.
 */
export const authClient = createAuthClient({
  baseURL: CONVEX_SITE_URL,
  plugins: [convexClient(), crossDomainClient()],
});

/** Re-reads the session (the native client needs this after sign-in; the web one does not). */
export async function refreshSession(): Promise<void> {
  await authClient.getSession();
}

/**
 * Leaves for the provider and comes back to `returnTo` signed in (the provider exchanges the
 * one-time token in the URL). On failure Better Auth returns to /sign-in with `?error=`.
 */
export async function signInWith(provider: Provider, returnTo: string): Promise<void> {
  const origin = window.location.origin;
  const { error } = await authClient.signIn.social({
    provider,
    callbackURL: `${origin}${returnTo}`,
    errorCallbackURL: `${origin}/sign-in`,
  });
  if (error) throw new Error(error.message ?? error.code ?? "Sign-in failed");
}
