import { useProfile } from "@/ui/profile/profileStore";

/**
 * Where "Play free" goes: onboarding for a new player, the lobby for one who has finished (or
 * skipped) it. Until storage answers it is onboarding, which is also what the prerendered page
 * says, so the link never differs between the static HTML and the first client render.
 */
export function usePlayFreeHref(): string {
  const { profile, ready } = useProfile();
  return ready && profile.onboarded ? "/lobby" : "/onboarding";
}
