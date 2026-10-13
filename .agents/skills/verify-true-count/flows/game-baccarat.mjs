/* global document, innerWidth, getComputedStyle -- page.evaluate callbacks run in the browser */
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

  // Keyboard only: Enter on a spot adds a chip; Tab reaches its "Take a chip off" button
  // (long-press never fires from a keyboard on web, so it has a real button too).
  await spot("Banker").focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  check(
    (await spot("Banker").getAttribute("aria-label")).includes("$50 bet"),
    "keyboard: Enter twice put $50 on Banker",
  );
  await page.keyboard.press("Tab");
  check(
    (await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))) ===
      "Take a chip off Banker",
    "keyboard: Tab reaches the spot's remove button",
  );
  await page.keyboard.press("Enter");
  check(
    (await spot("Banker").getAttribute("aria-label")).includes("$25 bet"),
    "keyboard: Enter on remove took one $25 chip back",
  );
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  check(
    !(await spot("Banker").getAttribute("aria-label")).includes("bet"),
    "keyboard: second remove cleared the spot",
  );
  check(
    (await page.getByRole("button", { name: "Take a chip off Banker" }).count()) === 0,
    "remove button only shows on a spot with chips",
  );

  // The Deal button's accessible name is its visible label (WCAG 2.5.3).
  const dealButton = () => visible(page.getByRole("button", { name: /^Deal · \$[\d,.]+$/ }));

  // A deliberate mistake: Tie. The coach catches it before the deal.
  await spot("Tie").click();
  check(
    (await dealButton().innerText()).trim() === "Deal · $25" &&
      (await dealButton().getAttribute("aria-label")) === "Deal · $25",
    "Deal button: accessible name = visible label (Deal · $25)",
  );
  await dealButton().click();
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
  // The caught mistake still counts: recorded as wrong and coached, even though it was taken back.
  const coached = await page
    .waitForFunction(() => {
      const raw = localStorage.getItem("tableside/progress/v1");
      const d = raw ? (JSON.parse(raw).decisions ?? []) : [];
      return d.find((x) => x.game === "baccarat") ?? null;
    })
    .then((h) => h.jsonValue());
  check(
    coached.category === "bet-choice" && coached.correct === false && coached.coached === true,
    `taken-back Tie recorded as a coached mistake (${JSON.stringify(coached)})`,
  );

  // Undo still works while a caught note is open (the mistake is already recorded once).
  await spot("Tie").click();
  await dealButton().click();
  await note.waitFor();
  await visible(page.getByRole("button", { name: "Undo" })).click();
  await note.waitFor({ state: "detached" });
  check(
    !(await spot("Tie").getAttribute("aria-label")).includes("bet"),
    "Undo with the caught note open lifted the Tie and dismissed the note",
  );
  const baccaratDecisions = () =>
    page.evaluate(
      () =>
        (JSON.parse(localStorage.getItem("tableside/progress/v1") ?? "{}").decisions ?? []).filter(
          (x) => x.game === "baccarat",
        ).length,
    );
  check((await baccaratDecisions()) === 1, "the repeated Tie mistake was not counted twice");

  // Round 1: $50 on Banker (two $25 chips).
  await spot("Banker").click();
  await spot("Banker").click();
  check(
    (await spot("Banker").getAttribute("aria-label")).includes("$50 bet"),
    "two $25 chips: $50 on Banker",
  );
  await visible(page.getByLabel("Practice bankroll $1,950")).waitFor();
  check(true, "chips on the layout leave the bankroll: $1,950");
  await dealButton().click();
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

  // The bankroll is the progress store's: it survives a reload (seed 7 starts the same shoe again).
  await page.reload({ waitUntil: "networkidle" });
  await visible(page.getByLabel(`Practice bankroll ${money(expected)}`)).waitFor();
  check(true, `bankroll persisted across reload: ${money(expected)}`);

  // Seed 7 deals Tie, Player, Tie, Player 7–1, Banker 8–3. Burn the first two coups, then a
  // winning payout turns the bankroll green (gu3Mf).
  const amountColor = () =>
    visible(page.getByLabel(/^Practice bankroll /)).evaluate(
      (e) => getComputedStyle(e.lastElementChild).color,
    );
  const playCoup = async (side) => {
    await spot(side).click();
    await spot(side).click();
    await dealButton().click();
    await visible(page.getByRole("button", { name: "Next hand" })).waitFor({ timeout: 8000 });
    return outcome();
  };
  for (const side of ["Banker", "Banker", "Player"]) {
    const result = await playCoup(side);
    expected += side === "Banker" ? bankerNet(result) : 0; // coup 3 is a tie: Player pushes
    log(`${side}: ${result}`);
    if ((await amountColor()) === "rgb(63, 168, 119)") check(false, "green only after a win");
    await visible(page.getByRole("button", { name: "Next hand" })).click();
  }
  const win = await playCoup("Player");
  check(win === "Player wins 7 over 1", `coup 4: ${win}`);
  expected += 50;
  check(
    (await bankrollLabel()) === `Practice bankroll ${money(expected)}`,
    `winning payout: ${money(expected)}`,
  );
  check((await amountColor()) === "rgb(63, 168, 119)", "bankroll shows --correct after a win");
  await shot("payout-win-green");
  await visible(page.getByRole("button", { name: "Next hand" })).click();
  check((await amountColor()) === "rgb(212, 174, 98)", "back to gold when betting");

  // Leaving mid-coup settles the hand (coup 5: Banker 8–3), it is never refunded.
  await spot("Banker").click();
  await spot("Banker").click();
  await dealButton().click();
  await visible(page.getByRole("progressbar", { name: /Step 2 of 4: Deal/ })).waitFor();
  await page.goto(url("/lobby"), { waitUntil: "networkidle" });
  expected += 47.5;
  await page.goto(url("/games/baccarat?seed=7"), { waitUntil: "networkidle" });
  await visible(page.getByLabel(`Practice bankroll ${money(expected)}`)).waitFor();
  check(true, `left mid-coup: the Banker win was still recorded (${money(expected)})`);
  const hands = await page.evaluate(
    () =>
      (JSON.parse(localStorage.getItem("tableside/progress/v1") ?? "{}").hands ?? []).filter(
        (h) => h.game === "baccarat",
      ).length,
  );
  check(hands === 7, `seven coups recorded once each (${hands})`);

  check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
};
