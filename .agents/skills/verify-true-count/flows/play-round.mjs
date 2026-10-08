// Play: deal one round at the simulated table and play it to settlement.
// Proves: the table renders, Deal works, cards are dealt face-up, an in-hand action resolves the round,
// the settlement + decision feedback render, and Next hand returns to betting with Rounds played advanced.
// React Native Web keeps hidden copies of some views in the DOM: always match visible elements.
const visible = (loc) => loc.filter({ visible: true }).first();
const statValue = (page, label) => visible(page.getByText(label, { exact: true })).locator("..").innerText();
const flat = (s) => s.replace(/\s+/g, " ");

export default async ({ page, url, shot, log, check }) => {
  await page.goto(url("/play"));
  await visible(page.getByRole("button", { name: "Deal" })).waitFor();
  const roundsBefore = await statValue(page, "Rounds played");
  await shot("table-before-deal");

  await visible(page.getByRole("button", { name: "Deal" })).click();
  await page.getByRole("img", { name: / of / }).first().waitFor();
  check((await page.getByRole("img", { name: / of / }).count()) >= 3, "at least 3 face-up cards dealt");

  // Dealer ace -> insurance prompt comes first.
  const noInsurance = visible(page.getByRole("button", { name: "No insurance" }));
  if (await noInsurance.isVisible().catch(() => false)) { log("insurance offered; declining"); await noInsurance.click(); }
  await shot("hand-dealt");

  // Stand until the round settles (a natural may settle it immediately).
  for (let i = 0; i < 4 && !(await visible(page.getByText("Round settled")).isVisible()); i++) {
    const stand = visible(page.getByRole("button", { name: "Stand" }));
    if (await stand.isVisible().catch(() => false)) await stand.click();
    await page.waitForTimeout(400);
  }
  await visible(page.getByText("Round settled")).waitFor({ timeout: 5000 });
  const result = await statValue(page, "This round");
  log(`settled: ${flat(result)}`);
  check(/\$\d/.test(result), "settlement shows the round's chip result");
  check(await visible(page.getByText(/^You (stood|hit|doubled|split|surrendered)/)).isVisible(), "decision feedback explains the play");
  await shot("round-settled");

  await visible(page.getByRole("button", { name: "Next hand" })).click();
  await visible(page.getByRole("button", { name: "Deal" })).waitFor();
  const roundsAfter = await statValue(page, "Rounds played");
  check(roundsAfter !== roundsBefore, `rounds played advanced (${flat(roundsBefore)} -> ${flat(roundsAfter)})`);
  await shot("next-hand-ready");
};
