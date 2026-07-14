# Print Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user print the document they are viewing, with all edits (fields, text, markup, comments, shapes, ink, signatures) baked in, by handing a flattened PDF to the OS default handler.

**Architecture:** Reuse the existing flatten-to-bytes projection (`projectBytes(model, { flatten: true })`). A new pure `printDocument` seam decides the outcome (no-op / encrypted / print); `main.ts` wires it to a dock button and a Cmd/Ctrl+P shortcut. A new Tauri command `print_pdf` writes the bytes to a uniquely named file in the per-user temp dir, opens it with the OS default PDF handler via the `opener` crate, and a best-effort startup sweep purges our own stale temp-print files.

**Tech Stack:** TypeScript + Vite (frontend), Vitest (tests); Rust + Tauri 2 (backend), `cargo test`; `opener` crate for OS handoff; pdf-lib via the existing `saveModel` path.

## Global Constraints

- All geometry is PDF user space; never screen pixels. (Not touched here — the flatten path already handles it.)
- Product name **Ceralo**; the temp-file prefix is `ceralo-print-`.
- The DocumentModel is immutable and the single source of truth; printing reads it, never mutates it.
- Save is a pure model → pdf-lib → bytes projection; printing reuses that exact projection with `flatten: true`.
- Encrypted sources are refused (pdf-lib cannot rewrite them) — printing must refuse them exactly as save does.
- No emoji anywhere. Conventional-commit messages. Atomic commits (each compiles, tests pass).
- Custom Tauri commands need **no** capability entry (existing commands have none); `opener` is a plain crate needing no capability. Do **not** edit `capabilities/default.json`.

---

### Task 1: Rust temp-file naming and purge predicate (pure helpers)

Pure, dependency-free helpers so the naming and cleanup logic are unit-tested without touching the filesystem or Tauri.

**Files:**

- Modify: `src-tauri/src/pdf_io.rs` (add helpers near the signature helpers around line 350; add tests in the existing `#[cfg(test)] mod tests` block at line 562)

**Interfaces:**

- Consumes: `std::path::{Path, PathBuf}`, `std::time::Duration` (add `use std::time::Duration;` if not already imported — it is not; add it to the imports at the top).
- Produces (used by Task 2):
  - `const PRINT_PREFIX: &str = "ceralo-print-";`
  - `const PRINT_MAX_AGE: Duration = Duration::from_secs(60 * 60);`
  - `fn print_file_name(nanos: u128) -> String`
  - `fn print_temp_path(dir: &Path, nanos: u128) -> PathBuf`
  - `fn is_purgeable_print(name: &str, age: Duration, max_age: Duration) -> bool`

- [ ] **Step 1: Write the failing tests**

Add to the `mod tests` block in `src-tauri/src/pdf_io.rs`:

```rust
    #[test]
    fn print_file_name_is_prefixed_padded_hex_pdf() {
        let name = print_file_name(0xABC);
        assert!(name.starts_with("ceralo-print-"), "carries the shared prefix");
        assert!(name.ends_with(".pdf"), "has a .pdf extension so the OS picks a PDF handler");
        // Zero-padded hex nanos: fixed width keeps names sortable and unique.
        assert_eq!(name, "ceralo-print-00000000000000000000000000000abc.pdf");
    }

    #[test]
    fn print_file_name_is_unique_per_nanos() {
        assert_ne!(print_file_name(1), print_file_name(2));
    }

    #[test]
    fn print_temp_path_joins_the_dir() {
        let path = print_temp_path(Path::new("/tmp"), 1);
        assert_eq!(path.parent().unwrap(), Path::new("/tmp"));
        assert!(path.file_name().unwrap().to_str().unwrap().starts_with("ceralo-print-"));
    }

    #[test]
    fn purges_only_our_old_pdfs() {
        let old = Duration::from_secs(7200);
        let fresh = Duration::from_secs(10);
        let max = Duration::from_secs(3600);
        // Ours, old enough -> purge.
        assert!(is_purgeable_print("ceralo-print-0001.pdf", old, max));
        // Ours but recent -> keep (the viewer may still hold it open).
        assert!(!is_purgeable_print("ceralo-print-0001.pdf", fresh, max));
        // Not ours -> never touch, regardless of age.
        assert!(!is_purgeable_print("someone-else.pdf", old, max));
        // Ours-looking prefix but not a PDF -> leave alone.
        assert!(!is_purgeable_print("ceralo-print-0001.tmp", old, max));
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd src-tauri && cargo test print_ && cargo test purges_only`
Expected: FAIL — `cannot find function print_file_name` (and the others).

