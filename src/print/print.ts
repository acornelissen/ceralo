// The print decision, kept pure so the guards (no document / encrypted / print)
// are testable without the DOM or Tauri. main.ts supplies the port: `flatten`
// reuses the Save projection (flatten: true) and `send` invokes the Rust
// print_pdf command. Printing never mutates the model.
import type { DocumentModel } from "../model/document";

export interface PrintPort {
  /** Project the model to flattened, printable PDF bytes (the Save projection). */
  flatten(model: DocumentModel): Promise<Uint8Array>;
  /** Hand the bytes to the OS for printing. */
  send(bytes: Uint8Array): Promise<void>;
}

export type PrintOutcome = "printed" | "no-document" | "encrypted";

/**
 * Print the current document. No-op without a document; refuses an encrypted
 * source (pdf-lib cannot rewrite it, exactly as Save refuses); otherwise
 * flattens and sends. Returns the outcome so the caller can surface a message.
 */
export async function printDocument(
  model: DocumentModel | null,
  encrypted: boolean,
  port: PrintPort,
): Promise<PrintOutcome> {
  if (!model) {
    return "no-document";
  }
  if (encrypted) {
    return "encrypted";
  }
  const bytes = await port.flatten(model);
  await port.send(bytes);
  return "printed";
}
