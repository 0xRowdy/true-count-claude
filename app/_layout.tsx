import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors as ds } from "@/ui/ds/tokens";
import { useTablesideFonts } from "@/ui/ds/fonts";
import { colors } from "@/ui/theme";

export default function RootLayout() {
  // Fraunces + Inter for the Tableside design system. Deliberately not awaited (hydration).
  useTablesideFonts();

  return (
    <SafeAreaProvider style={{ backgroundColor: ds.background }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: ds.background },
        }}
      >
        <Stack.Screen name="index" options={{ title: "True Count" }} />
        <Stack.Screen name="play" options={{ title: "Blackjack", headerShown: false }} />
        {/* The sheet is not an AppShell page (it mirrors frame bi8Au), so it hides the header here. */}
        <Stack.Screen
          name="design-system"
          options={{ title: "Design system · Tableside", headerShown: false }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}
