//! File reading and writing.
//!
//! The frontend has no direct filesystem access; these commands are the only
//! way content reaches or leaves the disk. Every entry point validates its path
//! before touching anything.

use crate::error::{AppError, ErrorCode};
use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// Refuse to load anything larger than this.
///
/// The editor targets documents up to roughly 500 KB. This ceiling is far above
/// that but still low enough that a mis-click on a video file fails fast with a
/// clear message instead of exhausting memory.
const MAX_FILE_BYTES: u64 = 32 * 1024 * 1024;

/// A successfully loaded document.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileReadResult {
    pub path: String,
    pub file_name: String,
    pub content: String,
}

/// Validate a path supplied by the frontend and normalise it to a `PathBuf`.
///
/// Paths always originate from a native dialog, so this is defence in depth
/// rather than the primary control. It rejects anything that is not a plain,
/// absolute, traversal-free path.
pub fn validate_path(raw: &str) -> Result<PathBuf, AppError> {
    if raw.trim().is_empty() {
        return Err(AppError::new(
            ErrorCode::InvalidPath,
            "No file path was provided.",
        ));
    }

    // An interior NUL truncates the path at the syscall boundary, so a value
    // containing one can never be trusted to mean what it looks like.
    if raw.contains('\0') {
        return Err(AppError::new(
            ErrorCode::InvalidPath,
            "That file path contains invalid characters.",
        ));
    }

    let path = Path::new(raw);

    if !path.is_absolute() {
        return Err(AppError::with_details(
            ErrorCode::InvalidPath,
            "Only absolute file paths are supported.",
            format!("received: {raw}"),
        ));
    }

    // `..` never appears in a dialog-produced path. Rejecting it keeps the
    // resolved location identical to the literal one.
    if path.components().any(|c| c == Component::ParentDir) {
        return Err(AppError::with_details(
            ErrorCode::InvalidPath,
            "That file path is not allowed.",
            format!("path contains a parent-directory segment: {raw}"),
        ));
    }

    Ok(path.to_path_buf())
}

/// Derive the display file name for a path.
fn file_name_of(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Untitled.md".to_string())
}

/// Strip a UTF-8 byte-order mark.
///
/// Editors on other platforms sometimes leave one behind. Keeping it would show
/// an invisible leading character in the editor and shift every column number
/// on line 1, so it is dropped on load and not written back.
fn strip_bom(content: String) -> String {
    match content.strip_prefix('\u{feff}') {
        Some(stripped) => stripped.to_string(),
        None => content,
    }
}

/// Read a UTF-8 text file from disk.
#[tauri::command]
pub fn read_markdown_file(path: String) -> Result<FileReadResult, AppError> {
    let path = validate_path(&path)?;
    read_file_at(&path)
}

/// The testable core of [`read_markdown_file`].
fn read_file_at(path: &Path) -> Result<FileReadResult, AppError> {
    let metadata = fs::metadata(path).map_err(|err| {
        AppError::from_io(&err, ErrorCode::ReadFailure, "Could not open that file.")
    })?;

    if !metadata.is_file() {
        return Err(AppError::with_details(
            ErrorCode::InvalidPath,
            "That is not a file.",
            format!("not a regular file: {}", path.display()),
        ));
    }

    if metadata.len() > MAX_FILE_BYTES {
        return Err(AppError::with_details(
            ErrorCode::FileTooLarge,
            format!(
                "That file is too large to open ({} MB). The limit is {} MB.",
                metadata.len() / (1024 * 1024),
                MAX_FILE_BYTES / (1024 * 1024)
            ),
            format!("{} bytes", metadata.len()),
        ));
    }

    let bytes = fs::read(path).map_err(|err| {
        AppError::from_io(&err, ErrorCode::ReadFailure, "Could not read that file.")
    })?;

    let content = String::from_utf8(bytes).map_err(|err| {
        AppError::with_details(
            ErrorCode::InvalidUtf8,
            "That file is not valid UTF-8 text, so it cannot be edited here.",
            err.to_string(),
        )
    })?;

    Ok(FileReadResult {
        path: path.to_string_lossy().into_owned(),
        file_name: file_name_of(path),
        content: strip_bom(content),
    })
}

