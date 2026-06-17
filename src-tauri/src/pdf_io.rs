use std::collections::HashSet;
use std::fmt;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tempfile::NamedTempFile;

/// Upper bound on a PDF we will load into memory. Generous for real documents,
/// but stops a multi-gigabyte file from freezing the webview.
pub const MAX_PDF_BYTES: u64 = 200 * 1024 * 1024;

/// Upper bound on a signature image. A scanned signature is tiny; this only
/// stops an absurd file from being slurped into the webview.
pub const MAX_IMAGE_BYTES: u64 = 20 * 1024 * 1024;

/// Paths the user granted us this session by choosing them in an open or save
/// dialog. save_pdf will only write to a path in this set, so a compromised
/// webview cannot ask the backend to overwrite arbitrary files.
#[derive(Default)]
pub struct GrantedPaths(pub Mutex<HashSet<PathBuf>>);

/// A PDF the user opened: its absolute path (so we can later save in place) and
/// its raw bytes (handed to pdf.js on the frontend).
#[derive(Serialize, Clone)]
pub struct OpenedPdf {
    pub path: String,
    pub bytes: Vec<u8>,
}

/// Why a read failed, with a user-facing message. Corrupt-or-not-a-PDF detection
/// is left to pdf.js on the frontend (it has the full parser); this layer only
/// guards I/O and size.
#[derive(Debug)]
pub enum ReadError {
    Io(std::io::Error),
    TooLarge { size: u64, max: u64 },
    Unsupported,
}

impl fmt::Display for ReadError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ReadError::Io(err) => write!(f, "Could not read the file: {err}"),
            ReadError::TooLarge { size, max } => write!(
                f,
                "That PDF is too large to open ({size} bytes; limit is {max} bytes)."
            ),
            ReadError::Unsupported => write!(f, "Only PDF files can be opened."),
        }
    }
}

impl From<std::io::Error> for ReadError {
    fn from(err: std::io::Error) -> Self {
        ReadError::Io(err)
    }
}

/// Why a save failed.
#[derive(Debug)]
pub enum SaveError {
    Io(std::io::Error),
    NotGranted,
}

impl fmt::Display for SaveError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SaveError::Io(err) => write!(f, "Could not save the file: {err}"),
            SaveError::NotGranted => {
                write!(
                    f,
                    "Refusing to write to a path that was not chosen via a dialog."
                )
            }
        }
    }
}

impl From<std::io::Error> for SaveError {
    fn from(err: std::io::Error) -> Self {
        SaveError::Io(err)
    }
}

/// Reject a file whose size exceeds the limit before we read it into memory.
fn ensure_within_limit(size: u64, max: u64) -> Result<(), ReadError> {
    if size > max {
        Err(ReadError::TooLarge { size, max })
    } else {
        Ok(())
    }
}

/// Read a PDF file's bytes from disk, refusing anything over the size limit.
/// Kept separate from the dialog so it can be unit-tested without any UI.
pub fn read_pdf_file(path: &Path) -> Result<Vec<u8>, ReadError> {
    let metadata = std::fs::metadata(path)?;
    ensure_within_limit(metadata.len(), MAX_PDF_BYTES)?;
    Ok(std::fs::read(path)?)
}

/// Read a signature image's bytes from disk, refusing anything over the image
/// size limit. Kept separate from the dialog so it can be unit-tested.
pub fn read_image_file(path: &Path) -> Result<Vec<u8>, ReadError> {
    let metadata = std::fs::metadata(path)?;
    ensure_within_limit(metadata.len(), MAX_IMAGE_BYTES)?;
    Ok(std::fs::read(path)?)
}

/// True if `path` has a `.pdf` extension (case-insensitive).
fn has_pdf_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("pdf"))
        .unwrap_or(false)
}

/// Read a PDF that was dropped onto the window. The path comes from the OS
/// drag-drop event handled in Rust — never from the webview — so this never
/// exposes an arbitrary-path read to the frontend. The dropped path is granted
/// for later in-place saves, matching `open_pdf`. Non-PDF drops are refused.
pub fn read_dropped_pdf(
    granted: &Mutex<HashSet<PathBuf>>,
    path: &Path,
) -> Result<OpenedPdf, ReadError> {
    if !has_pdf_extension(path) {
        return Err(ReadError::Unsupported);
    }
    let bytes = read_pdf_file(path)?;
    if let Ok(key) = canonical_key(path) {
        granted.lock().expect("granted paths lock").insert(key);
    }
    Ok(OpenedPdf {
        path: path.to_string_lossy().into_owned(),
        bytes,
    })
}

