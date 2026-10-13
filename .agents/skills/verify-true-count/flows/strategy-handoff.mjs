// Strategy hand-off ("Test in trainer"): a builder sends the player to the game's table with
// ?strategy=<id>. Proves: /play shows a dismissible "Testing: <draft name>" banner from the local
// draft store; the coach coaches against the draft's chart — a play that follows the draft but
// not the table's chart is *not* stopped as a mistake, and the note shows the draft's own coach
// note plus the EV it costs; roulette lays the strategy's bets on the felt; craps shows the plan;
// an unknown id says so honestly.
const visible = (loc) => loc.filter({ visible: true }).first();
const PROFILE_KEY = "tableside/profile/v1";
const STRATEGIES_KEY = "tableside/strategies/v1";
const FORK = "fork-curated-bj-6d-s17";
const NOTE = "Standing on 16 against a 7: my chart takes the dealer's bust chance.";
const MAX_ROUNDS = 25;

/** Deals until a hand waits on a play (declining insurance); false after a natural. */
async function dealToDecision(page) {
  const deal = visible(page.getByRole("button", { name: /^(Deal|Next hand|Reset to \$\d+)$/ }));
  const label = (await deal.innerText({ timeout: 10000 })).trim();
  await deal.click();
  if (/^Reset/.test(label)) await visible(page.getByRole("button", { name: "Deal" })).click();
  await page.getByRole("img", { name: / of / }).first().waitFor();
  for (let i = 0; i < 3; i++) {
    const no = visible(page.getByRole("button", { name: "No insurance" }));
    if (await no.isVisible().catch(() => false)) {
      await no.click();
      const keep = visible(page.getByRole("button", { name: "Keep my choice" }));
      if (await keep.isVisible().catch(() => false)) await keep.click();
    }
    if (
      await visible(page.getByRole("button", { name: "Stand", exact: true }))
        .isVisible()
        .catch(() => false)
    )
      return true;
    await page.waitForTimeout(200);
  }
  return false;
}

/** Stands out the hand (keeping any caught stand) and collects. */
async function finishHand(page) {
  const collect = visible(page.getByRole("button", { name: /^(Collect \$|Continue$)/ }));
  for (let i = 0; i < 8 && !(await collect.isVisible().catch(() => false)); i++) {
    const keep = visible(page.getByRole("button", { name: "Keep my stand" }));
    if (await keep.isVisible().catch(() => false)) await keep.click();
    const stand = visible(page.getByRole("button", { name: "Stand", exact: true }));
    if (await stand.isVisible().catch(() => false)) await stand.click();
    await page.waitForTimeout(250);
  }
  await collect.waitFor({ timeout: 5000 });
  await collect.click();
}

