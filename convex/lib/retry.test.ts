import { describe, expect, it } from "vitest";
import { retryDelay } from "./retry";

describe("retryDelay", () => {
  it("backs off over about 15 hours, then gives up", () => {
    const delays = [0, 1, 2, 3, 4, 5].map(retryDelay);
    expect(delays).toEqual([60_000, 300_000, 1_800_000, 7_200_000, 43_200_000, null]);
  });
});
