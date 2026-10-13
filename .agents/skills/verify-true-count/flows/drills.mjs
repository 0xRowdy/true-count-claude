// Drills: walk the Trainer hub and answer one question in each of the four drills.
// Proves: the hub links to every drill (none locked), each drill grades an answer while its cards
// or numbers are still on screen, and every graded answer carries its Explanation — the verdict as
// the dealer's Coach Note plus the drill's own why (invariants 2 and 3).
// React Native Web keeps the hub mounted under a drill: always match visible elements.
const visible = (loc) => loc.filter({ visible: true }).first();
const DRILLS = ["Basic Strategy drill", "Counting drill", "True Count drill", "Deviations drill"];

/** Click the first of `names` that is on screen; returns the name clicked. */
async function clickFirst(page, names) {
  for (const name of names) {
    const button = visible(page.getByRole("button", { name, exact: true }));
    if (await button.isVisible().catch(() => false)) {
      await button.click();
      return name;
    }
  }
  return null;
}

async function openFromHub(page, url, check, name) {
  await page.goto(url("/drills"));
  const link = visible(page.getByRole("link", { name }));
  await link.waitFor();
  check(
    (await page
      .getByRole("link", { name: /drill$/ })
      .filter({ visible: true })
      .count()) === 4,
    `hub lists all four drills (opening ${name})`,
  );
  check(
    (await visible(page.getByRole("link", { name: "Trainer" })).getAttribute("aria-current")) ===
      "page",
    "Trainer is the active nav item",
  );
  await link.click();
  await visible(page.getByRole("button", { name: "Report a bug" })).waitFor();
}

async function explained(page, check, what, why) {
  const note = visible(page.getByRole("note", { name: /^Coach note: / }));
  await note.waitFor();
  check(await note.isVisible(), `${what}: the verdict arrives as a Coach Note`);
  check(await visible(page.getByText(why, { exact: true })).isVisible(), `${what}: "${why}" shown`);
}

export default async ({ page, url, shot, log, check }) => {
  await page.goto(url("/drills"));
  for (const name of DRILLS) await visible(page.getByRole("link", { name })).waitFor();
  await shot("hub");

  // Basic Strategy: deal, take any legal action, read the Explanation.
  await openFromHub(page, url, check, DRILLS[0]);
  await visible(page.getByRole("button", { name: "Deal" })).click();
  await page.getByRole("img", { name: / of / }).first().waitFor();
  let played = null;
  for (let attempt = 0; attempt < 5 && !played; attempt++) {
    played = await clickFirst(page, ["No insurance", "Stand", "Hit"]);
    if (!played) {
      // A natural settles with no decision: deal the next hand.
      await clickFirst(page, ["Deal next hand"]);
      await page.waitForTimeout(200);
    }
  }
  check(played !== null, `basic strategy: answered with ${played}`);
  await explained(
    page,
    check,
    "basic strategy",
    played === "No insurance" ? "Is it a good bet?" : "The chart cell",
  );
  await shot("basic-strategy");

  // Counting: deal two steps, check a count, read the tag trail.
  await openFromHub(page, url, check, DRILLS[1]);
  await visible(page.getByRole("button", { name: /^Deal (one card|two cards)$/ })).click();
  await visible(page.getByRole("button", { name: /^Deal (one card|two cards)$/ })).click();
  await page.keyboard.type("1");
  await visible(page.getByRole("button", { name: /^Check: / })).click();
  await explained(page, check, "counting", "Since your last check");
  await shot("counting");

  // True Count: type an answer, grade it, read every rounding.
  await openFromHub(page, url, check, DRILLS[2]);
  await visible(page.getByText(/^Question 1$/)).waitFor();
  await page.keyboard.type("2");
  await visible(page.getByRole("button", { name: /^Answer: / })).click();
  await explained(page, check, "true count", "Every rounding of it");
  check(
    await visible(page.getByRole("button", { name: "Next question" })).isVisible(),
    "true count: Next question offered",
  );
  await shot("true-count");

  // Deviations: answer the index question, read the chart and the count.
  await openFromHub(page, url, check, DRILLS[3]);
  await visible(page.getByText(/^Question 1$/)).waitFor();
  const answered = await clickFirst(page, [
    "Stand",
    "Hit",
    "Double",
    "Split",
    "Surrender",
    "Decline insurance",
  ]);
  check(answered !== null, `deviations: answered with ${answered}`);
  await explained(page, check, "deviations", "The count");
  check(
    await visible(page.getByRole("button", { name: "Next question" })).isVisible(),
    "deviations: Next question offered",
  );
  await shot("deviation");
  log("all four drills graded and explained");
};
