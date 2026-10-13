/* global document, innerWidth -- page.evaluate callbacks run in the browser */
// Strategies: library → fork a curated chart → edit a cell in the blackjack builder.
// Proves: the library lists curated/community examples (labelled as examples), Fork makes a
// credited local draft and opens it in /strategies/blackjack, changing a cell moves the
// Compare count and the EV rules check ("Costs …" for a losing play), a coach note counts to
// 160, and the draft (cell + note) survives a reload.
const visible = (loc) => loc.filter({ visible: true }).first();

export default async ({ page, url, shot, log, check }) => {
  await page.setViewportSize({ width: 1440, height: 1400 });
  const res = await page.goto(url("/strategies"), { waitUntil: "networkidle" });
  check(res?.ok(), `/strategies served (HTTP ${res?.status()})`);
  await visible(page.getByRole("heading", { name: "Strategies", exact: true })).waitFor();
  await visible(page.getByText("Loading your drafts…"))
    .waitFor({ state: "hidden" })
    .catch(() => {});
  for (const name of ["My strategies", "Curated by Tableside", "Top community strategies"])
    check(await visible(page.getByRole("heading", { name })).isVisible(), `section: ${name}`);
  check(
    await visible(page.getByText(/are examples: this build has no server/)).isVisible(),
    "examples are labelled as such",
  );
  check(
    await visible(page.getByText("Low-Edge Place 6 & 8")).isVisible(),
    "community strategy card",
  );
  await shot("library");

  // Filter by game.
  await visible(page.getByRole("tab", { name: "Craps" })).click();
  check(
    !(await page.getByText("Basic Strategy · 6 deck, S17").filter({ visible: true }).count()),
    "Craps filter hides blackjack",
  );
  await visible(page.getByRole("tab", { name: "All games" })).click();

  // Fork the curated S17 chart.
  await visible(page.getByRole("button", { name: "Fork Basic Strategy · 6 deck, S17" })).click();
  await page.waitForURL(/\/strategies\/blackjack\?id=fork-curated-bj-6d-s17/);
  await visible(
    page.getByText(/Forked from Basic Strategy · 6 deck, S17 by Tableside Curated · v4/),
  ).waitFor();
  check(
    await visible(page.getByRole("button", { name: "Compare (0 changes)" })).isVisible(),
    "fresh fork: Compare (0 changes)",
  );
  log(`url: ${page.url()}`);

  // Change 16 vs 7 from Hit to Stand: a losing play under these rules.
  await visible(page.getByRole("button", { name: /^16 vs 7: Hit/ })).click();
  await visible(page.getByRole("heading", { name: "Hard 16 vs dealer 7" })).waitFor();
  await visible(page.getByRole("radio", { name: "Stand" })).click();
  await visible(page.getByRole("button", { name: "Compare (1 change)" })).waitFor();
  check(true, "Compare count updates to 1 change");
  const verdict = await visible(
    page.getByText(/^Costs .* of the bet under S17, 6 decks$/),
  ).innerText();
  check(/Costs/.test(verdict), `rules check flags it: "${verdict}"`);
  check(
    await visible(
      page.getByRole("button", { name: /^16 vs 7: Stand, changed, loses money/ }),
    ).isVisible(),
    "the cell is marked changed and flagged",
  );

  // Back to Hit: the rules check passes again; then a real change (soft 19 vs 6 for H17 is
  // shown in the example; here, double soft 18 vs 2 under S17 is checked as a loss).
  await visible(page.getByRole("radio", { name: "Hit" })).click();
  await visible(page.getByRole("button", { name: "Compare (0 changes)" })).waitFor();
  check(
    await visible(page.getByText("Rules-checked for S17, 6 decks")).isVisible(),
    "Rules-checked after reverting",
  );
  await visible(page.getByRole("radio", { name: "Stand" })).click();
  await visible(page.getByRole("button", { name: "Compare (1 change)" })).waitFor();

  // Coach note with a counter.
  const note = "Standing on 16 against a 7 loses more often than hitting.";
  await visible(page.getByRole("textbox", { name: "Coach note" })).fill(note);
  check(
    await visible(page.getByText(`${note.length} / 160`)).isVisible(),
    "note counter counts to 160",
  );
  await visible(page.getByRole("button", { name: "Preview as coach note" })).click();
  check(
    await visible(page.getByRole("note", { name: /Coach note: Hard 16 vs dealer 7/ })).isVisible(),
    "preview renders the coach note",
  );
  check(
    await visible(page.getByText(/Draft · autosaved \d+:\d\d/)).isVisible(),
    "draft badge shows the autosave time",
  );
  await shot("builder-edited");

  // Reload: the draft persisted.
  await page.reload({ waitUntil: "networkidle" });
  await visible(page.getByRole("button", { name: "Compare (1 change)" })).waitFor();
  await visible(page.getByRole("button", { name: /^16 vs 7: Stand, changed/ })).click();
  check(
    (await visible(page.getByRole("textbox", { name: "Coach note" })).inputValue()) === note,
    "coach note persisted",
  );
  check(true, "cell change persisted across reload");

  // Bet sizing (the 4th chart tab): a bet ramp by true count with a rules check, kept in the draft.
  await visible(page.getByRole("tab", { name: "Bet sizing" })).click();
  check(await visible(page.getByText("1–8 spread")).isVisible(), "default ramp: 1–8 spread");
  check(
    await visible(page.getByText("Rules-checked for $10–$1,000 tables")).isVisible(),
    "ramp rules-checked",
  );
  for (let i = 0; i < 8; i++)
    await visible(
      page.getByRole("button", { name: "More: Units at true count +5 or more" }),
    ).click();
  await visible(page.getByText("1–16 spread")).first().waitFor();
  check(
    await visible(page.getByText("Aggressive for a 6-deck shoe")).isVisible(),
    "an aggressive spread is flagged",
  );
  await visible(page.getByRole("textbox", { name: "Coach note" })).fill(
    "Ramp up only when the count is real.",
  );
  await page.reload({ waitUntil: "networkidle" });
  await visible(page.getByRole("tab", { name: "Bet sizing" })).click();
  check(await visible(page.getByText("1–16 spread")).first().isVisible(), "the ramp persisted");
  await shot("bet-sizing");
  await visible(page.getByRole("tab", { name: "Totals" })).click();

  // Steps 3 and 4 are real screens.
  await visible(page.getByRole("tab", { name: "Step 3: Explain your changes" })).click();
  check(
    await visible(page.getByText("1 of 1 notes written.", { exact: false })).isVisible(),
    "Explain step counts notes",
  );
  await visible(page.getByRole("tab", { name: "Step 4: Test & submit" })).click();
  await visible(page.getByRole("button", { name: "Play 50 hands with it" })).click();
  check(
    await visible(page.getByText("Basic strategy, same cards")).isVisible(),
    "50 seeded hands beside basic strategy",
  );
  await visible(page.getByRole("button", { name: "Submit to community" }).last()).click();
  check(
    await visible(page.getByText(/Nothing was sent/)).isVisible(),
    "submit is honest: rules check fails, nothing sent",
  );
  await shot("test-submit");

  // Share: JSON export with the credit.
  await visible(page.getByRole("button", { name: "Share draft" })).click();
  const exported = await visible(page.getByRole("textbox", { name: "Draft export" })).inputValue();
  check(
    /"author": "Tableside Curated"/.test(exported) && /"changes": 1/.test(exported),
    "share export carries credit and changes",
  );

  // The design example (frame RYP9O) renders its six H17 changes, all rules-checked.
  await page.goto(url("/strategies/blackjack"), { waitUntil: "networkidle" });
  await visible(page.getByRole("button", { name: "Compare (6 changes)" })).waitFor();
  await visible(
    page.getByRole("button", { name: /^A,8 vs 6: Double, else stand, changed/ }),
  ).click();
  check(
    await visible(page.getByText("Rules-checked for H17, 6 decks")).isVisible(),
    "example: soft 19 vs 6 rules-checked for H17",
  );
  check(await visible(page.getByText("Change 5 of 6")).isVisible(), "example: Change 5 of 6");
  await shot("example-rpy9o");
  check(
    await visible(page.getByText(/practice chips/)).isVisible(),
    "header shows the practice-chip balance",
  );

  // Phone width: no sideways page scroll, and chart cells are 44pt tap targets.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(overflow <= 0, `no horizontal page scroll at 390 (${overflow}px)`);
  const box = await visible(page.getByRole("button", { name: /^A,8 vs 6:/ })).boundingBox();
  check(
    box && box.height >= 44 && box.width >= 44,
    `chart cell is a 44pt target at 390 (${box?.width}×${box?.height})`,
  );
  await shot("blackjack-390");
};
