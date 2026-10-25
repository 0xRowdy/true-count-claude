import { TabStack } from "@/ui/navigation/TabStack";

/** The Strategies tab's stack: `strategies/index` at its root, so a deep link still has a way back. */
export const unstable_settings = { anchor: "strategies/index" };

export default function StrategiesLayout() {
  return <TabStack root={unstable_settings.anchor} />;
}
