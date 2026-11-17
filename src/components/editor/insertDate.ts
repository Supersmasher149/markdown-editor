import type { EditorState, TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

const pad = (value: number) => String(value).padStart(2, "0");

/** `2026-11-17`, or `2026-11-17 14:32` with time, in local time. */
export function formatDate(date: Date, withTime: boolean): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  if (!withTime) return day;
  return `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Replace every selection with a date stamp, leaving the cursor after it. */
export function dateStampSpec(
  state: EditorState,
  withTime: boolean,
  now: Date = new Date(),
): TransactionSpec {
  return {
    ...state.replaceSelection(formatDate(now, withTime)),
    scrollIntoView: true,
    userEvent: "input",
  };
}

/** A CodeMirror command; also called from the toolbar menu. */
export function insertDate(view: EditorView, withTime: boolean): boolean {
  view.dispatch(dateStampSpec(view.state, withTime));
  view.focus();
  return true;
}
