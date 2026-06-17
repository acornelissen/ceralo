// Reusable signatures persisted across sessions. File I/O lives Rust-side (see
// save_signature / list_signatures in pdf_io.rs); this module is the typed seam
// that converts between Tauri's number[] byte arrays and Uint8Array.
import { invoke } from "@tauri-apps/api/core";

export interface SavedSignature {
  readonly id: string;
  readonly pngBytes: Uint8Array;
}

/** Persist a signature PNG for reuse; resolves to its generated id. */
export async function saveSignature(pngBytes: Uint8Array): Promise<string> {
  return invoke<string>("save_signature", { bytes: Array.from(pngBytes) });
}

/** List the saved signatures, newest first. */
export async function listSignatures(): Promise<SavedSignature[]> {
  const saved = await invoke<{ id: string; png: number[] }[]>("list_signatures");
  return saved.map(({ id, png }) => ({ id, pngBytes: new Uint8Array(png) }));
}
