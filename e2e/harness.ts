// e2e harness: render the first fixture page with the real render pipeline and
// CSS so Playwright can exercise text selection in a real browser engine. This
// is the text-layer path from main.ts, minus Tauri (which a browser lacks).
import "../src/pdf/worker";
import "../src/styles.css";
import "../src/pdf/textlayer.css";
import fixtureUrl from "../fixtures/two-page.pdf?url";
import { openPdfDocument } from "../src/pdf/document";
import { capturePageGeometry } from "../src/pdf/geometry";
import { pageDisplaySize } from "../src/pdf/layout";
import { createPagePlaceholders, renderPageTextLayer, renderPageToCanvas } from "../src/pdf/render";

const SCALE = 1.25;

async function main(): Promise<void> {
  const mount = document.querySelector<HTMLElement>("#viewer");
  if (!mount) {
    return;
  }
  const bytes = new Uint8Array(await (await fetch(fixtureUrl)).arrayBuffer());
  const doc = await openPdfDocument(bytes);
  const pages = await capturePageGeometry(doc);
  const sizes = pages.map((page) => pageDisplaySize(page, SCALE));
  const placeholders = createPagePlaceholders(mount, sizes);
  const first = placeholders[0];
  if (!first) {
    return;
  }
  await renderPageToCanvas(doc, 1, first.canvas, SCALE);
  await renderPageTextLayer(doc, 1, first.text, SCALE);
  document.body.setAttribute("data-ready", "1");
}

void main();
