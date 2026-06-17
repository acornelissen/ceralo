// Reusable signatures persisted across sessions. File I/O lives Rust-side (see
// save_signature / list_signatures / rename_signature / set_default_signature /
// delete_signature in pdf_io.rs); this module is the typed seam that converts
// between Tauri's number[] byte arrays and Uint8Array.
import { invoke } from "@tauri-apps/api/core";

export interface SavedSignature {
  readonly id: string;
  readonly pngBytes: Uint8Array;
  /** User-given display name, or null if it has not been named. */
  readonly name: string | null;
  /** Whether this is the default signature offered first in the picker. */
  readonly isDefault: boolean;
}

/** The shape Rust serialises (see SavedSignature in pdf_io.rs). */
interface RawSignature {
  id: string;
  png: number[];
  name: string | null;
  is_default: boolean;
}

/** Persist a signature PNG for reuse; resolves to its generated id. */
export async function saveSignature(pngBytes: Uint8Array): Promise<string> {
  return invoke<string>("save_signature", { bytes: Array.from(pngBytes) });
}

/** List the saved signatures: the default first, then newest. */
export async function listSignatures(): Promise<SavedSignature[]> {
  const saved = await invoke<RawSignature[]>("list_signatures");
  return saved.map(({ id, png, name, is_default }) => ({
    id,
    pngBytes: new Uint8Array(png),
    name: name ?? null,
    isDefault: is_default ?? false,
  }));
}

/** Rename a saved signature; a blank name clears its name. */
export async function renameSignature(id: string, name: string): Promise<void> {
  await invoke("rename_signature", { id, name });
}

/** Make a saved signature the default offered first in the picker. */
export async function setDefaultSignature(id: string): Promise<void> {
  await invoke("set_default_signature", { id });
}

/** Permanently delete a saved signature and its metadata. */
export async function deleteSignature(id: string): Promise<void> {
  await invoke("delete_signature", { id });
}
