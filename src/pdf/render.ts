import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

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
  await page.render({ canvas, canvasContext, viewport }).promise;
}

/**
 * Render every page of a document, stacked top to bottom, into `mount`. Existing
 * content is cleared first. Pages render in order; large-document virtualisation
 * (only drawing near-viewport pages) is deferred to m5-9.
 */
export async function renderAllPages(
  doc: PDFDocumentProxy,
  mount: HTMLElement,
  scale = 1.25,
): Promise<void> {
  mount.replaceChildren();
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const canvas = document.createElement("canvas");
    canvas.className = "page";
    mount.appendChild(canvas);
    await renderPageToCanvas(doc, pageNumber, canvas, scale);
  }
}
