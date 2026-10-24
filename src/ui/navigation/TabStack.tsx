import { Stack } from "expo-router";
import { Platform } from "react-native";
import { colors } from "@/ui/ds/tokens";

/**
 * The stack inside one native tab (Lobby, Trainer, Strategies, Live, Progress).
 *
 * The tab's root screen draws its own Fraunces title, so it has no bar. A screen pushed inside
 * the tab (a drill, a builder, the live table) gets the platform's own navigation bar with a
 * back button, so iOS edge-swipe and the visible chevron both lead back. The web keeps the App
 * Header (AppShell) and never shows these bars.
 */
export function TabStack({ root }: { root: string }) {
  return (
    <Stack
      screenOptions={({ route }) => ({
        headerShown: Platform.OS !== "web" && route.name !== root,
        headerTitle: "",
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.foreground,
        headerShadowVisible: false,
        headerBackButtonDisplayMode: "minimal",
        contentStyle: { backgroundColor: colors.background },
      })}
    />
  );
}