- [ ] **Step 3: Implement the helpers**

Add near the top imports of `src-tauri/src/pdf_io.rs`:

```rust
use std::time::Duration;
```

Add the helpers (place them just above `fn signature_id` around line 350, or anywhere in the module body outside `mod tests`):

```rust
/// Shared prefix for the temp PDFs we hand to the OS printer. Lets the startup
/// sweep recognise and purge only our own leftovers.
const PRINT_PREFIX: &str = "ceralo-print-";

/// How long a temp-print file may linger before the startup sweep removes it.
/// Long enough that the external viewer has certainly finished opening it.
const PRINT_MAX_AGE: Duration = Duration::from_secs(60 * 60);

/// Name for a temp-print file: prefix + zero-padded hex nanos + `.pdf`. The
/// fixed-width hex keeps names unique per creation instant and sortable.
fn print_file_name(nanos: u128) -> String {
    format!("{PRINT_PREFIX}{nanos:032x}.pdf")
}

/// Full path for a temp-print file inside `dir`.
fn print_temp_path(dir: &Path, nanos: u128) -> PathBuf {
    dir.join(print_file_name(nanos))
}

/// True when `name` is one of our temp-print PDFs and has aged past `max_age`.
/// Only our prefix + `.pdf` files are ever eligible, so the sweep can never
/// delete an unrelated temp file.
fn is_purgeable_print(name: &str, age: Duration, max_age: Duration) -> bool {
    name.starts_with(PRINT_PREFIX) && name.ends_with(".pdf") && age >= max_age
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test print_ && cargo test purges_only`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/pdf_io.rs
git commit -m "feat: add temp-print naming and purge helpers"
```

---

### Task 2: Rust print_pdf command, startup purge, and registration

Wire the pure helpers into a Tauri command that writes the temp file and opens it with the OS, plus a best-effort startup sweep. This is integration glue over the OS/opener; the meaty logic was tested in Task 1.

**Files:**

- Modify: `src-tauri/Cargo.toml` (add the `opener` dependency)
- Modify: `src-tauri/src/pdf_io.rs` (add `print_pdf` command and `purge_stale_prints`)
- Modify: `src-tauri/src/lib.rs` (register the command; run the startup sweep)

**Interfaces:**

- Consumes: `print_temp_path`, `is_purgeable_print`, `PRINT_MAX_AGE`, `PRINT_PREFIX` from Task 1; `opener::open`.
- Produces (used by Task 4 / frontend): the Tauri command `print_pdf(bytes: Vec<u8>) -> Result<(), String>` (invoked from JS as `invoke("print_pdf", { bytes })`); and `pub fn purge_stale_prints()`.

- [ ] **Step 1: Add the opener dependency**

In `src-tauri/Cargo.toml`, under `[dependencies]`, add:

```toml
opener = "0.7"
```

- [ ] **Step 2: Verify it resolves**

Run: `cd src-tauri && cargo build`
Expected: builds (downloads `opener`). If offline, this is the only step that needs network; the rest is local.

- [ ] **Step 3: Implement the command and the sweep**

Add to `src-tauri/src/pdf_io.rs` (outside `mod tests`), after the helpers from Task 1:

```rust
/// Flatten-to-bytes is done on the frontend (the same projection as Save). This
/// command only takes the finished PDF, drops it in the per-user temp dir, and
/// opens it with the OS default handler so the user reaches their print dialog.
/// The file cannot be deleted here because the external viewer holds it open;
/// `purge_stale_prints` cleans it up on a later launch.
#[tauri::command]
pub fn print_pdf(bytes: Vec<u8>) -> Result<(), String> {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let path = print_temp_path(&std::env::temp_dir(), nanos);
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    opener::open(&path).map_err(|e| e.to_string())?;
    Ok(())
}

