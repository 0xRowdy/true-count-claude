import { Stack, usePathname } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import Head from "expo-router/head";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { colors as ds } from "@/ui/ds/tokens";
import { pageTitle } from "@/ui/pageTitle";
import { useTablesideFonts } from "@/ui/ds/fonts";
import { usePrefetchPortraits } from "@/ui/ds/Avatar";

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS !== "web" || __DEV__ || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.warn(
        "Offline cache could not be installed. Training is still available online.",
        error,
      );
    });
  }, []);
  const fontsReady = useTablesideFonts();
  // The coach's portrait is in every Coach Note: fetched once here, before any note shows.
  usePrefetchPortraits();
  const pathname = usePathname();

  // Native must measure text with its final font. Web keeps the prerendered tree for hydration.
  if (Platform.OS !== "web" && !fontsReady) return null;

  return (
    <SafeAreaProvider style={{ backgroundColor: ds.background }}>
      {/* Browser titles only: native Head enables iOS Handoff, which needs a hosted origin. */}
      {Platform.OS === "web" ? (
        <Head>
          <title>{pageTitle(pathname)}</title>
        </Head>
      ) : null}
      <StatusBar style="light" />
      <SafeAreaView
        style={{ flex: 1 }}
        edges={Platform.OS === "web" ? [] : ["top", "right", "bottom", "left"]}
      >
        <Stack
          screenOptions={{
            headerShown: false,
            headerStyle: { backgroundColor: ds.card },
            headerTintColor: ds.foreground,
            contentStyle: { backgroundColor: ds.background },
          }}
        >
          {/* The marketing pages draw their own top bar (frames Do2ZB, aLrYu); pricing uses AppShell. */}
          <Stack.Screen name="index" options={{ title: "Tableside", headerShown: false }} />
          <Stack.Screen
            name="onboarding"
            options={{ title: "Get started · Tableside", headerShown: false }}
          />
          <Stack.Screen
            name="pricing"
            options={{ title: "Pricing · Tableside", headerShown: false }}
          />
          <Stack.Screen name="play" options={{ title: "Blackjack", headerShown: false }} />
          {/* The sheet is not an AppShell page (it mirrors frame bi8Au), so it hides the header here. */}
          <Stack.Screen
            name="design-system"
            options={{ title: "Design system · Tableside", headerShown: false }}
          />
        </Stack>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
