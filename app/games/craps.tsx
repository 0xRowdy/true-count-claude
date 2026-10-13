import { useLocalSearchParams } from "expo-router";
import { CrapsScreen } from "@/ui/games/craps/CrapsScreen";

/** `/games/craps`: the single-player craps table (frame lUiCl). `?seed=<n>` replays a session. */
export default function CrapsRoute() {
  const { seed } = useLocalSearchParams<{ seed?: string }>();
  return <CrapsScreen seed={seed} />;
}
