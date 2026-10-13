/* global document, innerWidth -- page.evaluate callbacks run in the browser */
// Baccarat table (/games/baccarat, frame gu3Mf). Proves: with a fixed ?seed the table plays full
// coups through Bet → Deal → Result → Payout; the coach (default "mistakes") catches a Tie bet
// before the deal and takes it back; the practice bankroll settles each coup (Banker pays 0.95:1)
// and survives a reload; the bead road records every coup with the latest bead ringed; the draws
// are explained on request; the rules sheet shows exact house edges and the shoe's composition
// check; nothing scrolls sideways at 390 wide.
const visible = (loc) => loc.filter({ visible: true }).first();

const money = (n) => {
  const abs = Math.abs(n);
  const text = Number.isInteger(abs)
    ? String(abs)
    : `${Math.trunc(abs)}.${abs.toFixed(2).split(".")[1]}`;
  return `$${text.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
};

/** The net of a coup for a $50 Banker bet, from the outcome line. */
const bankerNet = (outcome) =>
  outcome.startsWith("Banker wins") ? 47.5 : outcome.startsWith("Tie at") ? 0 : -50;

export default async ({ page, url, shot, log, check }) => {
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 390, height: 1400 });

  const res = await page.goto(url("/games/baccarat?seed=7"), { waitUntil: "networkidle" });
  check(res?.ok(), `/games/baccarat served (HTTP ${res?.status()})`);
  const bankrollLabel = () =>
    visible(page.getByLabel(/^Practice bankroll /)).getAttribute("aria-label");
  await visible(page.getByLabel("Practice bankroll $2,000")).waitFor();
  check(true, "fresh practice bankroll: $2,000");
  check(
    await visible(page.getByText("Punto Banco · 8 decks · 5% commission")).isVisible(),
    "rules line from the engine",
  );
  check(await visible(page.getByText("BEAD ROAD · THIS SHOE")).isVisible(), "bead road header");
  check(
    (await visible(page.getByRole("progressbar")).getAttribute("aria-label")) ===
      "Step 1 of 4: Bet",
    "phase: Bet",
  );

  const spot = (name) => visible(page.getByRole("button", { name: new RegExp(`^${name}, pays`) }));
  const outcome = () => visible(page.getByTestId("outcome")).innerText();

  // A deliberate mistake: Tie. The coach catches it before the deal.
  await spot("Tie").click();
  await visible(page.getByRole("button", { name: "Deal" })).click();
  const note = visible(page.getByRole("note", { name: /Tie carries a 14\.36% house edge/ }));
  await note.waitFor();
  check(
    await visible(page.getByText(/Tie pays 8:1, but it lands about 1 coup in 11/)).isVisible(),
    "mistake note explains the Tie's edge (engine copy)",
  );
  await shot("mistake-caught");
  await visible(page.getByRole("button", { name: "Take it back" })).click();
  await note.waitFor({ state: "detached" });
  check(
    !(await spot("Tie").getAttribute("aria-label")).includes("bet"),
    "Take it back lifted the Tie bet",
  );
  check(
    (await visible(page.getByRole("progressbar")).getAttribute("aria-label")) ===
      "Step 1 of 4: Bet",
    "still betting after the take-back",
  );

  // Round 1: $50 on Banker (two $25 chips).
  await spot("Banker").click();
  await spot("Banker").click();
  check(
    (await spot("Banker").getAttribute("aria-label")).includes("$50 bet"),
    "two $25 chips: $50 on Banker",
  );
  await visible(page.getByLabel("Practice bankroll $1,950")).waitFor();
  check(true, "chips on the layout leave the bankroll: $1,950");
  await visible(page.getByRole("button", { name: "Deal" })).click();
  await visible(page.getByRole("progressbar", { name: /Step 2 of 4: Deal/ })).waitFor();
  check(true, "phase: Deal");
  await shot("dealing");
  await visible(page.getByRole("progressbar", { name: /Step 3 of 4: Result/ })).waitFor();
  check(true, "phase: Result");
  await visible(page.getByRole("button", { name: "Next hand" })).waitFor({ timeout: 8000 });
  check(
    (await visible(page.getByRole("progressbar")).getAttribute("aria-label")) ===
      "Step 4 of 4: Payout",
    "phase: Payout",
  );
  const first = await outcome();
  log(`coup 1: ${first}`);
  check(/^(Player wins \d over \d|Banker wins \d over \d|Tie at \d)$/.test(first), "result line");
  const cards = await page.getByRole("img", { name: / of / }).filter({ visible: true }).count();
  check(cards >= 4 && cards <= 6, `4–6 cards dealt (${cards})`);
  let expected = 2000 + bankerNet(first);
  check(
    (await bankrollLabel()) === `Practice bankroll ${money(expected)}`,
    `bankroll settled: ${money(expected)}`,
  );
  check(
    await visible(page.getByText("Good to know before your trip")).isVisible(),
    "payout coach note",
  );
  const legend1 = await visible(page.getByRole("img", { name: /^Bead road:/ })).getAttribute(
    "aria-label",
  );
  log(legend1);
  check(/Player \d, Banker \d, Tie \d/.test(legend1), "bead road records the coup");
  check((await page.getByTestId("latest-bead").count()) === 1, "latest bead ringed");

  // The draws, explained on request.
  await visible(page.getByRole("button", { name: "Why these draws?" })).click();
  await visible(page.getByText(/(Player has \d|natural|Both hands)/)).waitFor();
  check(true, "draws explained (engine explainDraws)");
  await shot("payout-explained");

  // Round 2: Rebet $50 deals the same bet again.
  await visible(page.getByRole("button", { name: "Rebet $50" })).click();
  await visible(page.getByRole("button", { name: "Next hand" })).waitFor({ timeout: 8000 });
  const second = await outcome();
  log(`coup 2: ${second}`);
  expected += bankerNet(second);
  check(
    (await bankrollLabel()) === `Practice bankroll ${money(expected)}`,
    `bankroll after coup 2: ${money(expected)}`,
  );
  const legend2 = await visible(page.getByRole("img", { name: /^Bead road:/ })).getAttribute(
    "aria-label",
  );
  const total = (legend2.match(/\d+/g) ?? []).slice(0, 3).reduce((a, b) => a + Number(b), 0);
  check(total === 2, `bead road holds 2 coups (${legend2})`);
  await shot("payout-2");

  // Big road toggle.
  await visible(page.getByRole("button", { name: "Show the big road" })).click();
  await visible(page.getByText("BIG ROAD · THIS SHOE")).waitFor();
  await visible(page.getByRole("button", { name: "Show the bead road" })).click();

  // Next hand clears the felt.
  await visible(page.getByRole("button", { name: "Next hand" })).click();
  await visible(page.getByText("Place your bets")).waitFor();
  check(true, "next hand: back to betting");

  // Rules sheet: exact edges, the shoe's composition check, the link to Shoe Integrity.
  await visible(page.getByRole("button", { name: "Rules and payouts" })).click();
  await visible(page.getByText("Rules & payouts")).waitFor();
  check(await visible(page.getByText("1.06%")).isVisible(), "Banker edge 1.06%");
  check(await visible(page.getByText("1.24%")).isVisible(), "Player edge 1.24%");
  check(
    await visible(page.getByText(/^Composition check passed/)).isVisible(),
    "shoe composition check",
  );
  check(
    (await visible(page.getByRole("link", { name: "How we prove a shoe is fair" })).getAttribute(
      "href",
    )) === "/shoe-integrity",
    "links to Shoe Integrity",
  );
  await page.waitForTimeout(500); // the sheet fades in
  await shot("rules-sheet");
  await visible(page.getByRole("button", { name: "Close", exact: true })).click();

  // Phone width: no sideways scroll.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(overflow <= 0, `no horizontal page scroll at 390 wide (overflow ${overflow}px)`);

  // The bankroll is the progress store's: it survives a reload.
  await page.reload({ waitUntil: "networkidle" });
  await visible(page.getByLabel(`Practice bankroll ${money(expected)}`)).waitFor();
  check(true, `bankroll persisted across reload: ${money(expected)}`);

  check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
};
