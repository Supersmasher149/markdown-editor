import type { AppError, MarkdownDocument } from "../../types";

export type SaveState = {
  label: string;
  tone: "neutral" | "dirty" | "busy" | "error";
};

/**
 * Describe the document's save state in one short phrase.
 *
 * Kept out of the component so it can be tested directly: the precedence
 * between error, saving and dirty is easy to get subtly wrong, and an error
 * must not be hidden just because the document also has unsaved edits.
 */
export function describeSaveState(
  document: MarkdownDocument,
  error: AppError | null,
): SaveState {
  if (error) return { label: error.message, tone: "error" };
  if (document.isSaving) return { label: "Saving…", tone: "busy" };
  if (document.isDirty) return { label: "Modified", tone: "dirty" };
  if (document.filePath === null) {
    return { label: "New document", tone: "neutral" };
  }
  return { label: "Saved", tone: "neutral" };
}
