import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { linkifyPaste } from "./smartPaste";

function paste(
  doc: string,
  ranges: Array<[number, number]>,
  text: string,
): { doc: string; cursor: number } | null {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.create(
      ranges.map(([from, to]) => EditorSelection.range(from, to)),
    ),
    extensions: EditorState.allowMultipleSelections.of(true),
  });
  const spec = linkifyPaste(state, text);
  if (!spec) return null;
  const next = state.update(spec).state;
  return { doc: next.doc.toString(), cursor: next.selection.main.head };
}

describe("smart paste", () => {
  it("wraps the selection in a link to the pasted URL", () => {
    expect(paste("see the docs here", [[8, 12]], "https://x.dev/a")).toEqual({
      doc: "see the [docs](https://x.dev/a) here",
      cursor: 31,
    });
  });

  it("trims whitespace around the pasted URL", () => {
    expect(paste("docs", [[0, 4]], "  http://x.dev\n")?.doc).toBe(
      "[docs](http://x.dev)",
    );
  });

  it("leaves ordinary text to the normal paste", () => {
    expect(paste("docs", [[0, 4]], "not a url")).toBeNull();
    expect(paste("docs", [[0, 4]], "https://x.dev and more")).toBeNull();
    expect(paste("docs", [[0, 4]], "ftp://x.dev")).toBeNull();
  });

  it("does nothing without a selection", () => {
    expect(paste("docs", [[2, 2]], "https://x.dev")).toBeNull();
  });

  it("does nothing for a multi-line selection", () => {
    expect(paste("one\ntwo", [[0, 7]], "https://x.dev")).toBeNull();
  });

  it("replaces rather than links when the selection is already a URL", () => {
    expect(paste("https://old.dev", [[0, 15]], "https://x.dev")).toBeNull();
  });

  it("links every selection when there are several", () => {
    expect(
      paste(
        "a and b",
        [
          [0, 1],
          [6, 7],
        ],
        "https://x.dev",
      )?.doc,
    ).toBe("[a](https://x.dev) and [b](https://x.dev)");
  });

  it("falls back if any one of several selections is empty", () => {
    expect(
      paste(
        "a and b",
        [
          [0, 1],
          [4, 4],
        ],
        "https://x.dev",
      ),
    ).toBeNull();
  });
});
