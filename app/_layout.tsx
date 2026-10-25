import { DarkTheme, Stack, ThemeProvider, usePathname } from "expo-router";
import { useEffect } from "react";
import { Platform, View } from "react-native";
import Head from "expo-router/head";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { colors as ds } from "@/ui/ds/tokens";
import { BACK_BAR } from "@/ui/navigation/TabStack";
import { loadProfile } from "@/ui/profile/profileStore";
import { pageTitle } from "@/ui/pageTitle";
import { useTablesideFonts } from "@/ui/ds/fonts";
import { usePrefetchPortraits } from "@/ui/ds/Avatar";

const NATIVE = Platform.OS !== "web";

/** The navigation theme behind native bars, sheets and the tab bar: Tableside is dark only. */
const THEME = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: ds.primary,
    background: ds.background,
    card: ds.background,
    text: ds.foreground,
    border: ds.border,
    notification: ds.primary,
  },
};

export default function RootLayout() {
  useEffect(() => {
    if (NATIVE || __DEV__ || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.warn(
        "Offline cache could not be installed. Training is still available online.",
        error,
      );
    });
  }, []);
  // Native `/` redirects on the stored profile: read it while the fonts load, not after.
  useEffect(() => loadProfile(), []);
  const fontsReady = useTablesideFonts();
  // The coach's portrait is in every Coach Note: fetched once here, before any note shows.
  usePrefetchPortraits();

  // Native must measure text with its final font. Web keeps the prerendered tree for hydration.
  // Until then the page is the app's own background, never a white frame.
  if (NATIVE && !fontsReady) return <View style={{ flex: 1, backgroundColor: ds.background }} />;

  return (
    <ThemeProvider value={THEME}>
      <SafeAreaProvider style={{ backgroundColor: ds.background }}>
        {NATIVE ? null : <PageTitle />}
        <StatusBar style="light" />
        {/*
         * The bottom inset is left to each screen: the native tab bar draws its own, and the
         * full-screen routes pad for it below (`contentStyle`).
         */}
        <SafeAreaView style={{ flex: 1 }} edges={NATIVE ? ["top", "right", "left"] : []}>
          <RootStack />
        </SafeAreaView>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

/**
 * The browser tab's title, from the route. Web only: native Head enables iOS Handoff, which
 * needs a hosted origin. Its own component, so a navigation re-renders the title, not the root.
 */
function PageTitle() {
  const pathname = usePathname();
  return (
    <Head>
      <title>{pageTitle(pathname)}</title>
    </Head>
  );
}

function RootStack() {
  const { bottom } = useSafeAreaInsets();
  // A screen pushed over the tabs (a game, Play, onboarding) clears the home indicator itself.
  const page = { backgroundColor: ds.background, paddingBottom: bottom };

  return (
    <Stack screenOptions={{ ...BACK_BAR, headerShown: false, contentStyle: page }}>
      <Stack.Screen
        name="(tabs)"
        options={{ title: "Tableside", contentStyle: { backgroundColor: ds.background } }}
      />
      {/* The marketing pages draw their own top bar (frames Do2ZB, aLrYu). */}
      <Stack.Screen name="index" options={{ title: "Tableside" }} />
      <Stack.Screen name="onboarding" options={{ title: "Get started · Tableside" }} />
      {/*
       * Pricing and the design sheet are reached from inside the app on native: they get the
       * platform's back bar there. The web keeps its own top bar.
       */}
      <Stack.Screen
        name="pricing"
        options={{ title: "Pricing · Tableside", headerShown: NATIVE }}
      />
      <Stack.Screen name="play" options={{ title: "Blackjack" }} />
      {/* The sheet is not an AppShell page (it mirrors frame bi8Au). */}
      <Stack.Screen
        name="design-system"
        options={{ title: "Design system · Tableside", headerShown: NATIVE }}
      />
    </Stack>
  );
}
