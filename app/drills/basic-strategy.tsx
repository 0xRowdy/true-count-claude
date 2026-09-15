import { Stack } from "expo-router";
import { BasicStrategyDrillScreen } from "@/ui/drills/BasicStrategyDrillScreen";

/** The Basic Strategy drill's route. */
export default function BasicStrategyDrillRoute() {
  return (
    <>
      <Stack.Screen options={{ title: "Basic Strategy drill" }} />
      <BasicStrategyDrillScreen />
    </>
  );
}
