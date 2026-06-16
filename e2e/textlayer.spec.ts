import { test, expect } from "@playwright/test";

test.describe("selectable text layer", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/e2e/harness.html");
    await page.waitForSelector("body[data-ready='1']");
  });

  test("renders text spans over the page", async ({ page }) => {
    const spans = page.locator(".textLayer span");
    expect(await spans.count()).toBeGreaterThan(0);
  });

  test("a mouse drag selects text (the actual bug)", async ({ page }) => {
    // Drag through an actual text span (the page has one line near the top).
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
});
