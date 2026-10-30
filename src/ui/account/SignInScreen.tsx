import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AppShell, Button, colors, display, Notice, ui } from "@/ui/ds";
import { useAccount } from "./account";
import { SignInOptions } from "./SignInOptions";

/** Only in-app paths: `?next=` never sends anyone off-site. */
export function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/account";
}

/**
 * Sign in (ADR-0007). Reached from the landing page, the account page, and from Pricing before
 * a purchase (`?next=/pricing?plan=…`), which it returns to once signed in.
 */
export function SignInScreen() {
  const router = useRouter();
  const account = useAccount();
  const params = useLocalSearchParams<{ next?: string; error?: string }>();
  // Search params are not in the prerendered HTML: read them after mount (hydration).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const next = safeNext(mounted ? params.next : undefined);
  const error = mounted && params.error ? params.error.replaceAll("_", " ").toLowerCase() : null;

  useEffect(() => {
    if (account.status === "signed-in") router.replace(next);
  }, [account.status, next, router]);

  return (
    <AppShell>
      <View style={styles.column}>
        <View style={styles.head}>
          <Text accessibilityRole="header" aria-level={1} style={[display(32, 500), styles.fg]}>
            Sign in to Tableside
          </Text>
          <Text style={[ui(16, 400, { lineHeight: 24 }), styles.muted]}>
            An account keeps Plus with you on the web, iPhone and Android. You don&apos;t need one
            to play: your practice is saved on this device either way.
          </Text>
        </View>
        {account.status === "unavailable" ? (
          <>
            <Notice
              title="Accounts aren't available in this build"
              body="Everything you play, your profile and your stats are saved on this device, and nothing is sent anywhere."
            />
            <Button
              label="Back to the lobby"
              variant="secondary"
              onPress={() => router.push("/lobby")}
            />
          </>
        ) : (
          <SignInOptions returnTo={next} error={error} />
        )}
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  column: {
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
    alignItems: "flex-start",
    gap: 24,
    paddingVertical: 24,
  },
  head: { gap: 10 },
  fg: { color: colors.foreground },
  muted: { color: colors.mutedForeground },
});
