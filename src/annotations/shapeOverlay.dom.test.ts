// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { PageGeometry, Shape } from "../model/document";
import { userSpacePoint } from "../model/geometry";
import { bindShapeDelete, buildShapeControl } from "./shapeOverlay";

const page: PageGeometry = { index: 0, width: 612, height: 792, rotation: 0 };
const viewport = { scale: 1 };

function shape(overrides: Partial<Shape> = {}): Shape {
  return {
    kind: "shape",
    id: "s1",
    page: 0,
    shape: "rectangle",
    start: userSpacePoint(72, 700),
    end: userSpacePoint(200, 640),
    stroke: "#cc0000",
    strokeWidth: 2,
    fill: null,
    ...overrides,
  };
}

describe("buildShapeControl (DOM)", () => {
  it("carries the annotation id and kind, and is positioned in px", () => {
    const control = buildShapeControl(shape(), page, viewport);
    expect(control.dataset.annotationId).toBe("s1");
    expect(control.dataset.annotationKind).toBe("shape");
    expect(control.style.left).toMatch(/px$/);
    expect(control.style.width).toMatch(/px$/);
  });

  it("renders a stroked rect element for a rectangle", () => {
    const rect = buildShapeControl(shape(), page, viewport).querySelector("rect");
    expect(rect).not.toBeNull();
    expect(rect?.getAttribute("stroke")).toBe("#cc0000");
    expect(rect?.getAttribute("fill")).toBe("none"); // no fill
  });

  it("applies the fill colour when set", () => {
    const rect = buildShapeControl(shape({ fill: "#ffff00" }), page, viewport).querySelector(
      "rect",
    );
    expect(rect?.getAttribute("fill")).toBe("#ffff00");
  });

  it("renders an ellipse element for an ellipse", () => {
    const el = buildShapeControl(shape({ shape: "ellipse" }), page, viewport).querySelector(
      "ellipse",
    );
    expect(el).not.toBeNull();
  });

  it("renders a line element for a line", () => {
    const line = buildShapeControl(shape({ shape: "line" }), page, viewport).querySelector("line");
    expect(line).not.toBeNull();
  });

  it("renders the arrowhead (more line segments) for an arrow", () => {
    const lines = buildShapeControl(shape({ shape: "arrow" }), page, viewport).querySelectorAll(
      "line",
    );
    expect(lines.length).toBeGreaterThanOrEqual(3); // shaft + two head segments
  });

  it("scales stroke width by the viewport", () => {
    const rect = buildShapeControl(shape({ strokeWidth: 2 }), page, { scale: 2 }).querySelector(
      "rect",
    );
    expect(Number(rect?.getAttribute("stroke-width"))).toBeCloseTo(4, 5);
  });
});

describe("bindShapeDelete (DOM)", () => {
  it("calls onDelete with the shape id", () => {
    const control = buildShapeControl(shape(), page, viewport);
    const onDelete = vi.fn();
    bindShapeDelete(control, shape(), onDelete);
    control.querySelector<HTMLButtonElement>(".shape-delete")?.click();
    expect(onDelete).toHaveBeenCalledWith("s1");
  });
});
