import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadPdfDocument } from "../pdf/document";
import { capturePageGeometry } from "../pdf/geometry";
import { modelToScreen, screenToModel, type Viewport } from "./coords";
import type { PageGeometry } from "./document";
import { screenPoint, userSpacePoint } from "./geometry";

function page(rotation: number): PageGeometry {
  return { index: 0, width: 612, height: 792, rotation };
}

const viewport: Viewport = { scale: 2 };

// Hand-computed expectations for a 612x792 page at scale 2. User space is
// bottom-left origin; screen space is top-left origin.
const cases: Array<{ rotation: number; input: [number, number]; expected: [number, number] }> = [
  { rotation: 0, input: [0, 0], expected: [0, 1584] },
  { rotation: 0, input: [612, 792], expected: [1224, 0] },
  { rotation: 0, input: [100, 200], expected: [200, 1184] },
  { rotation: 90, input: [0, 0], expected: [0, 0] },
  { rotation: 90, input: [100, 200], expected: [400, 200] },
  { rotation: 90, input: [612, 792], expected: [1584, 1224] },
  { rotation: 180, input: [0, 0], expected: [1224, 0] },
  { rotation: 180, input: [612, 792], expected: [0, 1584] },
  { rotation: 180, input: [100, 200], expected: [1024, 400] },
  { rotation: 270, input: [0, 0], expected: [1584, 1224] },
  { rotation: 270, input: [612, 792], expected: [0, 0] },
  { rotation: 270, input: [100, 200], expected: [1184, 1024] },
];

describe("modelToScreen", () => {
  it.each(cases)("rotation $rotation maps $input to $expected", ({ rotation, input, expected }) => {
    const result = modelToScreen(userSpacePoint(input[0], input[1]), page(rotation), viewport);
    expect(result.x).toBeCloseTo(expected[0], 6);
    expect(result.y).toBeCloseTo(expected[1], 6);
  });
});

function fixture(name: string): Uint8Array {
  return new Uint8Array(
    readFileSync(fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url))),
  );
}

describe("screenToModel", () => {
  it("inverts a known modelToScreen mapping", () => {
    const back = screenToModel(screenPoint(200, 1184), page(0), viewport);
    expect(back.x).toBeCloseTo(100, 6);
    expect(back.y).toBeCloseTo(200, 6);
  });

  it("round-trips screenToModel(modelToScreen(p)) ~= p across rotations and scales", () => {
    const rotations = [0, 90, 180, 270];
    const scales = [0.5, 1, 1.5, 2, 3.7];
    const xs = [0, 50, 306, 612];
    const ys = [0, 123, 400, 792];

    for (const rotation of rotations) {
      for (const scale of scales) {
        const geometry = page(rotation);
        const vp: Viewport = { scale };
        for (const x of xs) {
          for (const y of ys) {
            const start = userSpacePoint(x, y);
            const back = screenToModel(modelToScreen(start, geometry, vp), geometry, vp);
            expect(back.x).toBeCloseTo(x, 6);
            expect(back.y).toBeCloseTo(y, 6);
          }
        }
      }
    }
  });
});

describe("modelToScreen matches pdf.js convertToViewportPoint", () => {
  it.each(["two-page.pdf", "rotated-90.pdf"])(
    "aligns with the rendered page for %s",
    async (name) => {
      const doc = await loadPdfDocument(fixture(name));
      const geometry = (await capturePageGeometry(doc))[0];
      if (!geometry) {
        throw new Error("fixture has no pages");
      }
      const pdfjsPage = await doc.getPage(1);
      const scale = 1.5;
      const pdfjsViewport = pdfjsPage.getViewport({ scale });

      for (const [x, y] of [
        [0, 0],
        [100, 200],
        [612, 792],
      ] as Array<[number, number]>) {
        const mine = modelToScreen(userSpacePoint(x, y), geometry, { scale });
        const [ex, ey] = pdfjsViewport.convertToViewportPoint(x, y);
        expect(mine.x).toBeCloseTo(ex, 4);
        expect(mine.y).toBeCloseTo(ey, 4);
      }
    },
  );
});