export default async ({ page, url, shot, log, check }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(url("/strategies"), { waitUntil: "networkidle" });
  await page.evaluate(
    ([key, value]) => localStorage.setItem(key, value),
    [PROFILE_KEY, JSON.stringify({ onboarded: true, coach: "mistakes", games: ["blackjack"] })],
  );

  // 1. Fork the curated chart and make one change with a coach note, through the builder.
  await page.goto(url("/strategies"), { waitUntil: "networkidle" });
  await visible(page.getByRole("button", { name: "Fork Basic Strategy · 6 deck, S17" })).click();
  await page.waitForURL(new RegExp(`/strategies/blackjack\\?id=${FORK}`));
  await visible(page.getByRole("button", { name: /^16 vs 7: Hit/ })).click();
  await visible(page.getByRole("radio", { name: "Stand" })).click();
  await visible(page.getByRole("button", { name: "Compare (1 change)" })).waitFor();
  await visible(page.getByRole("textbox", { name: "Coach note" })).fill(NOTE);
  await page.waitForTimeout(400); // autosave

  // Widen the draft so the table meets it within a few hands: stand on hard 12-16 against 7-A.
  // The draft is the builder's own stored JSON, edited in place.
  const widened = await page.evaluate((key) => {
    const stored = JSON.parse(localStorage.getItem(key));
    const draft = stored.drafts.find((d) => d.game === "blackjack");
    for (let total = 12; total <= 16; total++)
      for (const up of [7, 8, 9, 10, 11]) draft.cells[`hard:${total}:${up}`] = "S";
    localStorage.setItem(key, JSON.stringify(stored));
    return draft.title;
  }, STRATEGIES_KEY);
  log(`draft under test: ${widened}`);

  // 2. "Test in trainer" goes to /play?strategy=<id> and says what is being tested.
  await page.reload({ waitUntil: "networkidle" });
  await visible(page.getByRole("button", { name: "Test in trainer" })).click();
  await page.waitForURL(new RegExp(`/play\\?strategy=${FORK}`));
  const banner = visible(page.getByRole("status", { name: `Testing: ${widened}` }));
  await banner.waitFor();
  check(await banner.isVisible(), `banner: "Testing: ${widened}"`);
  check(
    (await visible(page.getByRole("link", { name: "Open in the builder" })).getAttribute(
      "href",
    )) === `/strategies/blackjack?id=${FORK}`,
    "banner links back to the builder",
  );
  await shot("play-testing-banner");

  // 3. Stand on everything: a stand the draft makes but the chart does not is explained, not stopped.
  let seen = false;
  for (let round = 1; round <= MAX_ROUNDS && !seen; round++) {
    if (!(await dealToDecision(page))) {
      await finishHand(page);
      continue;
    }
    await visible(page.getByRole("button", { name: "Stand", exact: true })).click();
    const follows = visible(page.getByRole("note", { name: /as your strategy plays it\.$/ }));
    if (await follows.isVisible({ timeout: 800 }).catch(() => false)) {
      seen = true;
      const title = (await follows.getAttribute("aria-label")).replace("Coach note: ", "");
      log(`round ${round}: ${title}`);
      check(
        !(await visible(page.getByRole("note", { name: /^Coach note: Hold on: / }))
          .isVisible()
          .catch(() => false)),
        "the draft's stand is not stopped as a mistake",
      );
      const text = await follows.innerText();
      check(/YOUR STRATEGY · /i.test(text), "the note is labelled as the strategy's");
      check(
        /gives up \d\.\d{3} bets per hand against|worth about as much as/.test(text),
        `the note prices the departure: ${text.replace(/\s+/g, " ").slice(0, 160)}`,
      );
      if (/16 vs 7/.test(title)) check(text.includes(NOTE), "and carries the draft's coach note");
      await shot("draft-coach-note");
    }
    await finishHand(page);
  }
  check(seen, `within ${MAX_ROUNDS} hands the coach explained a stand the draft makes`);

  // Dismissible.
  await visible(page.getByRole("button", { name: "Dismiss strategy banner" })).click();
  check(
    !(await visible(page.getByRole("status", { name: /^Testing: / }))
      .isVisible()
      .catch(() => false)),
    "the banner dismisses",
  );

  // 4. Roulette: the strategy's bets go on the felt.
  await page.goto(url("/games/roulette?strategy=example-roulette&seed=7"), {
    waitUntil: "networkidle",
  });
  await visible(page.getByRole("status", { name: /^Testing: / })).waitFor();
  check(
    await visible(page.getByText("Total bet $0", { exact: true })).isVisible(),
    "roulette: an empty felt before placing",
  );
  await visible(page.getByRole("button", { name: "Place its bets" })).click();
  const total = await visible(page.getByText(/^Total bet \$/)).innerText();
  check(total !== "Total bet $0", `roulette: the strategy's bets are placed (${total})`);
  await shot("roulette-testing");

  // 5. Craps: the plan is shown for reference.
  await page.goto(url("/games/craps?strategy=example-craps"), { waitUntil: "networkidle" });
  const craps = visible(page.getByRole("status", { name: /^Testing: / }));
  await craps.waitFor();
  check(/Every come-out/i.test(await craps.innerText()), "craps: the banner lists the plan");

  // 6. An id this device does not have.
  await page.goto(url("/play?strategy=no-such-draft"), { waitUntil: "networkidle" });
  await visible(page.getByRole("status", { name: "That strategy isn't on this device" })).waitFor();
  check(true, "an unknown strategy says so");
};
