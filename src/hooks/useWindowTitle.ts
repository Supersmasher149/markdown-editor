import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { MarkdownDocument } from "../types";

export const APP_NAME = "Markdown Editor";

/**
 * Build the window title.
 *
 * Pure and exported so the format is testable without a window:
 *   `notes.md — Markdown Editor`
 *   `notes.md • — Markdown Editor`   (unsaved changes)
 */
export function formatWindowTitle(document: MarkdownDocument): string {
  const marker = document.isDirty ? " •" : "";
  return `${document.fileName}${marker} — ${APP_NAME}`;
}

/** Keep the native window title in step with the document. */
export function useWindowTitle(document: MarkdownDocument): void {
  const title = formatWindowTitle(document);

  useEffect(() => {
    // Also set on the DOM so the title is right in a plain browser dev server.
    window.document.title = title;

    void getCurrentWindow()
      .setTitle(title)
      .catch((error: unknown) => {
        console.warn("Could not set the window title", error);
      });
  }, [title]);
}
