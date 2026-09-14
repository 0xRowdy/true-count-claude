/**
 * The bug report sheet: what will be shared, shown in full, and three ways to hand it over.
 *
 * Local-first (ADR-0003). Copy and share/download go through `share.ts`, need no account and
 * no network, and work in airplane mode. The prefilled GitHub issue is offered as well, and
 * labelled for what it is — the one path that needs both.
 *
 * Privacy is shown, not asserted. The preview is the exact text every button hands over, the
 * optional note included, so a user who wants to know what leaves the device reads it here
 * rather than trusting a sentence about it.
 *
 * And the public known-issues list is linked from inside the app. The incumbent publishes a
 * good build log and never links it; a user who has hit a known bug should find that out in
 * one tap rather than by filing it again.
 */

import { useMemo, useState } from "react";
import { Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ActionButton, Panel, SecondaryButton } from "@/ui/primitives";
import { type ExportOutcome, copyText, exportReportFile } from "@/ui/shoe-integrity/share";
import { colors, radius, spacing, type } from "@/ui/theme";
import {
  type BugReport,
  KNOWN_ISSUES_URL,
  bugReportFileName,
  formatBugReport,
  issueLink,
} from "./bugReport";

export function BugReportSheet({ report, onClose }: { report: BugReport; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState<ExportOutcome | null>(null);

  const text = useMemo(() => formatBugReport(report, note), [report, note]);
  const fileName = useMemo(() => bugReportFileName(report), [report]);
  const web = Platform.OS === "web";

  const onCopy = () => {
    void copyText("Report", text).then((result) =>
      // `copyText` echoes the copied value, which here is the whole report. Say what happened.
      setOutcome(result.ok ? { ok: true, message: "Report copied. Paste it anywhere." } : result),
    );
  };

  const onShare = () => {
    void exportReportFile(fileName, text).then(setOutcome);
  };

  const onOpenIssue = () => {
    const link = issueLink(report, note);
    const openLink = () =>
      Linking.openURL(link.url).catch(() =>
        setOutcome({
          ok: false,
          message: "Could not open GitHub from here. Copy the report and paste it into a new issue.",
        }),
      );
    if (link.prefilled) {
      void openLink();
      return;
    }
    // Too long for a link: put it on the clipboard first, so the paste is one step away.
    void copyText("Report", text).then((result) => {
      setOutcome({
        ok: result.ok,
        message: result.ok
          ? "The report is too long for a link, so it has been copied — paste it into the issue."
          : "The report is too long for a link. Copy it from the text below and paste it into the issue.",
      });
      void openLink();
    });
  };

  const onKnownIssues = () => {
    void Linking.openURL(KNOWN_ISSUES_URL).catch(() =>
      setOutcome({ ok: false, message: `Could not open ${KNOWN_ISSUES_URL} from here.` }),
    );
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Panel style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.title}>Report a bug</Text>
              <SecondaryButton label="Close" onPress={onClose} />
            </View>

            <Text style={styles.prose}>
              This captures the exact game you were looking at — the Shoe&apos;s seed, the cards
              dealt so far, the round&apos;s actions, the Rule Set and the Counting System — so
              we can replay it card for card instead of guessing.
            </Text>

            <SecondaryButton label="See the known issues first →" onPress={onKnownIssues} />

            <Text style={styles.label}>What went wrong? (optional)</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="e.g. Split was not offered on a pair of 8s"
              placeholderTextColor={colors.textMuted}
              multiline
              style={styles.input}
              accessibilityLabel="What went wrong"
            />

            <View style={styles.row}>
              <ActionButton label="Copy report" tone="good" onPress={onCopy} />
              <SecondaryButton label={web ? "Download report" : "Share report"} onPress={onShare} />
              <SecondaryButton label="Open a GitHub issue" onPress={onOpenIssue} />
            </View>

            {outcome ? (
              <Text style={[styles.outcome, { color: outcome.ok ? colors.accent : colors.warning }]}>
                {outcome.message}
              </Text>
            ) : null}

            <Text style={styles.note}>
              Copy and {web ? "download" : "share"} work offline and need no account. The GitHub
              issue needs a network and a GitHub account.
            </Text>

            <Text style={styles.label}>Exactly what will be shared</Text>
            <Text style={styles.note}>
              Game state only: no name, no account, no device identifier, no location. Beyond
              the game, just the app version and platform, and your note if you write one. The
              Session id is made from the moment that Session started. Nothing leaves this
              device until you copy or share it.
            </Text>
            <ScrollView style={styles.preview} nestedScrollEnabled>
              <Text style={styles.previewText} selectable>
                {text}
              </Text>
            </ScrollView>
            <Text style={styles.meta}>
              {fileName} · {text.split("\n").length} lines
            </Text>
          </Panel>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.7)" },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: spacing.md,
  },
  sheet: { width: "100%", maxWidth: 720, alignSelf: "center" },
  header: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  title: { ...type.heading, color: colors.text },
  prose: { ...type.body, color: colors.textMuted },
  label: { ...type.caption, color: colors.text, fontWeight: "600", marginTop: spacing.xs },
  note: { ...type.caption, color: colors.textMuted, lineHeight: 18 },
  input: {
    ...type.body,
    color: colors.text,
    minHeight: 64,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    padding: spacing.sm,
    textAlignVertical: "top",
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  outcome: { ...type.caption },
  preview: {
    maxHeight: 320,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    padding: spacing.sm,
  },
  previewText: { ...type.mono, fontSize: 11, color: colors.textMuted, lineHeight: 16 },
  meta: { ...type.mono, fontSize: 11, color: colors.textMuted },
});
