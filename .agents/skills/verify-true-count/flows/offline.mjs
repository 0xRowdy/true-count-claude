// The first online visit caches every route. A new offline visit can train and keep progress.
const visible = (loc) => loc.filter({ visible: true }).first();

export default async ({ page, url, shot, check }) => {
  await page.goto(url("/lobby"), { waitUntil: "networkidle" });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  check(true, "the complete export is installed for offline use");
  await page.context().setOffline(true);
  try {
    // This route was never visited online; it must come from the install cache.
    await page.goto(url("/drills/true-count"), { waitUntil: "networkidle" });
    await visible(page.getByText(/^Question 1$/)).waitFor();
    await page.keyboard.type("2");
    await visible(page.getByRole("button", { name: /^Answer: / })).click();
    await visible(page.getByRole("button", { name: "Next question" })).waitFor();
    check(true, "a never-visited drill loads and grades an answer offline");
    await shot("offline-graded");
    await page.waitForFunction(() =>
      Object.keys(localStorage).some(
        (key) =>
          key.startsWith("truecount/v1/session/") &&
          localStorage.getItem(key)?.includes("true-count"),
      ),
    );
    const sessions = await page.evaluate(() =>
      Object.fromEntries(
        Object.entries(localStorage).filter(([key]) => key.startsWith("truecount/v1/session/")),
      ),
    );
    await page.goto(url("/session"), { waitUntil: "networkidle" });
    await page.reload({ waitUntil: "networkidle" });
    check(
      await page.evaluate(
        (saved) =>
          Object.entries(saved).every(([key, value]) => localStorage.getItem(key) === value),
        sessions,
      ),
      "the recorded answer survives an offline full reload",
    );
    for (const route of [
      "/play",
      "/play/",
      "/rules",
      "/games/roulette",
      "/games/craps",
      "/games/baccarat",
      "/games/video-poker",
    ]) {
      const response = await page.goto(url(route), { waitUntil: "networkidle" });
      check(
        response?.status() === 200 && (await page.locator("body").innerText()).length > 100,
        `${route} opens offline`,
      );
    }
    await shot("offline-video-poker");
  } finally {
    await page.context().setOffline(false);
  }
};
