import { Stack } from "expo-router";
import { CountingDrillScreen } from "@/ui/drills/CountingDrillScreen";

/** The Counting drill's route. */
export default function CountingDrillRoute() {
  return (
    <>
      <Stack.Screen options={{ title: "Counting drill" }} />
      <CountingDrillScreen />
    </>
  );
}
