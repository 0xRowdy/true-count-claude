import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { localIsoDate } from "@/state/profile";
import { AppShell, Badge, Button, colors, display, radius, ui } from "@/ui/ds";
import { Check } from "@/ui/ds/icons";
import { Apple, ChevronDown, ChevronUp, CreditCard, ShieldCheck } from "@/ui/marketing/icons";
import { Notice } from "@/ui/marketing/Notice";
import { marketing } from "@/ui/marketing/surfaces";
import { Tag } from "@/ui/marketing/Tag";
import { order, planView, yearlySaving, type Billing, type PlanId } from "./pricing";

const PLANS: ReadonlyArray<{ id: PlanId; name: string; features: readonly string[] }> = [
  {
    id: "free",
    name: "Free",
    features: [
      "All 5 games with every casino rule set",
      "Coach on house basic strategy for each game",
      "Play and follow community strategies",
      "Live tables, chat and leaderboards",
    ],
  },
  {
    id: "plus",
    name: "Tableside Plus",
    features: [
      "Advanced trainers: counting, craps systems, every video poker pay table",
      "Full progress history and decision breakdowns",
      "Private tables for you and friends",
      "Unlimited strategy drafts and test runs",
    ],
  },
  {
    id: "lifetime",
    name: "Lifetime",
    features: ["Pay once and keep it on every device", "Includes future games as they launch"],
  },
];

const FAQ: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "Can I win real money here?",
    a: "No. Tableside has no real-money wagering, and practice results don't carry over to a casino. The house edge is real; we just help you play each hand correctly.",
  },
  {
    q: "Do I need Plus to get ready for a trip?",
    a: "No. Every game, every casino rule set and the coach on basic strategy are free. Free is enough to walk up to the table knowing the move; Plus adds deeper trainers and your full history.",
  },
  {
    q: "What happens to my strategies if I cancel?",
    a: "They stay yours. Strategies you wrote or forked stay on your device and keep working with the coach on house basic strategy.",
  },
];

const WIDE = 1100;

/**
 * Pricing & purchase (design frame VcZwn), inside the app shell with no active nav item.
 * Monthly/Yearly changes the prices, choosing a plan updates "Your order" (its trial dates
 * counted from today, after mount), and the FAQ opens and closes.
 *
 * No payment is ever processed: "Pay" and the card button show an in-place notice that
 * purchases are not available in this build.
 */
