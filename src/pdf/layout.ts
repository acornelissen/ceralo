import type { PageGeometry } from "../model/document";

/** A page's on-screen size in CSS pixels. */
export interface DisplaySize {
  readonly width: number;
  readonly height: number;
}

/**
 * The CSS size a page occupies at a given scale, accounting for /Rotate (a
 * quarter turn swaps width and height). Used to size virtualized page
 * placeholders before their canvases are rendered, so scroll height and the
 * coordinate seam stay correct whether or not a page is currently drawn.
 */
export function pageDisplaySize(page: PageGeometry, scale: number): DisplaySize {
  const quarterTurn = page.rotation === 90 || page.rotation === 270;
  return {
    width: (quarterTurn ? page.height : page.width) * scale,
    height: (quarterTurn ? page.width : page.height) * scale,
  };
}
