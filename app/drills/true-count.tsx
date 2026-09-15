import { Stack } from "expo-router";
import { TrueCountDrillScreen } from "@/ui/drills/TrueCountDrillScreen";

/** The True Count drill's route. */
export default function TrueCountDrillRoute() {
  return (
    <>
      <Stack.Screen options={{ title: "True Count drill" }} />
      <TrueCountDrillScreen />
    </>
  );
}
