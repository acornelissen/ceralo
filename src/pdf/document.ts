import { getDocument, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

// The legacy build is used deliberately: it runs both in the Tauri webview and
// under node (Vitest), so tests exercise the same loader the app does. The
// worker is configured separately in ./worker (imported only by the app entry);
// without it, pdfjs falls back to an in-process worker, which is fine for the
// pure parsing that the headless tests need.

/**
 * Parse PDF bytes into a pdf.js document. The input buffer is copied first
 * because pdf.js may transfer (detach) the ArrayBuffer it is handed.
 */
export function loadPdfDocument(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  return getDocument({ data: bytes.slice() }).promise;
}