/// A canonical, comparable key for a path that works whether or not the file
/// exists yet: the canonicalized parent directory (symlinks and `..` resolved)
/// joined with the file name. Used to match a save target against granted paths.
fn canonical_key(path: &Path) -> std::io::Result<PathBuf> {
    let file = path.file_name().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "path has no file name")
    })?;
    let parent = match path.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent.to_path_buf(),
        _ => PathBuf::from("."),
    };
    Ok(parent.canonicalize()?.join(file))
}

/// Atomically write bytes to `path`: write a temp file in the same directory,
/// fsync it, then rename over the target. A failed or interrupted write can
/// never corrupt the user's existing PDF.
fn atomic_write(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let dir = match path.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent.to_path_buf(),
        _ => PathBuf::from("."),
    };
    let mut tmp = NamedTempFile::new_in(&dir)?;
    tmp.write_all(bytes)?;
    tmp.as_file().sync_all()?;
    tmp.persist(path).map_err(|err| err.error)?;
    Ok(())
}

/// Write PDF bytes to `path`, but only if that path was granted via a dialog.
/// The single guarded-write entry point, kept pure for unit testing.
pub fn write_pdf(granted: &HashSet<PathBuf>, path: &Path, bytes: &[u8]) -> Result<(), SaveError> {
    let key = canonical_key(path)?;
    if !granted.contains(&key) {
        return Err(SaveError::NotGranted);
    }
    atomic_write(path, bytes)?;
    Ok(())
}

/// A signature PNG persisted under the app data dir for reuse across sessions.
#[derive(Serialize, Clone)]
pub struct SavedSignature {
    pub id: String,
    pub png: Vec<u8>,
}

/// Why persisting or listing a signature failed, with a user-facing message.
#[derive(Debug)]
pub enum SignatureError {
    Io(std::io::Error),
    TooLarge { size: u64, max: u64 },
    NotPng,
}

impl fmt::Display for SignatureError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SignatureError::Io(err) => write!(f, "Could not save the signature: {err}"),
            SignatureError::TooLarge { size, max } => write!(
                f,
                "That signature image is too large ({size} bytes; limit is {max} bytes)."
            ),
            SignatureError::NotPng => write!(f, "A signature must be a PNG image."),
        }
    }
}

impl From<std::io::Error> for SignatureError {
    fn from(err: std::io::Error) -> Self {
        SignatureError::Io(err)
    }
}

/// The 8-byte PNG file signature.
const PNG_MAGIC: &[u8] = &[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/// A sortable, filesystem-safe id from a nanosecond timestamp: 32-char zero-
/// padded hex, so lexical order matches chronological order. Generated backend-
/// side so the frontend never influences the on-disk path.
fn signature_id(nanos: u128) -> String {
    format!("{nanos:032x}")
}

/// Persist a signature PNG into `dir` as `<id>.png`, creating `dir` if needed and
/// restricting the file to the owner (0600 on unix) since signatures are
/// sensitive. Validates the PNG magic and size before writing. Kept free of the
/// AppHandle so it can be unit-tested against a tempdir.
pub fn write_signature(dir: &Path, id: &str, bytes: &[u8]) -> Result<(), SignatureError> {
    let size = bytes.len() as u64;
    if size > MAX_IMAGE_BYTES {
        return Err(SignatureError::TooLarge {
            size,
            max: MAX_IMAGE_BYTES,
        });
    }
    if !bytes.starts_with(PNG_MAGIC) {
        return Err(SignatureError::NotPng);
    }
    std::fs::create_dir_all(dir)?;
    let path = dir.join(format!("{id}.png"));
    atomic_write(&path, bytes)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))?;
    }
    Ok(())
}

/// List the saved signatures in `dir`, newest first. A missing directory means
/// none have been saved yet. Kept AppHandle-free for unit testing.
pub fn read_signatures(dir: &Path) -> Result<Vec<SavedSignature>, SignatureError> {
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(err) => return Err(err.into()),
    };
    let mut signatures = Vec::new();
    for entry in entries {
        let path = entry?.path();
        let is_png = path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("png"))
            .unwrap_or(false);
        if !is_png {
            continue;
        }
        let Some(id) = path.file_stem().and_then(|stem| stem.to_str()) else {
            continue;
        };
        signatures.push(SavedSignature {
            id: id.to_string(),
            png: std::fs::read(&path)?,
        });
    }
    // Filenames are zero-padded timestamps, so a reverse lexical sort is newest first.
    signatures.sort_by(|a, b| b.id.cmp(&a.id));
    Ok(signatures)
}

