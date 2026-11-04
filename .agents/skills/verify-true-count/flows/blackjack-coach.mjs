// Blackjack coach (frame N6Lcl, then WSAfm): a wrong play is caught before it reaches the cards.
// Proves, with the profile's coach on "mistakes": standing on everything soon stands where the chart says
// otherwise; the hand pauses on a mistake Coach Note ("Hold on: … is a …", reason from the explanation
// engine) with "Take it back & <play>" and "Keep my stand"; taking it back plays the right move; the Result
// lists the decision as "stood, replayed as …" counting as a miss, and opens its Explanation. Then, with the
// coach on "every", a hint note precedes the decision; on "asked", a Hint button brings it up on request.
const visible = (loc) => loc.filter({ visible: true }).first();
const PROFILE_KEY = "tableside/profile/v1";
const MAX_ROUNDS = 20; // standing on everything is wrong on most hard 5–11 and 12–16 vs 7+ hands

async function setCoach(page, url, coach) {
  await page.evaluate(
    ([key, value]) => localStorage.setItem(key, value),
    [PROFILE_KEY, JSON.stringify({ onboarded: true, coach, games: ["blackjack"] })],
  );
  await page.goto(url("/play"), { waitUntil: "domcontentloaded" });
  await visible(page.getByRole("button", { name: /^(Deal|Reset to)/ })).waitFor();
  await page.waitForTimeout(500); // the profile is read after mount
  const reset = visible(page.getByRole("button", { name: /^Reset to/ }));
  if (await reset.isVisible().catch(() => false)) await reset.click();
}

/** Deals until a hand waits on a play (declining insurance), or returns false after a natural. */
async function dealToDecision(page, log) {
  const deal = visible(page.getByRole("button", { name: /^(Deal|Next hand|Reset to \$\d+)$/ }));
  const label = await deal.innerText({ timeout: 10000 });
  log?.(`dealing (${label.trim()})`);
  await deal.click();
  if (/^Reset/.test(label.trim())) {
    await visible(page.getByRole("button", { name: "Deal" })).click();
  }
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

/** Plays the hand out standing (keeping any caught stand), collects, and returns to a Deal-ready table. */
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
}

