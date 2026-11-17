import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { dateStampSpec, formatDate } from "./insertDate";

// Months are zero-based: this is 5 March 2026, 09:07 local time.
const MORNING = new Date(2026, 2, 5, 9, 7);

describe("formatDate", () => {
  it("zero-pads the date", () => {
    expect(formatDate(MORNING, false)).toBe("2026-03-05");
  });

  it("adds a zero-padded 24-hour time", () => {
    expect(formatDate(MORNING, true)).toBe("2026-03-05 09:07");
    expect(formatDate(new Date(2026, 11, 31, 23, 59), true)).toBe(
      "2026-12-31 23:59",
    );
  });
});

describe("dateStampSpec", () => {
  it("replaces the selection and leaves the cursor after the stamp", () => {
    const state = EditorState.create({
      doc: "Due: TODO",
      selection: { anchor: 5, head: 9 },
    });
    const next = state.update(dateStampSpec(state, false, MORNING)).state;

    expect(next.doc.toString()).toBe("Due: 2026-03-05");
    expect(next.selection.main.head).toBe(15);
  });

  it("stamps every cursor", () => {
    const state = EditorState.create({
      doc: "a\nb",
      selection: EditorSelection.create([
        EditorSelection.cursor(1),
        EditorSelection.cursor(3),
      ]),
      extensions: EditorState.allowMultipleSelections.of(true),
    });
    const next = state.update(dateStampSpec(state, false, MORNING)).state;

    expect(next.doc.toString()).toBe("a2026-03-05\nb2026-03-05");
  });
});
