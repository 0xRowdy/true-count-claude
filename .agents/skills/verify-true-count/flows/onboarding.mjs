/* global document -- page.evaluate callbacks run in the browser */
// Onboarding (/onboarding): walk all three steps, answer each, finish, and prove the answers
// persisted. Proves: Step n of 3 progress, skill → goal + games → trip date + name, the
// "Your starting point" panel follows the answers live, the coach-frequency control works,
// Back works, finishing marks the player onboarded and goes to /lobby, and a reload shows the
// same answers (stored locally, tableside/profile/v1).
const visible = (loc) => loc.filter({ visible: true }).first();
const checked = async (loc) => (await visible(loc).getAttribute("aria-checked")) === "true";

export default async ({ page, url, shot, check }) => {
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url("/onboarding"), { waitUntil: "networkidle" });

  // Step 1: skill.
  await visible(page.getByRole("progressbar", { name: "Step 1 of 3" })).waitFor();
  await visible(page.getByRole("radio", { name: "I play regularly" })).click();
  check(await checked(page.getByRole("radio", { name: "I play regularly" })), "skill chosen");
  await visible(page.getByRole("radio", { name: "I've played a few times" })).click();
  await shot("step-1");
  await visible(page.getByRole("button", { name: "Continue" })).click();

  // Step 2: goal and games (the design's frame aLrYu).
  await visible(page.getByRole("progressbar", { name: "Step 2 of 3" })).waitFor();
  check(
    await visible(page.getByText("Skill: I've played a few times")).isVisible(),
    "step 2 shows the step-1 answer",
  );
  await visible(page.getByRole("radio", { name: "Master strategy" })).click();
  await visible(page.getByText("Strategy, drilled until automatic")).waitFor();
  check(true, "panel title follows the goal (Master strategy)");
  await visible(page.getByRole("radio", { name: "Learn before a trip" })).click();
  await visible(page.getByText("Table-ready for your trip")).waitFor();
  await visible(page.getByRole("checkbox", { name: "Craps" })).click();
  check(await checked(page.getByRole("checkbox", { name: "Craps" })), "Craps toggled on");
  await visible(page.getByText("Craps · Pass line & odds")).waitFor();
  check(true, "panel adds the Craps lesson");
  await visible(page.getByRole("radio", { name: "Every decision" })).click();
  check(
    await checked(page.getByRole("radio", { name: "Every decision" })),
    "coach: every decision",
  );
  await visible(page.getByText("Coach on full guidance · eases off at 90%")).waitFor();
  check(true, "panel follows the coach level");
  await shot("step-2");

  // Back returns to step 1 with the answer kept; Continue twice reaches step 3.
  await visible(page.getByRole("button", { name: "Back" })).click();
  await visible(page.getByRole("progressbar", { name: "Step 1 of 3" })).waitFor();
  check(
    await checked(page.getByRole("radio", { name: "I've played a few times" })),
    "Back keeps step 1's answer",
  );
  await visible(page.getByRole("button", { name: "Continue" })).click();
  await visible(page.getByRole("button", { name: "Continue" })).click();

  // Step 3: trip date and name.
  await visible(page.getByRole("progressbar", { name: "Step 3 of 3" })).waitFor();
  await visible(page.getByRole("textbox", { name: "Trip date" })).fill("2030-02-30");
  check(
    await visible(page.getByText(/That isn't a calendar date/)).isVisible(),
    "an impossible date is rejected",
  );
  await visible(page.getByRole("textbox", { name: "Trip date" })).fill("2030-11-14");
  await visible(page.getByText(/^Trip on Nov 14 · \d+ days away$/)).waitFor();
  check(true, "panel counts down to the trip");
  await visible(page.getByRole("textbox", { name: "Your first name" })).fill("Sam");
  await visible(page.getByText("SAM'S STARTING POINT")).waitFor();
  check(true, "panel greets by name");
  await shot("step-3");
  await visible(page.getByRole("button", { name: "Finish" })).click();
  await page.waitForURL(/\/lobby$/);
  check(true, "Finish goes to /lobby");

  // Persisted: the stored profile, and the onboarding screen after a reload.
  const stored = JSON.parse(
    await page.evaluate(() => localStorage.getItem("tableside/profile/v1") ?? "null"),
  );
  check(stored?.onboarded === true, "profile marked onboarded");
  check(
    stored?.skill === "few-times" &&
      stored?.goal === "trip" &&
      stored?.coach === "every" &&
      stored?.tripDate === "2030-11-14" &&
      stored?.name === "Sam" &&
      JSON.stringify(stored?.games) === JSON.stringify(["blackjack", "craps"]),
    `stored answers ${JSON.stringify(stored)}`,
  );
  await page.goto(url("/onboarding"), { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" });
  await visible(page.getByText("SAM'S STARTING POINT")).waitFor();
  check(
    await checked(page.getByRole("radio", { name: "Every decision" })),
    "after reload: coach level kept",
  );
  await visible(page.getByRole("button", { name: "Continue" })).click();
  check(await checked(page.getByRole("checkbox", { name: "Craps" })), "after reload: games kept");
  check(
    await checked(page.getByRole("radio", { name: "Learn before a trip" })),
    "after reload: goal kept",
  );
  await shot("after-reload");

  // A finished player's "Play free" goes to the lobby.
  await page.goto(url("/"), { waitUntil: "networkidle" });
  const cta = visible(page.getByRole("link", { name: "Play free now — no signup" }));
  await page.waitForFunction(() =>
    [...document.querySelectorAll("a")].some(
      (a) => a.textContent?.includes("Play free now") && a.getAttribute("href") === "/lobby",
    ),
  );
  check((await cta.getAttribute("href")) === "/lobby", "onboarded: Play free → /lobby");

  // The lobby route belongs to another PR; its absence here is not this flow's failure.
  const own = errors.filter((e) => !/lobby|404/i.test(e));
  check(own.length === 0, `no console errors${own.length ? `: ${own.join(" | ")}` : ""}`);
};
