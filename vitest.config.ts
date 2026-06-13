import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Headless by default. Model and coordinate-seam logic is pure and runs
    // under the node environment; DOM-dependent suites opt into jsdom locally.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
