//! Window-level actions that have no filesystem counterpart.

use crate::error::{AppError, ErrorCode};
use tauri::WebviewWindow;

/// Opens the native print dialog for the document currently rendered in the
/// webview.
///
/// `window.print()` from the frontend does not reliably reach WKWebView's
/// print machinery inside a chrome-less, embedded webview like Tauri's, so
/// this goes through wry's native bridge instead, which drives
/// `-[WKWebView printOperationWithPrintInfo:]` directly.
#[tauri::command]
pub fn print_document(window: WebviewWindow) -> Result<(), AppError> {
    window.print().map_err(|err| {
        AppError::with_details(
            ErrorCode::Unknown,
            "Could not open the print dialog.",
            err.to_string(),
        )
    })
}
