import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, Notice, ui } from "@/ui/ds";
import { signInWith } from "./authClient";
import { type Provider, ProviderButton } from "./ProviderButton";

/**
 * Continue with Apple / Continue with Google, and what went wrong if a sign-in failed.
 * `returnTo` is the in-app path the player lands on, signed in.
 */
export function SignInOptions({
  returnTo,
  error: initialError = null,
}: {
  returnTo: string;
  /** A failure reported by the URL (a web sign-in that came back with `?error=`). */
  error?: string | null;
}) {
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = error ?? initialError;

  const start = async (provider: Provider) => {
    setBusy(provider);
    setError(null);
    try {
      await signInWith(provider, returnTo);
      // The web has left for the provider by now; native is signed in.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
      return;
    }
    setBusy(null);
  };

  return (
    <View style={styles.options}>
      <ProviderButton provider="apple" busy={busy === "apple"} onPress={() => start("apple")} />
      <ProviderButton provider="google" busy={busy === "google"} onPress={() => start("google")} />
      {shown ? (
        <Notice
          title="That sign-in didn't go through"
          body={`${shown}. Nothing changed; try again, or use the other option.`}
          onClose={() => setError(null)}
        />
      ) : null}
      <Text style={[ui(12, 400, { lineHeight: 18 }), styles.fine]}>
        Tableside gets only your name and email. With Apple you can keep your email hidden.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  options: { gap: 12, alignSelf: "stretch" },
  fine: { color: colors.mutedForeground, textAlign: "center" },
});
