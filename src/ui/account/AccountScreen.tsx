import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Platform, StyleSheet, Text, View } from "react-native";
import { AppShell, Avatar, Button, colors, display, Notice, Panel, ui } from "@/ui/ds";
import { CreditCard, Crown, LogOut, RotateCcw } from "@/ui/ds/icons";
import { type Account, deleteAccount, signOut, useAccount } from "./account";
import { billingFailure, billingPortalUrl } from "./billing";
import { BILLED_BY, doubleBillingWarning, PLAN_NAMES, planStatus } from "./planCopy";
import { SignInOptions } from "./SignInOptions";
import { usePurchase } from "./usePurchase";

/** Where each store lets a subscriber change or cancel. */
const STORE_MANAGE = {
  app_store: {
    label: "Manage in the App Store",
    url: "https://apps.apple.com/account/subscriptions",
  },
  play_store: {
    label: "Manage in Google Play",
    url: "https://play.google.com/store/account/subscriptions?package=com.truecount.app",
  },
} as const;

/**
 * Account (ADR-0007): who is signed in, their Plan and where it is billed, sign out, and
 * account deletion in the app (App Store guideline 5.1.1(v)).
 */
export function AccountScreen() {
  const account = useAccount();
  const params = useLocalSearchParams<{ checkout?: string }>();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const checkedOut = mounted && params.checkout === "success";

  return (
    <AppShell>
      <View style={styles.column}>
        <Text accessibilityRole="header" aria-level={1} style={[display(32, 500), styles.fg]}>
          Your account
        </Text>
        {account.status === "unavailable" ? (
          <Notice
            title="Accounts aren't available in this build"
            body="Everything you play, your profile and your stats are saved on this device, and nothing is sent anywhere."
          />
        ) : account.status === "loading" ? (
          <Text style={[ui(15), styles.muted]}>Checking your account…</Text>
        ) : account.status === "signed-out" ? (
          <SignedOut />
        ) : (
          <SignedIn account={account.account} checkedOut={checkedOut} />
        )}
      </View>
    </AppShell>
  );
}

function SignedOut() {
  return (
    <>
      <Text style={[ui(16, 400, { lineHeight: 24 }), styles.muted]}>
        Sign in to keep Plus on every device. Your practice is saved on this device either way.
      </Text>
      <SignInOptions returnTo="/account" />
    </>
  );
}

function SignedIn({ account, checkedOut }: { account: Account; checkedOut: boolean }) {
  return (
    <>
      <View style={styles.who}>
        <Avatar name={account.name || account.email} size={48} />
        <View style={styles.flex}>
          <Text style={[ui(18, 600), styles.fg]}>{account.name || "Signed in"}</Text>
          <Text style={[ui(14), styles.muted]}>{account.email}</Text>
        </View>
      </View>
      <PlanPanel account={account} checkedOut={checkedOut} />
      <SessionPanel />
      <DeletePanel account={account} />
    </>
  );
}

