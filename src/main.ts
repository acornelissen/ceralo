// SignetPDF frontend entry point.
// Configures the pdf.js worker, renders a bundled fixture on startup so the
// window is never empty, and lets the user open any PDF (via the Rust open_pdf
// command), scroll all of its pages, and zoom.
import "./pdf/worker";
import fixtureUrl from "../fixtures/two-page.pdf?url";
import { invoke } from "@tauri-apps/api/core";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { loadPdfDocument } from "./pdf/document";
import { renderAllPages } from "./pdf/render";
import { clampScale, fitToWidthScale, ZOOM_STEP } from "./pdf/zoom";

interface OpenedPdf {
  path: string;
  bytes: number[];
}

interface Viewer {
  mount: HTMLElement;
  zoomLabel: HTMLElement | null;
  doc: PDFDocumentProxy | null;
  scale: number;
}

async function rerender(viewer: Viewer): Promise<void> {
  if (viewer.zoomLabel) {
    viewer.zoomLabel.textContent = `${Math.round(viewer.scale * 100)}%`;
  }
  if (viewer.doc) {
    await renderAllPages(viewer.doc, viewer.mount, viewer.scale);
  }
}

async function setDocument(viewer: Viewer, bytes: Uint8Array): Promise<void> {
  viewer.doc = await loadPdfDocument(bytes);
  await rerender(viewer);
}

async function setScale(viewer: Viewer, scale: number): Promise<void> {
  viewer.scale = clampScale(scale);
  await rerender(viewer);
}

async function fitWidth(viewer: Viewer): Promise<void> {
  if (!viewer.doc) {
    return;
  }
  const page = await viewer.doc.getPage(1);
  const { width } = page.getViewport({ scale: 1 });
  await setScale(viewer, fitToWidthScale(width, viewer.mount.clientWidth));
}

async function openUserPdf(viewer: Viewer): Promise<void> {
  const opened = await invoke<OpenedPdf | null>("open_pdf");
  if (!opened) {
    return; // user cancelled the dialog
  }
  await setDocument(viewer, new Uint8Array(opened.bytes));
}

async function showBundledFixture(viewer: Viewer): Promise<void> {
  const bytes = new Uint8Array(await (await fetch(fixtureUrl)).arrayBuffer());
  await setDocument(viewer, bytes);
}

window.addEventListener("DOMContentLoaded", () => {
  const mount = document.querySelector<HTMLElement>("#viewer");
  if (!mount) {
    return;
  }

  const viewer: Viewer = {
    mount,
    zoomLabel: document.querySelector<HTMLElement>("#zoom-level"),
    doc: null,
    scale: 1.25,
  };

  const report = (action: Promise<void>, what: string): void => {
    action.catch((error: unknown) => {
      mount.textContent = `Failed to ${what}: ${String(error)}`;
    });
  };

  document
    .querySelector<HTMLButtonElement>("#open")
    ?.addEventListener("click", () => report(openUserPdf(viewer), "open the PDF"));
  document
    .querySelector<HTMLButtonElement>("#zoom-in")
    ?.addEventListener("click", () => report(setScale(viewer, viewer.scale * ZOOM_STEP), "zoom"));
  document
    .querySelector<HTMLButtonElement>("#zoom-out")
    ?.addEventListener("click", () => report(setScale(viewer, viewer.scale / ZOOM_STEP), "zoom"));
  document
    .querySelector<HTMLButtonElement>("#zoom-fit")
    ?.addEventListener("click", () => report(fitWidth(viewer), "fit width"));

  report(showBundledFixture(viewer), "render the bundled PDF");
});
