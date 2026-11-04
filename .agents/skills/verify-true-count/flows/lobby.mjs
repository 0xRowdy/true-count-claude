/* global document, innerWidth -- page.evaluate callbacks run in the browser */
// Lobby (/lobby, frame ZDK1x). Proves: a new player sees an honest empty lobby (games "Not
// started", a "Start here" hero, no streak, no accuracy); `?demo=1` swaps in the labelled sample
// history (streak, per-game accuracy and levels, a weak-spot hero) without saving anything;
// links follow the route map; nothing scrolls sideways on a phone.
const visible = (loc) => loc.filter({ visible: true }).first();

export default async ({ page, url, shot, log, check }) => {
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1440, height: 1200 });

  // Empty: a fresh browser profile has no progress.
  const res = await page.goto(url("/lobby"), { waitUntil: "networkidle" });
  check(res?.ok(), `/lobby served (HTTP ${res?.status()})`);
  await visible(page.getByText(/^Good (morning|afternoon|evening)/)).waitFor();
  check(
    (await visible(page.getByRole("link", { name: "Lobby", exact: true })).getAttribute(
      "aria-current",
    )) === "page",
    "Lobby is the current nav item",
  );
  check(
    await visible(page.getByText("Start a practice streak today")).isVisible(),
    "no streak yet",
  );
  check(
    await visible(page.getByText(/^START HERE · BLACKJACK TRAINER$/)).isVisible(),
    "start-here hero",
  );
  check(
    (await page.getByText("Not started", { exact: true }).filter({ visible: true }).count()) === 5,
    "all five games Not started",
  );
  check(
    await visible(page.getByText("10,000 practice chips")).isVisible(),
    "header shows the starting practice chips",
  );
  check(
    await visible(page.getByText("Simulated players")).isVisible(),
    "live tables are labelled simulated",
  );
  const hrefs = {
    "Start training": "/drills/basic-strategy",
    "Free play instead": "/play",
    "Join Craps · Downtown rules (simulated table)": "/live/craps",
    "Join Blackjack · 6 deck, S17 (simulated table)": "/live",
    "Strategy: Iron Cross, explained": "/strategies/craps",
    "Start today's drill": null,
  };
  for (const [name, href] of Object.entries(hrefs)) {
    const got = await visible(page.getByRole("link", { name, exact: true })).getAttribute("href");
    check(href === null ? !!got : got === href, `link "${name}" → ${got}`);
  }
  check(
    (await visible(page.getByRole("link", { name: /^Craps: Not started/ })).getAttribute(
      "href",
    )) === "/games/craps",
    "Craps card → /games/craps",
  );
  await shot("lobby-empty-1440");

  // Sample data, via the clearly labelled link.
  await visible(page.getByRole("link", { name: "Load sample data (demo, not saved)" })).click();
  await page.waitForURL(/demo=1/);
  await visible(page.getByText(/^Sample data\./)).waitFor();
  check(
    await visible(page.getByText("4-day practice streak")).isVisible(),
    "sample streak: 4 days",
  );
  check(
    await visible(page.getByText(/^UP NEXT · BLACKJACK TRAINER$/)).isVisible(),
    "hero picks a blackjack weak spot",
  );
  check(
    await visible(
      page.getByText(/tripped you up \d+ times? last session|is your weakest spot/),
    ).isVisible(),
    "hero says why",
  );
  const bj = await visible(page.getByRole("link", { name: /^Blackjack: Level \d+/ })).getAttribute(
    "aria-label",
  );
  log(`blackjack card: ${bj}`);
  check(
    /Level \d+ · .+, \d+% accuracy\. (Next: .+|Top level reached)$/.test(bj ?? ""),
    "blackjack card: level, accuracy and next step",
  );
  check(
    await visible(page.getByRole("link", { name: /^Roulette: Not started/ })).isVisible(),
    "roulette still not started",
  );
  const ticks = await page
    .getByRole("listitem", { name: /practised$/ })
    .filter({ visible: true })
    .count();
  check(ticks >= 1, `weekday ticks from practice days (${ticks} practised this week)`);
  await shot("lobby-sample-1440");

  // Nothing was written: the plain lobby is still empty.
  await visible(page.getByRole("link", { name: "Exit sample data" })).click();
  await page.waitForURL((u) => !u.search.includes("demo"));
  await visible(page.getByText("Start a practice streak today")).waitFor();
  const stored = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.includes("progress")),
  );
  check(
    stored.length === 0,
    `sample data saved nothing (progress keys: ${stored.join(",") || "none"})`,
  );

  // Phone width.
  await page.setViewportSize({ width: 390, height: 2600 });
  await page.goto(url("/lobby?demo=1"));
  await visible(page.getByText("4-day practice streak")).waitFor();
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(overflow <= 0, `no horizontal page scroll at 390 wide (overflow ${overflow}px)`);
  const blackjackCard = await visible(
    page.getByRole("link", { name: /^Blackjack: Level/ }),
  ).boundingBox();
  const pokerCard = await visible(page.getByRole("link", { name: /^Video Poker: / })).boundingBox();
  check(blackjackCard.width >= 160, "phone game cards retain readable width");
  check(pokerCard.y >= blackjackCard.y + blackjackCard.height, "phone game cards wrap into rows");
  await shot("lobby-sample-390");

  check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
};
