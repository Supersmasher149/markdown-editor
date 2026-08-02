import { invoke } from "@tauri-apps/api/core";
import {
  open as openDialog,
  save as saveDialog,
} from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { AppError, AppSettings, FileReadResult } from "../types";

/**
 * The only channel between the UI and the outside world.
 *
 * Everything here either opens a native panel or calls one of the five Rust
 * commands. Nothing else in the frontend imports `@tauri-apps/*` directly, so
 * this file is the single place to audit for privileged behaviour.
 */

/** File types offered in the open and save panels. */
export const MARKDOWN_EXTENSIONS = ["md", "markdown", "txt"] as const;

const DIALOG_FILTERS = [
  { name: "Markdown", extensions: ["md", "markdown"] },
  { name: "Text", extensions: ["txt"] },
];

/**
 * Normalise anything thrown across the IPC boundary into an `AppError`.
 *
 * Rust commands reject with a serialised `AppError`, but a transport failure or
 * a programming error can surface as a string or an `Error`. Callers should
 * never have to care which.
 */
export function toAppError(thrown: unknown): AppError {
  if (
    typeof thrown === "object" &&
    thrown !== null &&
    "code" in thrown &&
    "message" in thrown &&
    typeof (thrown as { message: unknown }).message === "string"
  ) {
    return thrown as AppError;
  }

  if (thrown instanceof Error) {
    return {
      code: "UNKNOWN",
      message: "Something went wrong.",
      details: thrown.message,
    };
  }

  return {
    code: "UNKNOWN",
    message: "Something went wrong.",
    details: typeof thrown === "string" ? thrown : undefined,
  };
}

/** Show the open panel. Resolves to null when the user cancels. */
export async function pickFileToOpen(): Promise<string | null> {
  const selected = await openDialog({
    multiple: false,
    directory: false,
    filters: DIALOG_FILTERS,
  });

  // Older dialog versions could return an array; guard rather than assume.
  if (Array.isArray(selected)) return selected[0] ?? null;
  return selected ?? null;
}

/** Show the save panel. Resolves to null when the user cancels. */
export async function pickFileToSave(
  defaultFileName: string,
): Promise<string | null> {
  const selected = await saveDialog({
    defaultPath: defaultFileName,
    filters: DIALOG_FILTERS,
  });
  return selected ?? null;
}

export function readFile(path: string): Promise<FileReadResult> {
  return invoke<FileReadResult>("read_markdown_file", { path });
}

export function writeFile(path: string, content: string): Promise<void> {
  return invoke<void>("write_markdown_file", { path, content });
}

export function revealInFileManager(path: string): Promise<void> {
  return invoke<void>("reveal_in_file_manager", { path });
}

/** Returns the raw stored JSON; validation is the settings store's job. */
export function loadSettings(): Promise<unknown> {
  return invoke<unknown>("load_settings");
}

export function saveSettings(settings: AppSettings): Promise<void> {
  return invoke<void>("save_settings", { settings });
}

/**
 * Schemes allowed to leave the app.
 *
 * Everything else - `javascript:`, `file:`, `data:`, `mailto:`, custom handlers
 * - is refused. Markdown is untrusted input, so an unrecognised scheme is
 * treated as hostile rather than merely unsupported. This list must stay in
 * step with the `opener:allow-open-url` scope in capabilities/default.json;
 * a scheme permitted here but not there fails at the IPC boundary instead.
 */
const ALLOWED_LINK_SCHEMES = new Set(["http:", "https:"]);

export function isAllowedExternalUrl(rawUrl: string): boolean {
  try {
    return ALLOWED_LINK_SCHEMES.has(new URL(rawUrl).protocol);
  } catch {
    // Relative or malformed URLs have no external destination to open.
    return false;
  }
}

/**
 * Open a link in the user's default browser.
 *
 * Returns false without doing anything when the scheme is not allowed.
 */
export async function openExternalUrl(rawUrl: string): Promise<boolean> {
  if (!isAllowedExternalUrl(rawUrl)) return false;
  await openUrl(rawUrl);
  return true;
}
