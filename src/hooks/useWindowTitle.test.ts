import { describe, expect, it } from "vitest";
import { formatWindowTitle } from "./useWindowTitle";
import { createDocument, createEmptyDocument } from "../stores/documentStore";

describe("window title", () => {
  it("shows the file name for a saved document", () => {
    const document = createDocument({
      filePath: "/Users/x/notes.md",
      fileName: "notes.md",
      content: "same",
      savedContent: "same",
      isSaving: false,
      lastSavedAt: null,
    });

    expect(formatWindowTitle(document)).toBe("notes.md — Markdown Editor");
  });

  it("adds a bullet when there are unsaved changes", () => {
    const document = createDocument({
      filePath: "/Users/x/notes.md",
      fileName: "notes.md",
      content: "edited",
      savedContent: "same",
      isSaving: false,
      lastSavedAt: null,
    });

    expect(formatWindowTitle(document)).toBe("notes.md • — Markdown Editor");
  });

  it("uses the untitled name for a new document", () => {
    expect(formatWindowTitle(createEmptyDocument())).toBe(
      "Untitled.md — Markdown Editor",
    );
  });
});
