import { Stack } from "expo-router";
import { DrillsHub } from "@/ui/drills/DrillsHub";

/**
 * The drills hub. Every drill is reachable from here and none is behind a purchase
 * (invariant 1). The title is set here so the route owns its own presentation.
 */
export default function DrillsRoute() {
  return (
    <>
      <Stack.Screen options={{ title: "Drills" }} />
      <DrillsHub />
    </>
  );
}
