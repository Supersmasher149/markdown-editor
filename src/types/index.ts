/**
 * Shared types for the whole application. The Rust side mirrors `AppError` and
 * `FileReadResult`; keep the two in sync when changing either.
 */

/** The single active document. There is exactly one at a time by design. */
export type MarkdownDocument = {
  /** Absolute path on disk, or null for a document that has never been saved. */
  filePath: string | null;
  fileName: string;
  /** Live editor content. */
  content: string;
  /** Content as of the last successful save (or load). */
  savedContent: string;
  /** Always derived from `content !== savedContent`; never set directly. */
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: number | null;
};

/**
 * Structured error shared across the Rust/TS boundary. `message` is written for
 * humans; `details` carries the underlying technical text for diagnostics.
 */
export type AppError = {
  code: AppErrorCode;
  message: string;
  details?: string;
};

export type AppErrorCode =
  | "FILE_NOT_FOUND"
  | "PERMISSION_DENIED"
  | "INVALID_UTF8"
  | "READ_FAILURE"
  | "SAVE_FAILURE"
  | "INVALID_PATH"
  | "CANCELLED"
  | "UNKNOWN";

/** Payload returned by the Rust `read_markdown_file` command. */
export type FileReadResult = {
  path: string;
  fileName: string;
  content: string;
};

export type LayoutMode = "editor" | "split" | "preview";

export type ThemeSetting = "system" | "light" | "dark";

/** The theme actually applied, after resolving "system". */
export type ResolvedTheme = "light" | "dark";

export type AppSettings = {
  version: 1;
  theme: ThemeSetting;
  fontSize: number;
  tabSize: number;
  softWrap: boolean;
  showLineNumbers: boolean;
  defaultLayout: LayoutMode;
  rememberLayout: boolean;
  confirmDiscard: boolean;
  /** Editor pane width in split view, as a fraction between 0 and 1. */
  splitPosition: number;
};

/** Cursor position and document statistics shown in the status bar. */
export type DocumentStats = {
  words: number;
  characters: number;
  line: number;
  column: number;
};

/** What the user chose when warned about unsaved changes. */
export type DiscardChoice = "save" | "discard" | "cancel";