/// Best-effort sweep of our own leftover temp-print files in the per-user temp
/// dir. Runs at startup; silently ignores every error (a locked or vanished
/// file just stays for the next launch). Only files matching our prefix and
/// past `PRINT_MAX_AGE` are removed — never an unrelated temp file.
pub fn purge_stale_prints() {
    let dir = std::env::temp_dir();
    let now = std::time::SystemTime::now();
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        let Ok(meta) = entry.metadata() else { continue };
        let Ok(modified) = meta.modified() else { continue };
        let age = now.duration_since(modified).unwrap_or_default();
        if is_purgeable_print(name, age, PRINT_MAX_AGE) {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}
```

- [ ] **Step 4: Register the command and run the sweep at startup**

In `src-tauri/src/lib.rs`, add `pdf_io::print_pdf` to the `generate_handler!` list (after `pdf_io::delete_signature`, adding a comma after that line):

```rust
            pdf_io::delete_signature,
            pdf_io::print_pdf
```

Then add a startup sweep. Immediately after `.manage(pdf_io::GrantedPaths::default())`, add a `.setup` hook (run off-thread so it never delays window creation):

```rust
        .setup(|_app| {
            // Best-effort cleanup of our own leftover temp-print files.
            std::thread::spawn(pdf_io::purge_stale_prints);
            Ok(())
        })
```

- [ ] **Step 5: Verify it compiles and all Rust tests pass**

Run: `cd src-tauri && cargo build && cargo test`
Expected: builds; all existing tests plus Task 1's tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/pdf_io.rs src-tauri/src/lib.rs
git commit -m "feat: add print_pdf command with OS handoff and temp cleanup"
```

---

### Task 3: Frontend print seam (pure `printDocument`)

A pure, injectable decision function so the guard logic (no document / encrypted / print) is unit-tested without the DOM or Tauri — matching the codebase's pure-module pattern (`model/coords`, `save/save`).

**Files:**

- Create: `src/print/print.ts`
- Test: `src/print/print.test.ts`

**Interfaces:**

- Consumes: `DocumentModel` from `../model/document`.
- Produces (used by Task 4):
  - `interface PrintPort { flatten(model: DocumentModel): Promise<Uint8Array>; send(bytes: Uint8Array): Promise<void> }`
  - `type PrintOutcome = "printed" | "no-document" | "encrypted"`
  - `function printDocument(model: DocumentModel | null, encrypted: boolean, port: PrintPort): Promise<PrintOutcome>`

- [ ] **Step 1: Write the failing test**

Create `src/print/print.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { printDocument, type PrintPort } from "./print";
import type { DocumentModel } from "../model/document";

// A minimal stand-in model; printDocument only checks for presence, not shape.
const model = {} as DocumentModel;

function port(over: Partial<PrintPort> = {}): PrintPort {
  return {
    flatten: vi.fn(async () => new Uint8Array([1, 2, 3])),
    send: vi.fn(async () => {}),
    ...over,
  };
}

describe("printDocument", () => {
  it("does nothing without a document", async () => {
    const p = port();
    expect(await printDocument(null, false, p)).toBe("no-document");
    expect(p.flatten).not.toHaveBeenCalled();
    expect(p.send).not.toHaveBeenCalled();
  });

  it("refuses an encrypted document without flattening or sending", async () => {
    const p = port();
    expect(await printDocument(model, true, p)).toBe("encrypted");
    expect(p.flatten).not.toHaveBeenCalled();
    expect(p.send).not.toHaveBeenCalled();
  });

  it("flattens the model and sends the bytes on the happy path", async () => {
    const bytes = new Uint8Array([9, 9]);
    const p = port({ flatten: vi.fn(async () => bytes) });
    expect(await printDocument(model, false, p)).toBe("printed");
    expect(p.flatten).toHaveBeenCalledWith(model);
    expect(p.send).toHaveBeenCalledWith(bytes);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/print/print.test.ts`
Expected: FAIL — cannot resolve `./print`.

- [ ] **Step 3: Write the implementation**

Create `src/print/print.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/print/print.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/print/print.ts src/print/print.test.ts
git commit -m "feat: add pure printDocument seam"
```

---

### Task 4: Print trigger — icon, shortcut, dock button, main.ts wiring

Expose printing: a printer icon, a Cmd/Ctrl+P shortcut (both TDD), a dock File-group button, and the `main.ts` wiring that connects them to the `printDocument` seam and the `print_pdf` command.

**Files:**

- Modify: `src/app/icons.ts` (add the `print` icon)
- Test: `src/app/icons.test.ts` (assert `print` is exposed)
- Modify: `src/app/shortcuts.ts` (add the `print` action)
- Test: `src/app/shortcuts.test.ts` (assert Cmd/Ctrl+P maps to `print`)
- Modify: `src/app/dock.ts` (add the Print button to the File group)
- Modify: `src/main.ts` (import `printDocument`; add a `printFlattened` wrapper; wire the button click and the shortcut)

**Interfaces:**

- Consumes: `printDocument`, `PrintPort` from Task 3; `projectBytes` and `blockedByEncryption` and `notify` already in `main.ts`; `invoke` from `@tauri-apps/api/core`; the `print_pdf` command from Task 2.
- Produces: user-visible Print button (`#print`) and Cmd/Ctrl+P.

- [ ] **Step 1: Write the failing shortcut test**

In `src/app/shortcuts.test.ts`, inside the `"maps the core actions"` test, add a line:

```ts
expect(matchShortcut(chord({ key: "p", ctrlKey: true }), "other")).toBe("print");
```

- [ ] **Step 2: Write the failing icon test**

In `src/app/icons.test.ts`, add `"print",` to the `names` array in the `"exposes every dock and toast icon"` test.

- [ ] **Step 3: Run both tests to verify they fail**

Run: `npx vitest run src/app/shortcuts.test.ts src/app/icons.test.ts`
Expected: FAIL — shortcut returns `null` for `p`; `icon("print")` throws.

- [ ] **Step 4: Implement the shortcut action**

In `src/app/shortcuts.ts`, add `"print"` to the `ShortcutAction` union:

```ts
export type ShortcutAction =
  | "open"
  | "save"
  | "save-as"
  | "print"
  | "undo"
  | "redo"
  | "zoom-in"
  | "zoom-out"
  | "zoom-reset";
```

And add a case in `matchShortcut`'s `switch` (after the `"s"` case):

```ts
    case "p":
      return "print";
```

- [ ] **Step 5: Implement the print icon**

In `src/app/icons.ts`, add to the `PATHS` object (after `"save-as"`):

```ts
  print:
    '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
```

- [ ] **Step 6: Run both tests to verify they pass**

Run: `npx vitest run src/app/shortcuts.test.ts src/app/icons.test.ts`
Expected: PASS.

- [ ] **Step 7: Add the dock button**

In `src/app/dock.ts`, in the `File` group's `buttons` array, add a Print entry after `export-flat`:

```ts
      { id: "export-flat", name: "export", label: "Export flattened copy" },
      { id: "print", name: "print", label: "Print", shortcut: "P" },
```

- [ ] **Step 8: Wire main.ts — the print wrapper**

In `src/main.ts`, add the import near the other feature imports (after the `save/save` import at line 142):

```ts
import { printDocument } from "./print/print";
```

Add a `printFlattened` function next to `exportFlattened` (after it, around line 1972). It reuses `projectBytes` (flatten), `blockedByEncryption`, `notify`, and `invoke`:

```ts
/**
 * Print the current document: flatten it (the Save projection) and hand the
 * bytes to the OS default PDF handler, where the user reaches their print
 * dialog. The working document is left untouched.
 */
async function printFlattened(viewer: Viewer): Promise<void> {
  const outcome = await printDocument(viewer.model, viewer.encrypted, {
    flatten: (model) => projectBytes(model, { flatten: true }),
    send: (bytes) => invoke("print_pdf", { bytes: Array.from(bytes) }),
  });
  if (outcome === "encrypted") {
    blockedByEncryption(viewer);
    return;
  }
  if (outcome === "printed") {
    notify(viewer, "Sent to your PDF viewer for printing.", "success");
  }
}
```

Note: `blockedByEncryption` both reports and returns a boolean; here we only need its reporting side effect, so call it for the message. Confirm `viewer.encrypted` is the field `blockedByEncryption` reads (it is — see `blockedByEncryption` at ~line 2044).

- [ ] **Step 9: Wire main.ts — the button click**

In `src/main.ts`, next to the other `on(...)` wirings (after the `#export-flat` line ~2160), add:

```ts
on("#print", () => printFlattened(viewer), "print the PDF");
```

- [ ] **Step 10: Wire main.ts — the shortcut**

In `src/main.ts`, in the keyboard `switch (action)` block (after the `save-as` case ~2330), add:

```ts
      case "print":
        run(() => printFlattened(viewer), "print the PDF");
        return;
```

The surrounding handler already calls `event.preventDefault()` for any matched action, so the webview's built-in print will not also fire.

- [ ] **Step 11: Run the full frontend gate**

Run: `npm run typecheck && npx vitest run && npm run lint`
Expected: types clean, all tests pass, lint clean.

- [ ] **Step 12: Commit**

```bash
git add src/app/icons.ts src/app/icons.test.ts src/app/shortcuts.ts src/app/shortcuts.test.ts src/app/dock.ts src/main.ts
git commit -m "feat: add Print button and Cmd/Ctrl+P shortcut"
```

---

### Task 5: Manual end-to-end verification

Automated tests cover the pure logic; the OS handoff itself can only be confirmed live.

**Files:** none (verification only).

- [ ] **Step 1: Launch the app**

Run: `npm run tauri dev`

- [ ] **Step 2: Verify the happy path**

Open a fixture PDF (e.g. `fixtures/` with a form and a rotated page), fill a field and add a signature, then click **Print** (and separately test Cmd/Ctrl+P). Expected: the OS default PDF viewer opens showing the flattened document with your edits baked in; a success toast appears. Print from there to confirm the output matches the screen.

- [ ] **Step 3: Verify the guards**

With no document open, Print does nothing (no toast, no error). Open an encrypted PDF (`fixtures/`), then Print: the encryption toast appears and nothing is sent.

- [ ] **Step 4: Verify cleanup**

Confirm a `ceralo-print-*.pdf` file appears in the OS temp dir after printing. Restart the app after the file is older than the max age (or temporarily lower `PRINT_MAX_AGE` for the check) and confirm the startup sweep removes it, while leaving unrelated temp files untouched.

- [ ] **Step 5: Close the beads issue**

```bash
bd close SignetPDF-c3u
```

---

## Self-Review

**Spec coverage:**

- WYSIWYG flattened output → Task 3 (`flatten` port) + Task 4 (`projectBytes({flatten:true})`). ✓
- No-document / encrypted guards → Task 3 + Task 4. ✓
- Dock button + Cmd/Ctrl+P → Task 4. ✓
- `print_pdf` command, per-user temp dir, OS default handler → Task 2. ✓
- Best-effort startup cleanup by prefix + age → Tasks 1 & 2. ✓
- Rust tests (naming, cleanup predicate) → Task 1. ✓
- Frontend tests (guards) → Task 3; shortcut/icon tests → Task 4. ✓
- Reuse existing fixtures, no new fixtures → Task 5 uses `fixtures/`. ✓
- Out of scope (page ranges, preview, printer settings) → not implemented. ✓

**Spec corrections folded in:** the spec said the Vitest tests would "mirror the existing save/export tests" and that a capability entry might be needed. In reality `main.ts` glue is untested (no `main.test.ts` harness), so the plan extracts a pure `printDocument` seam to make the guards testable; and custom Tauri commands need no capability, so `capabilities/default.json` is left untouched. These are reflected in the Global Constraints and Task 3.

**Placeholder scan:** none — every code and command step is concrete.

**Type consistency:** `PrintPort`/`PrintOutcome`/`printDocument` names match between Task 3 (definition) and Task 4 (use); `print_temp_path`/`is_purgeable_print`/`PRINT_MAX_AGE`/`PRINT_PREFIX` match between Task 1 (definition) and Task 2 (use); the `"print"` shortcut action and `print` icon name match between Task 4's tests and implementation.
