import { Linking, StyleSheet, Text, View } from "react-native";
import { AppShell, colors, display, ui } from "@/ui/ds";

/**
 * Terms of Use and the Privacy Policy, linked from Pricing (Apple 3.1.2 asks for both where a
 * subscription is sold) and served on the web at /terms and /privacy for the store listings.
 * Each line says what the app actually does; change them together with the code.
 */

const APPLE_EULA = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

type Section = readonly [heading: string, body: string];

const DOCS = {
  terms: {
    title: "Terms of Use",
    sections: [
      [
        "Practice only",
        "Tableside is a training tool for casino table games. All chips and balances are virtual and have no cash value. There is no real-money gambling, nothing can be cashed out, and training or expected-value figures do not guarantee results at a casino.",
      ],
      [
        "Plans",
        "Every game and the coach are free. Tableside Plus is a subscription, billed monthly or yearly; Tableside Lifetime is a single payment. Prices are shown before you buy. A plan belongs to your account and works on the web, iPhone and Android.",
      ],
      [
        "Renewal and cancellation",
        "Plus renews automatically at the end of each period until you cancel. Cancel where you bought it: Account → Manage billing for the web, or your App Store or Google Play subscription settings in the apps. Canceling stops the next renewal; Plus stays until the end of the period you paid for. A free trial, where offered, is for a first subscription and turns into a paid subscription when it ends unless you cancel before then.",
      ],
      [
        "Refunds",
        "Purchases made in the App Store or Google Play are refunded under that store's policy, through the store. Web purchases are handled by Tableside through Stripe.",
      ],
      [
        "App Store purchases",
        "If you use Tableside from the App Store, Apple's Standard License Agreement also applies.",
      ],
    ] satisfies readonly Section[],
  },
  privacy: {
    title: "Privacy Policy",
    sections: [
      [
        "On your device",
        "Your progress, settings, session history and strategies are stored only in this browser or device. Clearing its storage deletes them. Session backups and bug reports leave the device only when you choose to download, share or send them.",
      ],
      [
        "Your account (optional)",
        "Training needs no account. If you sign in with Google or Apple, we keep your name, email address and profile picture from that sign-in, your signed-in sessions (with the IP address and browser or device they came from), and a record of what you have bought, so your plan follows you between devices. These are stored on our servers, hosted by Convex.",
      ],
      [
        "Payments",
        "Stripe takes payment on the web; Apple or Google takes it in the apps, and RevenueCat keeps the record of those store purchases for us. We never see or store your card details.",
      ],
      [
        "What we don't do",
        "No advertising, no analytics or tracking SDKs, and we don't sell or share your information with anyone beyond the services named here, which handle it to sign you in and take payment.",
      ],
      [
        "Deleting your data",
        "Account → Delete account removes your account and our purchase records for it, and cancels any web subscription. A store subscription is canceled in the store. Data on your device is yours to clear.",
      ],
    ] satisfies readonly Section[],
  },
} as const;

export function LegalScreen({ doc }: { doc: keyof typeof DOCS }) {
  const { title, sections } = DOCS[doc];
  return (
    <AppShell>
      <View style={styles.body}>
        <Text accessibilityRole="header" aria-level={1} style={[display(32, 500), styles.fg]}>
          {title}
        </Text>
        <Text style={[ui(13), styles.muted]}>Last updated November 4, 2026</Text>
        {sections.map(([heading, body]) => (
          <View key={heading} style={styles.section}>
            <Text accessibilityRole="header" aria-level={2} style={[ui(17, 600), styles.fg]}>
              {heading}
            </Text>
            <Text style={[ui(15, 400, { lineHeight: 23 }), styles.muted]}>{body}</Text>
          </View>
        ))}
        {doc === "terms" ? (
          <Text
            accessibilityRole="link"
            onPress={() => Linking.openURL(APPLE_EULA)}
            style={[ui(15, 600), styles.fg, { textDecorationLine: "underline", minHeight: 44 }]}
          >
            Apple's Standard License Agreement
          </Text>
        ) : null}
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  fg: { color: colors.foreground },
  muted: { color: colors.mutedForeground },
  body: { gap: 20, maxWidth: 720, paddingTop: 16, paddingBottom: 32 },
  section: { gap: 6 },
});
