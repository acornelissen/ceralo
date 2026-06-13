import { GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
// `?url` makes Vite emit the worker as a bundled asset and hands back a URL
// that resolves inside the Tauri webview. Getting this path wrong is the
// classic Tauri + pdf.js failure, so it is pinned here and nowhere else.
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;
