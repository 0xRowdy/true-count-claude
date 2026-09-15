/**
 * The signed count keypad — see `countEntry.ts` for why it is a keypad at all.
 *
 * Every key is a 48pt button; the sign key is as large as a digit and sits where a thumb finds
 * it, because a negative count is an everyday answer and not an edge case. On the web a physical
 * keyboard works too: digits, "-", ".", Backspace and Enter.
 */

import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { ActionButton } from "@/ui/primitives";
import { colors, radius, spacing, type } from "@/ui/theme";
import {
  type CountEntry,
  EMPTY_ENTRY,
  type EntryKey,
  entryDisplay,
  entryValue,
  pressKey,
} from "./countEntry";

export function CountEntryPad({
  prompt,
  submitLabel,
  allowHalf = false,
  onSubmit,
}: {
  prompt: string;
  submitLabel: string;
  /** Wong Halves: a half point is a real Running Count. */
  allowHalf?: boolean;
  onSubmit: (value: number) => void;
}) {
  const [entry, setEntry] = useState<CountEntry>(EMPTY_ENTRY);
  const value = entryValue(entry);
  const display = entryDisplay(entry);

  const press = (key: EntryKey) =>
    setEntry((current) => (key.kind === "half" && !allowHalf ? current : pressKey(current, key)));

  const submit = () => {
    const current = entryValue(entry);
    if (current === null) return;
    onSubmit(current);
    setEntry(EMPTY_ENTRY);
  };

  // A physical keyboard, where there is one. Buttons remain the primary input everywhere.
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (/^[0-9]$/.test(event.key)) setEntry((c) => pressKey(c, { kind: "digit", digit: Number(event.key) }));
      else if (event.key === "-" || event.key === "_") setEntry((c) => pressKey(c, { kind: "sign" }));
      else if (event.key === "." && allowHalf) setEntry((c) => pressKey(c, { kind: "half" }));
      else if (event.key === "Backspace") setEntry((c) => pressKey(c, { kind: "backspace" }));
      else if (event.key === "Escape") setEntry(EMPTY_ENTRY);
      else if (event.key === "Enter") submitRef.current();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allowHalf]);

  const digit = (d: number): EntryKey => ({ kind: "digit", digit: d });
  const rows: readonly (readonly { label: string; key: EntryKey; hint: string }[])[] = [
    [1, 2, 3].map((d) => ({ label: String(d), key: digit(d), hint: `Digit ${d}` })),
    [4, 5, 6].map((d) => ({ label: String(d), key: digit(d), hint: `Digit ${d}` })),
    [7, 8, 9].map((d) => ({ label: String(d), key: digit(d), hint: `Digit ${d}` })),
    [
      { label: "+/−", key: { kind: "sign" }, hint: "Switch between positive and negative" },
      { label: "0", key: digit(0), hint: "Digit 0" },
      { label: "⌫", key: { kind: "backspace" }, hint: "Delete the last key" },
    ],
  ];

  return (
    <View style={styles.wrap}>
      <Text style={styles.prompt}>{prompt}</Text>
      <View
        style={styles.display}
        accessible
        accessibilityLabel={value === null ? "Nothing entered" : `Entered ${value}`}
        accessibilityLiveRegion="polite"
      >
        <Text style={[styles.displayText, value === null && styles.placeholder]}>
          {display === "" ? "0" : display}
        </Text>
      </View>
      <View style={styles.pad}>
        {rows.map((row, index) => (
          <View key={index} style={styles.row}>
            {row.map((cell) => (
              <Key key={cell.label} label={cell.label} hint={cell.hint} onPress={() => press(cell.key)} />
            ))}
          </View>
        ))}
        <View style={styles.row}>
          {allowHalf ? (
            <Key label=".5" hint="Add or remove a half point" onPress={() => press({ kind: "half" })} />
          ) : null}
          <Key label="Clear" hint="Clear the entry" onPress={() => press({ kind: "clear" })} />
        </View>
      </View>
      <View style={styles.submit}>
        {value === null ? (
          <Text style={styles.hint}>Type your count — negative and two-digit counts included.</Text>
        ) : (
          <ActionButton
            label={`${submitLabel}: ${display}`}
            tone="good"
            accessibilityHint="Grade this answer now, with the cards still on screen."
            onPress={submit}
          />
        )}
      </View>
    </View>
  );
}

function Key({ label, hint, onPress }: { label: string; hint: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label === "+/−" ? "Plus or minus" : label === "⌫" ? "Backspace" : label}
      accessibilityHint={hint}
      style={({ pressed }) => [styles.key, pressed && styles.pressed]}
    >
      <Text style={styles.keyLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, width: "100%", maxWidth: 360 },
  prompt: { ...type.body, color: colors.text, fontWeight: "600" },
  display: {
    minHeight: 56,
    justifyContent: "center",
    alignItems: "flex-end",
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.background,
  },
  displayText: { ...type.mono, fontSize: 30, fontWeight: "700", color: colors.text },
  placeholder: { color: colors.textMuted },
  pad: { gap: spacing.xs },
  row: { flexDirection: "row", gap: spacing.xs },
  key: {
    flexGrow: 1,
    flexBasis: 0,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  pressed: { opacity: 0.6 },
  keyLabel: { ...type.mono, fontSize: 20, fontWeight: "700", color: colors.text },
  submit: { minHeight: 44, justifyContent: "center", alignItems: "flex-start" },
  hint: { ...type.caption, color: colors.textMuted },
});
