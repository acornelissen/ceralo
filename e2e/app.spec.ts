import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Bytes of a fixture PDF that has selectable text, handed to the mocked open_pdf.
const fixtureBytes = [
  ...readFileSync(fileURLToPath(new URL("../fixtures/two-page.pdf", import.meta.url))),
];

// Drive the REAL app (index.html + main.ts) with Tauri's webview bridge mocked,
// so the full open flow and overlay run exactly as on the desktop.
test.beforeEach(async ({ page }) => {
  await page.addInitScript((bytes) => {
    let cbId = 0;
    let listenId = 0;
    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
      transformCallback: () => {
        cbId += 1;
        return cbId;
      },
      unregisterCallback: () => {},
      invoke: async (cmd: string) => {
        if (cmd === "open_pdf") return { path: "/fixture.pdf", bytes };
        if (cmd === "plugin:event|listen") {
          listenId += 1;
          return listenId;
        }
        return null;
      },
    };
  }, fixtureBytes);
  await page.goto("/");
});

test("opens a PDF and renders selectable text", async ({ page }) => {
  await page.locator("#empty-open").click();
  await page.waitForSelector(".textLayer span");

  const span = page.locator(".textLayer span").first();
  const box = await span.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();

  const selected = await page.evaluate(() => window.getSelection()?.toString() ?? "");
  expect(selected.trim().length).toBeGreaterThan(0);
});
