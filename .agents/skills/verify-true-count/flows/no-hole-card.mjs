// Seed 939 deals 7s, dealer Js, 4s, then Jh to the double and Ac to the dealer.
const visible = (locator) => locator.filter({ visible: true }).first();

export default async ({ page, url, shot, check }) => {
  await page.addInitScript(() => {
    Math.random = () => 939.5 / 0xffffffff;
  });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(url("/rules"));
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem(
      "tableside/profile/v1",
      JSON.stringify({ onboarded: true, coach: "asked", games: ["blackjack"] }),
    );
  });
  await page.reload();
  await visible(page.getByRole("radio", { name: "No hole card", exact: true })).click();
  await visible(page.getByText("Saved on this device. No account, no upload.")).waitFor();
  await page.goto(url("/play"));
  await visible(page.getByRole("button", { name: "Deal", exact: true })).waitFor();
  await page.waitForTimeout(500);
  await visible(page.getByRole("button", { name: "Deal", exact: true })).click();
  await visible(page.getByRole("button", { name: "Double", exact: true })).waitFor();
  check(
    (await page.getByRole("img", { name: / of / }).filter({ visible: true }).count()) === 3,
    "European opening deal contains three face-up cards",
  );
  check(
    (await page.getByRole("img", { name: "Face-down card" }).filter({ visible: true }).count()) ===
      0,
    "dealer has no reserved hole card",
  );
  await shot("no-hole-card-before-double");
  await visible(page.getByRole("button", { name: "Double", exact: true })).click();
  await visible(page.getByText("You lose $20", { exact: true })).waitFor();
  check(
    await visible(
      page.getByText(/Only a player blackjack can push a dealer blackjack/),
    ).isVisible(),
    "the result explains why a drawn 21 loses to dealer blackjack",
  );
  check(
    await visible(page.getByRole("img", { name: "Jack of hearts" })).isVisible(),
    "player receives the fourth card when doubling",
  );
  check(
    await visible(page.getByRole("img", { name: "Ace of clubs" })).isVisible(),
    "dealer receives the fifth card and collects both wagers with blackjack",
  );
  await shot("no-hole-card-blackjack-collects-double");
};
