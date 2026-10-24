import { TabStack } from "@/ui/navigation/TabStack";

/** The Lobby tab's stack: `lobby` at its root, so a deep link still has a way back. */
export const unstable_settings = { anchor: "lobby" };

export default function LobbyLayout() {
  return <TabStack root="lobby" />;
}
