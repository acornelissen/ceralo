// SignetPDF frontend entry point.
// Configures the pdf.js worker, renders a bundled fixture on startup so the
// window is never empty, and lets the user open any PDF (via the Rust open_pdf
// command) and scroll all of its pages.
import "./pdf/worker";
import fixtureUrl from "../fixtures/two-page.pdf?url";
import { invoke } from "@tauri-apps/api/core";
import { loadPdfDocument } from "./pdf/document";
import { renderAllPages } from "./pdf/render";

interface OpenedPdf {
  path: string;
  bytes: number[];
}

async function renderBytes(mount: HTMLElement, bytes: Uint8Array): Promise<void> {
  const doc = await loadPdfDocument(bytes);
  await renderAllPages(doc, mount);
}

async function openUserPdf(mount: HTMLElement): Promise<void> {
  const opened = await invoke<OpenedPdf | null>("open_pdf");
  if (!opened) {
    return; // user cancelled the dialog
  }
  await renderBytes(mount, new Uint8Array(opened.bytes));
}

async function showBundledFixture(mount: HTMLElement): Promise<void> {
  const bytes = new Uint8Array(await (await fetch(fixtureUrl)).arrayBuffer());
  await renderBytes(mount, bytes);
}

window.addEventListener("DOMContentLoaded", () => {
  const mount = document.querySelector<HTMLElement>("#viewer");
  if (!mount) {
    return;
  }

  document.querySelector<HTMLButtonElement>("#open")?.addEventListener("click", () => {
    openUserPdf(mount).catch((error: unknown) => {
      mount.textContent = `Failed to open the PDF: ${String(error)}`;
    });
  });

  showBundledFixture(mount).catch((error: unknown) => {
    mount.textContent = `Failed to render the bundled PDF: ${String(error)}`;
  });
});
