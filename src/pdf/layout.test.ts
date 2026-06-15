import { describe, expect, it } from "vitest";
import type { PageGeometry } from "../model/document";
import { pageDisplaySize } from "./layout";

const page = (over: Partial<PageGeometry> = {}): PageGeometry => ({
  index: 0,
  width: 600,
  height: 800,
  rotation: 0,
  ...over,
});

describe("pageDisplaySize", () => {
  it("scales the unrotated size", () => {
    expect(pageDisplaySize(page(), 1)).toEqual({ width: 600, height: 800 });
    expect(pageDisplaySize(page(), 2)).toEqual({ width: 1200, height: 1600 });
  });

  it("swaps width and height for quarter-turn rotations", () => {
    expect(pageDisplaySize(page({ rotation: 90 }), 1)).toEqual({ width: 800, height: 600 });
    expect(pageDisplaySize(page({ rotation: 270 }), 1)).toEqual({ width: 800, height: 600 });
  });

  it("does not swap for 180", () => {
    expect(pageDisplaySize(page({ rotation: 180 }), 1)).toEqual({ width: 600, height: 800 });
  });
});
