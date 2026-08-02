import type {
  ChangeSpec,
  EditorState,
  TransactionSpec,
} from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

/**
 * Markdown formatting actions.
 *
 * Each action is a pure function from `EditorState` to a `TransactionSpec`, so
 * it can be tested against a headless state with no DOM involved. `applyFormat`
 * is the only part that touches a live view.
 */
export type FormatAction = (state: EditorState) => TransactionSpec | null;

export type FormatName =
  | "bold"
  | "italic"
  | "inlineCode"
  | "link"
  | "heading1"
  | "heading2"
  | "heading3"
  | "blockquote"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "codeBlock"
  | "horizontalRule";

/** Characters treated as part of a word when expanding an empty selection. */
const WORD_CHARACTER = /[\p{L}\p{N}_'-]/u;

/**
 * Expand a bare cursor to the word underneath it.
 *
 * Lets Command-B with no selection bold the word being typed, which is what
 * every other editor does. Returns null when the cursor is not touching a word.
 */
function wordAt(
  state: EditorState,
  pos: number,
): { from: number; to: number } | null {
  const line = state.doc.lineAt(pos);
  const text = line.text;
  const offset = pos - line.from;

  let start = offset;
  let end = offset;
  while (start > 0 && WORD_CHARACTER.test(text[start - 1] ?? "")) start--;
  while (end < text.length && WORD_CHARACTER.test(text[end] ?? "")) end++;

  if (start === end) return null;
  return { from: line.from + start, to: line.from + end };
}

/** The lines touched by the current selection. */
function selectedLines(state: EditorState) {
  const { from, to } = state.selection.main;
  const firstLine = state.doc.lineAt(from).number;
  const lastLine = state.doc.lineAt(to).number;

  const lines = [];
  for (let n = firstLine; n <= lastLine; n++) lines.push(state.doc.line(n));
  return lines;
}

/**
 * Toggle a symmetric inline marker such as `**` or `` ` ``.
 *
 * Handles three cases: the markers sit inside the selection, the markers sit
 * just outside it (the usual result of a previous toggle), or there are no
 * markers yet.
 */
function toggleInlineMarker(marker: string): FormatAction {
  return (state) => {
    const main = state.selection.main;
    let { from, to } = main;

    if (main.empty) {
      const word = wordAt(state, main.head);
      if (word) {
        from = word.from;
        to = word.to;
      } else {
        // Nothing to wrap: drop in an empty pair and sit between the markers.
        return {
          changes: { from, insert: marker + marker },
          selection: { anchor: from + marker.length },
        };
      }
    }

    const selected = state.sliceDoc(from, to);
    const width = marker.length;

    // `*` must not treat `**bold**` as italic it can unwrap, or toggling italic
    // would silently demote bold text.
    const isDifferentMarker =
      marker === "*" && selected.startsWith("**") && selected.endsWith("**");

    if (
      !isDifferentMarker &&
      selected.length >= width * 2 &&
      selected.startsWith(marker) &&
      selected.endsWith(marker)
    ) {
      return {
        changes: { from, to, insert: selected.slice(width, -width) },
        selection: { anchor: from, head: to - width * 2 },
      };
    }

    const before = state.sliceDoc(Math.max(0, from - width), from);
    const after = state.sliceDoc(to, Math.min(state.doc.length, to + width));

    if (before === marker && after === marker) {
      return {
        changes: [
          { from: from - width, to: from },
          { from: to, to: to + width },
        ],
        selection: { anchor: from - width, head: to - width },
      };
    }

    return {
      changes: [
        { from, insert: marker },
        { from: to, insert: marker },
      ],
      selection: { anchor: from + width, head: to + width },
    };
  };
}

/**
 * Toggle a line-leading marker across every selected line.
 *
 * Adds the prefix unless all selected lines already have it, in which case it
 * is removed - so a partially-formatted selection completes rather than
 * inverting line by line. The selection is left unspecified so CodeMirror maps
 * it through the edits automatically.
 */
function toggleLinePrefix(insert: string, match: RegExp): FormatAction {
  return (state) => {
    const lines = selectedLines(state);
    const allPrefixed = lines.every((line) => match.test(line.text));
    const changes: ChangeSpec[] = [];

    for (const line of lines) {
      const existing = match.exec(line.text);

      if (allPrefixed && existing) {
        changes.push({ from: line.from, to: line.from + existing[0].length });
      } else if (!allPrefixed && !existing) {
        // Blank lines inside a selection would become stray markers.
        if (line.text.trim() === "" && lines.length > 1) continue;
        changes.push({ from: line.from, insert });
      }
    }

    return changes.length > 0 ? { changes } : null;
  };
}

const ANY_HEADING = /^#{1,6}\s+/;

/**
 * Apply or remove an ATX heading.
 *
 * Re-applying the same level clears it; a different level replaces it, so the
 * user never has to unset one heading before setting another.
 */
function setHeading(level: 1 | 2 | 3): FormatAction {
  const marker = "#".repeat(level) + " ";
  const exact = new RegExp(`^#{${level}}\\s+`);

  return (state) => {
    const changes: ChangeSpec[] = [];

    for (const line of selectedLines(state)) {
      const existingExact = exact.exec(line.text);
      const existingAny = ANY_HEADING.exec(line.text);

      if (existingExact) {
        changes.push({
          from: line.from,
          to: line.from + existingExact[0].length,
        });
      } else if (existingAny) {
        changes.push({
          from: line.from,
          to: line.from + existingAny[0].length,
          insert: marker,
        });
      } else {
        changes.push({ from: line.from, insert: marker });
      }
    }

    return changes.length > 0 ? { changes } : null;
  };
}

const ORDERED_ITEM = /^\s*\d+\.\s+/;

/** Number the selected lines sequentially, or strip the numbering. */
const toggleOrderedList: FormatAction = (state) => {
  const lines = selectedLines(state);
  const allNumbered = lines.every((line) => ORDERED_ITEM.test(line.text));
  const changes: ChangeSpec[] = [];

  let index = 1;
  for (const line of lines) {
    const existing = ORDERED_ITEM.exec(line.text);

    if (allNumbered && existing) {
      changes.push({ from: line.from, to: line.from + existing[0].length });
    } else if (!allNumbered && !existing) {
      if (line.text.trim() === "" && lines.length > 1) continue;
      changes.push({ from: line.from, insert: `${index}. ` });
      index++;
    } else if (!allNumbered && existing) {
      // Already numbered but the run is being renumbered around it.
      index++;
    }
  }

  return changes.length > 0 ? { changes } : null;
};

const URL_LIKE = /^(https?:\/\/|www\.|mailto:)\S+$/i;

/**
 * Insert a Markdown link, selecting whichever half the user still needs to fill
 * in: the URL when they had text selected, the text when they selected a URL.
 */
const insertLink: FormatAction = (state) => {
  const { from, to, empty } = state.selection.main;
  const selected = state.sliceDoc(from, to);

  if (empty) {
    const insert = "[text](url)";
    return {
      changes: { from, insert },
      selection: { anchor: from + 1, head: from + 5 },
    };
  }

  if (URL_LIKE.test(selected)) {
    const insert = `[text](${selected})`;
    return {
      changes: { from, to, insert },
      selection: { anchor: from + 1, head: from + 5 },
    };
  }

  const insert = `[${selected}](url)`;
  const urlStart = from + selected.length + 3;
  return {
    changes: { from, to, insert },
    selection: { anchor: urlStart, head: urlStart + 3 },
  };
};

const FENCE = "```";

/** Wrap the selected lines in a fenced code block, or unwrap an existing one. */
const toggleCodeBlock: FormatAction = (state) => {
  const lines = selectedLines(state);
  const firstLine = lines[0];
  const lastLine = lines[lines.length - 1];
  if (!firstLine || !lastLine) return null;

  const lineBefore =
    firstLine.number > 1 ? state.doc.line(firstLine.number - 1) : null;
  const lineAfter =
    lastLine.number < state.doc.lines
      ? state.doc.line(lastLine.number + 1)
      : null;

  // Already fenced: remove the surrounding fence lines, longest offset first so
  // the earlier deletion does not shift the later one.
  if (
    lineBefore?.text.startsWith(FENCE) &&
    lineAfter?.text.trimEnd() === FENCE
  ) {
    return {
      changes: [
        { from: lineBefore.from, to: firstLine.from },
        { from: lastLine.to, to: lineAfter.to },
      ],
    };
  }

  if (state.selection.main.empty) {
    const insert = `${FENCE}\n\n${FENCE}`;
    return {
      changes: { from: firstLine.from, insert: `${insert}\n` },
      // Land inside the empty block, ready to type.
      selection: { anchor: firstLine.from + FENCE.length + 1 },
    };
  }

  return {
    changes: [
      { from: firstLine.from, insert: `${FENCE}\n` },
      { from: lastLine.to, insert: `\n${FENCE}` },
    ],
  };
};

/** Insert a thematic break on its own line below the cursor. */
const insertHorizontalRule: FormatAction = (state) => {
  const line = state.doc.lineAt(state.selection.main.head);
  const needsLeadingBreak = line.text.trim() !== "";
  const insert = `${needsLeadingBreak ? "\n" : ""}---\n`;

  return {
    changes: { from: line.to, insert },
    selection: { anchor: line.to + insert.length },
  };
};

/** The complete formatting vocabulary, keyed by the name the UI uses. */
export const formatActions: Record<FormatName, FormatAction> = {
  bold: toggleInlineMarker("**"),
  italic: toggleInlineMarker("*"),
  inlineCode: toggleInlineMarker("`"),
  link: insertLink,
  heading1: setHeading(1),
  heading2: setHeading(2),
  heading3: setHeading(3),
  blockquote: toggleLinePrefix("> ", /^>\s?/),
  bulletList: toggleLinePrefix("- ", /^\s*[-*+]\s+/),
  orderedList: toggleOrderedList,
  taskList: toggleLinePrefix("- [ ] ", /^\s*[-*+]\s+\[[ xX]\]\s+/),
  codeBlock: toggleCodeBlock,
  horizontalRule: insertHorizontalRule,
};

/**
 * Run a formatting action against a live editor.
 *
 * Returns false when the action declined to change anything, matching the
 * CodeMirror command convention so it can be bound to a key.
 */
export function applyFormat(view: EditorView, name: FormatName): boolean {
  const spec = formatActions[name](view.state);
  if (!spec) return false;

  view.dispatch({ ...spec, scrollIntoView: true });
  view.focus();
  return true;
}
