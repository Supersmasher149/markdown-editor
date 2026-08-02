import { describe, expect, it } from "vitest";
import { describeSaveState } from "./saveState";
import {
  createDocument,
  createEmptyDocument,
} from "../../stores/documentStore";
import type { MarkdownDocument } from "../../types";

function documentWith(overrides: Partial<MarkdownDocument>): MarkdownDocument {
  return createDocument({
    filePath: "/tmp/notes.md",
    fileName: "notes.md",
    content: "same",
    savedContent: "same",
    isSaving: false,
    lastSavedAt: null,
    ...overrides,
  });
}

describe("save state description", () => {
  it("reports a saved document as saved", () => {
    expect(describeSaveState(documentWith({}), null)).toEqual({
      label: "Saved",
      tone: "neutral",
    });
  });

  it("reports an untouched new document distinctly from a saved one", () => {
    expect(describeSaveState(createEmptyDocument(), null).label).toBe(
      "New document",
    );
  });

  it("reports unsaved edits as modified", () => {
    const state = describeSaveState(documentWith({ content: "edited" }), null);

    expect(state).toEqual({ label: "Modified", tone: "dirty" });
  });

  it("reports an in-flight save while it is running", () => {
    const state = describeSaveState(
      documentWith({ content: "edited", isSaving: true }),
      null,
    );

    expect(state.tone).toBe("busy");
  });

  it("shows the error message in preference to any other state", () => {
    // An error must not be hidden just because the document is also dirty.
    const state = describeSaveState(
      documentWith({ content: "edited", isSaving: true }),
      { code: "PERMISSION_DENIED", message: "Permission denied." },
    );

    expect(state).toEqual({ label: "Permission denied.", tone: "error" });
  });
});
