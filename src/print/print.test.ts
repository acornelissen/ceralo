import { describe, expect, it, vi } from "vitest";
import { printDocument, type PrintPort } from "./print";
import type { DocumentModel } from "../model/document";

// A minimal stand-in model; printDocument only checks for presence, not shape.
const model = {} as DocumentModel;

function port(over: Partial<PrintPort> = {}): PrintPort {
  return {
    flatten: vi.fn(async () => new Uint8Array([1, 2, 3])),
    send: vi.fn(async () => {}),
    ...over,
  };
}

describe("printDocument", () => {
  it("does nothing without a document", async () => {
    const p = port();
    expect(await printDocument(null, false, p)).toBe("no-document");
    expect(p.flatten).not.toHaveBeenCalled();
    expect(p.send).not.toHaveBeenCalled();
  });

  it("refuses an encrypted document without flattening or sending", async () => {
    const p = port();
    expect(await printDocument(model, true, p)).toBe("encrypted");
    expect(p.flatten).not.toHaveBeenCalled();
    expect(p.send).not.toHaveBeenCalled();
  });

  it("flattens the model and sends the bytes on the happy path", async () => {
    const bytes = new Uint8Array([9, 9]);
    const p = port({ flatten: vi.fn(async () => bytes) });
    expect(await printDocument(model, false, p)).toBe("printed");
    expect(p.flatten).toHaveBeenCalledWith(model);
    expect(p.send).toHaveBeenCalledWith(bytes);
  });
});
