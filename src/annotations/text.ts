import { screenToModel, type Viewport } from "../model/coords";
import { addAnnotation, type DocumentModel, type PageGeometry } from "../model/document";
import type { ScreenPoint } from "../model/geometry";

// The text tool. A click on a page becomes a free-text annotation: the click is
// converted to user space through the one coordinate seam and added to the model
// through addAnnotation, so the model stays the single source of truth and the
// box lands where the page was rendered (at any scale and rotation).

/** Defaults for a freshly created text box (user-space units; pt for fontSize). */
export interface TextBoxDefaults {
  readonly width: number;
  readonly height: number;
  readonly fontSize: number;
}

export const DEFAULT_TEXT_BOX: TextBoxDefaults = {
  width: 160,
  height: 24,
  fontSize: 12,
};

/**
 * Create a text box from a page-relative screen click. The click maps to the
 * box origin via screenToModel; the new box starts empty and is added through
 * the immutable mutator, returning a new, dirty model.
 */
export function createTextBoxAt(
  model: DocumentModel,
  click: ScreenPoint,
  page: PageGeometry,
  viewport: Viewport,
  defaults: TextBoxDefaults = DEFAULT_TEXT_BOX,
): DocumentModel {
  const origin = screenToModel(click, page, viewport);
  return addAnnotation(model, {
    kind: "text",
    page: page.index,
    origin,
    width: defaults.width,
    height: defaults.height,
    text: "",
    fontSize: defaults.fontSize,
  });
}
