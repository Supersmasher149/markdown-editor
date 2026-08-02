//! Settings persistence.
//!
//! Settings live in a single JSON file inside the OS application-support
//! directory. Rust deliberately treats the payload as opaque JSON: the shape,
//! defaults, and validation all live in `src/stores/settingsStore.ts` so there
//! is exactly one definition of what a valid settings object is.

use crate::commands::files::write_file_at;
use crate::error::{AppError, ErrorCode};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const SETTINGS_FILE: &str = "settings.json";

/// Resolve the settings file path, creating the config directory if needed.
fn settings_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = app.path().app_config_dir().map_err(|err| {
        AppError::with_details(
            ErrorCode::InvalidPath,
            "Could not locate the application settings folder.",
            err.to_string(),
        )
    })?;

    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|err| {
            AppError::from_io(
                &err,
                ErrorCode::SaveFailure,
                "Could not create the application settings folder.",
            )
        })?;
    }

    Ok(dir.join(SETTINGS_FILE))
}

/// Load stored settings.
///
/// Returns `Ok(None)` when nothing has been saved yet or when the file on disk
/// is unreadable or malformed. A corrupt settings file must never stop the app
/// from starting, so the frontend simply falls back to defaults.
#[tauri::command]
pub fn load_settings(app: AppHandle) -> Result<Option<serde_json::Value>, AppError> {
    let path = settings_path(&app)?;

    let Ok(raw) = fs::read_to_string(&path) else {
        return Ok(None);
    };

    Ok(serde_json::from_str(&raw).ok())
}

/// Persist settings, replacing the existing file atomically.
#[tauri::command]
pub fn save_settings(app: AppHandle, settings: serde_json::Value) -> Result<(), AppError> {
    let path = settings_path(&app)?;

    let serialised = serde_json::to_string_pretty(&settings).map_err(|err| {
        AppError::with_details(
            ErrorCode::SaveFailure,
            "Could not save your settings.",
            err.to_string(),
        )
    })?;

    write_file_at(&path, &serialised)
}
