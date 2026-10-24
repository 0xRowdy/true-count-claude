import { Stack } from "expo-router";
import { RuleSetScreen } from "@/ui/rules/RuleSetScreen";

/**
 * The Rule Set configuration route.
 *
 * Its own top-level screen, because Basic Strategy is a function of the Rule Set
 * (CONTEXT.md) and the table you play is the setting everything else in the app is derived
 * from. The title is set here rather than in `app/_layout.tsx` so the route owns its own
 * presentation, the same way `app/shoe-integrity.tsx` does.
 */
export default function RulesRoute() {
  return (
    <>
      <Stack.Screen options={{ title: "Your Table" }} />
      <RuleSetScreen />
    </>
  );
}
