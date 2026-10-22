/* global document, innerWidth -- page.evaluate runs in the browser */
// Roulette strategy builder (/strategies/roulette, frame D0h320): the design's example layout
// renders the engine's numbers (Covers 25 of 37, the per-spin table, −$2.70) and they move
// when a bet changes.
const visible = (loc) => loc.filter({ visible: true }).first();

export default async ({ page, url, shot, check }) => {
  await page.setViewportSize({ width: 1440, height: 1300 });
  const res = await page.goto(url("/strategies/roulette"), { waitUntil: "networkidle" });
  check(res?.ok(), `/strategies/roulette served (HTTP ${res?.status()})`);
  await visible(page.getByRole("heading", { name: "High Side + Six Line + Zero" })).waitFor();
  check(
    await visible(page.getByRole("button", { name: "Compare (2 changes)" })).isVisible(),
    "Compare (2 changes)",
  );
  check(
    await visible(page.getByText("Covers 25 of 37 numbers")).isVisible(),
    "Covers 25 of 37 numbers",
  );
  for (const row of [
    "Ball lands 19–36: 18 pockets, 48.6%, +$40",
    "Ball lands 13–18 (six line): 6 pockets, 16.2%, +$50",
    "Ball lands 0: 1 pocket, 2.7%, +$80",
    "Ball lands 1–12: 12 pockets, 32.4%, −$100",
  ])
    check(await visible(page.getByLabel(row)).isVisible(), row);
  check(await visible(page.getByText("−$2.70")).isVisible(), "average −$2.70");
  check(
    await visible(page.getByText(/6 losses in a row ask for a \$6,400 bet/)).isVisible(),
    "Martingale warning",
  );
  check(
    await visible(page.getByRole("heading", { name: "Six line 13–18" })).isVisible(),
    "six line selected",
  );
  check(await visible(page.getByText("Yours: $25 of $100")).isVisible(), "Yours: $25 of $100");
  check(
    await visible(page.getByText(/Same 25% share of the spin as the original/)).isVisible(),
    "rules-checked share",
  );
  await shot("example-d0h320");

  await visible(page.getByRole("button", { name: "More: Amount" })).click();
  await visible(page.getByText("Bet layout · $105 per spin")).waitFor();
  // At $30 the six line wins $75 net, the same as the zero: the engine groups them.
  check(
    await visible(page.getByLabel("Ball lands 0, 13–18: 7 pockets, 18.9%, +$75")).isVisible(),
    "six line at $30: 0 and 13–18 both win +$75",
  );
  check(
    await visible(page.getByText(/29% of the spin; the original put 25% here/)).isVisible(),
    "share check follows",
  );
  await visible(page.getByRole("button", { name: "Match original %" })).click();
  await visible(page.getByText("Bet layout · $100 per spin")).waitFor();
  check(true, "Match original % restores $25");

  await visible(page.getByRole("button", { name: "7", exact: true })).click();
  await visible(page.getByText("Covers 26 of 37 numbers")).waitFor();
  check(
    await visible(page.getByRole("heading", { name: "Straight 7" })).isVisible(),
    "tapping 7 adds and selects a straight up",
  );

  await visible(page.getByRole("radio", { name: "Custom" })).click();
  await visible(page.getByRole("radiogroup", { name: "After a loss", exact: true }))
    .getByRole("radio", { name: "Double stake" })
    .click();
  await visible(page.getByRole("radiogroup", { name: "After a win", exact: true }))
    .getByRole("radio", { name: "Add units" })
    .click();
  await visible(page.getByRole("button", { name: "More: Unit change" })).click();
  const custom = visible(page.getByRole("status", { name: "Custom progression" }));
  check(
    /after a loss, double the stake; after a win, add 2 base units/.test(await custom.innerText()),
    "Custom applies independent loss and win rules",
  );
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: "networkidle" });
  await custom.waitFor();
  check(
    /after a win, add 2 base units/.test(await custom.innerText()),
    "custom rule survives reload",
  );
  await shot("custom-progression");
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(200);
  await custom.scrollIntoViewIfNeeded();
  check(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "custom controls fit a phone without page overflow",
  );
  await shot("custom-progression-mobile");
  await page.setViewportSize({ width: 1440, height: 1300 });
  await visible(page.getByRole("tab", { name: "Step 4: Test & submit" })).click();
  await visible(page.getByRole("button", { name: "Play 50 spins with it" })).click();
  check(
    await visible(page.getByText("200 sessions", { exact: true })).isVisible(),
    "custom progression runs the session simulation",
  );
  await visible(page.getByRole("tab", { name: "Step 2: Bet layout" })).click();
  await visible(page.getByRole("radio", { name: "Martingale" })).click();
  check(
    (await visible(page.getByRole("radio", { name: "Martingale" })).getAttribute(
      "aria-checked",
    )) === "true",
    "Martingale selected",
  );
  await visible(page.getByRole("button", { name: "More: Stop when down" })).click();
  check(await visible(page.getByText("−$350")).isVisible(), "session rule steps");
  await shot("edited");
};
