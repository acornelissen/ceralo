// Pure zoom maths, kept out of the DOM so it can be unit-tested. Scales are
// pdf.js render scales (1 = intrinsic point size).
export const MIN_SCALE = 0.25;
export const MAX_SCALE = 5;
export const ZOOM_STEP = 1.2;

/** Constrain a scale to the supported range. */
export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * Scale needed for a page of `pageWidth` points to fill `availableWidth` pixels,
 * clamped to the supported range. Falls back to 1 for a non-positive width.
 */
export function fitToWidthScale(pageWidth: number, availableWidth: number): number {
  if (pageWidth <= 0) {
    return 1;
  }
  return clampScale(availableWidth / pageWidth);
}