/// Show a native open dialog filtered to PDFs, then return the chosen file's
/// path and bytes. The chosen path is granted for later in-place saves. Returns
/// `Ok(None)` when the user cancels.
#[tauri::command]
pub async fn open_pdf(
    app: AppHandle,
    granted: State<'_, GrantedPaths>,
) -> Result<Option<OpenedPdf>, String> {
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
    if let Ok(key) = canonical_key(&path) {
        granted.0.lock().expect("granted paths lock").insert(key);
    }
    Ok(Some(OpenedPdf {
        path: path.to_string_lossy().into_owned(),
        bytes,
    }))
}

/// Show a native open dialog filtered to PNG/JPEG, then return the chosen image's
/// bytes for use as a signature. No path is granted (we never save back to it).
/// Returns `Ok(None)` when the user cancels.
#[tauri::command]
pub async fn open_image(app: AppHandle) -> Result<Option<Vec<u8>>, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("Image", &["png", "jpg", "jpeg"])
        .blocking_pick_file();

    let Some(picked) = picked else {
        return Ok(None);
    };

    let path = picked.into_path().map_err(|e| e.to_string())?;
    let bytes = read_image_file(&path).map_err(|e| e.to_string())?;
    Ok(Some(bytes))
}

/// The per-app local directory where reusable signatures live. Local data (not
/// roaming/synced) since signatures are sensitive.
fn signatures_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|dir| dir.join("signatures"))
        .map_err(|e| e.to_string())
}

/// Persist a signature PNG for reuse and return its generated id.
#[tauri::command]
pub fn save_signature(app: AppHandle, bytes: Vec<u8>) -> Result<String, String> {
    let dir = signatures_dir(&app)?;
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let id = signature_id(nanos);
    write_signature(&dir, &id, &bytes).map_err(|e| e.to_string())?;
    Ok(id)
}

/// List the saved signatures (newest first) for the dialog to offer.
#[tauri::command]
pub fn list_signatures(app: AppHandle) -> Result<Vec<SavedSignature>, String> {
    let dir = signatures_dir(&app)?;
    read_signatures(&dir).map_err(|e| e.to_string())
}

/// Save bytes to an already-granted path (Save). Refuses paths not granted this
/// session.
#[tauri::command]
pub fn save_pdf(
    granted: State<'_, GrantedPaths>,
    path: String,
    bytes: Vec<u8>,
) -> Result<(), String> {
    let set = granted.0.lock().expect("granted paths lock").clone();
    write_pdf(&set, Path::new(&path), &bytes).map_err(|e| e.to_string())
}

