// Play: play rounds at the simulated table until one needs a player decision, then settle it.
// Proves: the table renders, Deal works, cards are dealt face-up, an in-hand action resolves the round,
// the settlement + decision feedback render, and Next hand returns to betting with Rounds played advanced.
// React Native Web keeps hidden copies of some views in the DOM: always match visible elements.
const visible = (loc) => loc.filter({ visible: true }).first();
const statValue = (page, label) => visible(page.getByText(label, { exact: true })).locator("..").innerText();
const flat = (s) => s.replace(/\s+/g, " ");
const MAX_ROUNDS = 5; // a natural (player or dealer) settles with no decision; deal again, a few times at most

export default async ({ page, url, shot, log, check }) => {
  await page.goto(url("/play"));
  await visible(page.getByRole("button", { name: "Deal (gate check)" })).waitFor({ timeout: 5000 });
  await shot("table-before-deal");

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const roundsBefore = await statValue(page, "Rounds played");
    await visible(page.getByRole("button", { name: "Deal" })).click();
    await page.getByRole("img", { name: / of / }).first().waitFor();
    check((await page.getByRole("img", { name: / of / }).count()) >= 3, `round ${round}: at least 3 face-up cards dealt`);

    const noInsurance = visible(page.getByRole("button", { name: "No insurance" }));
    if (await noInsurance.isVisible().catch(() => false)) { log("insurance offered; declining"); await noInsurance.click(); }

    // Stand until the round settles. If it settles before we act, it was a natural: no decision to prove.
    let decided = false;
    for (let i = 0; i < 4 && !(await visible(page.getByText("Round settled")).isVisible()); i++) {
      const stand = visible(page.getByRole("button", { name: "Stand" }));
      if (await stand.isVisible().catch(() => false)) { await stand.click(); decided = true; }
      await page.waitForTimeout(400);
    }
    await visible(page.getByText("Round settled")).waitFor({ timeout: 5000 });
    const result = await statValue(page, "This round");
    log(`round ${round} settled: ${flat(result)}${decided ? "" : " (natural, no player decision)"}`);
    check(/\$\d/.test(result), `round ${round}: settlement shows the round's chip result`);
    if (decided) {
      check(await visible(page.getByText(/^You (stood|hit|doubled|split|surrendered)/)).isVisible(), "decision feedback explains the play");
      await shot("round-settled");
    }

    await visible(page.getByRole("button", { name: "Next hand" })).click();
    await visible(page.getByRole("button", { name: "Deal (gate check)" })).waitFor({ timeout: 5000 });
    const roundsAfter = await statValue(page, "Rounds played");
    check(roundsAfter !== roundsBefore, `rounds played advanced (${flat(roundsBefore)} -> ${flat(roundsAfter)})`);
    if (decided) { await shot("next-hand-ready"); return; }
  }
  throw new Error(`no round needed a player decision in ${MAX_ROUNDS} deals`);
};
