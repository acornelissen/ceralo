import { modelToScreen, type Viewport } from "../model/coords";
import type { PageGeometry, Shape } from "../model/document";
import { positionElement as position } from "../overlay/position";
import type { ScreenRect } from "./transform";

// The shape overlay: an SVG drawing of a shape over the rendered page. Like the
// other overlays it holds no state — the shape's two points are placed through
// the one coordinate seam (modelToScreen) and the only mutation, delete, routes
// back to the model (invariant 1). The SVG sits in a container at the shape's
// screen bounding box; the shape is drawn in container-local coordinates so the
// whole thing can be positioned with one box.

const SVG_NS = "http://www.w3.org/2000/svg";

/** A shape's screen geometry: its bounding box plus its two endpoints (local). */
interface ShapeScreen {
  box: ScreenRect;
  start: { x: number; y: number }; // relative to the box's top-left
  end: { x: number; y: number };
}

function shapeScreen(shape: Shape, page: PageGeometry, viewport: Viewport): ShapeScreen {
  const a = modelToScreen(shape.start, page, viewport);
  const b = modelToScreen(shape.end, page, viewport);
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  return {
    box: { left, top, width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) },
    start: { x: a.x - left, y: a.y - top },
    end: { x: b.x - left, y: b.y - top },
  };
}

function svg(tag: string, attrs: Record<string, string | number>): SVGElement {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

/** Draw the shape's geometry into the SVG, in container-local coordinates. */
function drawInto(root: SVGElement, shape: Shape, geo: ShapeScreen, strokeWidth: number): void {
  const common = {
    stroke: shape.stroke,
    "stroke-width": strokeWidth,
    fill: shape.fill ?? "none",
  };
  const inset = strokeWidth / 2; // keep the stroke inside the box
  if (shape.shape === "rectangle") {
    root.appendChild(
      svg("rect", {
        x: inset,
        y: inset,
        width: Math.max(0, geo.box.width - strokeWidth),
        height: Math.max(0, geo.box.height - strokeWidth),
        ...common,
      }),
    );
    return;
  }
  if (shape.shape === "ellipse") {
    root.appendChild(
      svg("ellipse", {
        cx: geo.box.width / 2,
        cy: geo.box.height / 2,
        rx: Math.max(0, geo.box.width / 2 - inset),
        ry: Math.max(0, geo.box.height / 2 - inset),
        ...common,
      }),
    );
    return;
  }
  // line or arrow: the shaft, plus an arrowhead for arrows. Lines never fill.
  const lineAttrs = {
    stroke: shape.stroke,
    "stroke-width": strokeWidth,
    "stroke-linecap": "round",
  };
  root.appendChild(
    svg("line", { x1: geo.start.x, y1: geo.start.y, x2: geo.end.x, y2: geo.end.y, ...lineAttrs }),
  );
  if (shape.shape === "arrow") {
    const angle = Math.atan2(geo.end.y - geo.start.y, geo.end.x - geo.start.x);
    const length = Math.max(6, strokeWidth * 4);
    const spread = Math.PI / 7;
    for (const a of [angle - spread, angle + spread]) {
      root.appendChild(
        svg("line", {
          x1: geo.end.x,
          y1: geo.end.y,
          x2: geo.end.x - length * Math.cos(a),
          y2: geo.end.y - length * Math.sin(a),
          ...lineAttrs,
        }),
      );
    }
  }
}

/**
 * Build the control for a shape: a container at its screen bounding box holding
 * an SVG drawing and a delete button. Stroke width is scaled by the viewport so
 * the on-screen weight tracks the rendered page.
 */
export function buildShapeControl(
  shape: Shape,
  page: PageGeometry,
  viewport: Viewport,
): HTMLElement {
  const geo = shapeScreen(shape, page, viewport);
  const strokeWidth = shape.strokeWidth * viewport.scale;

  const container = document.createElement("div");
  container.className = `shape shape-${shape.shape}`;
  container.dataset.annotationId = shape.id;
  container.dataset.annotationKind = "shape";
  position(container, geo.box);

  const root = svg("svg", {
    width: geo.box.width,
    height: geo.box.height,
    // Let the stroke (and fill) catch clicks; the empty box does not.
    overflow: "visible",
  });
  root.setAttribute("class", "shape-svg");
  drawInto(root, shape, geo, strokeWidth);
  container.appendChild(root);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "shape-delete";
  remove.setAttribute("aria-label", `Delete ${shape.shape}`);
  remove.textContent = "×";
  container.appendChild(remove);

  return container;
}

/** Wire the delete button so clicking it removes this shape from the model. */
export function bindShapeDelete(
  container: HTMLElement,
  shape: Shape,
  onDelete: (id: string) => void,
): void {
  const button = container.querySelector<HTMLButtonElement>(".shape-delete");
  button?.addEventListener("click", () => onDelete(shape.id));
}
