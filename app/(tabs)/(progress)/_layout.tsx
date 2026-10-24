import { TabStack } from "@/ui/navigation/TabStack";

/** The Progress tab's stack: `progress` at its root, so a deep link still has a way back. */
export const unstable_settings = { anchor: "progress" };

export default function ProgressLayout() {
  return <TabStack root="progress" />;
}
