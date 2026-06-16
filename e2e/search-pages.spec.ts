import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// A 40-page document: "alpha" on every page, a unique "needle" only on page 30.
const fixtureBytes = [
  ...readFileSync(fileURLToPath(new URL("../fixtures/search-many.pdf", import.meta.url))),
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript((bytes) => {
    let listenId = 0;
    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
      transformCallback: () => 1,
      unregisterCallback: () => {},
      invoke: async (cmd: string) => {
        if (cmd === "open_pdf") return { path: "/fixture.pdf", bytes };
        if (cmd === "plugin:event|listen") return (listenId += 1);
        return null;
      },
    };
  }, fixtureBytes);
  await page.goto("/");
  await page.locator("#empty-open").click();
  await page.waitForSelector(".textLayer span");
  await page.evaluate(() => {
    document.getElementById("search-bar")!.hidden = false;
  });
});

test("counts matches across every page, including unrendered ones", async ({ page }) => {
  await page.fill("#search-input", "alpha");
  await expect(page.locator("#search-count")).toHaveText("1 of 40");
});

test("finds a term that only appears on a far, unrendered page", async ({ page }) => {
  // "needle" is on page 30 — well below the fold and not initially rendered.
  await page.fill("#search-input", "needle");
  await expect(page.locator("#search-count")).toHaveText("1 of 1");
});
