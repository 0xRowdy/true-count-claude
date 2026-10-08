// True Count drill: answer one conversion question and see it graded.
// Proves: the drills hub links to the drill, a question shows its running count and decks remaining,
// keyboard entry + Answer grades it, and the Correct tally/Next question appear.
// React Native Web keeps the drills hub mounted under the drill: always match visible elements.
const visible = (loc) => loc.filter({ visible: true }).first();

export default async ({ page, url, shot, log, check }) => {
  await page.goto(url("/drills"));
  await page.getByRole("link", { name: /True Count drill/i }).click();
  await visible(page.getByText(/^Question 1$/)).waitFor();
  const rc = await visible(page.getByText(/^Running Count · /)).locator("..").innerText();
  log(`question shows: ${rc.replace(/\s+/g, " ")}`);
  await shot("question");

  await page.keyboard.type("2");
  const answer = visible(page.getByRole("button", { name: /^Answer: / }));
  await answer.waitFor();
  check((await answer.getAttribute("aria-label"))?.includes("2"), "typed answer reaches the entry pad");
  await answer.click();

  await visible(page.getByRole("button", { name: "Next question" })).waitFor();
  check(await visible(page.getByText("Correct", { exact: true })).isVisible(), "graded result shows the Correct tally");
  await shot("graded");
  await visible(page.getByRole("button", { name: "Next question" })).click();
  await visible(page.getByText(/^Question 2$/)).waitFor();
  await shot("next-question");
};
