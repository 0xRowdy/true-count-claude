/* global document, innerWidth -- page.evaluate callbacks run in the browser */
// Landing (/): the marketing page renders and its calls to action go where the route map says.
// Proves: the hero renders (headline, table vignette, coach note), the five game tiles link to
// their tables, Sign in opens an honest in-place notice (no account), "Play free now — no
// signup" takes a new player to /onboarding, and the page fits a phone without sideways scroll.
const visible = (loc) => loc.filter({ visible: true }).first();

export default async ({ page, url, shot, check }) => {
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.setViewportSize({ width: 1440, height: 3700 });
  const res = await page.goto(url("/"), { waitUntil: "networkidle" });
  check(res?.ok(), `/ served (HTTP ${res?.status()})`);
  const headline = visible(
    page.getByRole("heading", { name: "Walk up to the table already knowing the move." }),
  );
  await headline.waitFor();
  check(await headline.isVisible(), "hero headline");
  check(
    await visible(page.getByRole("note", { name: /Hit\. 12 against a dealer 7/ })).isVisible(),
    "hero coach note",
  );
  for (const name of ["Face-down card", "7 of clubs", "7 of spades", "5 of diamonds"])
    check(await visible(page.getByRole("img", { name })).isVisible(), `hero table: ${name}`);
  check(
    await visible(page.getByText("Practice only · no real-money wagering, ever")).isVisible(),
    "practice-only badge",
  );
  check(
    await visible(page.getByText(/call 1-800-GAMBLER or visit ncpgambling\.org/)).isVisible(),
    "responsible-gaming footer",
  );
  check(
    await visible(page.getByText(/Example strategies/)).isVisible(),
    "community strategies are labelled as examples",
  );
  check(
    await visible(page.getByText("Every current training tool is free.")).isVisible(),
    "landing states the actual free training scope",
  );
  check(
    await visible(
      page.getByText("Pricing preview only. Purchases and trials are unavailable in this build."),
    ).isVisible(),
    "pricing preview is disclosed before plan cards",
  );

  const tiles = {
    Blackjack: "/play",
    Roulette: "/games/roulette",
    Craps: "/games/craps",
    "Video Poker": "/games/video-poker",
    Baccarat: "/games/baccarat",
  };
  for (const [game, href] of Object.entries(tiles)) {
    const link = visible(page.getByRole("link", { name: `Play ${game} free` }));
    check((await link.getAttribute("href")) === href, `tile "${game}" → ${href}`);
  }
  await shot("landing-1440");

  // Sign in: no backend, so an honest notice in place of a form.
  await visible(page.getByRole("button", { name: "Sign in" })).click();
  const notice = visible(page.getByRole("status", { name: /No account needed/ }));
  await notice.waitFor();
  check(await notice.isVisible(), "Sign in shows the no-account notice");
  check((await page.locator("input[type=password]").count()) === 0, "no fake sign-in form");
  await shot("sign-in-notice");
  await visible(page.getByRole("button", { name: "Dismiss" })).click();

  for (const [label, content] of [
    ["Privacy", /Clearing its storage deletes them/],
    ["Terms", /balances are virtual and have no cash value/],
    ["Accessibility", /controls support keyboard navigation/],
  ]) {
    await visible(page.getByRole("button", { name: label, exact: true })).click();
    const disclosure = visible(page.getByRole("status", { name: label, exact: true }));
    check(content.test(await disclosure.innerText()), `${label} opens its information`);
    await disclosure.getByRole("button", { name: "Dismiss", exact: true }).click();
    check(!(await disclosure.isVisible()), `${label} can be dismissed`);
  }

  // Phone width: nothing scrolls sideways.
  await page.setViewportSize({ width: 390, height: 6000 });
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(overflow <= 0, `no horizontal page scroll at 390 wide (overflow ${overflow}px)`);
  await shot("landing-390");

  // The main CTA takes a new player to onboarding.
  await page.setViewportSize({ width: 1440, height: 900 });
  const cta = visible(page.getByRole("link", { name: "Play free now — no signup" }));
  check((await cta.getAttribute("href")) === "/onboarding", "CTA points at /onboarding");
  await cta.click();
  await page.waitForURL(/\/onboarding$/);
  await visible(page.getByRole("heading", { name: "How well do you know the tables?" })).waitFor();
  check(true, "CTA navigated to onboarding step 1");
  await shot("after-cta");

  check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
};
