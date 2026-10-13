/* global document, location */
// Navigation integrity: crawl every route at desktop (1440) and phone (390) width, collect every
// in-app link (lobby and landing game cards, the nav, strategy cards, live-table links, the
// footer, …), and fail if any of them leads to a 404 or expo-router's "Unmatched Route" screen.
// Routes come from the build's sitemap (scripts/routes.mjs), so a new screen is crawled the day
// it lands. Buttons that navigate with router.push are covered by src/ui/routes.test.ts.
import { discoverRoutes, NOT_FOUND } from "../scripts/routes.mjs";

const WIDTHS = [1440, 390];
/** Variants that render different links from the plain route (sample history). */
const EXTRA = ["/lobby?demo=1", "/progress?demo=1"];

export default async ({ page, url, shot, log, check }) => {
  const routes = await discoverRoutes(page, url);
  log(`sitemap: ${routes.length} routes — ${routes.join(" ")}`);
  const known = new Set(routes);

  // target path → first page that links to it
  const targets = new Map();
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [...routes, ...EXTRA]) {
      const res = await page.goto(url(route), { waitUntil: "networkidle" });
      check(res?.ok(), `${route} @${width}: served (HTTP ${res?.status()})`);
      const hrefs = await page.$$eval("a[href]", (as) =>
        as.map((a) => {
          const u = new URL(a.getAttribute("href"), location.href);
          return u.origin === location.origin ? u.pathname : null;
        }),
      );
      for (const href of hrefs) {
        if (!href || href.startsWith("/assets/") || href === "/_sitemap") continue;
        const path = href.length > 1 ? href.replace(/\/$/, "") : href;
        if (!targets.has(path)) targets.set(path, `${route} @${width}`);
      }
    }
  }
  log(`links found: ${targets.size} distinct targets`);

  const broken = [];
  for (const [path, from] of [...targets].sort()) {
    const res = await page.goto(url(path), { waitUntil: "networkidle" });
    const body = await page.evaluate(() => document.body.innerText);
    const ok = res?.ok() && known.has(path) && !NOT_FOUND.test(body);
    log(`${ok ? "ok  " : "BAD "} ${path} (linked from ${from}, HTTP ${res?.status()})`);
    if (!ok) broken.push(`${path} ← ${from}`);
  }
  if (broken.length) await shot("broken-link");

  // The fallback really is detected, so a clean run above means something. A separate tab, so
  // its intended 404 is not reported among this flow's console errors.
  const probe = await page.context().browser().newPage();
  const missing = await probe.goto(url("/no-such-route"), { waitUntil: "networkidle" });
  check(
    missing?.status() === 404 &&
      NOT_FOUND.test(await probe.evaluate(() => document.body.innerText)),
    "an unknown path is reported as not found (the check can fail)",
  );
  await probe.close();

  check(
    broken.length === 0,
    `every in-app link resolves${broken.length ? `; broken:\n  ${broken.join("\n  ")}` : ""}`,
  );
};
