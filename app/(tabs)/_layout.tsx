import { NativeTabs } from "expo-router/native-tabs";
import { colors, surfaces } from "@/ui/ds/tokens";

/**
 * The app's five top-level areas as the platform's own tab bar: UITabBar on iOS (Liquid Glass
 * on iOS 26), the Material navigation bar on Android. Icons are SF Symbols and Material
 * Symbols, as each platform expects. The web keeps the App Header instead (`_layout.web.tsx`).
 * Games and Play open over the tabs from the root stack, full screen.
 */
export default function TabsLayout() {
  return (
    <NativeTabs
      tintColor={colors.primary}
      iconColor={{ default: colors.mutedForeground, selected: colors.primary }}
      labelStyle={{
        default: { color: colors.mutedForeground },
        selected: { color: colors.primary },
      }}
      backgroundColor={colors.background}
      // Android: every destination labelled (Material 3), the active pill in Secondary Fill.
      labelVisibilityMode="labeled"
      indicatorColor={colors.secondary}
      rippleColor={surfaces.primaryWash}
      disableTransparentOnScrollEdge
    >
      <NativeTabs.Trigger name="(lobby)">
        <NativeTabs.Trigger.Label>Lobby</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }}
          md="grid_view"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(trainer)">
        <NativeTabs.Trigger.Label>Trainer</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "graduationcap", selected: "graduationcap.fill" }}
          md="school"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(strategies)">
        <NativeTabs.Trigger.Label>Strategies</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "books.vertical", selected: "books.vertical.fill" }}
          md="library_books"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(live)">
        <NativeTabs.Trigger.Label>Live</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "person.3", selected: "person.3.fill" }}
          md="groups"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(progress)">
        <NativeTabs.Trigger.Label>Progress</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="chart.line.uptrend.xyaxis" md="show_chart" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
