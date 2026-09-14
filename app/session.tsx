import { Stack } from "expo-router";
import { SessionScreen } from "@/ui/session/SessionScreen";

/**
 * The Statistics route.
 *
 * Its own top-level screen so the Session's aggregate numbers — and the control that ends
 * the Session — are reachable from outside the felt. The title is set here rather than in
 * `app/_layout.tsx` so the route owns its own presentation.
 */
export default function SessionRoute() {
  return (
    <>
      <Stack.Screen options={{ title: "Statistics" }} />
      <SessionScreen />
    </>
  );
}
