import { describe, expect, it } from "vitest";
import {
  EMPTY_ENTRY,
  MAX_DIGITS,
  entryDisplay,
  entryFor,
  entryValue,
  pressKey,
  typeKeys,
} from "./countEntry";

const typed = (text: string) => typeKeys(EMPTY_ENTRY, text);

describe("count entry takes negative and two-digit counts", () => {
  // The four values from #24: a competitor's field blocked users on exactly these.
  it.each([
    ["-12", -12, "−12"],
    ["-3", -3, "−3"],
    ["0", 0, "0"],
    ["14", 14, "14"],
  ])("types %s as %d", (keys, value, display) => {
    const entry = typed(keys);
    expect(entryValue(entry)).toBe(value);
    expect(entryDisplay(entry)).toBe(display);
  });

  it("takes the sign after the digits as well as before", () => {
    expect(entryValue(typed("12-"))).toBe(-12);
    expect(entryValue(typed("1-2"))).toBe(-12);
  });

  it("toggles the sign back off", () => {
    expect(entryValue(typed("--14"))).toBe(14);
  });

  it("shows a minus pressed before any digit, and submits nothing for it", () => {
    const entry = typed("-");
    expect(entryDisplay(entry)).toBe("−");
    expect(entryValue(entry)).toBeNull();
  });

  it("never produces negative zero", () => {
    expect(Object.is(entryValue(typed("-0")), 0)).toBe(true);
    expect(Object.is(entryValue(typed("-0")), -0)).toBe(false);
  });

  it("submits nothing before a key is pressed", () => {
    expect(entryValue(EMPTY_ENTRY)).toBeNull();
    expect(entryDisplay(EMPTY_ENTRY)).toBe("");
  });

  it("does not grow a leading zero", () => {
    expect(entryDisplay(typed("07"))).toBe("7");
    expect(entryValue(typed("007"))).toBe(7);
  });

  it(`caps at ${MAX_DIGITS} digits rather than overflowing`, () => {
    expect(entryValue(typed("-1234"))).toBe(-123);
  });

  it("takes a Wong Halves half point", () => {
    expect(entryValue(typed("7.5"))).toBe(7.5);
    expect(entryValue(typed("-.5"))).toBe(-0.5);
    expect(entryDisplay(typed("-12.5"))).toBe("−12.5");
  });

  it("backspaces the half, then the digits, then the sign", () => {
    let entry = typed("-12.5");
    entry = pressKey(entry, { kind: "backspace" });
    expect(entryValue(entry)).toBe(-12);
    entry = pressKey(entry, { kind: "backspace" });
    expect(entryValue(entry)).toBe(-1);
    entry = pressKey(entry, { kind: "backspace" });
    expect(entryDisplay(entry)).toBe("−");
    entry = pressKey(entry, { kind: "backspace" });
    expect(entry).toEqual(EMPTY_ENTRY);
  });

  it("clears", () => {
    expect(pressKey(typed("-14"), { kind: "clear" })).toEqual(EMPTY_ENTRY);
  });

  it("round-trips a stated value", () => {
    for (const value of [-12, -3, 0, 14, 7.5, -0.5]) {
      expect(entryValue(entryFor(value))).toBe(value);
    }
  });
});
