import { create } from "zustand";
import type { AppError, FileReadResult, MarkdownDocument } from "../types";

export const UNTITLED_FILE_NAME = "Untitled.md";

/**
 * Build a document record with `isDirty` derived rather than assigned.
 *
 * Every state transition goes through here, so `isDirty` can never drift out of
 * step with the content it describes.
 */
export function createDocument(
  fields: Omit<MarkdownDocument, "isDirty">,
): MarkdownDocument {
  return { ...fields, isDirty: fields.content !== fields.savedContent };
}

export function createEmptyDocument(): MarkdownDocument {
  return createDocument({
    filePath: null,
    fileName: UNTITLED_FILE_NAME,
    content: "",
    savedContent: "",
    isSaving: false,
    lastSavedAt: null,
  });
}

type DocumentState = {
  document: MarkdownDocument;
  /** Last error worth showing the user; cleared when they dismiss it. */
  error: AppError | null;

  setContent: (content: string) => void;
  /** Replace the document with an empty untitled one. */
  reset: () => void;
  /** Adopt a file loaded from disk as the active document. */
  loadFromDisk: (file: FileReadResult) => void;
  /** Mark a save as in flight; returns false if one already is. */
  beginSave: () => boolean;
  /** Record a successful save, optionally at a new path (Save As). */
  completeSave: (saved: {
    content: string;
    filePath: string;
    fileName: string;
  }) => void;
  failSave: (error: AppError) => void;
  setError: (error: AppError | null) => void;
};

export const useDocumentStore = create<DocumentState>((set, get) => ({
  document: createEmptyDocument(),
  error: null,

  setContent: (content) =>
    set((state) => ({
      document: createDocument({ ...state.document, content }),
    })),

  reset: () => set({ document: createEmptyDocument(), error: null }),

  loadFromDisk: (file) =>
    set({
      document: createDocument({
        filePath: file.path,
        fileName: file.fileName,
        content: file.content,
        savedContent: file.content,
        isSaving: false,
        lastSavedAt: null,
      }),
      error: null,
    }),

  beginSave: () => {
    // Guard against a second save starting while one is in flight - a double
    // Command-S could otherwise interleave two writes to the same path.
    if (get().document.isSaving) return false;
    set((state) => ({
      document: { ...state.document, isSaving: true },
      error: null,
    }));
    return true;
  },

  completeSave: ({ content, filePath, fileName }) =>
    set((state) => ({
      document: createDocument({
        ...state.document,
        filePath,
        fileName,
        // `savedContent` advances only to the text that actually reached disk.
        // The live content may already have moved on if the user kept typing
        // during the write, and that difference must stay visible as dirty.
        savedContent: content,
        isSaving: false,
        lastSavedAt: Date.now(),
      }),
      error: null,
    })),

  failSave: (error) =>
    set((state) => ({
      document: { ...state.document, isSaving: false },
      error,
    })),

  setError: (error) => set({ error }),
}));
