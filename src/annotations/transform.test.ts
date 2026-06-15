import { describe, expect, it } from "vitest";
import type { Viewport } from "../model/coords";
import type { PageGeometry, TextBox } from "../model/document";
import { screenPoint, userSpacePoint } from "../model/geometry";
import { moveTextBox, resizeTextBox } from "./transform";

const page: PageGeometry = { index: 0, width: 612, height: 792, rotation: 0 };

function box(): TextBox {
  return {
    kind: "text",
    id: "t1",
    page: 0,
    origin: userSpacePoint(100, 500),
    width: 200,
    height: 24,
    text: "hi",
    fontSize: 12,
  };
}

describe("moveTextBox", () => {
  it("shifts the origin by the user-space delta of a screen drag (scale 2)", () => {
    const viewport: Viewport = { scale: 2 };
    // Dragging right 100px / down 40px at scale 2: x grows by 50, and because
    // screen y is inverted relative to user space, y drops by 20.
    const moved = moveTextBox(box(), screenPoint(10, 10), screenPoint(110, 50), page, viewport);

    expect(moved.origin.x).toBeCloseTo(150);
    expect(moved.origin.y).toBeCloseTo(480);
  });

  it("preserves identity, size and text, returning a new box", () => {
    const original = box();
    const moved = moveTextBox(original, screenPoint(0, 0), screenPoint(20, 0), page, { scale: 1 });

    expect(moved).not.toBe(original);
    expect(moved.id).toBe("t1");
    expect(moved.width).toBe(200);
    expect(moved.text).toBe("hi");
    expect(original.origin.x).toBe(100); // input untouched
  });
});

describe("resizeTextBox", () => {
  it("grows width/height by the user-space delta of the bottom-right handle drag", () => {
    const viewport: Viewport = { scale: 2 };
    // Drag the handle right 40 / down 20 at scale 2: width +20, height +10, and
    // since the top edge is the anchor, the bottom drops so origin.y falls by 10.
    const resized = resizeTextBox(
      box(),
      screenPoint(600, 584),
      screenPoint(640, 604),
      page,
      viewport,
    );

    expect(resized.width).toBeCloseTo(220);
    expect(resized.height).toBeCloseTo(34);
    expect(resized.origin.x).toBeCloseTo(100);
    expect(resized.origin.y).toBeCloseTo(490);
  });

  it("clamps to a minimum size when the handle is dragged onto the anchor", () => {
    // box() at scale 1 spans screen (100,268)-(300,292); collapse the handle
    // onto the top-left anchor and the box must not reach zero/negative size.
    const resized = resizeTextBox(box(), screenPoint(300, 292), screenPoint(100, 268), page, {
      scale: 1,
    });

    expect(resized.width).toBeGreaterThan(0);
    expect(resized.height).toBeGreaterThan(0);
    expect(resized.width).toBeLessThan(10);
    expect(resized.height).toBeLessThan(10);
  });
});
