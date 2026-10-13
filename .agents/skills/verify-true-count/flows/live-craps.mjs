/* global document -- page.waitForFunction callbacks run in the browser */
// Live tables: join the simulated craps table from /live and play it like a user.
// Proves: the list links to the table (carrying ?seed= so the run replays), the table says it is
// a practice table with simulated players, the chip rack bets the pass line, Confirm rolls the
// seeded dice (dice, call and bankroll change), Add odds backs a point, chat posts locally, the
// leaderboard tabs switch, and the betting timer counts down on its own.
// Seed 7 with ?pace=manual (bets close only on Confirm) makes every roll below deterministic:
// 8 (point made) → 4 · 5 (point 9).
const visible = (loc) => loc.filter({ visible: true }).first();

export default async ({ page, url, shot, log, check }) => {
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1440, height: 1000 });

  // The list.
  const res = await page.goto(url("/live?seed=7&pace=manual"), { waitUntil: "networkidle" });
  check(res?.ok(), `/live served (HTTP ${res?.status()})`);
  const join = visible(page.getByRole("link", { name: /^Join Craps · Downtown rules/ }));
  await join.waitFor();
  check(
    await visible(page.getByRole("link", { name: "Play Blackjack solo" })).isVisible(),
    "blackjack offers the solo table, not a fake live one",
  );
  await page.waitForFunction(() =>
    [...document.querySelectorAll("a")].some((a) => a.href.includes("/live/craps?seed=7")),
  );
  await shot("live-list");
  await join.click();
  await page.waitForURL(/\/live\/craps\?seed=7&pace=manual$/);
  log(`joined: ${page.url()}`);

  // The table as the design draws it.
  const call = visible(page.getByRole("heading", { level: 2 }));
  await call.waitFor();
  check((await call.innerText()) === "Six, easy six. Point is still 8.", "opening roll call");
  check(
    await visible(page.getByText("Practice table · simulated players")).isVisible(),
    "labelled as a practice table with simulated players",
  );
  check(await visible(page.getByText("Live · 6 of 8 at the rail")).isVisible(), "occupancy badge");
  check(await visible(page.getByText("YOU · $25 + 3x odds")).isVisible(), "your pass line tag");
  check(await visible(page.getByText(/^Point is 8: odds go up to 5x/)).isVisible(), "coach hint");
  check(await visible(page.getByText("Bets close on confirm")).isVisible(), "manual pace timer");
  const yourSeat = visible(page.getByLabel(/^Carol \(you\), Pass \+ 3x odds/));
  const bank0 = await yourSeat.getAttribute("aria-label");
  check(/\$2,641$/.test(bank0 ?? ""), `your seat starts at $2,641 (${bank0})`);
  await shot("table-opening");

  // Confirm: the dice roll and the point is made.
  const dice0 = await page.getByRole("img", { name: /^Die showing/ }).allInnerTexts();
  await visible(page.getByRole("button", { name: "Confirm bets" })).click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("[role=heading][aria-level='2']")].some(
      (h) => h.textContent === "Eight, easy eight. Point made, pay the line.",
    ),
  );
  const dice1 = await page
    .getByRole("img", { name: /^Die showing/ })
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  check(dice1.join() === "Die showing 5,Die showing 3", `dice changed to 5 · 3 (${dice1})`);
  log(`dice before: ${dice0.length} faces`);
  const bank1 = await visible(page.getByLabel(/^Carol \(you\), /)).getAttribute("aria-label");
  check(/\$2,831$/.test(bank1 ?? ""), `bankroll paid: $2,641 → $2,831 (${bank1})`);
  check(
    await visible(page.getByLabel(/^Coach: \+\$115 this roll/)).isVisible(),
    "coach reports the roll's result",
  );
  check(
    (await page.getByRole("button", { name: "Add odds" }).count()) === 0,
    "Add odds is not offered on the come-out (never shown disabled)",
  );
  await shot("point-made");

  // The chip rack: pick $25 and press the pass line.
  await visible(page.getByRole("radio", { name: "$25 chip" })).click();
  await visible(page.getByRole("button", { name: /^Pass line, your bet \$25$/ })).click();
  await visible(page.getByRole("button", { name: "Pass line, your bet $50" })).waitFor();
  check(true, "pass line bet placed with the $25 chip ($25 → $50)");
  const bank2 = await visible(page.getByLabel(/^Carol \(you\), /)).getAttribute("aria-label");
  check(/\$2,806$/.test(bank2 ?? ""), `chips leave your bankroll (${bank2})`);

  // Confirm: 4 · 5 sets the point at 9.
  await visible(page.getByRole("button", { name: "Confirm bets" })).click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("[role=heading][aria-level='2']")].some(
      (h) => h.textContent === "Nine, center field nine. The point is 9.",
    ),
  );
  check(true, "second roll: point is 9");
  check(await visible(page.getByRole("img", { name: "Puck on" })).isVisible(), "puck is ON");

  // Add odds behind the point.
  await visible(page.getByRole("button", { name: "Add odds" })).click();
  await visible(page.getByText("YOU · $50 + 0.5x odds")).waitFor();
  check(
    await visible(page.getByRole("button", { name: "Pass line, your bet $75" })).isVisible(),
    "odds added behind the pass line",
  );
  await shot("odds-added");

  // Chat: type a message, and a quick reply.
  const input = visible(page.getByRole("textbox", { name: "Message the table" }));
  await input.fill("Odds on the nine, here we go");
  await visible(page.getByRole("button", { name: "Send message" })).click();
  await visible(page.getByText("Odds on the nine, here we go")).waitFor();
  check((await input.inputValue()) === "", "message posted and the composer cleared");
  await visible(page.getByRole("button", { name: "Good luck", exact: true })).click();
  check(
    (await page.getByText("Good luck", { exact: true }).count()) >= 2,
    "quick reply posted to the chat",
  );

  // Leaderboard tabs.
  const longest = visible(page.getByRole("tab", { name: "Longest roll" }));
  await longest.click();
  check((await longest.getAttribute("aria-selected")) === "true", "Longest roll tab selected");
  check(await visible(page.getByText("22 rolls")).isVisible(), "longest roll board: 22 rolls");
  await visible(page.getByRole("tab", { name: "Best decisions" })).click();
  check(await visible(page.getByText("98%")).isVisible(), "back to best decisions");
  await shot("chat-and-leaderboard");

  // The real timer: without ?pace=manual the window counts down on its own.
  await page.goto(url("/live/craps"), { waitUntil: "networkidle" });
  const timer = visible(page.getByText(/^Bets close in 0:\d\d$/));
  await timer.waitFor();
  const t0 = await timer.innerText();
  await page.waitForTimeout(2200);
  const t1 = await visible(page.getByText(/^Bets close in 0:\d\d$/)).innerText();
  check(t0 !== t1, `bet timer counts down (${t0} → ${t1})`);

  check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
};
