import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

import {
  deleteSignature,
  listSignatures,
  renameSignature,
  saveSignature,
  setDefaultSignature,
} from "./store";

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
  it("maps png bytes, name and the default flag", async () => {
    invoke.mockResolvedValue([{ id: "a", png: [137, 80, 78, 71], name: "Work", is_default: true }]);
    const saved = await listSignatures();
    expect(invoke).toHaveBeenCalledWith("list_signatures");
    expect(saved).toEqual([
      { id: "a", pngBytes: new Uint8Array([137, 80, 78, 71]), name: "Work", isDefault: true },
    ]);
  });

  it("normalises a missing name to null and a missing default to false", async () => {
    invoke.mockResolvedValue([{ id: "a", png: [], name: null, is_default: false }]);
    const saved = await listSignatures();
    expect(saved[0]?.name).toBeNull();
    expect(saved[0]?.isDefault).toBe(false);
  });

  it("returns an empty list when nothing is saved", async () => {
    invoke.mockResolvedValue([]);
    expect(await listSignatures()).toEqual([]);
  });
});

describe("renameSignature", () => {
  it("sends the id and the new name", async () => {
    invoke.mockResolvedValue(undefined);
    await renameSignature("a", "Personal");
    expect(invoke).toHaveBeenCalledWith("rename_signature", { id: "a", name: "Personal" });
  });
});

describe("setDefaultSignature", () => {
  it("sends the id to make default", async () => {
    invoke.mockResolvedValue(undefined);
    await setDefaultSignature("a");
    expect(invoke).toHaveBeenCalledWith("set_default_signature", { id: "a" });
  });
});

describe("deleteSignature", () => {
  it("sends the id to delete", async () => {
    invoke.mockResolvedValue(undefined);
    await deleteSignature("a");
    expect(invoke).toHaveBeenCalledWith("delete_signature", { id: "a" });
  });
});
