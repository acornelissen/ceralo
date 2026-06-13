// SignetPDF frontend entry point.
// M0-4 proves the pipeline end to end inside the webview: configure the pdf.js
// worker, load a bundled fixture, and render its first page. User-chosen
// documents and full multi-page scrolling arrive in m0-5/m0-6.
import "./pdf/worker";
import fixtureUrl from "../fixtures/two-page.pdf?url";
import { loadPdfDocument } from "./pdf/document";
import { renderPageToCanvas } from "./pdf/render";

async function showBundledFixture(mount: HTMLElement): Promise<void> {
  const bytes = new Uint8Array(await (await fetch(fixtureUrl)).arrayBuffer());
  const doc = await loadPdfDocument(bytes);
  const canvas = document.createElement("canvas");
  canvas.className = "page";
  mount.replaceChildren(canvas);
  await renderPageToCanvas(doc, 1, canvas, 1.25);
}

window.addEventListener("DOMContentLoaded", () => {
  const mount = document.querySelector<HTMLElement>("#viewer");
  if (!mount) {
    return;
  }
  showBundledFixture(mount).catch((error: unknown) => {
    mount.textContent = `Failed to render the bundled PDF: ${String(error)}`;
  });
});