function PlanPanel({ account, checkedOut }: { account: Account; checkedOut: boolean }) {
  const router = useRouter();
  const { plan } = account;
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const purchase = usePurchase();
  const warning = doubleBillingWarning(plan);

  const manageOnWeb = async () => {
    setBusy(true);
    setMessage(null);
    try {
      window.location.assign(await billingPortalUrl());
    } catch (e) {
      setMessage(billingFailure(e));
      setBusy(false);
    }
  };

  return (
    <Panel title="Plan" style={styles.panel}>
      {checkedOut ? (
        <Notice
          title={
            plan.plan === "free" ? "Confirming your purchase…" : `${PLAN_NAMES[plan.plan]} is on`
          }
          body={
            plan.plan === "free"
              ? "Stripe is telling us about it; this takes a few seconds."
              : "It's on every device you sign in to, starting now."
          }
        />
      ) : null}
      <View style={styles.planHead}>
        {plan.plan === "free" ? null : <Crown size={22} color={colors.primary} strokeWidth={2} />}
        <Text style={[display(24, 500), styles.fg]}>{PLAN_NAMES[plan.plan]}</Text>
      </View>
      <Text style={[ui(14, 400, { lineHeight: 20 }), styles.muted]}>{planStatus(plan)}</Text>
      {plan.source ? <Text style={[ui(13), styles.muted]}>{BILLED_BY[plan.source]}</Text> : null}
      {warning ? <Notice title="You're paying twice" body={warning} /> : null}
      <View style={styles.actions}>
        {plan.plan === "free" ? (
          <Button label="See Plus" icon={Crown} onPress={() => router.push("/pricing")} />
        ) : null}
        {plan.source === "stripe" && plan.plan === "plus" ? (
          Platform.OS === "web" ? (
            <Button
              label="Manage billing"
              icon={CreditCard}
              variant="secondary"
              onPress={manageOnWeb}
              disabled={busy}
            />
          ) : (
            <Text style={[ui(13, 400, { lineHeight: 19 }), styles.muted]}>
              Change or cancel it on the web: sign in to Tableside in a browser and open Account.
            </Text>
          )
        ) : null}
        {plan.source === "app_store" || plan.source === "play_store" ? (
          <Button
            label={STORE_MANAGE[plan.source].label}
            variant="secondary"
            onPress={() => Linking.openURL(STORE_MANAGE[plan.source as "app_store"].url)}
          />
        ) : null}
        {purchase.restore ? (
          <Button
            label="Restore purchases"
            icon={RotateCcw}
            variant="ghost"
            onPress={purchase.restore}
            disabled={purchase.busy}
          />
        ) : null}
      </View>
      {message ? <Notice title={message} onClose={() => setMessage(null)} /> : null}
      {purchase.notice ? (
        <Notice
          title={purchase.notice.title}
          body={purchase.notice.body}
          onClose={purchase.clearNotice}
        />
      ) : null}
    </Panel>
  );
}

function SessionPanel() {
  const router = useRouter();
  return (
    <Panel style={styles.panel}>
      <Button
        label="Sign out"
        icon={LogOut}
        variant="secondary"
        onPress={async () => {
          await signOut();
          router.replace("/lobby");
        }}
      />
      <Text style={[ui(13, 400, { lineHeight: 19 }), styles.muted]}>
        Signing out keeps your practice on this device. Sign back in any time to get your plan back.
      </Text>
    </Panel>
  );
}

function DeletePanel({ account }: { account: Account }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<"reauthenticate" | string | null>(null);
  const storeBilled =
    account.plan.willRenew &&
    (account.plan.source === "app_store" || account.plan.source === "play_store");

  const remove = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const outcome = await deleteAccount();
      if (outcome === "reauthenticate") setProblem("reauthenticate");
      else router.replace("/lobby");
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  return (
    <Panel title="Delete account" style={styles.panel}>
      <Text style={[ui(14, 400, { lineHeight: 20 }), styles.muted]}>
        Deletes your account and your plan from Tableside for good. Practice saved on this device
        stays here.
        {account.plan.source === "stripe" && account.plan.willRenew
          ? " Your web subscription is canceled with it."
          : ""}
      </Text>
      {storeBilled ? (
        <Notice
          title={`Cancel your subscription in ${account.plan.source === "app_store" ? "the App Store" : "Google Play"} first`}
          body="Deleting your account doesn't stop the store from billing you. Cancel it there, then come back to delete."
        />
      ) : null}
      {problem === "reauthenticate" ? (
        <Notice
          title="Sign in again to confirm"
          body="For your security, deleting needs a sign-in from the last day. Sign out, sign back in, then delete."
        />
      ) : problem ? (
        <Notice title="The account wasn't deleted" body={problem} />
      ) : null}
      {confirming ? (
        <View style={styles.actions}>
          <Button
            label={busy ? "Deleting…" : "Delete my account"}
            variant="primary"
            onPress={remove}
            disabled={busy}
            style={styles.danger}
          />
          <Button label="Keep my account" variant="ghost" onPress={() => setConfirming(false)} />
        </View>
      ) : (
        <Button label="Delete account" variant="secondary" onPress={() => setConfirming(true)} />
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  column: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    gap: 24,
    paddingVertical: 24,
  },
  who: { flexDirection: "row", alignItems: "center", gap: 14 },
  flex: { flex: 1 },
  panel: { alignSelf: "stretch" },
  planHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "center" },
  danger: { backgroundColor: colors.destructive, borderColor: colors.destructive },
  fg: { color: colors.foreground },
  muted: { color: colors.mutedForeground },
});
