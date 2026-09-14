import { Stack } from "expo-router";
import { ShoeIntegrityScreen } from "@/ui/shoe-integrity/ShoeIntegrityScreen";

/**
 * The Shoe Integrity Panel's route.
 *
 * Its own top-level screen, reachable from the home screen and never behind a purchase
 * (invariant 1). The title is set here rather than in `app/_layout.tsx` so the route owns
 * its own presentation.
 */
export default function ShoeIntegrityRoute() {
  return (
    <>
      <Stack.Screen options={{ title: "Shoe Integrity" }} />
      <ShoeIntegrityScreen />
    </>
  );
}
