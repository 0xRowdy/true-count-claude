import { useLocalSearchParams } from "expo-router";
import { VideoPokerScreen } from "@/ui/games/video-poker/VideoPokerScreen";

/** Video Poker (frame xfJEh). `?seed=<n>` replays a session's deals. */
export default function VideoPokerRoute() {
  const { seed } = useLocalSearchParams<{ seed?: string }>();
  return <VideoPokerScreen seed={seed} />;
}
