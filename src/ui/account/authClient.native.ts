import { expoClient } from "@better-auth/expo/client";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import Constants from "expo-constants";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { CONVEX_SITE_URL } from "./backend";
import type { Provider } from "./ProviderButton";

const scheme = Constants.expoConfig?.scheme as string;

/** Better Auth on iOS and Android: the session cookie lives in the keychain / keystore. */
export const authClient = createAuthClient({
  baseURL: CONVEX_SITE_URL,
  plugins: [convexClient(), expoClient({ scheme, storagePrefix: scheme, storage: SecureStore })],
});

/**
 * Better Auth 1.6 on React Native can leave `useSession` deaf to a sign-in until the app
 * restarts (better-auth#10545); refetching the session atom directly wakes it up.
 */
export async function refreshSession(): Promise<void> {
  await authClient.$store.atoms.session?.get().refetch();
}

/**
 * iOS uses the system Sign in with Apple sheet and hands Better Auth the identity token. Every
 * other case opens the provider in an in-app browser that returns to `truecount://`.
 */
export async function signInWith(provider: Provider, returnTo: string): Promise<void> {
  if (provider === "apple" && Platform.OS === "ios") {
    const nonce = Crypto.randomUUID();
    let credential: AppleAuthentication.AppleAuthenticationCredential;
    try {
      credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce,
      });
    } catch (e) {
      // Closing the sheet is not an error worth showing.
      if ((e as { code?: string }).code === "ERR_REQUEST_CANCELED") return;
      throw e;
    }
    if (!credential.identityToken) throw new Error("Apple returned no identity token");
    const { error } = await authClient.signIn.social({
      provider: "apple",
      idToken: {
        token: credential.identityToken,
        nonce,
        // Apple shares the name on the first sign-in only.
        user: {
          name: {
            firstName: credential.fullName?.givenName ?? undefined,
            lastName: credential.fullName?.familyName ?? undefined,
          },
        },
      },
    });
    if (error) throw new Error(error.message ?? error.code ?? "Sign-in failed");
  } else {
    const { error } = await authClient.signIn.social({ provider, callbackURL: returnTo });
    if (error) throw new Error(error.message ?? error.code ?? "Sign-in failed");
  }
  await refreshSession();
}
