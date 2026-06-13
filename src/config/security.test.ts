import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const config = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../src-tauri/tauri.conf.json", import.meta.url)), "utf8"),
) as {
  app: { withGlobalTauri: boolean; security: { csp: string; freezePrototype: boolean } };
};

const csp = config.app.security.csp;

describe("tauri security config", () => {
  it("sets a content security policy", () => {
    expect(typeof csp).toBe("string");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
  });

  it("allows the bundled pdf.js worker without remote origins or eval", () => {
    expect(csp).toMatch(/worker-src[^;]*'self'/);
    expect(csp).not.toContain("'unsafe-eval'");
    // The only absolute origin allowed is the Tauri IPC endpoint; no remote hosts.
    expect(csp).not.toMatch(/https?:\/\/(?!ipc\.localhost)/);
  });

  it("freezes the prototype and hides the global Tauri namespace", () => {
    expect(config.app.security.freezePrototype).toBe(true);
    expect(config.app.withGlobalTauri).toBe(false);
  });
});
