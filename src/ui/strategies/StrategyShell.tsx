import type { ReactNode } from "react";
import { AppShell } from "@/ui/ds";

/** `AppShell` for the Strategies area (the header shows the stored practice balance itself). */
export function StrategyShell({ children }: { children: ReactNode }) {
  return <AppShell active="strategies">{children}</AppShell>;
}
