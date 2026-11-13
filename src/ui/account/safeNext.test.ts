import { describe, expect, it } from "vitest";
import { safeNext } from "./safeNext";

describe("safeNext", () => {
  it("keeps paths inside the app, with their queries", () => {
    expect(safeNext("/pricing?plan=plus&billing=yearly")).toBe("/pricing?plan=plus&billing=yearly");
    expect(safeNext("/lobby")).toBe("/lobby");
  });

  it.each([
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
    "https://evil.example",
    "lobby",
  ])("refuses %j", (next) => expect(safeNext(next)).toBe("/account"));

  it("falls back when there is no path", () => {
    expect(safeNext(undefined)).toBe("/account");
    expect(safeNext(["/lobby"])).toBe("/account");
  });
});
