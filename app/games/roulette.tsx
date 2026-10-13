import { Stack, useLocalSearchParams } from "expo-router";
import { RouletteScreen } from "@/ui/games/roulette/RouletteScreen";

/** The Roulette table (frame dBsVJ). `?seed=<n>` makes the spins deterministic (e2e). */
export default function RouletteRoute() {
  const { seed } = useLocalSearchParams<{ seed?: string }>();
  return (
    <>
      <Stack.Screen options={{ title: "Roulette", headerShown: false }} />
      <RouletteScreen seed={seed} />
    </>
  );
}
