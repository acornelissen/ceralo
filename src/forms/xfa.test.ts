import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { hasXfa } from "./xfa";

function fixture(name: string): Uint8Array {
  return new Uint8Array(
    readFileSync(fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url))),
  );
}

describe("hasXfa", () => {
  it("detects an XFA form", async () => {
    expect(await hasXfa(fixture("xfa.pdf"))).toBe(true);
  });

  it("returns false for a plain AcroForm and a no-forms PDF", async () => {
    expect(await hasXfa(fixture("acroform.pdf"))).toBe(false);
    expect(await hasXfa(fixture("two-page.pdf"))).toBe(false);
  });
});
