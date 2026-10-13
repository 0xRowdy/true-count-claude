// Route discovery for flows: every route the web build actually has, read from expo-router's
// own sitemap (`/_sitemap`, generated from `app/`), so a flow that must cover "every route"
// never depends on a hand-kept list that a new screen forgets to join.
const IGNORED = new Set(["/_sitemap"]);

/** Returns the build's routes, sorted, e.g. ["/", "/drills", "/drills/counting", …]. */
export async function discoverRoutes(page, url) {
  const res = await page.goto(url("/_sitemap"), { waitUntil: "networkidle" });
  if (!res?.ok()) throw new Error(`/_sitemap not served (HTTP ${res?.status()})`);
  const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
  const routes = [...new Set(hrefs.filter((h) => h?.startsWith("/") && !IGNORED.has(h)))].sort();
  if (routes.length < 2 || !routes.includes("/"))
    throw new Error(`/_sitemap listed no routes: ${JSON.stringify(hrefs)}`);
  return routes;
}

/** expo-router's fallback screen, which a client-side navigation to an unknown path renders. */
export const NOT_FOUND = /Unmatched Route|Page could not be found/;
