/* global document, getComputedStyle, innerWidth -- page.evaluate callbacks run in the browser */
// Design system: the /design-system sheet renders every Tableside component with the real fonts.
// Proves: tokens + components render (by role and accessible name), Fraunces and Inter are
// actually loaded and applied (not a fallback face), a chip in the rack can be selected, the
// App Header links follow the route map, and the page fits a phone without sideways scrolling.
const visible = (loc) => loc.filter({ visible: true }).first();

export default async ({ page, url, shot, log, check }) => {
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));

  // Tall viewport: the sheet scrolls inside a React Native ScrollView, not the document.
  await page.setViewportSize({ width: 1440, height: 2400 });
  const res = await page.goto(url("/design-system"), { waitUntil: "networkidle" });
  check(res?.ok(), `/design-system served (HTTP ${res?.status()})`);
  await visible(page.getByRole("heading", { name: "Tableside", exact: true })).waitFor();

  // Fonts: every Fraunces/Inter face is registered and loaded, and the title really uses one.
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() => {
    const faces = [...document.fonts].map((f) => ({ family: f.family, status: f.status }));
    return {
      faces,
      fraunces: document.fonts.check('56px "Fraunces_600SemiBold"'),
      inter: document.fonts.check('16px "Inter_400Regular"'),
    };
  });
  for (const fam of ["Fraunces", "Inter"]) {
    const mine = fonts.faces.filter((f) => f.family.replace(/"/g, "").startsWith(fam));
    log(`${fam}: ${mine.map((f) => `${f.family}=${f.status}`).join(", ")}`);
    check(mine.length > 0 && mine.every((f) => f.status === "loaded"), `${fam} faces loaded`);
  }
  check(fonts.fraunces && fonts.inter, "document.fonts.check passes for Fraunces and Inter");
  const titleFont = await visible(
    page.getByRole("heading", { name: "Tableside", exact: true }),
  ).evaluate((el) => getComputedStyle(el).fontFamily);
  check(/Fraunces_600SemiBold/.test(titleFont), `title set in Fraunces (${titleFont})`);
  const buttonFont = await visible(page.getByRole("button", { name: "Primary" }))
    .locator("div[dir=auto]")
    .first()
    .evaluate((el) => getComputedStyle(el).fontFamily);
  check(/Inter_600SemiBold/.test(buttonFont), `button label set in Inter (${buttonFont})`);

  // Components, by role and name.
  for (const name of ["Primary", "Secondary", "Ghost", "Table"])
    check(await visible(page.getByRole("button", { name })).isVisible(), `Button/${name}`);
  check(await visible(page.getByText("Badge", { exact: true })).isVisible(), "Badge");
  for (const name of ["Ace of spades", "King of hearts", "10 of diamonds", "7 of clubs"])
    check(await visible(page.getByRole("img", { name })).isVisible(), `Playing card: ${name}`);
  check(await visible(page.getByRole("img", { name: "Face-down card" })).isVisible(), "Card back");
  for (const v of ["$1", "$5", "$25", "$100", "$500", "$1,000"])
    check(await visible(page.getByRole("img", { name: `${v} chip` })).isVisible(), `Chip ${v}`);
  check(await visible(page.getByText("PASS LINE", { exact: true })).isVisible(), "Bet spot");
  check(
    await visible(page.getByRole("button", { name: "Hit", exact: true })).isVisible(),
    "Coach note (hint) actions",
  );
  check(
    await visible(page.getByRole("button", { name: "Take it back & double" })).isVisible(),
    "Coach note (mistake) actions",
  );
  check(await visible(page.getByText("94.2%", { exact: true })).isVisible(), "Stat card");
  check(await visible(page.getByText("Hi-Lo with Illustrious 18")).isVisible(), "Strategy card");
  check(
    await visible(page.getByRole("button", { name: "Back", exact: true })).isVisible(),
    "Table top bar",
  );
  check(
    await visible(page.getByRole("progressbar", { name: "Step 1 of 4: Bet" })).isVisible(),
    "Phase stepper",
  );
  check(await visible(page.getByText(/^\$25 selected/)).isVisible(), "Chip rack caption");

  // App Header: nav links follow the route map; the active item is marked current.
  const hrefs = {
    Lobby: "/lobby",
    Trainer: "/drills",
    Strategies: "/strategies",
    "Live tables": "/live",
    Progress: "/progress",
  };
  for (const [name, href] of Object.entries(hrefs)) {
    const link = visible(page.getByRole("link", { name, exact: true }));
    check((await link.getAttribute("href")) === href, `nav "${name}" → ${href}`);
  }
  check(
    (await visible(page.getByRole("link", { name: "Lobby", exact: true })).getAttribute(
      "aria-current",
    )) === "page",
    "active nav item is aria-current=page",
  );
  check(await visible(page.getByText("12,450 practice chips")).isVisible(), "practice chip pill");
  await shot("sheet-1440");

  // The whole sheet at the design's 2180 width, for side-by-side with frame bi8Au.
  await page.setViewportSize({ width: 2180, height: 4200 });
  await page.waitForTimeout(300);
  await shot("sheet-2180");
  await page.setViewportSize({ width: 1440, height: 2400 });

  // Interaction: pick the $100 chip; the rack caption follows.
  await visible(page.getByRole("radio", { name: "$100 chip" })).click();
  await visible(page.getByText(/^\$100 selected/)).waitFor();
  check(
    (await visible(page.getByRole("radio", { name: "$100 chip" })).getAttribute("aria-checked")) ===
      "true",
    "tapping a chip selects it",
  );
  await visible(page.getByRole("checkbox", { name: "Roulette" })).click();
  check(
    (await visible(page.getByRole("checkbox", { name: "Roulette" })).getAttribute(
      "aria-checked",
    )) === "true",
    "toggle chip toggles on",
  );

  // Phone width: nothing scrolls sideways.
  await page.setViewportSize({ width: 390, height: 2400 });
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(overflow <= 0, `no horizontal page scroll at 390 wide (overflow ${overflow}px)`);
  await shot("sheet-390");

  check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
};
