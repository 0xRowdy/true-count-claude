import { describe, expect, it } from "vitest";
import { order, planView, yearlySaving } from "./pricing";

describe("pricing", () => {
  it("shows the design's yearly prices and saving", () => {
    expect(yearlySaving()).toBe(32);
    expect(planView("plus", "yearly", "preview")).toEqual({
      price: "$49 / year",
      sub: "$4.08 a month, billed yearly · example 7-day trial",
    });
    expect(planView("lifetime", "yearly", "preview").price).toBe("$199.99 once");
  });

  it("switches Plus to monthly", () => {
    expect(planView("plus", "monthly", "preview")).toEqual({
      price: "$5.99 / month",
      sub: "Billed monthly · example 7-day trial",
    });
    expect(order("plus", "monthly", null, "preview").total).toBe("$5.99");
  });

  it("builds the hypothetical trial timeline from today (design: Oct 11 → Oct 16, Oct 18)", () => {
    const o = order("plus", "yearly", "2026-10-11", "preview");
    expect(o.name).toBe("Tableside Plus, yearly");
    expect(o.total).toBe("$49.00");
    expect(o.dueToday).toBe("$0.00");
    expect(o.timeline.map((t) => t.when)).toEqual(["Today", "Oct 16", "Oct 18"]);
    expect(o.timeline[2]?.text).toBe(
      "Example: $49 for the year after the trial. No subscription starts here.",
    );
  });

  it("crosses month ends and has no date before mount", () => {
    expect(order("plus", "yearly", "2026-12-28", "preview").timeline[2]?.when).toBe("Jan 4");
    expect(order("plus", "yearly", null, "preview").timeline[1]?.when).toBe("In 5 days");
  });

  it("previews the Lifetime price and nothing due on Free", () => {
    expect(order("lifetime", "monthly", null, "preview")).toMatchObject({
      dueToday: "$199.99",
      trial: false,
    });
    expect(order("free", "yearly", null, "preview")).toMatchObject({
      dueToday: "$0.00",
      purchasable: false,
    });
  });

  describe("in a build that can sell", () => {
    it("offers a real trial, with no example wording", () => {
      expect(planView("plus", "yearly", "trial").sub).toBe(
        "$4.08 a month, billed yearly · 7-day free trial",
      );
      expect(planView("plus", "monthly", "trial").sub).toBe("Billed monthly · 7-day free trial");
      const o = order("plus", "yearly", "2026-10-11", "trial");
      expect(o).toMatchObject({ dueToday: "$0.00", trial: true });
      expect(o.detail).toBe("Web, iOS and Android, one account");
      expect(JSON.stringify(o)).not.toMatch(/example|unavailable/i);
    });

    it("promises no reminder, because nothing sends one", () => {
      const { timeline } = order("plus", "monthly", "2026-10-11", "trial");
      expect(timeline.map((t) => t.when)).toEqual(["Today", "Oct 18"]);
      expect(timeline[1]?.text).toBe("Trial ends. $5.99 a month unless you cancel.");
      expect(JSON.stringify(timeline)).not.toMatch(/remind|notify|email/i);
    });

    it("charges Lifetime today", () => {
      const o = order("lifetime", "monthly", null, "trial");
      expect(o).toMatchObject({ total: "$199.99", dueToday: "$199.99", trial: false });
      expect(o.timeline[0]?.text).toBe("One payment of $199.99. No renewals.");
    });
  });

  describe("for an Account that has already had a web subscription", () => {
    it("promises no trial and charges today, as Checkout will", () => {
      expect(planView("plus", "yearly", "paid").sub).toBe("$4.08 a month, billed yearly");
      expect(planView("plus", "monthly", "paid").sub).toBe("Billed monthly");
      const o = order("plus", "yearly", "2026-10-11", "paid");
      expect(o).toMatchObject({ total: "$49.00", dueToday: "$49.00", trial: false });
      expect(o.timeline).toEqual([
        {
          when: "Today",
          text: "$49 for the year, renewing until you cancel. Trials are for a first subscription.",
        },
      ]);
    });
  });
});
