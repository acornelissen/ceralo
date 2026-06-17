import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

import { listSignatures, saveSignature } from "./store";

beforeEach(() => {
  invoke.mockReset();
});

describe("saveSignature", () => {
  it("sends the PNG bytes as a number array and returns the generated id", async () => {
    invoke.mockResolvedValue("0000000000000000000000000000000a");
    const id = await saveSignature(new Uint8Array([137, 80, 78, 71]));
    expect(invoke).toHaveBeenCalledWith("save_signature", { bytes: [137, 80, 78, 71] });
    expect(id).toBe("0000000000000000000000000000000a");
  });
});

describe("listSignatures", () => {
  it("maps each saved signature's png bytes to a Uint8Array", async () => {
    invoke.mockResolvedValue([{ id: "a", png: [137, 80, 78, 71] }]);
    const saved = await listSignatures();
    expect(invoke).toHaveBeenCalledWith("list_signatures");
    expect(saved).toEqual([{ id: "a", pngBytes: new Uint8Array([137, 80, 78, 71]) }]);
  });

  it("returns an empty list when nothing is saved", async () => {
    invoke.mockResolvedValue([]);
    expect(await listSignatures()).toEqual([]);
  });
});
