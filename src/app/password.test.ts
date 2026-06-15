import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { openPdfDocument } from "../pdf/document";
import { openWithPassword } from "./password";

function fixture(name: string): Uint8Array {
  return new Uint8Array(
    readFileSync(fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url))),
  );
}

const openFixture = (name: string) => (password?: string) =>
  openPdfDocument(fixture(name), password);

describe("openWithPassword", () => {
  it("opens a normal PDF without ever asking for a password", async () => {
    const ask = vi.fn();
    const doc = await openWithPassword(openFixture("two-page.pdf"), ask);
    expect(doc?.numPages).toBe(2);
    expect(ask).not.toHaveBeenCalled();
  });

  it("asks once, then opens with the correct password", async () => {
    const ask = vi.fn(async () => "secret");
    const doc = await openWithPassword(openFixture("encrypted-password.pdf"), ask);
    expect(doc?.numPages).toBeGreaterThan(0);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith(false); // first ask is not flagged "incorrect"
  });

  it("retries after a wrong password, flagging the second ask as incorrect", async () => {
    const answers = ["wrong", "secret"];
    const seen: boolean[] = [];
    const ask = vi.fn(async (incorrect: boolean) => {
      seen.push(incorrect);
      return answers.shift() ?? null;
    });
    const doc = await openWithPassword(openFixture("encrypted-password.pdf"), ask);
    expect(doc?.numPages).toBeGreaterThan(0);
    expect(seen).toEqual([false, true]);
  });

  it("returns null when the user cancels the prompt", async () => {
    const ask = vi.fn(async () => null);
    const doc = await openWithPassword(openFixture("encrypted-password.pdf"), ask);
    expect(doc).toBeNull();
  });
});
