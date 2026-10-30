// Accounts (/sign-in, /account; ADR-0007). Two builds, one flow:
// - No backend (CI, and `verify.sh launch`, which builds with EXPO_NO_DOTENV): both pages say
//   accounts aren't available, offer no sign-in buttons, and the header avatar is not a link.
//   Proves invariant 8: nothing asks for an account the build can't have.
// - A backend (`expo start --web` with .env.local, served on localhost:8081, the dev
//   deployment's trusted origin; run `node scripts/drive.mjs flows/account.mjs
//   http://localhost:8081 <dir>`): Apple and Google buttons at equal size, a failed sign-in
//   explained in place, Pricing sends a signed-out buyer to sign-in and back to the same plan.
const visible = (loc) => loc.filter({ visible: true }).first();

export default async ({ page, url, shot, check, log }) => {
  const errors = [];
  // With the URL, so the one expected failure below can be told apart from anything else.
  page.on(
    "console",
    (m) => m.type() === "error" && errors.push(`${m.text()} @ ${m.location()?.url}`),
  );
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1280, height: 1000 });

  const res = await page.goto(url("/sign-in"), { waitUntil: "networkidle" });
  check(res?.ok(), `/sign-in served (HTTP ${res?.status()})`);
  await visible(page.getByRole("heading", { name: "Sign in to Tableside" })).waitFor();
  const unavailable = visible(page.getByRole("status", { name: /Accounts aren't available/ }));
  const apple = visible(page.getByRole("button", { name: "Continue with Apple" }));
  await Promise.race([unavailable.waitFor(), apple.waitFor()]);
  const hasBackend = await apple.isVisible();
  log(`build has a backend: ${hasBackend}`);

  if (!hasBackend) {
    check(await unavailable.isVisible(), "sign-in says accounts aren't available");
    check(
      (await page.getByRole("button", { name: /^Continue with/ }).count()) === 0,
      "no sign-in buttons without a backend",
    );
    await shot("sign-in-unavailable");
    await page.goto(url("/account"), { waitUntil: "networkidle" });
    await visible(page.getByRole("status", { name: /Accounts aren't available/ })).waitFor();
    check(true, "account says accounts aren't available");
    check(
      (await page.getByRole("link", { name: "Account" }).count()) === 0,
      "header avatar is not a link without a backend",
    );
    await shot("account-unavailable");
    check(
      errors.length === 0,
      `no console errors${errors.length ? `: ${errors.join(" | ")}` : ""}`,
    );
    return;
  }

  // Apple and Google: same size, tappable (each provider requires at least equal prominence).
  const google = visible(page.getByRole("button", { name: "Continue with Google" }));
  const [a, g] = [await apple.boundingBox(), await google.boundingBox()];
  check(
    a && g && a.height >= 44 && a.height === g.height,
    `equal heights ≥44 (${a?.height}, ${g?.height})`,
  );
  check(a && g && a.width === g.width, `equal widths (${a?.width}, ${g?.width})`);
  await shot("sign-in");

  // A sign-in the provider refused comes back as ?error= and is explained in place.
  await page.goto(url("/sign-in?error=please_restart_the_process"), { waitUntil: "networkidle" });
  await visible(page.getByRole("status", { name: "That sign-in didn't go through" })).waitFor();
  check(true, "?error= shows the sign-in failure notice");

  // Google: either off to the provider, or (credentials not set on this deployment) the
  // backend's refusal, explained in place. Either way the button did something real.
  await page.goto(url("/sign-in"), { waitUntil: "networkidle" });
  await visible(page.getByRole("button", { name: "Continue with Google" })).click();
  const failed = visible(page.getByRole("status", { name: "That sign-in didn't go through" }));
  await Promise.race([
    page.waitForURL(/accounts\.google\.com|convex\.site/, { timeout: 15_000 }),
    failed.waitFor({ timeout: 15_000 }),
  ]);
  if (/accounts\.google\.com|convex\.site/.test(page.url())) {
    check(true, `Google sign-in left for ${new URL(page.url()).host}`);
  } else {
    check(await failed.isVisible(), "Google sign-in refused by the backend, explained in place");
    await shot("google-refused");
  }

  // Signed out, Pricing sends a buyer to sign-in, carrying the plan to come back to.
  await page.goto(url("/pricing"), { waitUntil: "networkidle" });
  await visible(page.getByRole("button", { name: "Start free trial with card" })).click();
  await page.waitForURL(/\/sign-in\?next=/);
  const next = new URL(page.url()).searchParams.get("next");
  check(next === "/pricing?plan=plus&billing=yearly", `sign-in returns to the plan (${next})`);

  // …and the plan in the URL is chosen again on the way back.
  await page.goto(url("/pricing?plan=lifetime&billing=monthly"), { waitUntil: "networkidle" });
  const lifetime = visible(page.getByRole("radio", { name: "Lifetime" }));
  await page.waitForFunction(
    (el) => el?.getAttribute("aria-checked") === "true",
    await lifetime.elementHandle(),
  );
  check(true, "?plan=lifetime selects Lifetime");

  // Signed out, the account page offers sign-in; the header avatar leads there.
  check(
    (await visible(page.getByRole("link", { name: "Account" })).getAttribute("href")) ===
      "/account",
    "header avatar → /account",
  );
  await page.goto(url("/account"), { waitUntil: "networkidle" });
  await visible(page.getByRole("button", { name: "Continue with Apple" })).waitFor();
  check(true, "signed-out account page offers sign-in");
  await shot("account-signed-out");

  // The refused sign-in request logs its own HTTP error; nothing else may.
  const unexpected = errors.filter((e) => !e.includes("/api/auth/sign-in/social"));
  check(
    unexpected.length === 0,
    `no console errors${unexpected.length ? `: ${unexpected.join(" | ")}` : ""}`,
  );
};
