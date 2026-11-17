import {
  EditorSelection,
  type EditorState,
  type TransactionSpec,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/** A lone http(s) URL with no whitespace anywhere in it. */
const URL_ONLY = /^https?:\/\/\S+$/i;

/**
 * Turn "paste a URL over selected text" into a Markdown link.
 *
 * Returns null - leaving the normal paste to run - unless the clipboard holds a
 * single http(s) URL and every selection is non-empty, single-line text that is
 * not itself a URL. Pasting a URL over a URL means "replace it", not "link it".
 */
export function linkifyPaste(
  state: EditorState,
  pasted: string,
): TransactionSpec | null {
  const url = pasted.trim();
  if (!URL_ONLY.test(url)) return null;

  const ranges = state.selection.ranges;
  const applies = ranges.every((range) => {
    if (range.empty) return false;
    const text = state.sliceDoc(range.from, range.to);
    return !text.includes("\n") && !URL_ONLY.test(text.trim());
  });
  if (!applies) return null;

  return {
    ...state.changeByRange((range) => {
      const insert = `[${state.sliceDoc(range.from, range.to)}](${url})`;
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.cursor(range.from + insert.length),
      };
    }),
    scrollIntoView: true,
    userEvent: "input.paste",
  };
}

/** Wires {@link linkifyPaste} into the editor's paste event. */
export const smartPaste = EditorView.domEventHandlers({
  paste(event, view) {
    const text = event.clipboardData?.getData("text/plain");
    if (!text) return false;

    const spec = linkifyPaste(view.state, text);
    if (!spec) return false;

    event.preventDefault();
    view.dispatch(spec);
    return true;
  },
});
