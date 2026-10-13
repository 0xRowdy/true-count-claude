import { Pressable, StyleSheet, Text, View } from "react-native";
import { type LiveSeat, type LiveTableState, seatStatus, shooterOf } from "@/games/craps";
import { formatMoney } from "@/ui/ds/format";
import { colors, ui } from "@/ui/ds/tokens";
import { Dices, Plus } from "./icons";
import { seatColor } from "./session";
import { live } from "./theme";

/** A round avatar with the seat's initials on its colour (the design's seat avatars). */
export function Initials({ text, color, size }: { text: string; color: string; size: number }) {
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
      ]}
    >
      <Text style={[ui(size >= 36 ? 13 : size >= 30 ? 11 : 10, 700), { color: live.white }]}>
        {text}
      </Text>
    </View>
  );
}

/** One seat at the rail: avatar, handle, style (or "Shooter · rolling"), bankroll. */
export function SeatCard({ state, seat }: { state: LiveTableState; seat: LiveSeat }) {
  const shooter = shooterOf(state).id === seat.id;
  const status = seatStatus(state, seat);
  return (
    <View
      accessible
      accessibilityLabel={`${seat.handle}, ${status}, ${formatMoney(seat.bankroll)}`}
      style={[styles.seat, shooter && styles.shooter, seat.isYou && styles.you]}
    >
      <Initials text={seat.initials} color={seatColor(seat.id)} size={36} />
      <View style={styles.text}>
        <View style={styles.nameRow}>
          <Text
            style={[ui(13, 600), styles.shrink, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {seat.handle}
          </Text>
          {shooter ? <Dices size={14} color={colors.correct} strokeWidth={2} /> : null}
        </View>
        <Text
          style={[ui(11), { color: shooter ? colors.correct : colors.mutedForeground }]}
          numberOfLines={1}
        >
          {status}
        </Text>
      </View>
      <Text style={[ui(12, 600), { color: seat.isYou ? colors.primary : colors.mutedForeground }]}>
        {formatMoney(seat.bankroll)}
      </Text>
    </View>
  );
}

/** The open seat: "Invite a friend" copies the table's link. */
export function OpenSeat({ status, onInvite }: { status: string | null; onInvite: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open seat: invite a friend"
      onPress={onInvite}
      style={({ pressed }) => [styles.seat, styles.open, pressed && styles.pressed]}
    >
      <View style={[styles.avatar, styles.openAvatar]}>
        <Plus size={16} color={colors.mutedForeground} strokeWidth={2} />
      </View>
      <View style={styles.text}>
        <Text style={[ui(13, 600), { color: colors.mutedForeground }]}>Open seat</Text>
        <Text style={[ui(11), { color: colors.mutedForeground }]} numberOfLines={2}>
          {status ?? "Invite a friend"}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: "center", justifyContent: "center" },
  seat: {
    flex: 1,
    minWidth: 200,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  shooter: { borderWidth: 2, borderColor: colors.correct },
  you: { borderWidth: 2, borderColor: colors.primary, backgroundColor: live.youWash },
  open: { backgroundColor: "transparent" },
  openAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.muted },
  text: { flex: 1, gap: 1, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  shrink: { flexShrink: 1 },
  pressed: { opacity: 0.85 },
});
