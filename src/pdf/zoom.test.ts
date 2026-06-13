import { describe, expect, it } from "vitest";
import { clampScale, fitToWidthScale, MAX_SCALE, MIN_SCALE } from "./zoom";

describe("clampScale", () => {
  it("keeps a scale within bounds untouched", () => {
    expect(clampScale(1.25)).toBe(1.25);
  });

  it("clamps below the minimum and above the maximum", () => {
    expect(clampScale(0.01)).toBe(MIN_SCALE);
    expect(clampScale(99)).toBe(MAX_SCALE);
  });
});

describe("fitToWidthScale", () => {
  it("scales the page to fill the available width", () => {
    expect(fitToWidthScale(600, 900)).toBe(1.5);
  });

  it("clamps the computed scale to the allowed range", () => {
    expect(fitToWidthScale(600, 6000)).toBe(MAX_SCALE);
    expect(fitToWidthScale(600, 30)).toBe(MIN_SCALE);
  });

  it("falls back to 1 for a non-positive page width", () => {
    expect(fitToWidthScale(0, 900)).toBe(1);
  });
});