/// Write text to disk, replacing any existing file.
#[tauri::command]
pub fn write_markdown_file(path: String, content: String) -> Result<(), AppError> {
    let path = validate_path(&path)?;
    write_file_at(&path, &content)
}

/// The testable core of [`write_markdown_file`].
///
/// Writes to a temporary file in the destination directory, flushes and fsyncs
/// it, then renames it over the target. The rename is atomic within a single
/// filesystem, so a crash mid-save leaves either the old file or the new one
/// intact - never a truncated hybrid.
pub(crate) fn write_file_at(path: &Path, content: &str) -> Result<(), AppError> {
    // Follow symlinks so we replace the file the link points at rather than
    // clobbering the link itself.
    let target = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());

    let parent = target.parent().ok_or_else(|| {
        AppError::with_details(
            ErrorCode::InvalidPath,
            "That location cannot be written to.",
            format!("no parent directory for {}", target.display()),
        )
    })?;

    if !parent.is_dir() {
        return Err(AppError::with_details(
            ErrorCode::InvalidPath,
            "The folder for that file no longer exists.",
            format!("missing directory: {}", parent.display()),
        ));
    }

    let temp_path = parent.join(temp_file_name(&target));

    // Any failure from here on must not leave the temporary file behind.
    let write_result = (|| -> std::io::Result<()> {
        let mut file = fs::File::create(&temp_path)?;
        file.write_all(content.as_bytes())?;
        file.flush()?;
        // Force the bytes to disk before the rename makes them visible.
        file.sync_all()?;
        Ok(())
    })();

    if let Err(err) = write_result {
        let _ = fs::remove_file(&temp_path);
        return Err(AppError::from_io(
            &err,
            ErrorCode::SaveFailure,
            "Could not save the file.",
        ));
    }

    // Carry over the original file's permissions; a fresh temp file would
    // otherwise silently reset them to the default mode.
    if let Ok(existing) = fs::metadata(&target) {
        let _ = fs::set_permissions(&temp_path, existing.permissions());
    }

    if let Err(err) = fs::rename(&temp_path, &target) {
        let _ = fs::remove_file(&temp_path);
        return Err(AppError::from_io(
            &err,
            ErrorCode::SaveFailure,
            "Could not save the file.",
        ));
    }

    Ok(())
}

/// Build a collision-resistant temporary name beside the destination file.
///
/// The leading dot keeps it hidden if the process dies before the rename.
fn temp_file_name(target: &Path) -> String {
    let stem = target
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "document".to_string());

    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);

    format!(".{stem}.tmp-{}-{nanos}", std::process::id())
}

