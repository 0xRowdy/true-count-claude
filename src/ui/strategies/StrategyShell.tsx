import type { ReactNode } from "react";
import { AppShell } from "@/ui/ds";
import { useChipBalance, useProgressView } from "@/ui/progress/progressStore";

/** `AppShell` for the Strategies area, with the player's real practice-chip balance. */
export function StrategyShell({ children }: { children: ReactNode }) {
  const chips = useChipBalance(useProgressView(false));
  return (
    <AppShell active="strategies" chips={chips}>
      {children}
    </AppShell>
  );
}
