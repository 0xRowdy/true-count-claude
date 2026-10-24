// Pricing (/pricing): the billing toggle, plan choice, order summary and FAQ work, and no
// payment is ever processed. Proves: Yearly/Monthly change the prices ($49 / year ↔ $5.99 /
// month), choosing a plan updates "Your order" (trial timeline with dates after mount),
// Pay and the card button show the "not available in this build" notice, the FAQ opens and
// closes, and the "training tools, not chips" box is there.
const visible = (loc) => loc.filter({ visible: true }).first();

export default async ({ page, url, shot, check }) => {
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1440, height: 1300 });
  const res = await page.goto(url("/pricing"), { waitUntil: "networkidle" });
  check(res?.ok(), `/pricing served (HTTP ${res?.status()})`);
  const order = visible(page.getByRole("region", { name: "Your order" }));
  await order.waitFor();
  check(
    await visible(
      page.getByText(/Pricing preview\. Purchases and trials are unavailable/),
    ).isVisible(),
    "pricing is labelled as unavailable before any payment action",
  );
  check(
    await visible(page.getByText(/Progress stays on this device/)).isVisible(),
    "local storage and backup are explained without promising automatic sync",
  );

  // Yearly by default, as designed.
  check(await visible(page.getByText("$49 / year")).isVisible(), "yearly Plus price $49 / year");
  check(
    await visible(page.getByText(/billed yearly · example 7-day trial/)).isVisible(),
    "the Plus card calls the trial an example",
  );
  check((await page.getByText(/\d+-day free trial/).count()) === 0, "no copy offers a free trial");
  check(await order.getByText("Tableside Plus, yearly").isVisible(), "order: Plus yearly");
  check(await order.getByText("$49.00").isVisible(), "order total $49.00");
  check(
    await order
      .getByText("Example: a seven-day trial would start. No trial starts here.")
      .isVisible(),
    "the timeline describes a hypothetical trial",
  );
  check(
    await order
      .getByText("Example: a reminder would arrive 2 days before. No reminders are sent.")
      .isVisible(),
    "the preview does not promise a reminder",
  );
  // Trial dates are computed after mount: "In 5 days" must have become a date.
  await order
    .getByText(/^[A-Z][a-z]{2} \d{1,2}$/)
    .first()
    .waitFor();
  check((await order.getByText(/^In \d+ days$/).count()) === 0, "trial timeline shows dates");
  await shot("yearly");

  await visible(page.getByRole("radio", { name: "Monthly" })).click();
  await visible(page.getByText("$5.99 / month")).waitFor();
  check((await page.getByText("$49 / year").count()) === 0, "monthly replaces the yearly price");
  check(await order.getByText("Tableside Plus, monthly").isVisible(), "order: Plus monthly");
  check(await order.getByText("$5.99", { exact: true }).isVisible(), "order total $5.99");
  check(
    await order
      .getByText("Example: $5.99 a month after the trial. No subscription starts here.")
      .isVisible(),
    "timeline: hypothetical monthly renewal",
  );
  await shot("monthly");
  await visible(page.getByRole("radio", { name: "Yearly" })).click();
  await visible(page.getByText("$49 / year")).waitFor();
  check(true, "back to yearly");

  // Choose Lifetime: a one-time price preview, no trial or purchase.
  await visible(page.getByRole("radio", { name: "Lifetime" })).click();
  check(
    (await visible(page.getByRole("radio", { name: "Lifetime" })).getAttribute("aria-checked")) ===
      "true",
    "Lifetime selected",
  );
  check(await order.getByText("Tableside Lifetime").isVisible(), "order: Lifetime");
  check((await order.getByText("$119.00").count()) === 2, "Lifetime: $119.00 total and due today");
  check(
    await order
      .getByText("Example: one payment of $119 with no renewals. Purchases are unavailable.")
      .isVisible(),
    "Lifetime describes an unavailable example purchase",
  );

  // Pay: nothing is processed, the notice says so.
  await visible(page.getByRole("button", { name: "Pay (unavailable)", exact: true })).click();
  const notice = visible(page.getByRole("status", { name: /Purchases aren't available/ }));
  await notice.waitFor();
  check(await notice.isVisible(), "Pay shows the purchases-unavailable notice");
  await shot("pay-notice");
  await visible(page.getByRole("radio", { name: "Tableside Plus" })).click();
  check((await page.getByRole("status", { name: /Purchases/ }).count()) === 0, "notice clears");
  await visible(page.getByRole("button", { name: "Free trial (unavailable)" })).click();
  await notice.waitFor();
  check(true, "card button shows the notice too");
  check(
    await visible(page.getByText(/Practice uses virtual chips only/)).isVisible(),
    "responsible box",
  );

  // Tap targets: the billing toggle and each FAQ row are at least 44pt tall.
  for (const [role, name] of [
    ["radio", "Monthly"],
    ["radio", "Yearly"],
    ["button", "Can I win real money here?"],
    ["button", "Do I need Plus to get ready for a trip?"],
  ]) {
    const box = await visible(page.getByRole(role, { name })).boundingBox();
    check(box && box.height >= 44, `"${name}" tap target ≥44 (${box?.height})`);
  }

  // FAQ accordion.
  const q = visible(page.getByRole("button", { name: "Do I need Plus to get ready for a trip?" }));
  check((await q.getAttribute("aria-expanded")) === "false", "FAQ 2 starts closed");
  await q.click();
  check((await q.getAttribute("aria-expanded")) === "true", "FAQ 2 opens");
  check(
    await visible(page.getByText(/Every game, every supported rule set/)).isVisible(),
    "answer",
  );
  await q.click();
  check((await q.getAttribute("aria-expanded")) === "false", "FAQ 2 closes");

  check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
};
