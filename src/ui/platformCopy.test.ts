import { describe, expect, it } from "vitest";
import { platformCopy } from "./platformCopy";

describe("platformCopy", () => {
  it("names no other mobile platform on iOS (App Store guideline 2.3.10)", () => {
    for (const phrase of Object.values(platformCopy("ios"))) {
      expect(phrase).not.toMatch(/android|google play/i);
    }
  });

  it("names every platform on the web and Android", () => {
    for (const os of ["web", "android"]) {
      expect(platformCopy(os).reach).toBe("the web, iPhone and Android");
      expect(platformCopy(os).stores).toBe("the App Store or Google Play");
    }
  });
});
