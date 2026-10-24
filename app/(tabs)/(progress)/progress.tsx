import { useLocalSearchParams } from "expo-router";
import { ProgressScreen } from "@/ui/progress/ProgressScreen";

/** Progress & Mastery (frame LvXnf). `?demo=1` shows the labelled sample history instead. */
export default function ProgressRoute() {
  const { demo } = useLocalSearchParams<{ demo?: string }>();
  return <ProgressScreen demo={demo === "1"} />;
}
