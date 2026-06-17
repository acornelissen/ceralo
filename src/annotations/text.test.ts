import { describe, expect, it } from "vitest";
import type { Viewport } from "../model/coords";
import { createModel, withPages, type PageGeometry, type TextBox } from "../model/document";
import { screenPoint } from "../model/geometry";
import { createTextBoxAt } from "./text";

const PAGE: PageGeometry = { index: 0, width: 600, height: 800, rotation: 0 };
const VIEWPORT: Viewport = { scale: 1 };

function emptyModel() {
  return withPages(createModel(new Uint8Array()), [PAGE]);
}

describe("createTextBoxAt", () => {
  it("places a text box origin at the user-space coordinate of the click", () => {
    // For an unrotated 600x800 page at scale 1, screen (100, 200) maps to
    // user space (100, 600): y flips about the page height.
    const model = createTextBoxAt(emptyModel(), screenPoint(100, 200), PAGE, VIEWPORT);

    expect(model.annotations).toHaveLength(1);
    const box = model.annotations[0] as TextBox;
    expect(box.kind).toBe("text");
    expect(box.page).toBe(PAGE.index);
    expect(box.origin.x).toBeCloseTo(100);
    expect(box.origin.y).toBeCloseTo(600);
  });

  it("returns a new, dirty model and does not touch the input", () => {
    const before = emptyModel();
    const after = createTextBoxAt(before, screenPoint(100, 200), PAGE, VIEWPORT);

    expect(after).not.toBe(before);
    expect(after.dirty).toBe(true);
    expect(before.annotations).toHaveLength(0);
  });

  it("starts with regular, left-aligned, black formatting defaults", () => {
    const model = createTextBoxAt(emptyModel(), screenPoint(100, 200), PAGE, VIEWPORT);
    const box = model.annotations[0] as TextBox;
    expect(box.bold).toBe(false);
    expect(box.italic).toBe(false);
    expect(box.color).toBe("#000000");
    expect(box.align).toBe("left");
  });
});
