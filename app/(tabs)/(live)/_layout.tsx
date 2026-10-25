import { TabStack } from "@/ui/navigation/TabStack";

/** The Live tab's stack: `live/index` at its root, so a deep link still has a way back. */
export const unstable_settings = { anchor: "live/index" };

export default function LiveLayout() {
  return <TabStack root={unstable_settings.anchor} />;
}
