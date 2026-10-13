/* global document -- page.evaluate callbacks run in the browser */
// Roulette table (/games/roulette, frame dBsVJ): two full rounds through Bet → Spin → Result →
// Payout with ?seed=, the bet loupe (long-press a number), chips on split lines, the bankroll
// and LAST strip updating, the wheel choice in the rules sheet, and the coach catching the
// American top line (the one bet the engine rates worse than the wheel's own edge).
const visible = (loc) => loc.filter({ visible: true }).first();
const money = (text) => Number(text.replace(/[^0-9.−-]/g, "").replace("−", "-"));

export default async ({ page, url, shot, log, check }) => {
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 390, height: 988 });
  const res = await page.goto(url("/games/roulette?seed=7"), { waitUntil: "networkidle" });
  check(res?.ok(), `/games/roulette served (HTTP ${res?.status()})`);

  const bankrollLabel = () =>
    visible(page.getByLabel(/^Practice bankroll /)).getAttribute("aria-label");
  await visible(page.getByLabel(/^Practice bankroll /)).waitFor();
  const start = money((await bankrollLabel()).replace("Practice bankroll", ""));
  log(`bankroll at start: ${start}`);
  check(start > 40, "a practice bankroll to bet with");
  check(
    await visible(page.getByText("European · single zero · $5–$1,000")).isVisible(),
    "rules subtitle",
  );
  check(await visible(page.getByText("No spins yet")).isVisible(), "empty LAST strip");
  check(
    await visible(
      page.getByText("$5 selected · long-press any number for the bet loupe"),
    ).isVisible(),
    "chip rack caption",
  );

  // Round 1: the design's layout, 17 straight · Red · 2nd dozen = $40.
  const n17 = () => visible(page.getByRole("button", { name: /^17 black/ }));
  await n17().click();
  await visible(page.getByRole("radio", { name: "$25 chip" })).click();
  await visible(page.getByRole("button", { name: /^RED,/ })).click();
  await visible(page.getByRole("radio", { name: "$5 chip" })).click();
  await visible(page.getByRole("button", { name: /^2nd 12,/ })).click();
  await visible(page.getByRole("button", { name: /^2nd 12,/ })).click();
  check(
    await visible(page.getByText("Total bet $40", { exact: true })).isVisible(),
    "Total bet $40",
  );
  check(
    await visible(page.getByText("17 straight · Red · 2nd dozen", { exact: true })).isVisible(),
    "bet summary line",
  );
  check(
    await visible(page.getByRole("button", { name: /^House edge 2\.7%/ })).isVisible(),
    "house edge pill",
  );

  // The bet loupe: long-press 17.
  await n17().click({ delay: 700 });
  const loupe = visible(page.getByRole("dialog", { name: "Bets touching 17" }));
  await loupe.waitFor();
  check(
    await visible(page.getByText("Tap to add $5 · hold to remove")).isVisible(),
    "loupe subtitle",
  );
  for (const name of [
    /^Straight 17, pays 35 to 1, \$5 bet/,
    /^Split 16 \| 17, pays 17 to 1/,
    /^Street 16 · 17 · 18, pays 11 to 1/,
  ])
    check(await visible(page.getByRole("button", { name })).isVisible(), `loupe option ${name}`);
  await shot("loupe");
  await visible(page.getByRole("button", { name: /^Split 16 \| 17/ })).click();
  check(
    await visible(
      page.getByRole("button", { name: /^Split 16 \| 17, pays 17 to 1, \$5 bet/ }),
    ).isVisible(),
    "split placed from the loupe",
  );
  await visible(page.getByRole("button", { name: "Close bet loupe" })).click();
  check(
    await visible(page.getByText("Total bet $45", { exact: true })).isVisible(),
    "Total bet $45 with the split",
  );
  check(
    await visible(
      page.getByText("17 straight · Red · 2nd dozen · 16 | 17 split", { exact: true }),
    ).isVisible(),
    "summary includes the split",
  );

  const playRound = async (n) => {
    await visible(page.getByRole("button", { name: "Spin", exact: true })).click();
    check(await visible(page.getByText("No more bets")).isVisible(), `round ${n}: spin phase`);
    await visible(page.getByLabel(/^Ball landed on /)).waitFor();
    const label = await visible(page.getByLabel(/^Ball landed on /)).getAttribute("aria-label");
    log(`round ${n}: ${label}`);
    const net = label.endsWith("$0") ? 0 : money(label.split(". ").pop());
    check(
      await visible(page.getByRole("progressbar", { name: /Step 3 of 4: Result/ })).isVisible(),
      `round ${n}: Result step`,
    );
    await shot(`round-${n}-result`);
    await visible(page.getByRole("button", { name: "Pay out" })).click();
    check(
      await visible(page.getByRole("progressbar", { name: /Step 4 of 4: Payout/ })).isVisible(),
      `round ${n}: Payout step`,
    );
    check(await visible(page.getByText(/^Bankroll \$/)).isVisible(), `round ${n}: bankroll line`);
    await shot(`round-${n}-payout`);
    await visible(page.getByRole("button", { name: "Next spin" })).click();
    check(
      await visible(page.getByRole("progressbar", { name: /Step 1 of 4: Bet/ })).isVisible(),
      `round ${n}: back to Bet`,
    );
    return net;
  };

  const net1 = await playRound(1);
  let bank = money((await bankrollLabel()).replace("Practice bankroll", ""));
  check(
    Math.abs(bank - (start + net1)) < 0.001,
    `bankroll ${start} ${net1 >= 0 ? "+" : ""}${net1} = ${bank}`,
  );
  check(
    (await page.getByRole("listitem").filter({ visible: true }).count()) >= 1,
    "LAST strip has the spin",
  );
  check(await visible(page.getByLabel(/^Latest: /)).isVisible(), "latest spin ringed in LAST");

  // Round 2: Rebet.
  await visible(page.getByRole("button", { name: "Rebet" })).click();
  check(
    await visible(page.getByText("Total bet $45", { exact: true })).isVisible(),
    "Rebet restores $45",
  );
  const net2 = await playRound(2);
  const bank2 = money((await bankrollLabel()).replace("Practice bankroll", ""));
  check(
    Math.abs(bank2 - (bank + net2)) < 0.001,
    `bankroll ${bank} ${net2 >= 0 ? "+" : ""}${net2} = ${bank2}`,
  );
  const pills = await page
    .getByLabel("Last spins")
    .filter({ visible: true })
    .first()
    .getByRole("listitem")
    .count();
  check(pills === 2, `LAST strip shows 2 spins (${pills})`);

  // Rules sheet: switch to the American wheel.
  await visible(page.getByRole("button", { name: "Rules and payouts" })).click();
  await visible(page.getByRole("dialog", { name: "Roulette rules and payouts" })).waitFor();
  await visible(page.getByRole("radio", { name: "American" })).click();
  check(await visible(page.getByText("7.89%")).isVisible(), "top line edge in the payout table");
  await shot("rules-american");
  await visible(page.getByRole("button", { name: "Done" })).click();
  check(
    await visible(page.getByText("American · double zero · $5–$1,000")).isVisible(),
    "American wheel subtitle",
  );
  check(
    await visible(page.getByRole("button", { name: /^00 green/ })).isVisible(),
    "00 on the layout",
  );

  // Coach (default "mistakes"): the top line is caught while the bet is on the felt.
  await visible(page.getByRole("button", { name: /^1 red/ })).click({ delay: 700 });
  await visible(page.getByRole("dialog", { name: "Bets touching 1" })).waitFor();
  await visible(page.getByRole("button", { name: /^Top line 0 · 00 · 1 · 2 · 3/ })).click();
  const note = visible(page.getByRole("note", { name: "Coach note: The top line costs 7.89%" }));
  await note.waitFor();
  check(await note.isVisible(), "coach catches the top line");
  await shot("coach-top-line");
  await visible(page.getByRole("button", { name: "Take it back" })).click();
  check(
    await visible(page.getByText("Total bet $0", { exact: true })).isVisible(),
    "Take it back removes the bet",
  );

  // The bankroll survives a reload (progress store).
  await page.reload({ waitUntil: "networkidle" });
  await visible(page.getByLabel(/^Practice bankroll /)).waitFor();
  const reloaded = money((await bankrollLabel()).replace("Practice bankroll", ""));
  check(Math.abs(reloaded - bank2) < 0.001, `bankroll persisted (${reloaded})`);

  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  check(width <= 390, `no sideways scroll at 390 (${width})`);
  check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
};
