import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { Platform, StyleSheet, Text, View } from "react-native";
import { localIsoDate } from "@/state/profile";
import { Button, colors, icons, ui } from "@/ui/ds";
import { shortDate } from "./startingPoint";

/** "2026-11-14" → a local Date at midnight (the picker works in local days, as the profile does). */
function toDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

/**
 * The trip date on iOS and Android: the system date picker, which cannot produce a malformed
 * or past date. iOS shows its compact date control (a calendar popover); Android opens the
 * Material date dialog from a button. The web keeps a typed field (`TripDatePicker.tsx`).
 */
export function TripDatePicker({
  value,
  today,
  onChange,
}: {
  /** The chosen date, `YYYY-MM-DD`, or null for none yet. */
  value: string | null;
  /** Today, `YYYY-MM-DD`: the earliest date the picker offers. */
  today: string;
  onChange: (iso: string) => void;
}) {
  const shown = toDate(value ?? today);
  const minimumDate = toDate(today);
  const pick = (_event: unknown, picked: Date) => onChange(localIsoDate(picked));

  if (Platform.OS === "ios") {
    return (
      <View style={styles.row}>
        <Text style={[ui(15), styles.label]}>{value ? "Trip date" : "Or pick a date"}</Text>
        <DateTimePicker
          value={shown}
          mode="date"
          display="compact"
          minimumDate={minimumDate}
          onValueChange={pick}
          themeVariant="dark"
          accentColor={colors.primary}
          accessibilityLabel="Trip date"
        />
      </View>
    );
  }

  return (
    <Button
      label={value ? shortDate(value) : "Or pick a date"}
      variant="secondary"
      icon={icons.Calendar}
      accessibilityLabel={value ? `Trip date, ${shortDate(value)}. Change it` : "Pick a trip date"}
      onPress={() =>
        DateTimePickerAndroid.open({ value: shown, mode: "date", minimumDate, onValueChange: pick })
      }
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  label: { color: colors.mutedForeground, flexShrink: 1 },
});
