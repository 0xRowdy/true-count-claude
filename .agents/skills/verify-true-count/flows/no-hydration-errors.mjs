// Hydration: load every route of the build fresh and fail if React reports a hydration mismatch.
// Proves: the static HTML from `expo export` matches the client render on each page (issue #32).
// Minified production React logs mismatches as error #418 (text), #423/#425 or "Hydration failed".
import { discoverRoutes } from "../scripts/routes.mjs";

// Routes come from the build's own sitemap, so every screen is covered the day it lands.
// These query variants render different first frames from their plain route.
const EXTRA = ["/lobby?demo=1", "/progress?demo=1"];
const HYDRATION = /Minified React error #(418|423|425)|hydrat/i;

export default async ({ page, url, shot, log, check }) => {
  const ROUTES = [...(await discoverRoutes(page, url)), ...EXTRA];
  log(`routes (from /_sitemap): ${ROUTES.join(" ")}`);
  let errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));

  const failing = [];
  for (const route of ROUTES) {
    errors = [];
    const res = await page.goto(url(route), { waitUntil: "networkidle" });
    check(res?.ok(), `${route}: served (HTTP ${res?.status()})`); // a missing page would otherwise read as clean
    await page.waitForTimeout(500); // hydration errors are reported after the client's first render
    const hydration = errors.filter((e) => HYDRATION.test(e));
    log(
      `${route}: ${hydration.length ? `hydration mismatch\n  ${hydration.join("\n  ")}` : "clean"}`,
    );
    if (hydration.length) failing.push(route);
  }
  await shot("last-route");
  check(
    failing.length === 0,
    `no hydration mismatch on ${ROUTES.join(" ")}${failing.length ? ` (failing: ${failing.join(" ")})` : ""}`,
  );
};
