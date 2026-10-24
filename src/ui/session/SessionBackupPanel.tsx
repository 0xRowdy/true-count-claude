import { useState } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { Button, Panel, colors } from "@/ui/ds";
import { inputStyle, text } from "@/ui/trainer/kit";
import { copyText, exportReportFile, type ExportOutcome } from "@/ui/shoe-integrity/share";
import { createSessionBackup, restoreSessionBackup } from "./sessionStore";

export function SessionBackupPanel({ onRestore }: { onRestore: () => void }) {
  const [backup, setBackup] = useState<Awaited<ReturnType<typeof createSessionBackup>> | null>(
    null,
  );
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ExportOutcome | null>(null);
  const web = Platform.OS === "web";

  async function createBackup() {
    setBusy(true);
    setOutcome(null);
    setBackup(null);
    try {
      setBackup(await createSessionBackup());
    } catch (error) {
      setOutcome({
        ok: false,
        message: `Could not create a backup. ${describe(error)} Try again.`,
      });
    } finally {
      setBusy(false);
    }
  }

  async function restoreBackup() {
    if (!raw.trim()) {
      setOutcome({ ok: false, message: "Paste the JSON from a Tableside session backup first." });
      return;
    }
    setBusy(true);
    setOutcome(null);
    try {
      const report = await restoreSessionBackup(raw);
      setOutcome({
        ok: report.unreadable.length === 0,
        message: `Sessions added: ${report.imported.length}. Already on this device: ${report.skippedExisting.length}.${
          report.unreadable.length
            ? ` Could not read ${report.unreadable.length} ${report.unreadable.length === 1 ? "entry" : "entries"}: ${report.unreadable.map((entry) => entry.reason).join("; ")} Check the backup and try again.`
            : " Existing sessions were kept."
        }`,
      });
    } catch (error) {
      setOutcome({
        ok: false,
        message: `Restore stopped. ${describe(error)} Existing sessions were kept. Some new sessions may have been added; retrying will skip them.`,
      });
    } finally {
      setBackup(null);
      setBusy(false);
      onRestore();
    }
  }

  return (
    <Panel title="Back up session history">
      <Text style={text.note}>
        Save your Play and Drill sessions before clearing app data or moving devices. Backups
        include decision logs, but not settings or other game progress.
      </Text>
      <View style={styles.actions}>
        <Button
          label={busy ? "Working…" : "Create backup"}
          disabled={busy}
          onPress={() => void createBackup()}
        />
        <Button
          label={restoreOpen ? "Hide restore" : "Restore backup"}
          variant="secondary"
          disabled={busy}
          onPress={() => setRestoreOpen(!restoreOpen)}
        />
      </View>

      {backup ? (
        <View style={styles.group}>
          <Text style={text.lead}>Backup ready. Sessions included: {backup.count}.</Text>
          {backup.unreadable.length ? (
            <Text accessibilityRole="alert" style={text.warn}>
              This backup is incomplete. Stored records that could not be read:{" "}
              {backup.unreadable.length}. Their data remains on this device. Do not clear app data
              until you have recovered them.
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Button
              label={web ? "Download backup" : "Share backup"}
              variant="secondary"
              onPress={() =>
                void exportReportFile("true-count-sessions.json", backup.contents).then(setOutcome)
              }
            />
            {web ? (
              <Button
                label="Copy backup"
                variant="secondary"
                onPress={() =>
                  void copyText("backup JSON", backup.contents).then((result) =>
                    setOutcome(result.ok ? { ok: true, message: "Backup copied." } : result),
                  )
                }
              />
            ) : null}
          </View>
          <Text style={text.note}>
            You can also select and copy all of the backup JSON below. Keep it somewhere outside
            this app.
          </Text>
          <TextInput
            accessibilityLabel="Backup JSON"
            value={backup.contents}
            editable={false}
            multiline
            selectTextOnFocus
            style={styles.json}
          />
        </View>
      ) : null}

      {restoreOpen ? (
        <View style={styles.group}>
          <Text style={text.lead}>Restore from backup JSON</Text>
          <Text style={text.note}>
            Open your backup file, copy its contents, and paste them here. Restore adds missing
            sessions and skips any already on this device. Your current Play session stays open.
          </Text>
          <TextInput
            accessibilityLabel="Restore backup JSON"
            placeholder="Paste your session backup JSON"
            placeholderTextColor={colors.mutedForeground}
            value={raw}
            onChangeText={(value) => {
              setRaw(value);
              setOutcome(null);
            }}
            editable={!busy}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            style={styles.json}
          />
          <Button label="Import sessions" disabled={busy} onPress={() => void restoreBackup()} />
        </View>
      ) : null}

      {outcome ? (
        <Text
          accessibilityRole={outcome.ok ? undefined : "alert"}
          accessibilityLiveRegion="polite"
          style={outcome.ok ? text.note : text.warn}
        >
          {outcome.message}
        </Text>
      ) : null}
    </Panel>
  );
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  group: { gap: 12 },
  json: { ...inputStyle, fontSize: 16, height: 180, paddingVertical: 12, textAlignVertical: "top" },
});
