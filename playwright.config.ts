import { defineConfig, devices } from "@playwright/test";

// Local visual/interaction checks for things unit tests can't cover (text
// selection, overlay hit-testing). Not part of the required CI gates; run with
// `npx playwright test`. Reuses a running vite dev server, or starts one.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  use: {
    baseURL: "http://localhost:1420",
  },
  // WebKit mirrors the macOS WKWebView that Tauri uses; Chromium mirrors the
  // Windows WebView2. Test both so engine-specific bugs surface here.
  projects: [
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:1420",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
