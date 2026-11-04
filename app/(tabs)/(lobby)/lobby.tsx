import { useLocalSearchParams } from "expo-router";
import { LobbyScreen } from "@/ui/lobby/LobbyScreen";

/** The Lobby (frame ZDK1x). `?demo=1` shows the labelled sample history instead. */
export default function LobbyRoute() {
  const { demo } = useLocalSearchParams<{ demo?: string }>();
  return <LobbyScreen demo={demo === "1"} />;
}
