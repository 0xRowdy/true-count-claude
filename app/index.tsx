import { Redirect } from "expo-router";
import { Platform, View } from "react-native";
import { colors } from "@/ui/ds/tokens";
import { LandingScreen } from "@/ui/landing/LandingScreen";
import { useProfile } from "@/ui/profile/profileStore";
import { usePlayFreeHref } from "@/ui/profile/usePlayFreeHref";

/**
 * `/`. On the web, the landing page. An installed app does not open on its own marketing page:
 * on iOS and Android a new player starts onboarding and a returning one lands in the Lobby.
 */
export default function Home() {
  return Platform.OS === "web" ? <LandingScreen /> : <NativeStart />;
}

function NativeStart() {
  const { ready } = useProfile();
  const href = usePlayFreeHref();
  // Storage answers within a frame or two; until then, the app's background rather than a guess.
  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  return <Redirect href={href} />;
}
