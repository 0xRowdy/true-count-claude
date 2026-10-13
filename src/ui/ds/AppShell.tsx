import { useState, type ReactNode } from "react";
import { Stack } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import { useChipBalance, useProgressView } from "@/ui/progress/progressStore";
import { AppHeader, type NavKey } from "./AppHeader";
import { colors } from "./tokens";

/** The design's desktop frames are 1440 wide; content sits inside 32 / 32 / 48 padding. */
export const PAGE_MAX_WIDTH = 1440;
const NARROW = 640;

/**
 * Page wrapper for the app's desktop screens (Lobby, Progress, Strategies…): the App Header
 * with `active` highlighted, then a scrolling content column on `--background`, padded and
 * capped at the design's 1440 width. It hides the stack header itself.
 *
 * The header's chip pill shows the player's total practice balance from the progress store on
 * every page, so no page can forget it. `chips` overrides it where a page shows another number
 * (the lobby's labelled sample history, a live table's own stack, the design-system sheet).
 */
export function AppShell({
  active,
  children,
  chips,
}: {
  active?: NavKey;
  children: ReactNode;
  /** Overrides the header pill's balance (otherwise the stored total practice balance). */
  chips?: number;
}) {
  // Read after mount like every stored value (hydration): undefined until storage answers.
  const stored = useChipBalance(useProgressView(false));
  // Measured after mount (hydration): phones get a 16pt gutter instead of 32.
  const [narrow, setNarrow] = useState(false);
  return (
    <View style={styles.root} onLayout={(e) => setNarrow(e.nativeEvent.layout.width < NARROW)}>
      {/* The shell is the page chrome: no stack header above it, whichever route uses it. */}
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader active={active} chips={chips ?? stored} />
      {/* "handled": a tap on a button inside the page lands even while a field has focus. */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.page, narrow && styles.pageNarrow]}>{children}</View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: { alignItems: "center" },
  page: {
    width: "100%",
    maxWidth: PAGE_MAX_WIDTH,
    paddingTop: 32,
    paddingHorizontal: 32,
    paddingBottom: 48,
  },
  pageNarrow: { paddingTop: 20, paddingHorizontal: 16 },
});
