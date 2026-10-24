// Exercise recovery in every game and export an actual in-progress blackjack reproduction.
import { readFile } from "node:fs/promises";

const visible = (loc) => loc.filter({ visible: true }).first();
const progressKey = "tableside/progress/v1";

export default async ({ page, url, shot, check }) => {
  await page.setViewportSize({ width: 390, height: 1050 });
  await page.addInitScript(() => {
    Math.random = () => 1.5 / 0xffffffff;
  });
  await page.goto(url("/lobby"));
  const saved = await page.evaluate(() => Object.entries(localStorage));
  try {
    await page.evaluate(() => {
      localStorage.setItem(
        "tableside/profile/v1",
        JSON.stringify({ onboarded: true, coach: "asked" }),
      );
    });
    await page.goto(url("/play"));
    const button = (name) =>
      visible(page.getByRole("button", { name, exact: typeof name === "string" }));
    await button("Deal").click();
    await button("Hit").click();
    await visible(page.getByRole("img", { name: "8 of hearts", exact: true })).waitFor();
    await button("Rules and strategy").click();
    await visible(page.getByRole("tab", { name: "Table", exact: true })).click();
    await button("Report a bug").click();
    await visible(page.getByRole("textbox", { name: "What went wrong" })).fill(
      "Recovery verification: preserve this exact hand.",
    );
    const preview = visible(page.getByText(/^\*\*True Count bug report\*\*/));
    const text = await preview.innerText();
    const report = JSON.parse(text.match(/```json\n([\s\S]*?)\n```/)[1]);
    check(
      report.shoe.seed === 920564995 && report.shoe.rebuildsFromSeed === true,
      "report exports the actual seeded shoe and verifies reconstruction",
    );
    check(
      report.round.replaysFromActions === true &&
        JSON.stringify(report.round.actions) === '["hit"]',
      "report replays the real hit action exactly",
    );
    check(
      JSON.stringify(report.round.playerHands[0]) === '["4s","2h","8h"]',
      "report captures the three cards currently on the table",
    );
    check(
      text.includes("createShoe(rules, 920564995)") && text.includes("Recovery verification:"),
      "preview includes the reproduction recipe and user note",
    );
    const downloading = page.waitForEvent("download");
    await button("Download report").click();
    const download = await downloading;
    check(
      (await readFile(await download.path(), "utf8")) === text,
      "download contains the exact previewed report, including seed and actions",
    );
    await page.waitForTimeout(350); // Let the report modal finish its fade before capture.
    await shot("current-hand-report");
    await page
      .getByRole("button", { name: "Close", exact: true })
      .filter({ visible: true })
      .last()
      .click();
    await button("Close").click();
    await button("Stand").click();
    await button(/^(Collect \$|Continue$)/).waitFor();
    await page.waitForFunction(() =>
      Object.entries(localStorage).some(
        ([key, value]) =>
          key.startsWith("truecount/v1/session/") && JSON.parse(value).data.rounds.length > 0,
      ),
    );
    const history = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((key) => key.startsWith("truecount/v1/session/"));
      const record = JSON.parse(localStorage.getItem(key));
      const before = {
        key,
        id: record.data.id,
        rounds: record.data.rounds,
        decisions: record.data.decisions,
      };
      record.data.bankroll = 0;
      localStorage.setItem(key, JSON.stringify(record));
      return before;
    });
    await page.reload();
    await button("Reset to $500").waitFor();
    await shot("blackjack-depleted");
    await button("Reset to $500").click();
    await button("Deal").waitFor();
    check(await button("Deal").isEnabled(), "blackjack one tap restores a playable $500 stack");
    await page.waitForFunction(
      ({ key }) => JSON.parse(localStorage.getItem(key)).data.bankroll === 500,
      history,
    );
    const restored = await page.evaluate(
      ({ key }) => JSON.parse(localStorage.getItem(key)).data,
      history,
    );
    check(
      restored.id === history.id &&
        JSON.stringify(restored.rounds) === JSON.stringify(history.rounds) &&
        JSON.stringify(restored.decisions) === JSON.stringify(history.decisions),
      "blackjack reset preserves the session, completed hand and decision history",
    );
    await button("Deal").click();
    await visible(page.getByRole("img", { name: / of / })).waitFor();
    check(true, "blackjack deals a new hand after recovery");

    for (const game of ["roulette", "craps", "baccarat", "video-poker"]) {
      // Leave the previous game before changing stored balances; pagehide settles its state.
      await page.goto(url("/lobby"), { waitUntil: "networkidle" });
      await page.evaluate(
        ({ key, game }) => {
          const state = JSON.parse(
            localStorage.getItem(key) ??
              '{"version":1,"decisions":[],"hands":[],"sessions":[],"bankrollBase":{}}',
          );
          const net = state.hands
            .filter((hand) => hand.game === game)
            .reduce((sum, hand) => sum + hand.net, 0);
          state.bankrollBase[game] = -2000 - net;
          localStorage.setItem(key, JSON.stringify(state));
        },
        { key: progressKey, game },
      );
      await page.goto(url(`/games/${game}?seed=${game === "craps" ? 337 : 7}`), {
        waitUntil: "networkidle",
      });
      await visible(page.getByLabel("Practice bankroll $0", { exact: true })).waitFor();
      const before = await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)),
        progressKey,
      );
      const reset =
        game === "craps"
          ? "Reset bankroll"
          : game === "video-poker"
            ? "Reset practice bankroll"
            : "Reset to $2,000";
      await button(reset).waitFor();
      await shot(`${game}-depleted`);
      await button(reset).click();
      await visible(page.getByLabel("Practice bankroll $2,000", { exact: true })).waitFor();
      await page.waitForFunction(
        ({ key, game }) => {
          const state = JSON.parse(localStorage.getItem(key));
          return (
            (state.bankrollBase[game] ?? 0) +
              state.hands
                .filter((hand) => hand.game === game)
                .reduce((sum, hand) => sum + hand.net, 0) ===
            0
          );
        },
        { key: progressKey, game },
      );
      const after = await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)),
        progressKey,
      );
      check(
        JSON.stringify(after.hands) === JSON.stringify(before.hands) &&
          JSON.stringify(after.decisions) === JSON.stringify(before.decisions),
        `${game}: one tap restores $2,000 without erasing hands or decisions`,
      );
      await page.reload();
      await visible(page.getByLabel("Practice bankroll $2,000", { exact: true })).waitFor();
      check(true, `${game}: recovered bankroll survives reload`);
      if (game === "roulette") {
        await button(/^RED,/).click();
        await button("Spin").click();
        await visible(page.getByLabel(/^Ball landed on /)).waitFor();
      } else if (game === "craps") {
        await button(/^Pass line/).click();
        await button("Come-out roll").click();
        await visible(page.getByRole("progressbar", { name: "Step 3 of 4: Result" })).waitFor();
      } else if (game === "baccarat") {
        await button(/^Banker, pays/).click();
        await button(/^Deal · \$/).click();
        await visible(page.getByRole("progressbar", { name: "Step 3 of 4: Result" })).waitFor();
      } else {
        await button(/^Deal, bet \$/).click();
        await visible(
          page.getByRole("progressbar", { name: "Step 2 of 4: Hold & draw" }),
        ).waitFor();
      }
      check(true, `${game}: a real round starts after bankroll recovery`);
      await shot(`${game}-playing-again`);
    }
  } catch (error) {
    await shot("before-cleanup-failure");
    throw error;
  } finally {
    // Only this flow's isolated browser context is touched, and preserve its starting data.
    await page.goto(url("/lobby"));
    await page.evaluate((entries) => {
      localStorage.clear();
      for (const [key, value] of entries) localStorage.setItem(key, value);
    }, saved);
  }
};
