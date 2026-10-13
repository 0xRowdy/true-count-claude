// Rules → Shoe Integrity → Statistics: change a rule and watch the chart move, then open the
// proofs and the Session record.
// Proves: the Rule Set editor drives the live strategy chart (invariant 4: the chart is generated
// from the rules), the Shoe Integrity Panel's zero-sum check runs a Shoe out to 0 (invariant 5),
// and the Statistics screen and Report a bug are reachable on each.
const visible = (loc) => loc.filter({ visible: true }).first();

export default async ({ page, url, shot, log, check }) => {
  await page.goto(url("/rules"));
  const before = visible(page.getByLabel(/^16 versus 10: /));
  await before.waitFor();
  const was = await before.getAttribute("aria-label");
  log(`before: ${was}`);
  check(/Surrender/.test(was ?? ""), "default table surrenders 16 against a 10");
  await shot("rules-default");

  await visible(page.getByRole("radio", { name: "None" })).click();
  const after = visible(page.getByLabel(/^16 versus 10: .*changed/));
  await after.waitFor();
  const now = await after.getAttribute("aria-label");
  log(`after: ${now}`);
  check(
    /^16 versus 10: Hit, changed/.test(now ?? ""),
    "surrender off: 16 v 10 becomes Hit, outlined",
  );
  const report = visible(page.getByText(/^\d+ cells? moves?, in /));
  await report.waitFor();
  log(`change report: ${await report.innerText()}`);
  check(await report.isVisible(), "the change report names how many cells moved");
  await shot("rules-surrender-off");

  // Put the table back so later flows deal the default game.
  await visible(page.getByRole("button", { name: "Reset to the default table" })).click();
  await visible(page.getByLabel(/^16 versus 10: Surrender/)).waitFor();

  await page.goto(url("/shoe-integrity"));
  await visible(page.getByText("Reconciles", { exact: true })).waitFor();
  check(
    await visible(page.getByRole("button", { name: "Report a bug" })).isVisible(),
    "shoe integrity: Report a bug is on the page",
  );
  await visible(page.getByRole("button", { name: "Run the Shoe out" })).click();
  await visible(page.getByText("Finished on 0", { exact: true })).waitFor({ timeout: 15000 });
  check(
    await visible(page.getByText("Finished on 0", { exact: true })).isVisible(),
    "Hi-Lo runs the Shoe out to exactly 0",
  );
  await shot("shoe-integrity-finished");

  await page.goto(url("/session"));
  await visible(page.getByRole("heading", { name: "Statistics" })).waitFor();
  check(
    await visible(page.getByText("Every session on this device", { exact: true })).isVisible(),
    "statistics: lifetime totals panel",
  );
  check(
    await visible(page.getByRole("button", { name: "Report a bug" })).isVisible(),
    "statistics: Report a bug is on the page",
  );
  await shot("statistics");
};
