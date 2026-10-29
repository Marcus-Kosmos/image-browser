import { describe, expect, it } from "vitest";
import { waitedFraction } from "./WaitingRing";

describe("waitedFraction", () => {
  it("starts empty, is half full after 20 seconds and never quite full", () => {
    expect(waitedFraction(0)).toBe(0);
    expect(waitedFraction(-5)).toBe(0);
    expect(waitedFraction(20)).toBeCloseTo(0.5);
    expect(waitedFraction(40)).toBeCloseTo(0.75);
    expect(waitedFraction(300)).toBeLessThan(1);
  });
});