export default async ({ page, url, shot, log, check }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(url("/play"));
  await setCoach(page, url, "mistakes");

  // --- 1. A mistake is caught, taken back, and reviewed as a miss -------------------------------
  let caught = false;
  for (let round = 1; round <= MAX_ROUNDS && !caught; round++) {
    if (!(await dealToDecision(page, log))) {
      await finishHand(page);
      await visible(page.getByRole("button", { name: /^(Collect \$|Continue$)/ })).click();
      continue;
    }
    await visible(page.getByRole("button", { name: "Stand", exact: true })).click();
    const keep = visible(page.getByRole("button", { name: "Keep my stand" }));
    if (!(await keep.isVisible().catch(() => false))) {
      await finishHand(page);
      await visible(page.getByRole("button", { name: /^(Collect \$|Continue$)/ })).click();
      continue;
    }

    caught = true;
    log(`round ${round}: the coach caught a stand`);
    const note = visible(page.getByRole("note", { name: /^Coach note: Hold on: / }));
    check(await note.isVisible(), "a mistake Coach Note pauses the hand");
    const title = (await note.getAttribute("aria-label")).replace("Coach note: ", "");
    log(`coach: ${title}`);
    check(
      /^Hold on: .+ vs .+ is an? (hit|double|split|surrender)\.$/.test(title),
      "the note names the hand and the right play",
    );
    check(
      await visible(page.getByText("LET'S REPLAY THAT")).isVisible(),
      "the note is the mistake variant",
    );
    check(
      await visible(page.getByText("You: Stand")).isVisible(),
      "the felt tags the caught action",
    );
    check(
      (await page
        .getByRole("button", { name: "Hit", exact: true })
        .filter({ visible: true })
        .count()) === 0,
      "the hand is paused: no action buttons while the note decides",
    );
    const takeBack = visible(page.getByRole("button", { name: /^Take it back & / }));
    check(await takeBack.isVisible(), "a take-back is offered");
    const [a, b] = [await takeBack.boundingBox(), await keep.boundingBox()];
    check(
      a && b && Math.abs(a.y + a.height / 2 - (b.y + b.height / 2)) < 4,
      "at 390 wide the note's two choices sit on one row",
    );
    const replacement = (await takeBack.innerText()).replace("Take it back & ", "").trim();
    await shot("mistake-caught");

    const cardsBefore = await page
      .getByRole("img", { name: / of / })
      .filter({ visible: true })
      .count();
    await takeBack.click();
    await page.waitForTimeout(300);
    const cardsAfter = await page
      .getByRole("img", { name: / of / })
      .filter({ visible: true })
      .count();
    log(`took it back and played ${replacement} (${cardsBefore} -> ${cardsAfter} face-up cards)`);
    check(
      !(await note.isVisible().catch(() => false)),
      "the note closes once the take-back is played",
    );
    if (replacement === "hit" || replacement === "double") {
      check(cardsAfter > cardsBefore, `the ${replacement} dealt a card`);
    }

    await finishHand(page);
    const row = visible(
      page.getByRole("button", {
        name: new RegExp(`^Why: .*: stood, replayed as ${replacement}$`),
      }),
    );
    check(await row.isVisible(), `the result lists "stood, replayed as ${replacement}"`);
    check(
      await visible(page.getByText("Counts as a miss.")).isVisible(),
      "the taken-back stand counts as a miss",
    );
    check(
      await visible(page.getByText(/^Bet sizing: \$\d+ = [\d.]+% of bankroll$/)).isVisible(),
      "bet sizing is reviewed against the bankroll",
    );
    await shot("result-decisions");
    await row.click();
    check(
      await visible(page.getByText(/^You stood\. The play was /)).isVisible(),
      "the miss opens its Explanation",
    );
    await shot("miss-explained");
    await visible(page.getByRole("button", { name: "Close table panel" })).click();
    await visible(page.getByRole("button", { name: /^(Collect \$|Continue$)/ })).click();
  }
  check(caught, `the coach caught a wrong stand within ${MAX_ROUNDS} rounds`);

  // --- 2. "Every decision": a hint before each play ---------------------------------------------
  await setCoach(page, url, "every");
  let hinted = false;
  for (let round = 1; round <= 6 && !hinted; round++) {
    if (await dealToDecision(page, log)) {
      const hint = visible(page.getByText(/^HINT · (BASIC STRATEGY|INDEX PLAY)$/));
      check(await hint.isVisible(), "coach = every: a hint note precedes the decision");
      await shot("hint-every");
      hinted = true;
    }
    await finishHand(page);
    await visible(page.getByRole("button", { name: /^(Collect \$|Continue$)/ })).click();
  }
  check(hinted, "a hand waited on a decision with coach = every");

  // --- 3. "Only if asked": no catch, a Hint button -----------------------------------------------
  await setCoach(page, url, "asked");
  let asked = false;
  for (let round = 1; round <= 6 && !asked; round++) {
    if (await dealToDecision(page, log)) {
      check(
        !(await visible(page.getByText(/^HINT · /))
          .isVisible()
          .catch(() => false)),
        "coach = asked: no unprompted hint",
      );
      await visible(page.getByRole("button", { name: "Hint" })).click();
      check(
        await visible(page.getByText(/^HINT · /)).isVisible(),
        "the Hint button brings up the hint",
      );
      await shot("hint-asked");
      asked = true;
    }
    await finishHand(page);
    await visible(page.getByRole("button", { name: /^(Collect \$|Continue$)/ })).click();
  }
  check(asked, "a hand waited on a decision with coach = asked");
};
