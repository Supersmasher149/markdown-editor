//! Structured errors shared with the frontend.
//!
//! Every command returns `Result<T, AppError>`. Tauri serialises the `Err`
//! variant straight to the JS side, so the shape here is a public contract:
//! it mirrors the `AppError` type in `src/types/index.ts`.

use serde::Serialize;
use std::fmt;
use std::io;

/// Stable, machine-readable error codes.
///
/// The frontend switches on these, so variants must not be renamed casually.
/// They serialise as `SCREAMING_SNAKE_CASE` strings (`FileNotFound` ->
/// `"FILE_NOT_FOUND"`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    FileNotFound,
    PermissionDenied,
    InvalidUtf8,
    ReadFailure,
    SaveFailure,
    InvalidPath,
    FileTooLarge,
    Unknown,
}

/// An error suitable for display to a user.
///
/// `message` is a complete, human-readable sentence. `details` carries the
/// underlying technical text (usually an `io::Error`) for diagnostics; the UI
/// shows it only as secondary text, never as the primary message.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: ErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

impl AppError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            details: None,
        }
    }

    pub fn with_details(
        code: ErrorCode,
        message: impl Into<String>,
        details: impl Into<String>,
    ) -> Self {
        Self {
            code,
            message: message.into(),
            details: Some(details.into()),
        }
    }

    /// Convert an [`io::Error`] into a user-facing error.
    ///
    /// `NotFound` and `PermissionDenied` carry enough meaning on their own to
    /// get specific wording. Anything else falls back to the caller-supplied
    /// `fallback` code and `message`, because only the caller knows whether it
    /// was reading or writing.
    pub fn from_io(err: &io::Error, fallback: ErrorCode, message: &str) -> Self {
        let (code, message) = match err.kind() {
            io::ErrorKind::NotFound => (
                ErrorCode::FileNotFound,
                "The file could not be found. It may have been moved or deleted.".to_string(),
            ),
            io::ErrorKind::PermissionDenied => (
                ErrorCode::PermissionDenied,
                "Permission denied. Check that you have access to this file.".to_string(),
            ),
            _ => (fallback, message.to_string()),
        };
        Self::with_details(code, message, err.to_string())
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for AppError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_not_found_regardless_of_fallback() {
        let io_err = io::Error::new(io::ErrorKind::NotFound, "no such file");
        let err = AppError::from_io(&io_err, ErrorCode::ReadFailure, "unused");

        assert_eq!(err.code, ErrorCode::FileNotFound);
        assert!(err.message.contains("could not be found"));
        assert_eq!(err.details.as_deref(), Some("no such file"));
    }

    #[test]
    fn maps_permission_denied_regardless_of_fallback() {
        let io_err = io::Error::new(io::ErrorKind::PermissionDenied, "nope");
        let err = AppError::from_io(&io_err, ErrorCode::SaveFailure, "unused");

        assert_eq!(err.code, ErrorCode::PermissionDenied);
    }

    #[test]
    fn uses_fallback_for_unrecognised_kinds() {
        let io_err = io::Error::other("disk on fire");
        let err = AppError::from_io(&io_err, ErrorCode::SaveFailure, "Could not save.");

        assert_eq!(err.code, ErrorCode::SaveFailure);
        assert_eq!(err.message, "Could not save.");
        assert_eq!(err.details.as_deref(), Some("disk on fire"));
    }

    #[test]
    fn serialises_codes_as_screaming_snake_case() {
        let err = AppError::new(ErrorCode::InvalidUtf8, "Not text.");
        let json = serde_json::to_value(&err).expect("serialises");

        assert_eq!(json["code"], "INVALID_UTF8");
        assert_eq!(json["message"], "Not text.");
        // `details` is omitted rather than null so the TS optional field works.
        assert!(json.get("details").is_none());
    }
}
