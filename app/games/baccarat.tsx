import { useLocalSearchParams } from "expo-router";
import { BaccaratScreen } from "@/ui/games/baccarat/BaccaratScreen";

/** The baccarat table (frame gu3Mf). `?seed=<n>` deals a reproducible session (e2e, bug reports). */
export default function BaccaratRoute() {
  const { seed } = useLocalSearchParams<{ seed?: string }>();
  return <BaccaratScreen seed={seed} />;
}
