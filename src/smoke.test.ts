import { describe, expect, it } from "vitest";

// Proves the Vitest harness runs headlessly. Replaced by real specs as
// features land (first up: the PDF.js page-count test in m0-4).
describe("test harness", () => {
  it("is wired up", () => {
    expect(true).toBe(true);
  });
});
