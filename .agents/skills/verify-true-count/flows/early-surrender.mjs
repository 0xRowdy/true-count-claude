// Session seed 3557 deals K, dealer 10, 6, dealer A from the default six-deck shoe.
// The user must be able to surrender before that natural ends the round.
const visible = (locator) => locator.filter({ visible: true }).first();

export default async ({ page, url, shot, check }) => {
  await page.addInitScript(() => {
    Math.random = () => 3557.5 / 0xffffffff;
  });
  for (const [width, action, loss] of [
    [390, "Surrender", 5],
    [1440, "Double", 10],
  ]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(url("/rules"));
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem(
        "tableside/profile/v1",
        JSON.stringify({ onboarded: true, coach: "asked", games: ["blackjack"] }),
      );
    });
    await page.reload();
    await visible(page.getByRole("radio", { name: "Early", exact: true })).click();
    await visible(page.getByText("Saved on this device. No account, no upload.")).waitFor();
    await page.goto(url("/play"));
    await visible(page.getByRole("button", { name: "Deal", exact: true })).waitFor();
    await page.waitForTimeout(500);
    await visible(page.getByRole("button", { name: "Deal", exact: true })).click();
    await visible(page.getByText(/^Early surrender keeps half your bet/)).waitFor();
    check(
      await visible(page.getByRole("button", { name: "Surrender", exact: true })).isVisible(),
      `${width}px: surrender is available before the dealer reveals blackjack`,
    );
    await shot(`early-surrender-offer-${width}`);
    await visible(page.getByRole("button", { name: action, exact: true })).click();
    await visible(page.getByText(`You lose $${loss}`, { exact: true })).waitFor();
    check(
      await visible(page.getByRole("img", { name: "Ace of clubs", exact: true })).isVisible(),
      `${width}px: dealer reveals the seeded natural`,
    );
    check(
      (await page.getByRole("img", { name: / of / }).filter({ visible: true }).count()) === 4,
      `${width}px: ${action.toLowerCase()} resolves without dealing another card`,
    );
    await shot(`early-surrender-result-${width}`);
  }
};
