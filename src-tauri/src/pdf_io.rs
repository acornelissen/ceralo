use std::path::Path;

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

/// A PDF the user opened: its absolute path (so we can later save in place) and
/// its raw bytes (handed to pdf.js on the frontend).
#[derive(Serialize)]
pub struct OpenedPdf {
    pub path: String,
    pub bytes: Vec<u8>,
}

/// Read a PDF file's bytes from disk. Kept separate from the dialog so it can be
/// unit-tested without any UI. Validation of the *contents* (real PDF, not
/// corrupt) lives in the graceful-failure work (m0-10); this just does I/O.
pub fn read_pdf_file(path: &Path) -> std::io::Result<Vec<u8>> {
    std::fs::read(path)
}

/// Show a native open dialog filtered to PDFs, then return the chosen file's
/// path and bytes. Returns `Ok(None)` when the user cancels.
#[tauri::command]
pub async fn open_pdf(app: AppHandle) -> Result<Option<OpenedPdf>, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("PDF", &["pdf"])
        .blocking_pick_file();

    let Some(picked) = picked else {
        return Ok(None);
    };

    let path = picked.into_path().map_err(|e| e.to_string())?;
    let bytes = read_pdf_file(&path).map_err(|e| e.to_string())?;
    Ok(Some(OpenedPdf {
        path: path.to_string_lossy().into_owned(),
        bytes,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_path() -> std::path::PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../fixtures/two-page.pdf")
    }

    #[test]
    fn reads_a_pdf_fixture_from_disk() {
        let bytes = read_pdf_file(&fixture_path()).expect("fixture should be readable");
        assert!(!bytes.is_empty(), "fixture should not be empty");
        assert!(
            bytes.starts_with(b"%PDF-"),
            "fixture should start with the PDF magic header"
        );
    }

    #[test]
    fn reports_an_error_for_a_missing_file() {
        let missing = Path::new(env!("CARGO_MANIFEST_DIR")).join("../fixtures/does-not-exist.pdf");
        assert!(read_pdf_file(&missing).is_err());
    }
}
