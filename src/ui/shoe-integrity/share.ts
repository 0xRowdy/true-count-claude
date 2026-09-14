/**
 * Getting the integrity report out of the app and into a bug report.
 *
 * Invariant 10 wants bug reports that capture state, and ADR-0004 makes a seed a complete
 * repro — but only if the user can actually hand it over. Three platforms, no new
 * dependencies, and no network (ADR-0003), so:
 *
 *   web    — a real file download, and the system clipboard
 *   native — the share sheet, which reaches mail, messages and notes
 *
 * Every one of these can fail for reasons outside our control — a browser that blocks
 * programmatic downloads, a clipboard API absent over plain HTTP, a cancelled share sheet.
 * So the panel also renders the report as selectable text. That fallback cannot fail, and
 * a trust feature whose export silently does nothing would undo everything else on the
 * screen.
 */

import { Platform, Share } from "react-native";

export interface ExportOutcome {
  readonly ok: boolean;
  /** Shown to the user verbatim. Says what happened, or what to do instead. */
  readonly message: string;
}

const MANUAL_FALLBACK = "Copy it from the report text below instead.";

/** Offers `contents` to the user as a file they can attach to a bug report. */
export async function exportReportFile(
  fileName: string,
  contents: string,
): Promise<ExportOutcome> {
  if (Platform.OS === "web") {
    if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
      return { ok: false, message: `This browser blocked the download. ${MANUAL_FALLBACK}` };
    }
    try {
      const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      return { ok: true, message: `Saved ${fileName}` };
    } catch {
      return { ok: false, message: `This browser blocked the download. ${MANUAL_FALLBACK}` };
    }
  }

  try {
    const result = await Share.share({ title: fileName, message: contents });
    return result.action === Share.dismissedAction
      ? { ok: false, message: `Share cancelled. ${MANUAL_FALLBACK}` }
      : { ok: true, message: "Report shared." };
  } catch {
    return { ok: false, message: `Could not open the share sheet. ${MANUAL_FALLBACK}` };
  }
}

/** Puts a short value — a seed, most often — somewhere the user can paste it from. */
export async function copyText(label: string, text: string): Promise<ExportOutcome> {
  if (Platform.OS === "web") {
    const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (!clipboard) {
      return { ok: false, message: `Clipboard unavailable here. Select the ${label} to copy it.` };
    }
    try {
      await clipboard.writeText(text);
      return { ok: true, message: `${label} copied: ${text}` };
    } catch {
      return { ok: false, message: `Clipboard blocked. Select the ${label} to copy it.` };
    }
  }

  try {
    const result = await Share.share({ message: text });
    return result.action === Share.dismissedAction
      ? { ok: false, message: `Share cancelled. Select the ${label} to copy it.` }
      : { ok: true, message: `${label} shared.` };
  } catch {
    return { ok: false, message: `Could not share the ${label}. Select it to copy it.` };
  }
}