/// Show a file in Finder.
///
/// Routed through Rust so the path is validated and confirmed to exist before
/// the opener plugin is invoked; the frontend is not granted the
/// `reveal-item-in-dir` permission directly.
#[tauri::command]
pub fn reveal_in_file_manager(path: String) -> Result<(), AppError> {
    let path = validate_path(&path)?;

    if !path.exists() {
        return Err(AppError::with_details(
            ErrorCode::FileNotFound,
            "That file is no longer on disk.",
            path.display().to_string(),
        ));
    }

    tauri_plugin_opener::reveal_item_in_dir(&path).map_err(|err| {
        AppError::with_details(
            ErrorCode::Unknown,
            "Could not reveal that file in Finder.",
            err.to_string(),
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn rejects_empty_and_blank_paths() {
        assert_eq!(validate_path("").unwrap_err().code, ErrorCode::InvalidPath);
        assert_eq!(
            validate_path("   ").unwrap_err().code,
            ErrorCode::InvalidPath
        );
    }

    #[test]
    fn rejects_relative_paths() {
        let err = validate_path("notes/todo.md").unwrap_err();
        assert_eq!(err.code, ErrorCode::InvalidPath);
    }

    #[test]
    fn rejects_parent_directory_traversal() {
        let err = validate_path("/Users/someone/../../etc/passwd").unwrap_err();
        assert_eq!(err.code, ErrorCode::InvalidPath);
    }

    #[test]
    fn rejects_interior_nul_bytes() {
        let err = validate_path("/tmp/evil\0.md").unwrap_err();
        assert_eq!(err.code, ErrorCode::InvalidPath);
    }

    #[test]
    fn accepts_a_plain_absolute_path() {
        let path = validate_path("/tmp/notes.md").expect("valid");
        assert_eq!(path, PathBuf::from("/tmp/notes.md"));
    }

    #[test]
    fn reads_valid_utf8_content() {
        let dir = tempdir().expect("temp dir");
        let path = dir.path().join("notes.md");
        fs::write(&path, "# Título\n\nAccents: café — ok\n").expect("write");

        let result = read_file_at(&path).expect("reads");

        assert_eq!(result.file_name, "notes.md");
        assert!(result.content.starts_with("# Título"));
        assert!(result.content.contains("café — ok"));
    }

    #[test]
    fn strips_a_leading_byte_order_mark() {
        let dir = tempdir().expect("temp dir");
        let path = dir.path().join("bom.md");
        fs::write(&path, "\u{feff}# Heading").expect("write");

        let result = read_file_at(&path).expect("reads");

        assert_eq!(result.content, "# Heading");
    }

    #[test]
    fn rejects_invalid_utf8() {
        let dir = tempdir().expect("temp dir");
        let path = dir.path().join("binary.md");
        // 0xFF is never valid in a UTF-8 sequence.
        fs::write(&path, [0x68, 0x69, 0xff, 0xfe]).expect("write");

        let err = read_file_at(&path).unwrap_err();

        assert_eq!(err.code, ErrorCode::InvalidUtf8);
        assert!(err.details.is_some());
    }

    #[test]
    fn reports_a_missing_file_as_not_found() {
        let dir = tempdir().expect("temp dir");
        let err = read_file_at(&dir.path().join("absent.md")).unwrap_err();

        assert_eq!(err.code, ErrorCode::FileNotFound);
    }

    #[test]
    fn rejects_reading_a_directory() {
        let dir = tempdir().expect("temp dir");
        let err = read_file_at(dir.path()).unwrap_err();

        assert_eq!(err.code, ErrorCode::InvalidPath);
    }

    #[test]
    fn writes_content_and_reads_it_back() {
        let dir = tempdir().expect("temp dir");
        let path = dir.path().join("out.md");

        write_file_at(&path, "# Saved\n\nBody text.\n").expect("writes");

        let round_tripped = read_file_at(&path).expect("reads");
        assert_eq!(round_tripped.content, "# Saved\n\nBody text.\n");
    }

    #[test]
    fn overwrites_an_existing_file_completely() {
        let dir = tempdir().expect("temp dir");
        let path = dir.path().join("out.md");
        fs::write(&path, "a much longer original document").expect("write");

        write_file_at(&path, "short").expect("writes");

        // A non-atomic write that forgot to truncate would leave trailing bytes.
        assert_eq!(fs::read_to_string(&path).expect("read"), "short");
    }

    #[test]
    fn leaves_no_temporary_files_behind() {
        let dir = tempdir().expect("temp dir");
        let path = dir.path().join("out.md");

        write_file_at(&path, "content").expect("writes");

        let entries: Vec<_> = fs::read_dir(dir.path())
            .expect("read dir")
            .filter_map(Result::ok)
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(entries, vec!["out.md".to_string()]);
    }

    #[test]
    fn writing_into_a_missing_directory_is_an_invalid_path() {
        let dir = tempdir().expect("temp dir");
        let path = dir.path().join("nope").join("out.md");

        let err = write_file_at(&path, "content").unwrap_err();

        assert_eq!(err.code, ErrorCode::InvalidPath);
    }

    #[test]
    fn writes_empty_content() {
        let dir = tempdir().expect("temp dir");
        let path = dir.path().join("empty.md");

        write_file_at(&path, "").expect("writes");

        assert_eq!(read_file_at(&path).expect("reads").content, "");
    }
}
