import { AnnotationMode, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { DisplaySize } from "./layout";

/**
 * Render one page of a pdf.js document onto a canvas at the given scale. This
 * is plain rasterisation: it reads the document and nothing else. Document-model
 * state (fields, annotations) never enters here — that boundary is the M1 seam.
 */
export async function renderPageToCanvas(
  doc: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale = 1,
): Promise<void> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvasContext = canvas.getContext("2d");
  if (!canvasContext) {
    throw new Error("2D canvas context unavailable");
  }
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  // ENABLE_FORMS renders the page and non-form annotations but NOT interactive
  // form widgets — those are drawn by our HTML overlay, so the canvas must not
  // paint them too (otherwise field values render twice).
  await page.render({
    canvas,
    canvasContext,
    viewport,
    annotationMode: AnnotationMode.ENABLE_FORMS,
  }).promise;
}

/**
 * A page placeholder: a sized container holding the (initially blank) canvas and
 * the overlay layer the caller fills with form/annotation controls. The canvas
 * is rendered on demand when the page nears the viewport and cleared when it
 * leaves, so a large document stays bounded in memory (m5-9).
 */
export interface RenderedPage {
  readonly index: number; // 0-based
  readonly container: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly overlay: HTMLElement;
}

/**
 * Lay out one sized, empty placeholder per page, stacked top to bottom, into
 * `mount`. Sizing every placeholder up front keeps the scroll height and the
 * coordinate seam correct whether or not a page is currently drawn. Existing
 * content is cleared first. Canvases are rendered later by renderPageToCanvas.
 */
export function createPagePlaceholders(mount: HTMLElement, sizes: DisplaySize[]): RenderedPage[] {
  mount.replaceChildren();
  return sizes.map((size, index) => {
    const container = document.createElement("div");
    container.className = "page-container";
    container.style.width = `${size.width}px`;
    container.style.height = `${size.height}px`;

    const canvas = document.createElement("canvas");
    canvas.className = "page";
    container.appendChild(canvas);

    const overlay = document.createElement("div");
    overlay.className = "overlay";
    container.appendChild(overlay);

    mount.appendChild(container);
    return { index, container, canvas, overlay };
  });
}

/** Release a page's canvas memory when it scrolls out of view. */
export function clearPageCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}
