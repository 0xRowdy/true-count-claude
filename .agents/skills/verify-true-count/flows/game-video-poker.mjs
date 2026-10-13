/* global document, innerWidth, localStorage -- page.evaluate callbacks run in the browser */
// Video Poker (/games/video-poker, frame xfJEh). Proves, with ?seed=1981: two full hands through
// Bet → Hold & draw → Result → Payout; a deliberately worse hold (the pair of 9s over four
// hearts) is stopped by the coach's mistake note *before* the draw, with the cards on screen,
// and "Hold the better cards" takes it back; the hint (asked for) applies its holds; the
// bankroll and the LAST strip update after each hand; both holds are recorded into progress;
// the rules sheet switches machine between hands; nothing scrolls sideways at 390.
const visible = (loc) => loc.filter({ visible: true }).first();
const money = (n) => `$${n.toLocaleString("en-US")}`;

export default async ({ page, url, shot, log, check }) => {
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 390, height: 1000 });

  // Coach "On mistakes" (the default), fresh progress.
  await page.goto(url("/lobby"));
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem(
      "tableside/profile/v1",
      JSON.stringify({ onboarded: true, coach: "mistakes" }),
    );
  });
  const res = await page.goto(url("/games/video-poker?seed=1981"), { waitUntil: "networkidle" });
  check(res?.ok(), `/games/video-poker served (HTTP ${res?.status()})`);

  const bankroll = async () =>
    visible(page.getByLabel(/^Practice bankroll /)).getAttribute("aria-label");
  const step = async () => visible(page.getByRole("progressbar")).getAttribute("aria-label");

  await visible(page.getByLabel("Practice bankroll $2,000")).waitFor();
  check((await step()) === "Step 1 of 4: Bet", "Bet phase");
  check(
    await visible(page.getByText("9/6 Jacks or Better · 5 coins × $1")).isVisible(),
    "machine subtitle",
  );
  check(await visible(page.getByText("BET 5", { exact: true })).isVisible(), "BET 5");
  await shot("bet");

  // Hand 1: a deliberate mistake.
  await visible(page.getByRole("button", { name: "Deal, bet $5" })).click();
  await visible(page.getByText("Dealt: pair of 9s, four hearts")).waitFor();
  // The deal animation turns the cards over one by one (normal speed).
  await visible(page.getByRole("img", { name: "5 of hearts" })).waitFor();
  check((await step()) === "Step 2 of 4: Hold & draw", "Hold & draw phase");
  check((await bankroll()) === "Practice bankroll $1,995", "the $5 stake is in the machine");
  check(
    (await page.getByText("KEEP", { exact: true }).filter({ visible: true }).count()) === 0,
    "no hint unasked",
  );
  await visible(page.getByRole("button", { name: "Hold 9 of spades" })).click();
  await visible(page.getByRole("button", { name: "Hold 9 of hearts" })).click();
  check(
    (await visible(page.getByRole("button", { name: "Hold 9 of hearts" })).getAttribute(
      "aria-pressed",
    )) === "true",
    "9♥ held",
  );
  await visible(page.getByRole("button", { name: "Draw" })).click();
  const note = visible(page.getByRole("note", { name: /^Coach note: / }));
  await note.waitFor();
  check(
    (await note.getAttribute("aria-label")) ===
      "Coach note: Keep the four hearts. Let the pair of 9s go.",
    "mistake note names the better hold",
  );
  check(await visible(page.getByText(/^BETTER HOLD · 9\/6 JACKS OR BETTER$/)).isVisible(), "tag");
  check(
    (await page.getByText("KEEP", { exact: true }).filter({ visible: true }).count()) === 4,
    "KEEP tags on the four hearts",
  );
  check(
    await visible(page.getByRole("img", { name: "9 of spades" })).isVisible(),
    "the dealt cards are still on screen (not drawn yet)",
  );
  check((await step()) === "Step 2 of 4: Hold & draw", "still before the draw");
  await shot("mistake-note");
  await visible(page.getByRole("button", { name: "Hold the better cards" })).click();
  await visible(page.getByText("DECISIONS THIS HAND")).waitFor();
  check((await step()) === "Step 3 of 4: Result", "Result phase");
  check(
    await visible(page.getByText("Hold: a low pair, taken back.")).isVisible(),
    "decision: taken back, counted as a miss",
  );
  const headline1 = await visible(page.getByRole("status")).getAttribute("aria-label");
  log(`hand 1: ${headline1}`);
  await shot("result-1");
  await visible(page.getByRole("button", { name: /^Deal speed: normal/ })).click();
  check(
    await visible(page.getByRole("button", { name: /^Deal speed: fast/ })).isVisible(),
    "Speed toggles the deal animation to fast",
  );
  await visible(page.getByRole("button", { name: /^(Collect \$[\d,]+|Continue)$/ })).click();
  await visible(page.getByText("LAST", { exact: true })).waitFor();
  check((await step()) === "Step 4 of 4: Payout", "Payout phase");
  const last1 = await visible(page.getByRole("listitem", { name: /^Hand 1: / })).getAttribute(
    "aria-label",
  );
  const net1 = Number((last1.match(/[WLP] ([+-]?[\d.]+)/) ?? [])[1] ?? NaN);
  check(Number.isFinite(net1), `LAST shows hand 1 (${last1})`);
  check((await bankroll()) === `Practice bankroll ${money(2000 + net1)}`, `bankroll after hand 1`);
  await shot("payout-1");

  // Hand 2, at fast speed: ask for the hint and take it.
  await visible(page.getByRole("button", { name: "Deal again, bet $5" })).click();
  await visible(page.getByText(/^Dealt: /)).waitFor();
  await visible(page.getByRole("button", { name: "Ask Marcus for a hint" })).click();
  const hint = visible(page.getByText(/^HINT · 9\/6 JACKS OR BETTER$/));
  await hint.waitFor();
  check(
    (await page.getByText("KEEP", { exact: true }).filter({ visible: true }).count()) >= 1,
    "hint tags KEEP",
  );
  await visible(page.getByRole("button", { name: "Show the math" })).click();
  check(
    await visible(page.getByLabel("Holds ranked by expected return")).isVisible(),
    "math table",
  );
  await visible(
    page.getByRole("button", { name: /^(Hold these \d|Hold this 1|Hold all 5|Draw five new)$/ }),
  ).click();
  await visible(page.getByRole("button", { name: "Draw" })).click();
  await visible(page.getByText("DECISIONS THIS HAND")).waitFor();
  check(await visible(page.getByText(/The best play\.$/)).isVisible(), "hand 2: the best play");
  await visible(page.getByRole("button", { name: /^(Collect \$[\d,]+|Continue)$/ })).click();
  const last2 = await visible(page.getByRole("listitem", { name: /^Hand 2: / })).getAttribute(
    "aria-label",
  );
  const net2 = Number((last2.match(/[WLP] ([+-]?[\d.]+)/) ?? [])[1] ?? NaN);
  check(
    (await page
      .getByRole("listitem", { name: /^Hand \d: / })
      .filter({ visible: true })
      .count()) === 2,
    `LAST shows both hands (${last2})`,
  );
  check(
    (await bankroll()) === `Practice bankroll ${money(2000 + net1 + net2)}`,
    "bankroll after hand 2",
  );
  await shot("payout-2");

  // Recorded into progress: two video poker holds (one miss) and two hands.
  await page.waitForTimeout(300);
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("tableside/progress/v1") ?? "{}"),
  );
  const decisions = (stored.decisions ?? []).filter((d) => d.game === "video-poker");
  const hands = (stored.hands ?? []).filter((h) => h.game === "video-poker");
  check(
    decisions.length === 2 &&
      decisions[0].correct === false &&
      decisions[0].coached === true &&
      decisions[0].category === "flush-draws" &&
      decisions[1].correct === true,
    `progress decisions ${JSON.stringify(decisions.map((d) => [d.category, d.correct, d.coached]))}`,
  );
  check(hands.length === 2, `progress hands: ${hands.map((h) => h.net).join(", ")}`);

  // Rules sheet: switch machine between hands.
  await visible(page.getByRole("button", { name: "Rules and pay tables" })).click();
  await visible(page.getByRole("dialog", { name: "Rules and pay tables" })).waitFor();
  check(await visible(page.getByText(/house edge 0\.46%/)).isVisible(), "house edge shown");
  await shot("rules");
  await visible(page.getByRole("radio", { name: "Full Pay Deuces Wild" })).click();
  await visible(page.getByRole("button", { name: "Close rules" })).click();
  check(
    await visible(page.getByText("Full Pay Deuces Wild · 5 coins × $1")).isVisible(),
    "switched to Deuces Wild",
  );
  check((await step()) === "Step 1 of 4: Bet", "back to Bet after switching");
  await visible(page.getByRole("radio", { name: "1 coin" })).click();
  await visible(page.getByRole("radio", { name: "25¢" })).click();
  check(await visible(page.getByText("BET 1", { exact: true })).isVisible(), "BET 1");
  check(
    await visible(page.getByRole("button", { name: "Deal, bet $0.25" })).isVisible(),
    "Deal shows the $0.25 bet",
  );

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(overflow <= 0, `no horizontal page scroll at 390 wide (overflow ${overflow}px)`);
  await shot("bet-deuces");
  check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
};
