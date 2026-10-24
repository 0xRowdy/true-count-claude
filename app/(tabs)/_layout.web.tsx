import { Stack } from "expo-router";

/**
 * On the web there is no system tab bar: the App Header (AppShell) carries the five areas, so
 * the tab groups are a plain stack here and the URLs are the same as on native.
 */
export default function TabsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
