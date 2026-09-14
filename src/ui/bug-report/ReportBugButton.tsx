/**
 * "Report a bug", one tap from any screen that renders it (invariant 10).
 *
 * Built to be dropped in. A screen passes its name and, if it deals cards, the live Shoe and
 * round it already holds — nothing is translated, nothing is serialised by the caller. Every
 * other part of the report is gathered here from places the button can reach on its own: the
 * open Session from the Session store, the configured Rule Set from the rules store, the
 * build and platform from Expo.
 *
 * The report is captured at the tap, not rebuilt as the screen moves on underneath the sheet,
 * so the preview the user reads is exactly the thing that gets copied or shared.
 *
 *     <ReportBugButton screen="Play table" table={{ shoe, round, bankroll, shoeIndex }}
 *                      rules={rules} countingSystem={system.name} />
 *     <ReportBugButton screen="Statistics" />
 */

import { useEffect, useState } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import type { RuleSet } from "@/engine/rules";
import { SecondaryButton } from "@/ui/primitives";
import { useConfiguredRules } from "@/ui/rules/rulesStore";
import { loadActiveSession, useSessionState } from "@/ui/session/sessionStore";
import {
  type AppEnvironment,
  type BugReport,
  type BugReportDetails,
  type BugReportTable,
  buildBugReport,
} from "./bugReport";
import { BugReportSheet } from "./BugReportSheet";

export interface ReportBugButtonProps {
  /** Where the user is, in their words: "Play table", "Basic Strategy drill". Required. */
  readonly screen: string;
  /**
   * What the screen is dealing: its between-rounds `shoe`, the live `round` (if any), the
   * `bankroll` before the deal and the `shoeIndex`. Omit on a screen with no Shoe of its own;
   * the report then reads the open Session's current Shoe off its log.
   */
  readonly table?: BugReportTable | null;
  /**
   * The Rule Set the Shoe was built at. Defaults to the live round's, then — with no table —
   * the open Session's, then the configured one.
   */
  readonly rules?: RuleSet;
  /** Counting System name in force. Defaults to the open Session's. */
  readonly countingSystem?: string;
  /** Screen-specific facts worth replaying: a drill id, a run seed, a question index. */
  readonly details?: BugReportDetails;
  /**
   * Whether the open Session belongs in the report. Default `true`. A screen that runs
   * something unrelated to the Session in the store can pass `false` to keep it out.
   */
  readonly includeSession?: boolean;
  readonly label?: string;
}

export function ReportBugButton({
  screen,
  table = null,
  rules,
  countingSystem,
  details,
  includeSession = true,
  label = "Report a bug",
}: ReportBugButtonProps) {
  const configured = useConfiguredRules();
  const store = useSessionState();
  const [report, setReport] = useState<BugReport | null>(null);

  // Idempotent. A screen reached directly — a drill opened from a link — still reports the
  // Session that is running on this device.
  useEffect(() => {
    loadActiveSession();
  }, []);

  const open = () => {
    const session = includeSession ? store.session : null;
    setReport(
      buildBugReport({
        screen,
        app: appEnvironment(),
        rules:
          rules ??
          table?.round?.rules ??
          (table ? configured.rules : (session?.rules ?? configured.rules)),
        countingSystem: countingSystem ?? null,
        table,
        session,
        ...(details ? { details } : {}),
      }),
    );
  };

  return (
    <>
      <SecondaryButton label={label} onPress={open} />
      {report ? <BugReportSheet report={report} onClose={() => setReport(null)} /> : null}
    </>
  );
}

/**
 * The build and the platform, and nothing that identifies the person or the device: no user
 * agent, no device name, no model, no locale.
 */
function appEnvironment(): AppEnvironment {
  return {
    version: Constants.expoConfig?.version ?? "unknown",
    platform: Platform.OS,
    osVersion: Platform.OS === "web" ? null : String(Platform.Version),
  };
}
