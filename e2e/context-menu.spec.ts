import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fixtureBytes = [
  ...readFileSync(fileURLToPath(new URL("../fixtures/two-page.pdf", import.meta.url))),
];

// Drive the REAL app with Tauri mocked, then exercise the right-click menu in a
// real browser engine (WebKit mirrors the macOS WKWebView, Chromium WebView2).
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
  await page.locator("#empty-open").click();
  await page.waitForSelector(".textLayer span");
});

const menu = (page: import("@playwright/test").Page) => page.locator(".context-menu");
const item = (page: import("@playwright/test").Page, label: string) =>
  page.getByRole("menuitem", { name: label, exact: true });

test("right-clicking a page shows the page menu", async ({ page }) => {
  const box = (await page.locator(".page-container").first().boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: "right" });

  await expect(menu(page)).toBeVisible();
  await expect(item(page, "Add text here")).toBeFocused();
  await expect(item(page, "Fit width")).toBeVisible();
});

test("Add text here places a focused text box at the click point", async ({ page }) => {
  const box = (await page.locator(".page-container").first().boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + 120, { button: "right" });
  await item(page, "Add text here").click();

  await expect(page.locator(".text-box")).toHaveCount(1);
  await expect(page.locator(".text-box-input")).toBeFocused();
  await expect(menu(page)).toBeHidden();
});

test("a text selection offers Copy", async ({ page }) => {
  const span = page.locator(".textLayer span").first();
  const sbox = (await span.boundingBox())!;
  await page.mouse.move(sbox.x + 2, sbox.y + sbox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sbox.x + sbox.width - 2, sbox.y + sbox.height / 2, { steps: 8 });
  await page.mouse.up();

  await page.mouse.click(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2, { button: "right" });
  await expect(item(page, "Copy")).toBeVisible();
});

test("right-clicking a placed text box's chrome offers Edit and Delete", async ({ page }) => {
  const box = (await page.locator(".page-container").first().boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + 120, { button: "right" });
  await item(page, "Add text here").click();

  // The textarea keeps the native menu (for paste); the box chrome (grip) is the
  // non-editable surface that surfaces the annotation menu.
  await page.locator(".text-box-grip").click({ button: "right" });
  await expect(item(page, "Edit")).toBeVisible();
  await expect(item(page, "Delete")).toBeVisible();
});

test("Escape closes the menu", async ({ page }) => {
  const box = (await page.locator(".page-container").first().boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: "right" });
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu(page)).toBeHidden();
});
