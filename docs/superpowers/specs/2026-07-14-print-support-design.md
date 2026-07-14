# Print support — design

Date: 2026-07-14

## Goal

Let the user print the document they are viewing, including every edit —
filled fields, text edits, markup, comments, shapes, ink and signatures — so
the printout matches what is on screen.

## Approach

Reuse the existing flatten-to-bytes path and hand the result to the OS. This
mirrors `exportFlattened` in `src/main.ts`: the model is projected to flattened
PDF bytes, then instead of a Save-As dialog the bytes go to a new Tauri command
that writes a temp file and opens it with the OS default PDF handler. The user
lands in their normal print flow (Preview on macOS, Edge/Acrobat on Windows,
the default viewer on Linux).

Alternatives considered and rejected:

- **In-app `window.print()`** — render flattened pages to images in a hidden
  print-only DOM and call `window.print()`. Keeps the dialog in-app but
  reliability differs across the macOS/Windows/Linux webviews and it is more
  code. Rejected for the cross-platform risk.
- **Native Rust printing** — send bytes straight to a printer from a Rust
  printing crate. Fully in-app but heavy, platform-specific, and the weakest
  cross-platform story. Rejected.

## What gets printed

The current model, flattened via `projectBytes(model, { flatten: true })`. This
is the exact same projection used by "Export flattened", so the printout is
WYSIWYG. Guards match the save path:

- No-op if there is no open document.
- Blocked with the existing encryption toast if the source is encrypted
  (`blockedByEncryption` / `EncryptedSaveError`), since pdf-lib cannot rewrite
  encrypted content.

## Frontend (`src/main.ts`)

- New `printDocument(viewer)`, structurally a sibling of `exportFlattened`:
  guard → `projectBytes(model, { flatten: true })` → `invoke("print_pdf", {
  bytes: Array.from(bytes) })` → success or failure toast.
- A **Print** button in the dock, following the existing icon/dock pattern
  (new icon added to `src/app/icons.ts`, wired in `src/app/dock.ts` and via
  `on("#print", ...)` in `main.ts`).
- A **Cmd/Ctrl+P** shortcut, resolved per platform like the existing save and
  find shortcuts, calling `preventDefault()` so the webview's built-in print
  does not also fire.

## Backend (`src-tauri/src/pdf_io.rs`)

- New `#[tauri::command] print_pdf(bytes: Vec<u8>) -> Result<...>`:
  - Write the bytes to a uniquely named file in the per-user temp directory
    (`std::env::temp_dir()`), which is not world-readable on macOS/Linux. Use a
    known filename prefix (e.g. `ceralo-print-`) and restrictive permissions
    where the platform supports it.
  - Open the file with the OS default handler so the user reaches their print
    dialog.
  - Register the command in `src-tauri/src/lib.rs`. Add whatever capability the
    chosen opener mechanism requires to `src-tauri/capabilities/default.json`.
- **Temp file lifecycle — per-user temp dir, best-effort cleanup:** the file
  cannot be deleted immediately because the external viewer holds it open. On
  startup, purge our own leftover temp-print files (matched by the known
  prefix) older than a threshold. Files left by a crash are cleaned on the next
  launch.

## Testing

- **Vitest** (`src/main.ts` behavior, mirroring the save/export tests):
  - no open document → `invoke` is not called;
  - encrypted source → blocked, encryption toast shown, no `invoke`;
  - happy path → `invoke("print_pdf", ...)` called with the flattened bytes and
    a success toast shown.
- **Rust** (`src-tauri/src/pdf_io.rs`):
  - temp filename generation uses the expected prefix and is unique;
  - the cleanup-purge predicate selects only our old temp-print files and
    spares unrelated files and recent ones.
- Reuse existing fixtures (rotated page, all-field-types form) through the
  shared flatten path — no new fixtures.

## Out of scope (YAGNI)

Page-range selection, in-app print preview, printer/paper settings, and
silent direct-to-printer printing. All are handled by the OS print dialog the
user lands in.
