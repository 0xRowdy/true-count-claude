/* global document */
const pages = [
  ["/session", "Statistics"],
  ["/drills", "Drills"],
  ["/drills/basic-strategy", "Basic Strategy"],
  ["/drills/counting", "Counting"],
  ["/drills/true-count", "True Count"],
  ["/drills/deviation", "Deviations"],
  ["/rules", "Your table"],
  ["/shoe-integrity", "Shoe Integrity"],
];

export default async ({ page, url, shot, check }) => {
  for (const width of [360, 429, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [route, title] of pages) {
      await page.goto(url(route));
      const heading = page
        .getByRole("heading", { name: title, exact: true })
        .filter({ visible: true });
      await heading.waitFor();
      await page.evaluate(() => document.fonts.ready);
      const bounds = await heading.boundingBox();
      const action = await page
        .getByRole("button", { name: "Report a bug", exact: true })
        .filter({ visible: true })
        .boundingBox();
      check(
        bounds.width >= Math.min(width * 0.7, 500),
        `${width}px ${title}: readable title width`,
      );
      check(action.y + action.height <= 900, `${width}px ${title}: header controls above the fold`);
      check(action.x >= 0 && action.x + action.width <= width, `${width}px ${title}: controls fit`);
      if (width === 429 || (width === 1280 && route === "/session")) {
        await shot(`${width}-${route.slice(1).replaceAll("/", "-")}`);
      }
    }
  }
};
