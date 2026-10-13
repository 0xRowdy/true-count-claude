/* global document, innerWidth -- page.evaluate callbacks run in the browser */
// Progress & Mastery (/progress, frame LvXnf). Proves: a new player gets honest empty states
// (level 0, "—" accuracy, locked achievements, no sessions) and a labelled way to load sample
// data; with `?demo=1` every panel fills from the progress store (level ring + criteria, stat
// cards, weekly bars, decision types + weak spot, achievements, bankroll, session stats,
// recent sessions); game tabs and the range control change the numbers; links work.
const visible = (loc) => loc.filter({ visible: true }).first();

export default async ({ page, url, shot, log, check }) => {
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1440, height: 1700 });

  const res = await page.goto(url("/progress"), { waitUntil: "networkidle" });
  check(res?.ok(), `/progress served (HTTP ${res?.status()})`);
  await visible(page.getByText("Not started", { exact: true })).waitFor();
  check(
    (await visible(page.getByRole("link", { name: "Progress", exact: true })).getAttribute(
      "aria-current",
    )) === "page",
    "Progress is the current nav item",
  );
  check(await visible(page.getByRole("img", { name: /^Level 0,/ })).isVisible(), "level ring at 0");
  check(
    await visible(page.getByText("No decisions in this range")).isVisible(),
    "accuracy card empty state",
  );
  check(
    await visible(page.getByText("0 of 6", { exact: true })).isVisible(),
    "no achievements earned",
  );
  check(
    await visible(page.getByText("No sessions in this range yet.")).isVisible(),
    "recent sessions empty state",
  );
  check(
    await visible(page.getByText(/^Practice chips only\. Results here don't predict/)).isVisible(),
    "disclaimer",
  );
  await shot("progress-empty-1440");

  await visible(page.getByRole("link", { name: "Load sample data (demo, not saved)" })).click();
  await page.waitForURL(/demo=1/);
  await visible(page.getByText(/^Sample data\./)).waitFor();
  await visible(page.getByText(/^BLACKJACK · (\d+% TO LEVEL \d+|TOP LEVEL)$/)).waitFor();
  const ring = await visible(page.getByRole("img", { name: /^Level \d+,/ })).getAttribute(
    "aria-label",
  );
  log(`ring: ${ring}`);
  check(!/^Level 0,/.test(ring ?? ""), "blackjack has a level");
  const card = async (label) =>
    (await visible(page.getByRole("group", { name: new RegExp(`^${label}: `) })).getAttribute(
      "aria-label",
    )) ?? "";
  const acc = await card("Decision accuracy");
  const hands = await card("Hands played");
  log(`${acc} · ${hands} · ${await card("Best streak")} · ${await card("Practice win rate")}`);
  check(/: \d+\.\d%$/.test(acc), "decision accuracy is a percentage");
  check(/: [1-9][\d,]*$/.test(hands), "hands played > 0");
  check(
    (await page
      .getByRole("listitem", { name: /^W\d+: \d+%$/ })
      .filter({ visible: true })
      .count()) >= 6,
    "weekly bars have values",
  );
  check(
    await visible(
      page.getByRole("progressbar", { name: /^Soft totals: \d+% of \d+$/ }),
    ).isVisible(),
    "decision-type bars",
  );
  const weak = visible(page.getByRole("link", { name: /your weak spot\. Drill them$/ }));
  check(
    (await weak.getAttribute("href")) === "/drills/basic-strategy",
    "weak spot links to the blackjack drill",
  );
  check(await visible(page.getByText(/^[1-9] of 6$/)).isVisible(), "some achievements earned");
  check(
    await visible(page.getByText(/^Started at \$[\d,]+ · now \$[\d,]+$/)).isVisible(),
    "bankroll caption",
  );
  check(
    await visible(
      page.getByRole("img", { name: /^Practice bankroll chart, \d+ points$/ }),
    ).isVisible(),
    "bankroll chart",
  );
  check(await visible(page.getByText(/^1 per \d+ decisions$/)).isVisible(), "coach corrections");
  check(
    await visible(page.getByText("Today", { exact: true })).isVisible(),
    "recent sessions list today's session",
  );
  await shot("progress-sample-blackjack-1440");

  // Tabs: All games, then Craps.
  await visible(page.getByRole("tab", { name: "All games" })).click();
  await visible(page.getByText("By game", { exact: true })).waitFor();
  const allHands = await card("Hands played");
  check(allHands !== hands, `All games changes the numbers (${hands} → ${allHands})`);
  await visible(page.getByRole("tab", { name: "Craps" })).click();
  await visible(page.getByText(/^CRAPS · /)).waitFor();
  check(await visible(page.getByText("Weekly, craps")).isVisible(), "craps weekly chart");
  check(
    await visible(page.getByRole("progressbar", { name: /^Odds: / })).isVisible(),
    "craps decision types",
  );
  await shot("progress-sample-craps-1440");
  await visible(page.getByRole("tab", { name: "Roulette" })).click();
  await visible(page.getByText(/^ROULETTE · NOT STARTED$/)).waitFor();
  check(
    await visible(page.getByText("No sessions in this range yet.")).isVisible(),
    "roulette: no sessions",
  );

  // Range control.
  await visible(page.getByRole("tab", { name: "Blackjack" })).click();
  const before = await card("Hands played");
  const rangeButton = visible(page.getByRole("button", { name: "Range: Last 30 days" }));
  await rangeButton.click();
  check(
    (await visible(page.getByRole("menuitemradio", { name: "Last 30 days" })).getAttribute(
      "aria-checked",
    )) === "true",
    "range menu items are menuitemradio, the current one checked",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("menu", { name: "Range" }).waitFor({ state: "hidden" });
  log("Escape closes the range menu");
  await rangeButton.click();
  await visible(page.getByRole("menu", { name: "Range" })).waitFor();
  await page.mouse.click(700, 120); // the page title, outside the picker
  await page.getByRole("menu", { name: "Range" }).waitFor({ state: "hidden" });
  log("an outside press closes the range menu");
  await rangeButton.click();
  await visible(page.getByRole("menuitemradio", { name: "All time" })).click();
  await visible(page.getByRole("button", { name: "Range: All time" })).waitFor();
  const after = await card("Hands played");
  check(after !== before, `range changes the numbers (${before} → ${after})`);
  check(await visible(page.getByText(/^View all \d+$/)).isVisible(), "View all sessions");
  await visible(page.getByRole("button", { name: /^View all \d+ sessions$/ })).click();
  check(await visible(page.getByText("Show fewer")).isVisible(), "View all expands the table");

  // Phone width.
  await page.setViewportSize({ width: 390, height: 4200 });
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(overflow <= 0, `no horizontal page scroll at 390 wide (overflow ${overflow}px)`);
  await shot("progress-sample-390");

  // Real blackjack: a round at the Play table shows up in Progress (bridged from the Session log).
  await page.setViewportSize({ width: 1440, height: 1700 });
  await page.goto(url("/play"), { waitUntil: "networkidle" });
  for (let round = 1; round <= 5; round++) {
    await visible(page.getByRole("button", { name: "Deal" })).click();
    await page.getByRole("img", { name: / of / }).first().waitFor();
    const noInsurance = visible(page.getByRole("button", { name: "No insurance" }));
    if (await noInsurance.isVisible().catch(() => false)) await noInsurance.click();
    let decided = false;
    for (let i = 0; i < 4 && !(await visible(page.getByText("Round settled")).isVisible()); i++) {
      const stand = visible(page.getByRole("button", { name: "Stand" }));
      if (await stand.isVisible().catch(() => false)) {
        await stand.click();
        decided = true;
      }
      await page.waitForTimeout(300);
    }
    await visible(page.getByText("Round settled")).waitFor({ timeout: 5000 });
    await visible(page.getByRole("button", { name: "Next hand" })).click();
    await visible(page.getByRole("button", { name: "Deal" })).waitFor();
    if (decided) break;
  }
  await page.waitForTimeout(500); // the Session write is queued
  await page.goto(url("/progress"), { waitUntil: "networkidle" });
  await visible(page.getByText(/^BLACKJACK · \d+% TO LEVEL \d+$/)).waitFor();
  const real = await card("Hands played");
  log(`after one round of Play: ${real} · ${await card("Decision accuracy")}`);
  check(/: [1-9]/.test(real), "a Play round counts as blackjack hands played");
  check(
    await visible(page.getByRole("img", { name: /^Level 1,/ })).isVisible(),
    "blackjack reaches level 1",
  );
  check(
    await visible(page.getByText("Basic Strategy · 6D H17")).isVisible(),
    "the Play session is in Recent sessions",
  );
  await shot("progress-real-blackjack-1440");

  check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
};
