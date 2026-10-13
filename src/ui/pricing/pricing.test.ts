import { describe, expect, it } from "vitest";
import { order, planView, yearlySaving } from "./pricing";

describe("pricing", () => {
  it("shows the design's yearly prices and saving", () => {
    expect(yearlySaving()).toBe(32);
    expect(planView("plus", "yearly")).toEqual({
      price: "$49 / year",
      sub: "$4.08 a month, billed yearly · 7-day free trial",
    });
    expect(planView("lifetime", "yearly").price).toBe("$119 once");
  });

  it("switches Plus to monthly", () => {
    expect(planView("plus", "monthly")).toEqual({
      price: "$5.99 / month",
      sub: "Billed monthly · 7-day free trial",
    });
    expect(order("plus", "monthly", null).total).toBe("$5.99");
  });

  it("builds the trial timeline from today (design: Oct 11 → Oct 16, Oct 18)", () => {
    const o = order("plus", "yearly", "2026-10-11");
    expect(o.name).toBe("Tableside Plus, yearly");
    expect(o.total).toBe("$49.00");
    expect(o.dueToday).toBe("$0.00");
    expect(o.timeline.map((t) => t.when)).toEqual(["Today", "Oct 16", "Oct 18"]);
    expect(o.timeline[2]?.text).toBe("Trial ends. $49 for the year unless you cancel.");
  });

  it("crosses month ends and has no date before mount", () => {
    expect(order("plus", "yearly", "2026-12-28").timeline[2]?.when).toBe("Jan 4");
    expect(order("plus", "yearly", null).timeline[1]?.when).toBe("In 5 days");
  });

  it("charges Lifetime today and nothing on Free", () => {
    expect(order("lifetime", "monthly", null)).toMatchObject({ dueToday: "$119.00", trial: false });
    expect(order("free", "yearly", null)).toMatchObject({ dueToday: "$0.00", purchasable: false });
  });
});
