// Play (Tableside table, frames CcmBm/N6Lcl/WSAfm/w7wLdL): bet, deal, act, settle, collect, back to betting.
// Proves: the felt prints the configured rules, a chip tapped onto the spot sets the wager, Deal deals face-up
// cards, an in-hand action resolves the round, the Result names the outcome and reviews the hand's decisions
// (each with its Explanation one tap away), Collect moves to the Payout, and the LAST strip records the round.
// React Native Web keeps hidden copies of some views in the DOM: always match visible elements.
const visible = (loc) => loc.filter({ visible: true }).first();
const MAX_ROUNDS = 6; // a natural settles with no decision; deal again, a few times at most
const phase = (page) =>
  visible(page.getByRole("progressbar"))
    .getAttribute("aria-label")
    .catch(() => "");

export default async ({ page, url, shot, log, check }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(url("/play"));
  const deal = visible(page.getByRole("button", { name: "Deal" }));
  await deal.waitFor();
  check(/Step 1 of 4: Bet/.test(await phase(page)), "phase stepper starts on Bet");
  check(
    await visible(page.getByText(/^BLACKJACK PAYS (3 TO 2|6 TO 5)$/)).isVisible(),
    "felt prints the blackjack payout from the Rule Set",
  );
  check(
    await visible(page.getByText(/^DEALER (STANDS ON ALL 17s|HITS SOFT 17)$/)).isVisible(),
    "felt prints the dealer's soft-17 rule",
  );

  // Clear the spot, pick the $5 chip, tap the spot twice: $10 on the spot.
  await visible(page.getByRole("button", { name: "Clear" })).click();
  await visible(page.getByRole("radio", { name: "$5 chip" })).click();
  const spot = visible(page.getByRole("button", { name: /^Bet spot/ }));
  await spot.click();
  await spot.click();
  check(
    /\$10$/.test((await spot.getAttribute("aria-label")) ?? ""),
    "two $5 chips tapped onto the spot make a $10 bet",
  );
  await shot("betting");

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const historyBefore = await page
      .getByText(/^(BJ|W|L|P) [+−]?\d/)
      .filter({ visible: true })
      .count();
    await visible(page.getByRole("button", { name: /^(Deal|Next hand)$/ })).click();
    await page.getByRole("img", { name: / of / }).first().waitFor();
    check(
      (await page.getByRole("img", { name: / of / }).count()) >= 3,
      `round ${round}: at least 3 face-up cards dealt`,
    );

    const noInsurance = visible(page.getByRole("button", { name: "No insurance" }));
    if (await noInsurance.isVisible().catch(() => false)) {
      log("insurance offered; declining");
      await noInsurance.click();
      // The coach may catch the decline (only at a high count); keep it.
      const keep = visible(page.getByRole("button", { name: "Keep my choice" }));
      if (await keep.isVisible().catch(() => false)) await keep.click();
    }

    // Stand until the round settles; keep the stand if the coach catches it.
    let decided = false;
    const collect = visible(page.getByRole("button", { name: /^(Collect \$|Continue$)/ }));
    for (let i = 0; i < 6 && !(await collect.isVisible().catch(() => false)); i++) {
      const stand = visible(page.getByRole("button", { name: "Stand", exact: true }));
      if (await stand.isVisible().catch(() => false)) {
        if (!decided) await shot("dealing");
        await stand.click();
        decided = true;
        const keep = visible(page.getByRole("button", { name: "Keep my stand" }));
        if (await keep.isVisible().catch(() => false)) {
          log("coach caught the stand; keeping it");
          await keep.click();
        }
      }
      await page.waitForTimeout(300);
    }
    await collect.waitFor({ timeout: 5000 });
    check(/Step 3 of 4: Result/.test(await phase(page)), `round ${round}: stepper on Result`);
    const headline = await visible(
      page.getByRole("heading", { name: /^(You win|You lose|Push$|Blackjack!)/ }),
    ).innerText();
    log(`round ${round} settled: ${headline}${decided ? "" : " (natural, no player decision)"}`);
    check(
      await visible(page.getByText("DECISIONS THIS HAND")).isVisible(),
      "result reviews the hand's decisions",
    );

    if (decided) {
      const why = visible(page.getByRole("button", { name: /^Why: .*: stood/ }));
      check(await why.isVisible(), "the stand is listed in the decisions this hand");
      await shot("result");
      await why.click();
      check(
        await visible(page.getByText(/^You stood( — correct\.|\. The play was)/)).isVisible(),
        "the decision opens its Explanation",
      );
      await shot("why");
      await visible(page.getByRole("button", { name: "Close table panel" })).click();
    }

    await collect.click();
    check(
      /Step 4 of 4: Payout/.test(await phase(page)),
      `round ${round}: Collect moves to the Payout`,
    );
    const historyAfter = await page
      .getByText(/^(BJ|W|L|P) [+−]?\d/)
      .filter({ visible: true })
      .count();
    check(
      historyAfter > historyBefore || historyBefore === 5,
      `the LAST strip records the round (${historyBefore} -> ${historyAfter})`,
    );
    if (decided) {
      await shot("payout");
      await visible(page.getByRole("button", { name: /^Rebet \$/ })).click();
      await visible(page.getByRole("button", { name: "Deal" })).waitFor();
      check(/Step 1 of 4: Bet/.test(await phase(page)), "Rebet returns to betting");
      await shot("next-hand-ready");
      return;
    }
  }
  throw new Error(`no round needed a player decision in ${MAX_ROUNDS} deals`);
};
