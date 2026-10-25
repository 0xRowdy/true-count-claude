import { Stack, useIsFocused } from "expo-router";
import { useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { colors } from "@/ui/ds/tokens";

/** The platform's back bar on the app background: a bare chevron, no title, no hairline. */
export const BACK_BAR = {
  headerTitle: "",
  headerStyle: { backgroundColor: colors.background },
  headerTintColor: colors.foreground,
  headerShadowVisible: false,
  headerBackButtonDisplayMode: "minimal",
} as const;

/**
 * The stack inside one native tab (Lobby, Trainer, Strategies, Live, Progress).
 *
 * The tab's root screen draws its own Fraunces title, so it has no bar. A screen pushed inside
 * the tab (a drill, a builder, the live table) gets the platform's own navigation bar with a
 * back button, so iOS edge-swipe and the visible chevron both lead back. The web keeps the App
 * Header (AppShell) and never shows these bars.
 *
 * Native tabs render every tab when the app opens, and expo-router has no lazy option. So a
 * tab's root screen draws only the app background until the tab is first opened, then stays: the
 * launch renders one tab's screen, and a tab opened once comes back instantly. The stack itself
 * mounts at once, so a link into an unopened tab still lands on top of the tab's root.
 */
export function TabStack({ root }: { root: string }) {
  const focused = useIsFocused();
  const [opened, setOpened] = useState(focused);
  if (focused && !opened) setOpened(true);

  return (
    <Stack
      screenOptions={({ route }) => ({
        ...BACK_BAR,
        headerShown: Platform.OS !== "web" && route.name !== root,
        contentStyle: { backgroundColor: colors.background },
      })}
      screenLayout={({ route, children }) =>
        opened || route.name !== root ? children : <View style={styles.unopened} />
      }
    />
  );
}

const styles = StyleSheet.create({
  unopened: { flex: 1, backgroundColor: colors.background },
});