export function PricingScreen() {
  const router = useRouter();
  const [billing, setBilling] = useState<Billing>("yearly");
  const [plan, setPlan] = useState<PlanId>("plus");
  const [open, setOpen] = useState<number | null>(0);
  const [notice, setNotice] = useState(false);
  const [width, setWidth] = useState<number | null>(null);
  // The timeline's dates are a clock read: after mount only (hydration).
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(localIsoDate(new Date())), []);

  const wide = width === null || width >= WIDE;
  const o = order(plan, billing, today);
  const choose = (id: PlanId) => {
    setPlan(id);
    setNotice(false);
  };

  return (
    <AppShell>
      <View
        style={[styles.body, wide ? styles.bodyWide : styles.bodyStacked]}
        onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      >
        <View style={styles.plans}>
          <View style={styles.head}>
            <Text
              accessibilityRole="header"
              aria-level={1}
              style={[display(wide ? 40 : 32, 500, { lineHeight: wide ? 48 : 38 }), styles.fg]}
            >
              Every game is free. Plus goes deeper.
            </Text>
            <Text style={[ui(17, 400, { lineHeight: 25 }), styles.muted]}>
              No chips to buy, no ads and no real-money wagering, on any plan. Your progress follows
              you across web, iPhone and Android.
            </Text>
          </View>

          <View style={styles.toggle} accessibilityRole="radiogroup" accessibilityLabel="Billing">
            {(["monthly", "yearly"] as const).map((b) => {
              const on = billing === b;
              return (
                <Pressable
                  key={b}
                  accessibilityRole="radio"
                  accessibilityLabel={b === "monthly" ? "Monthly" : "Yearly"}
                  accessibilityHint={b === "yearly" ? `Save ${yearlySaving()}%` : undefined}
                  aria-checked={on}
                  onPress={() => setBilling(b)}
                  style={[styles.toggleItem, on && styles.toggleOn]}
                >
                  <Text style={[ui(14, on ? 600 : 500), on ? styles.fg : styles.muted]}>
                    {b === "monthly" ? "Monthly" : "Yearly"}
                  </Text>
                  {b === "yearly" ? (
                    <View style={styles.save}>
                      <Text style={[ui(11, 700), { color: colors.primaryForeground }]}>
                        Save {yearlySaving()}%
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.planList} accessibilityRole="radiogroup" accessibilityLabel="Plan">
            {PLANS.map((p) => {
              const on = plan === p.id;
              const view = planView(p.id, billing);
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole="radio"
                  accessibilityLabel={p.name}
                  accessibilityHint={`${view.price}. ${view.sub}`}
                  aria-checked={on}
                  onPress={() => choose(p.id)}
                  style={[styles.plan, on && styles.planOn]}
                >
                  <View style={styles.planTop}>
                    <View style={[styles.radio, on && styles.radioOn]} />
                    <View style={styles.planText}>
                      <View style={styles.nameRow}>
                        <Text style={[ui(19, 600), styles.fg]}>{p.name}</Text>
                        {p.id === "free" ? (
                          <Badge icon={Check} tone="correct" label="Current plan" />
                        ) : p.id === "plus" ? (
                          <Tag label="Best for trip prep" />
                        ) : null}
                      </View>
                      <Text style={[ui(13), styles.muted]}>{view.sub}</Text>
                    </View>
                    {wide ? <Text style={[display(28, 500), styles.fg]}>{view.price}</Text> : null}
                  </View>
                  {wide ? null : (
                    <Text style={[display(24, 500), styles.fg, { paddingLeft: 38 }]}>
                      {view.price}
                    </Text>
                  )}
                  <View style={styles.features}>
                    {p.features.map((f) => (
                      <View key={f} style={styles.feature}>
                        <Check
                          size={16}
                          color={p.id === "plus" ? colors.primary : colors.mutedForeground}
                          strokeWidth={2}
                        />
                        <Text style={[ui(14, 400, { lineHeight: 17 }), styles.fg, styles.flex]}>
                          {f}
                        </Text>
                      </View>
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.faq}>
            <Text accessibilityRole="header" aria-level={2} style={[ui(20, 600), styles.fg]}>
              Questions
            </Text>
            {FAQ.map((item, i) => {
              const expanded = open === i;
              const Chevron = expanded ? ChevronUp : ChevronDown;
              return (
                <View key={item.q} style={styles.q}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={item.q}
                    aria-expanded={expanded}
                    onPress={() => setOpen(expanded ? null : i)}
                    // The whole padded row is the tap target (≥44pt); the answer sits below it.
                    style={[styles.qHead, expanded && styles.qHeadOpen]}
                  >
                    <Text style={[ui(16, 600), styles.fg, styles.flex]}>{item.q}</Text>
                    <Chevron size={18} color={colors.mutedForeground} strokeWidth={2} />
                  </Pressable>
                  {expanded ? (
                    <Text
                      style={[ui(14, 400, { lineHeight: 14 * 1.55 }), styles.muted, styles.answer]}
                    >
                      {item.a}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>

        <View
          style={[styles.checkout, wide && { width: 420 }]}
          role="region"
          accessibilityLabel="Your order"
        >
          <Text style={[ui(11, 700, { letterSpacing: 1.5 }), styles.muted]}>YOUR ORDER</Text>
          <View style={styles.item}>
            <View style={styles.itemText}>
              <Text style={[ui(17, 600), styles.fg]}>{o.name}</Text>
              <Text style={[ui(13), styles.muted]}>{o.detail}</Text>
            </View>
            <Text style={[ui(17, 600), styles.fg]}>{o.total}</Text>
          </View>
          <View style={styles.timeline}>
            {o.timeline.map((t, i) => {
              const last = i === o.timeline.length - 1;
              return (
                <View key={t.text} style={styles.tlRow}>
                  <View style={styles.rail}>
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: i === 0 ? colors.primary : colors.mutedForeground },
                      ]}
                    />
                    {last ? null : <View style={styles.line} />}
                  </View>
                  <View style={[styles.tlText, !last && { paddingBottom: 10 }]}>
                    <Text style={[ui(13, 600), styles.fg]}>{t.when}</Text>
                    <Text style={[ui(13, 400, { lineHeight: 18 }), styles.muted]}>{t.text}</Text>
                  </View>
                </View>
              );
            })}
          </View>
          <View style={styles.due}>
            <Text style={[ui(15, 600), styles.fg]}>Due today</Text>
            <Text style={[display(24, 500), styles.fg]}>{o.dueToday}</Text>
          </View>
          {o.purchasable ? (
            <View style={styles.pay}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Pay"
                onPress={() => setNotice(true)}
                style={({ pressed }) => [styles.wallet, pressed && { opacity: 0.85 }]}
              >
                <Apple size={18} color={marketing.walletInk} strokeWidth={2} />
                <Text style={[ui(17, 600), { color: marketing.walletInk }]}>Pay</Text>
              </Pressable>
              <Button
                size="lg"
                icon={CreditCard}
                label={o.trial ? "Start free trial with card" : "Pay with card"}
                onPress={() => setNotice(true)}
                fullWidth
                style={{ height: 52 }}
              />
            </View>
          ) : (
            <Button
              size="lg"
              label="Keep playing free"
              onPress={() => router.push("/lobby")}
              fullWidth
              style={{ height: 52 }}
            />
          )}
          {notice ? (
            <Notice
              title="Purchases aren't available in this build"
              body="Nothing was charged and no card details were asked for. Every game and the coach are free to use right now."
              onClose={() => setNotice(false)}
            />
          ) : null}
          <Text style={[ui(12, 400, { lineHeight: 18 }), styles.muted]}>
            Cancel any time in Settings → Plan, in two taps. Bought on iPhone or Android? Manage it
            in your app store. Purchases restore on every device.
          </Text>
          <View style={styles.responsible}>
            <ShieldCheck size={18} color={colors.correct} strokeWidth={2} />
            <Text style={[ui(12, 400, { lineHeight: 12 * 1.45 }), styles.fg, styles.flex]}>
              You&apos;re paying for training tools, not chips. Nothing here can be wagered, cashed
              out or used to win real money.
            </Text>
          </View>
        </View>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fg: { color: colors.foreground },
  muted: { color: colors.mutedForeground },
  // AppShell pads 32; the design's body sits at 48 / 120 / 64.
  body: { gap: 48 },
  bodyWide: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: 16,
    paddingHorizontal: 88,
    paddingBottom: 16,
  },
  bodyStacked: { flexDirection: "column", gap: 32 },
  plans: { flex: 1, gap: 24, alignSelf: "stretch" },
  head: { gap: 10 },
  toggle: {
    flexDirection: "row",
    alignSelf: "flex-start",
    gap: 4,
    padding: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  toggleItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    minHeight: 44,
  },
  toggleOn: { backgroundColor: colors.muted },
  save: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  planList: { gap: 24 },
  plan: {
    gap: 14,
    padding: 24,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  // 2pt border when chosen; padding drops by 1 so the content does not shift.
  planOn: {
    padding: 23,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: marketing.primaryWashSoft,
  },
  planTop: { flexDirection: "row", alignItems: "center", gap: 16 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.mutedForeground,
  },
  radioOn: { borderWidth: 0, backgroundColor: colors.primary },
  planText: { flex: 1, gap: 2 },
  nameRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  features: { gap: 8, paddingLeft: 38 },
  feature: { flexDirection: "row", alignItems: "center", gap: 10 },
  faq: { paddingTop: 16 },
  q: { borderBottomWidth: 1, borderBottomColor: colors.border },
  qHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 44,
    paddingVertical: 18,
  },
  qHeadOpen: { paddingBottom: 8 },
  answer: { paddingBottom: 18 },

  checkout: {
    gap: 20,
    padding: 28,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  item: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  itemText: { flex: 1, gap: 3 },
  timeline: { padding: 16, borderRadius: 12, backgroundColor: colors.muted },
  tlRow: { flexDirection: "row", gap: 12 },
  rail: { width: 14, alignItems: "center", paddingTop: 2 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  line: { width: 2, flex: 1, minHeight: 30, backgroundColor: colors.border },
  tlText: { flex: 1, gap: 2 },
  due: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pay: { gap: 10 },
  wallet: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.md,
    backgroundColor: marketing.wallet,
  },
  responsible: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
