/**
 * Export — turning everything on this screen into a file we can act on.
 *
 * Invariant 10 asks for bug reporting that captures state. The report is JSON because a
 * user's job ends at "send the file" and ours begins at "replay it": the seed and Rule Set
 * regenerate the Shoe exactly, and the checks record what the panel was showing at the
 * moment the user decided something was wrong.
 *
 * The report is also rendered here as selectable text. Downloads get blocked, share sheets
 * get cancelled, clipboards are absent over plain HTTP — and an export that silently fails
 * would undo the credibility the rest of the screen just bought. Select-and-copy always
 * works.
 */

import { ScrollView, StyleSheet, Text, View } from "react-native";
import Download from "lucide-react-native/icons/download";
import { colors, radius, ui, Panel } from "@/ui/ds";
import { ActionButton, SecondaryButton, text } from "@/ui/trainer/kit";

export function ExportPanel({
  fileName,
  contents,
  onExport,
  onCopy,
  outcome,
  previewOpen,
  onTogglePreview,
}: {
  fileName: string;
  /** Present only while the preview is open — the report is built on demand, not per frame. */
  contents?: string;
  onExport: () => void;
  onCopy: () => void;
  /** The last export or copy result, shown verbatim so a failure names its own workaround. */
  outcome?: { ok: boolean; message: string };
  previewOpen: boolean;
  onTogglePreview: () => void;
}) {
  const lines = contents === undefined ? undefined : contents.split("\n").length;

  return (
    <Panel title="Export this report">
      <Text style={styles.prose}>
        Everything above, as one file: the seed, the Rule Set, every check on this screen, the
        remaining composition, and the full dealt-card history. Send it with a bug report and we can
        replay your exact Shoe.
      </Text>

      <View style={styles.row}>
        <ActionButton label="Export report" icon={Download} onPress={onExport} tone="good" />
        <SecondaryButton label="Copy report" onPress={onCopy} />
        <SecondaryButton
          label={previewOpen ? "Hide the report" : "Read the report"}
          onPress={onTogglePreview}
        />
      </View>

      {outcome ? (
        <Text style={[styles.outcome, { color: outcome.ok ? colors.correct : colors.primary }]}>
          {outcome.message}
        </Text>
      ) : null}

      <Text style={styles.meta}>
        {fileName}
        {lines === undefined ? "" : ` · ${lines} lines`}
      </Text>

      {previewOpen && contents !== undefined ? (
        <ScrollView style={styles.preview} nestedScrollEnabled>
          <Text style={styles.previewText} selectable>
            {contents}
          </Text>
        </ScrollView>
      ) : null}
    </Panel>
  );
}

const styles = StyleSheet.create({
  prose: text.note,
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  outcome: { ...ui(13, 500) },
  meta: { ...ui(12, 500), color: colors.mutedForeground },
  preview: {
    maxHeight: 260,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    padding: 12,
  },
  previewText: { ...ui(11, 400, { lineHeight: 16 }), color: colors.mutedForeground },
});