/// Show a save dialog, grant the chosen path, and write to it (Save As). Returns
/// the chosen path, or `Ok(None)` if the user cancels.
#[tauri::command]
pub async fn save_pdf_as(
    app: AppHandle,
    granted: State<'_, GrantedPaths>,
    bytes: Vec<u8>,
) -> Result<Option<String>, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("PDF", &["pdf"])
        .blocking_save_file();

    let Some(picked) = picked else {
        return Ok(None);
    };

    let path = picked.into_path().map_err(|e| e.to_string())?;
    let key = canonical_key(&path).map_err(|e| e.to_string())?;
    let set = {
        let mut granted = granted.0.lock().expect("granted paths lock");
        granted.insert(key);
        granted.clone()
    };
    write_pdf(&set, &path, &bytes).map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_path() -> PathBuf {
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
    fn reads_an_image_fixture_with_the_png_signature() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../fixtures/signature.png");
        let bytes = read_image_file(&path).expect("image fixture should be readable");
        assert!(
            bytes.starts_with(&[0x89, 0x50, 0x4e, 0x47]),
            "fixture should start with the PNG magic header"
        );
    }

    #[test]
    fn reports_an_error_for_a_missing_file() {
        let missing = Path::new(env!("CARGO_MANIFEST_DIR")).join("../fixtures/does-not-exist.pdf");
        assert!(read_pdf_file(&missing).is_err());
    }

    #[test]
    fn reads_a_dropped_pdf_and_grants_its_path() {
        let granted = Mutex::new(HashSet::new());
        let opened = read_dropped_pdf(&granted, &fixture_path()).expect("dropped pdf should read");
        assert!(opened.bytes.starts_with(b"%PDF-"));
        // The dropped path is granted so a later in-place Save is permitted.
        let key = canonical_key(&fixture_path()).unwrap();
        assert!(granted.lock().unwrap().contains(&key));
    }

    #[test]
    fn refuses_a_dropped_non_pdf() {
        let granted = Mutex::new(HashSet::new());
        let image = Path::new(env!("CARGO_MANIFEST_DIR")).join("../fixtures/signature.png");
        let err = read_dropped_pdf(&granted, &image);
        assert!(matches!(err, Err(ReadError::Unsupported)));
        assert!(
            granted.lock().unwrap().is_empty(),
            "a refused drop grants nothing"
        );
    }

    #[test]
    fn allows_a_file_at_the_limit() {
        assert!(ensure_within_limit(MAX_PDF_BYTES, MAX_PDF_BYTES).is_ok());
    }

    #[test]
    fn rejects_a_file_over_the_limit() {
        let err = ensure_within_limit(MAX_PDF_BYTES + 1, MAX_PDF_BYTES);
        assert!(matches!(err, Err(ReadError::TooLarge { .. })));
    }

    #[test]
    fn atomic_write_round_trips_bytes() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("out.pdf");
        atomic_write(&path, b"%PDF-hello").unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"%PDF-hello");
    }

    #[test]
    fn writes_to_a_granted_path() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("out.pdf");
        let mut granted = HashSet::new();
        granted.insert(canonical_key(&path).unwrap());
        write_pdf(&granted, &path, b"%PDF-data").unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"%PDF-data");
    }

    #[test]
    fn refuses_a_non_granted_path() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("out.pdf");
        let granted = HashSet::new();
        assert!(matches!(
            write_pdf(&granted, &path, b"x"),
            Err(SaveError::NotGranted)
        ));
        assert!(!path.exists(), "refused write must not create the file");
    }

    #[test]
    fn overwrites_a_granted_existing_file_in_place() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("out.pdf");
        std::fs::write(&path, b"old").unwrap();
        let mut granted = HashSet::new();
        granted.insert(canonical_key(&path).unwrap());
        write_pdf(&granted, &path, b"new").unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"new");
    }

    // A minimal byte string that passes the PNG magic check.
    fn png_bytes() -> Vec<u8> {
        let mut bytes = PNG_MAGIC.to_vec();
        bytes.extend_from_slice(b"body");
        bytes
    }

    #[test]
    fn signature_id_is_zero_padded_hex_and_sorts_chronologically() {
        let earlier = signature_id(1);
        let later = signature_id(2);
        assert_eq!(earlier.len(), 32);
        assert!(earlier < later, "older ids must sort before newer ones");
    }

    #[test]
    fn writes_then_lists_a_signature() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("signatures");
        let bytes = png_bytes();
        write_signature(&path, &signature_id(1), &bytes).unwrap();

        let saved = read_signatures(&path).unwrap();
        assert_eq!(saved.len(), 1);
        assert_eq!(saved[0].id, signature_id(1));
        assert_eq!(saved[0].png, bytes);
    }

    #[cfg(unix)]
    #[test]
    fn written_signature_is_owner_only() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        write_signature(dir.path(), "abc", &png_bytes()).unwrap();
        let mode = std::fs::metadata(dir.path().join("abc.png"))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o600);
    }

    #[test]
    fn write_signature_rejects_non_png() {
        let dir = tempfile::tempdir().unwrap();
        let err = write_signature(dir.path(), "abc", b"not a png");
        assert!(matches!(err, Err(SignatureError::NotPng)));
        assert!(
            !dir.path().join("abc.png").exists(),
            "a rejected signature must not be written"
        );
    }

    #[test]
    fn write_signature_rejects_oversize() {
        let dir = tempfile::tempdir().unwrap();
        let oversize = vec![0u8; (MAX_IMAGE_BYTES + 1) as usize];
        let err = write_signature(dir.path(), "abc", &oversize);
        assert!(matches!(err, Err(SignatureError::TooLarge { .. })));
    }

    #[test]
    fn read_signatures_is_empty_for_a_missing_dir() {
        let dir = tempfile::tempdir().unwrap();
        let missing = dir.path().join("nope");
        assert!(read_signatures(&missing).unwrap().is_empty());
    }

    #[test]
    fn read_signatures_ignores_non_png_files_and_sorts_newest_first() {
        let dir = tempfile::tempdir().unwrap();
        write_signature(dir.path(), &signature_id(1), &png_bytes()).unwrap();
        write_signature(dir.path(), &signature_id(3), &png_bytes()).unwrap();
        std::fs::write(dir.path().join("notes.txt"), b"ignore me").unwrap();

        let saved = read_signatures(dir.path()).unwrap();
        let ids: Vec<&str> = saved.iter().map(|s| s.id.as_str()).collect();
        assert_eq!(ids, vec![signature_id(3), signature_id(1)]);
    }
}
