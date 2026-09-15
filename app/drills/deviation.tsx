import { Stack } from "expo-router";
import { DeviationDrillScreen } from "@/ui/drills/DeviationDrillScreen";

/** The Deviation drill's route. */
export default function DeviationDrillRoute() {
  return (
    <>
      <Stack.Screen options={{ title: "Deviation drill" }} />
      <DeviationDrillScreen />
    </>
  );
}
