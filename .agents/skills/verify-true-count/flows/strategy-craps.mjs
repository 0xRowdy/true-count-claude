// Craps strategy builder (/strategies/craps, frame GYRRl): the design's example plan renders
// the engine's numbers ($78 on the table, −$78 worst roll, ≈ 0.6% blended edge) and they move
// when a rule changes.
const visible = (loc) => loc.filter({ visible: true }).first();

export default async ({ page, url, shot, check }) => {
  await page.setViewportSize({ width: 1440, height: 1500 });
  const res = await page.goto(url("/strategies/craps"), { waitUntil: "networkidle" });
  check(res?.ok(), `/strategies/craps served (HTTP ${res?.status()})`);
  await visible(page.getByRole("heading", { name: "Pass, Odds & Press the 6/8" })).waitFor();
  check(
    await visible(page.getByRole("button", { name: "Compare (3 changes)" })).isVisible(),
    "Compare (3 changes)",
  );
  check(
    await visible(
      page.getByRole("button", { name: "Preview: Point is 6, after 2 hits" }),
    ).isVisible(),
    "preview picker",
  );
  check(
    await visible(
      page.getByLabel("On the table: $78. Pass $10 · odds $50 · place 8 $18"),
    ).isVisible(),
    "On the table $78",
  );
  check(
    await visible(page.getByLabel("Worst single roll: −$78. A seven ends it all")).isVisible(),
    "Worst single roll −$78",
  );
  check(
    await visible(
      page.getByLabel("Blended house edge: ≈ 0.6%. Engine estimate on money bet"),
    ).isVisible(),
    "Blended edge ≈ 0.6%",
  );
  check(
    await visible(page.getByLabel(/^Place 8: \$18, pressed/)).isVisible(),
    "felt shows the pressed 8",
  );

  await visible(
    page.getByRole("button", { name: /^Rule 3\.2: 2nd hit\. Press to \$18\. Changed/ }),
  ).click();
  await visible(page.getByRole("heading", { name: "Second hit on a place 6 or 8" })).waitFor();
  check(
    await visible(page.getByText("Rules-checked for 3-4-5x craps")).isVisible(),
    "rules-checked",
  );
  check(
    await visible(
      page.getByText(
        "$18 pays $21 on the next hit. Pressing uses $6 of the $14 win and pockets $8.",
      ),
    ).isVisible(),
    "press note",
  );
  check(
    await visible(page.getByText("Steps of $6 so the 7:6 payout comes out exact.")).isVisible(),
    "step help",
  );
  check(await visible(page.getByText("Change 2 of 3")).isVisible(), "Change 2 of 3");
  await shot("example-gyrrl");

  await visible(page.getByRole("button", { name: "More: Press amount" })).click();
  await visible(page.getByText("$24 each")).waitFor();
  check(
    await visible(page.getByLabel(/^On the table: \$84\./)).isVisible(),
    "pressing to $24 → $84 on the table",
  );
  check(
    await visible(page.getByLabel(/^Worst single roll: −\$84\./)).isVisible(),
    "worst roll follows: −$84",
  );
  check(
    await visible(
      page.getByText(
        "$24 pays $28 on the next hit. Pressing uses $12 of the $14 win and pockets $2.",
      ),
    ).isVisible(),
    "press note follows",
  );

  // Change the preview, then add a rule.
  await visible(page.getByRole("button", { name: /^Preview:/ })).click();
  await visible(page.getByRole("radio", { name: "5", exact: true })).click();
  await visible(page.getByRole("radio", { name: "0", exact: true })).click();
  await visible(page.getByRole("button", { name: "Done" })).click();
  check(
    await visible(page.getByLabel(/^On the table: \$74\./)).isVisible(),
    "point 5, no hits: $74 on the table",
  );
  await visible(page.getByRole("button", { name: "Add rule: point is set" })).click();
  await visible(page.getByRole("button", { name: "Field every roll" })).click();
  check(
    await visible(page.getByText("Bet $10 on the Field every roll")).isVisible(),
    "added a field rule",
  );
  check(
    await visible(page.getByLabel(/^On the table: \$84\./)).isVisible(),
    "the field bet joins the layout",
  );
  await shot("edited");
};
