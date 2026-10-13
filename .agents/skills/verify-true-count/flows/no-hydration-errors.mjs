// Hydration: load every top-level route fresh and fail if React reports a hydration mismatch.
// Proves: the static HTML from `expo export` matches the client render on each page (issue #32).
// Minified production React logs mismatches as error #418 (text), #423/#425 or "Hydration failed".
const ROUTES = [
  "/",
  "/onboarding",
  "/pricing",
  "/play",
  "/drills",
  "/drills/basic-strategy",
  "/drills/counting",
  "/drills/true-count",
  "/drills/deviation",
  "/rules",
  "/shoe-integrity",
  "/session",
  "/design-system",
  "/live",
  "/live/craps",
  "/lobby",
  "/progress",
  "/progress?demo=1",
  "/strategies",
  "/strategies/blackjack",
  "/strategies/craps",
  "/strategies/roulette",
];
const HYDRATION = /Minified React error #(418|423|425)|hydrat/i;

export default async ({ page, url, shot, log, check }) => {
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
