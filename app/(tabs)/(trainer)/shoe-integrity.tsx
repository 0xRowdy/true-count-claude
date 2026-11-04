import { Stack } from "expo-router";
import { sessionResultFor } from "@/ui/session/sessionFormat";
import { useSessionOverview } from "@/ui/session/usePlaySession";
import { ShoeIntegrityScreen } from "@/ui/shoe-integrity/ShoeIntegrityScreen";

/**
 * The Shoe Integrity Panel's route.
 *
 * Its own top-level screen, reachable from the home screen and never behind a purchase
 * (invariant 1). The title is set here rather than in `app/_layout.tsx` so the route owns
 * its own presentation.
 *
 * The Session is read here rather than inside the screen, so the screen stays a function of
 * its props: the expectation band's argument is "here are the hands you played", and where
 * they come from is the route's business. `sessionResultFor` returns `null` before a single
 * hand has resolved — there is no result to place — and the panel then falls back to its
 * manual-entry form, which is also what someone checking a Session played elsewhere needs.
 */
export default function ShoeIntegrityRoute() {
  const overview = useSessionOverview();
  const played = sessionResultFor(overview.stats);

  return (
    <>
      <Stack.Screen options={{ title: "Shoe Integrity" }} />
      <ShoeIntegrityScreen {...(played ? { session: played } : {})} />
    </>
  );
}
