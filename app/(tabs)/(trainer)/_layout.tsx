import { TabStack } from "@/ui/navigation/TabStack";

/** The Trainer tab's stack: `drills/index` at its root, so a deep link still has a way back. */
export const unstable_settings = { anchor: "drills/index" };

export default function TrainerLayout() {
  return <TabStack root={unstable_settings.anchor} />;
}
