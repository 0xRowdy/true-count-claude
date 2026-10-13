/* global document, innerWidth -- page.evaluate callbacks run in the browser */
// Craps table (/games/craps, frame lUiCl). Proves, on seed 337 (rolls 4-2, 4-5, 3-3): three full
// rounds through Bet → Roll → Result → Payout; the pass line, 3x odds behind it and a place 8;
// the coach catching a hard 6 as a mistake and taking it back before the roll; the design's
// result ("Six, the hard way" / "Point made · front line winner", +$46 · 10 + 36 odds, the
// GOOD CALL · ODDS note); the ROLLS strip and the practice bankroll updating; decisions and
// hands recorded to progress; no horizontal scroll at 390 wide.
const visible = (loc) => loc.filter({ visible: true }).first();

export default async ({ page, url, shot, log, check }) => {
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 390, height: 1500 });

  // Coach on every decision, so the praise note shows as in the design.
  await page.goto(url("/games/craps"), { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("tableside/profile/v1", JSON.stringify({ coach: "every" }));
  });
  const res = await page.goto(url("/games/craps?seed=337"), { waitUntil: "networkidle" });
  check(res?.ok(), `/games/craps served (HTTP ${res?.status()})`);

  const button = (name) => visible(page.getByRole("button", { name, exact: true }));
  const spot = (name) => visible(page.getByRole("button", { name: new RegExp(`^${name}`) }));
  const phase = (n, label) =>
    visible(page.getByRole("progressbar", { name: `Step ${n} of 4: ${label}` })).waitFor();
  const bankroll = async () =>
    (await visible(page.getByLabel(/^Practice bankroll/)).getAttribute("aria-label")) ?? "";
  const chip = (v) => visible(page.getByRole("radio", { name: `$${v} chip` }));

  await visible(page.getByLabel("Practice bankroll $2,000")).waitFor();
  await phase(1, "Bet");
  check(await visible(page.getByText("No rolls yet")).isVisible(), "empty ROLLS strip");
  check(
    await visible(page.getByText("Come-out roll", { exact: true })).isVisible(),
    "come-out call",
  );
  await shot("bet-empty");

  // Round 1: $10 on the pass line, come-out roll 4-2 sets the point.
  await chip(5).click();
  await spot("Pass line").click();
  check(
    (await spot("Pass line").getAttribute("aria-label")) === "Pass line, your bet $10",
    "a $5 chip on an empty pass line starts at the $10 minimum",
  );
  check(
    await visible(page.getByText("Pass line starts at the $10 table minimum.")).isVisible(),
    "minimum notice",
  );
  check(
    await visible(page.getByText("GOOD CALL · LINE")).isVisible(),
    "coach 'every' grades the line bet",
  );
  check(
    (await bankroll()) === "Practice bankroll $1,990",
    `bet leaves the bankroll: ${await bankroll()}`,
  );
  await button("Come-out roll").click();
  await phase(2, "Roll");
  await phase(3, "Result");
  check(await visible(page.getByText("Six, easy six")).isVisible(), "call: Six, easy six");
  check(await visible(page.getByText("Point is 6 · the puck is on")).isVisible(), "point is set");
  await phase(4, "Payout");
  check(await visible(page.getByLabel("Last roll 6 point")).isVisible(), "ROLLS: 6 point");
  check(await visible(page.getByRole("img", { name: "Puck on" })).isVisible(), "puck ON");
  check(
    await visible(page.getByText(/3-4-5x odds · \$10–\$2,000 · Point: 6/)).isVisible(),
    "header shows the point",
  );

  // Round 2: 3x odds ($30) and place 8 for $12; a hard 6 is caught and taken back.
  await spot("Pass line").click(); // $5 odds, back in the Bet phase
  await phase(1, "Bet");
  await chip(25).click();
  await spot("Pass line").click();
  check(
    (await spot("Pass line").getAttribute("aria-label")) ===
      "Pass line with $30 odds, your bet $40",
    "odds behind the line",
  );
  check(await visible(page.getByText("ODDS 3x")).isVisible(), "ODDS 3x tag");
  await chip(1).click();
  await spot("Place 8").click(); // starts at the $10 minimum
  await spot("Place 8").click();
  await spot("Place 8").click();
  check(
    (await spot("Place 8").getAttribute("aria-label")) === "Place 8, your bet $12",
    "place 8 for $12",
  );
  check(await button("Edit bets, $52 on the table").isVisible(), "Edit bets · $52");

  await chip(5).click();
  await button("Center bets").click();
  await spot("Hard 6, pays 9:1").click();
  await visible(page.getByText("Hard 6 carries a 9.09% house edge.")).waitFor();
  check(
    await visible(
      page.getByText(/as odds behind your pass line carries no house edge/),
    ).isVisible(),
    "mistake note suggests odds instead",
  );
  await shot("coach-mistake");
  await button("Take it back").click();
  check(
    (await page
      .getByText("Hard 6 carries a 9.09% house edge.")
      .filter({ visible: true })
      .count()) === 0,
    "note dismissed",
  );
  check(await button("Edit bets, $52 on the table").isVisible(), "hard 6 taken back");
  await shot("bet-full");

  await button("Roll").click();
  await phase(3, "Result");
  check(await visible(page.getByText("Nine, center field nine")).isVisible(), "call: nine");
  await phase(4, "Payout");
  check(await visible(page.getByLabel("Last roll 9")).isVisible(), "ROLLS: 9");

  // Round 3: six the hard way, point made: +$46 (10 + 36 odds).
  await button("Roll").click();
  await phase(3, "Result");
  check(await visible(page.getByText("Six, the hard way")).isVisible(), "call: Six, the hard way");
  check(await visible(page.getByText("Point made · front line winner")).isVisible(), "point made");
  check(await visible(page.getByLabel("Won +$46")).isVisible(), "win tag +$46");
  check(await visible(page.getByText("10 + 36 odds")).isVisible(), "breakdown 10 + 36 odds");
  check(await visible(page.getByText("GOOD CALL · ODDS")).isVisible(), "good-call note");
  check(
    await visible(page.getByText("Taking 3x odds was the best bet on the table.")).isVisible(),
    "praise for 3x odds",
  );
  check(await button("Come-out roll").isVisible(), "next roll is a come-out");
  await shot("result-390");
  await phase(4, "Payout");
  check(await visible(page.getByLabel("Last roll 6 hard")).isVisible(), "ROLLS: 6 hard first");
  // 2,000 + 46 won, with the $10 line and $12 place 8 still up.
  check((await bankroll()) === "Practice bankroll $2,024", `bankroll paid: ${await bankroll()}`);
  await shot("payout-390");

  // "How odds work" opens the rules with the edge chart.
  await button("How odds work").click();
  await visible(page.getByRole("dialog", { name: "Rules and payouts" })).waitFor();
  check(await visible(page.getByText("Odds / Lay odds")).isVisible(), "edge chart");
  await button("Close rules and payouts").click();

  // Progress: decisions in the craps categories and one hand per roll in action.
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("tableside/progress/v1") ?? "{}"),
  );
  const decisions = (stored.decisions ?? []).filter((d) => d.game === "craps");
  const hands = (stored.hands ?? []).filter((h) => h.game === "craps");
  log(`decisions: ${JSON.stringify(decisions.map((d) => [d.category, d.correct, d.coached]))}`);
  log(`hands: ${JSON.stringify(hands.map((h) => h.net))}`);
  check(
    decisions.some((d) => d.category === "place" && !d.correct && d.coached),
    "the taken-back hard 6 is a coached mistake",
  );
  check(
    decisions.some((d) => d.category === "odds" && d.correct),
    "odds recorded",
  );
  check(
    decisions.some((d) => d.category === "line" && d.correct),
    "line recorded",
  );
  check(JSON.stringify(hands.map((h) => h.net)) === "[0,0,46]", "three hands: 0, 0, +46");

  // Reload: the bankroll comes back from progress (bets on the layout are returned).
  await page.goto(url("/games/craps?seed=337"), { waitUntil: "networkidle" });
  await visible(page.getByLabel("Practice bankroll $2,046")).waitFor();
  log("reload: bankroll $2,046");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(overflow <= 0, `no horizontal page scroll at 390 wide (overflow ${overflow}px)`);

  // Desktop: the table sits in a phone-width column.
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.waitForTimeout(300);
  await shot("desktop-1440");

  check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
};
