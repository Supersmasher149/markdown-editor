import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { formatActions, type FormatName } from "./formattingCommands";

/**
 * Apply a formatting action to a document and return the result.
 *
 * `anchor`/`head` describe the selection before the action; the returned
 * `selection` describes it afterwards, so tests can assert on where the cursor
 * or highlight ends up.
 */
function format(
  name: FormatName,
  doc: string,
  anchor: number,
  head: number = anchor,
): { doc: string; selection: { from: number; to: number } } {
  const state = EditorState.create({ doc, selection: { anchor, head } });
  const spec = formatActions[name](state);

  if (!spec) {
    return {
      doc,
      selection: { from: Math.min(anchor, head), to: Math.max(anchor, head) },
    };
  }

  const next = state.update(spec).state;
  return {
    doc: next.doc.toString(),
    selection: { from: next.selection.main.from, to: next.selection.main.to },
  };
}

/** Convenience for the common "just check the resulting text" assertion. */
function textAfter(
  name: FormatName,
  doc: string,
  anchor: number,
  head?: number,
): string {
  return format(name, doc, anchor, head).doc;
}

describe("inline formatting with a selection", () => {
  it("wraps the selection in bold markers", () => {
    expect(textAfter("bold", "hello world", 0, 5)).toBe("**hello** world");
  });

  it("keeps the original text selected after wrapping", () => {
    const result = format("bold", "hello world", 0, 5);

    expect(result.doc.slice(result.selection.from, result.selection.to)).toBe(
      "hello",
    );
  });

  it("wraps in italic and inline code", () => {
    expect(textAfter("italic", "hello", 0, 5)).toBe("*hello*");
    expect(textAfter("inlineCode", "hello", 0, 5)).toBe("`hello`");
  });

  it("unwraps when the markers are inside the selection", () => {
    expect(textAfter("bold", "**hello**", 0, 9)).toBe("hello");
  });

  it("unwraps when the markers sit just outside the selection", () => {
    // The usual state after wrapping, since the selection excludes the markers.
    expect(textAfter("bold", "**hello**", 2, 7)).toBe("hello");
  });

  it("does not let italic strip a bold marker", () => {
    // "**hello**" starts and ends with "*", but it is bold, not italic.
    expect(textAfter("italic", "**hello**", 0, 9)).toBe("***hello***");
  });

  it("wraps a multi-word selection", () => {
    expect(textAfter("bold", "one two three", 4, 13)).toBe("one **two three**");
  });
});

describe("inline formatting without a selection", () => {
  it("wraps the word under the cursor", () => {
    expect(textAfter("bold", "hello world", 2)).toBe("**hello** world");
  });

  it("wraps the word when the cursor sits at its end", () => {
    expect(textAfter("bold", "hello world", 5)).toBe("**hello** world");
  });

  it("inserts an empty pair when there is no word to wrap", () => {
    expect(textAfter("bold", "", 0)).toBe("****");
  });

  it("places the cursor between the markers of an empty pair", () => {
    const result = format("bold", "", 0);

    expect(result.selection.from).toBe(2);
    expect(result.selection.to).toBe(2);
  });

  it("unwraps the word under the cursor when it is already bold", () => {
    expect(textAfter("bold", "**hello** world", 4)).toBe("hello world");
  });
});

describe("links", () => {
  it("inserts a placeholder link at an empty cursor", () => {
    const result = format("link", "", 0);

    expect(result.doc).toBe("[text](url)");
    // "text" is preselected so the user can type straight over it.
    expect(result.doc.slice(result.selection.from, result.selection.to)).toBe(
      "text",
    );
  });

  it("uses the selection as the link label and selects the URL", () => {
    const result = format("link", "click here", 0, 10);

    expect(result.doc).toBe("[click here](url)");
    expect(result.doc.slice(result.selection.from, result.selection.to)).toBe(
      "url",
    );
  });

  it("uses a selected URL as the destination and selects the label", () => {
    const result = format("link", "https://example.com", 0, 19);

    expect(result.doc).toBe("[text](https://example.com)");
    expect(result.doc.slice(result.selection.from, result.selection.to)).toBe(
      "text",
    );
  });
});

describe("headings", () => {
  it("adds a heading marker to the current line", () => {
    expect(textAfter("heading1", "Title", 0)).toBe("# Title");
    expect(textAfter("heading2", "Title", 0)).toBe("## Title");
    expect(textAfter("heading3", "Title", 0)).toBe("### Title");
  });

  it("removes the marker when the same level is applied again", () => {
    expect(textAfter("heading1", "# Title", 3)).toBe("Title");
  });

  it("replaces a different heading level rather than stacking", () => {
    expect(textAfter("heading2", "# Title", 3)).toBe("## Title");
    expect(textAfter("heading1", "### Title", 5)).toBe("# Title");
  });

  it("applies to every line in a multi-line selection", () => {
    expect(textAfter("heading2", "One\nTwo", 0, 7)).toBe("## One\n## Two");
  });
});

describe("blockquotes", () => {
  it("adds a marker to the current line", () => {
    expect(textAfter("blockquote", "quoted", 0)).toBe("> quoted");
  });

  it("removes an existing marker", () => {
    expect(textAfter("blockquote", "> quoted", 3)).toBe("quoted");
  });

  it("adds markers across a selection", () => {
    expect(textAfter("blockquote", "one\ntwo", 0, 7)).toBe("> one\n> two");
  });

  it("completes a partially quoted selection instead of inverting it", () => {
    expect(textAfter("blockquote", "> one\ntwo", 0, 9)).toBe("> one\n> two");
  });
});

describe("bullet lists", () => {
  it("adds bullets to the selected lines", () => {
    expect(textAfter("bulletList", "one\ntwo", 0, 7)).toBe("- one\n- two");
  });

  it("removes existing bullets", () => {
    expect(textAfter("bulletList", "- one\n- two", 0, 11)).toBe("one\ntwo");
  });

  it("recognises * and + as existing bullets", () => {
    expect(textAfter("bulletList", "* one\n+ two", 0, 11)).toBe("one\ntwo");
  });
});

describe("numbered lists", () => {
  it("numbers the selected lines sequentially", () => {
    expect(textAfter("orderedList", "one\ntwo\nthree", 0, 13)).toBe(
      "1. one\n2. two\n3. three",
    );
  });

  it("removes existing numbering", () => {
    expect(textAfter("orderedList", "1. one\n2. two", 0, 13)).toBe("one\ntwo");
  });
});

describe("task lists", () => {
  it("adds an unchecked box to the current line", () => {
    expect(textAfter("taskList", "buy milk", 0)).toBe("- [ ] buy milk");
  });

  it("removes an existing task marker, checked or not", () => {
    expect(textAfter("taskList", "- [ ] buy milk", 8)).toBe("buy milk");
    expect(textAfter("taskList", "- [x] buy milk", 8)).toBe("buy milk");
  });
});

describe("code blocks", () => {
  it("fences the selected lines", () => {
    expect(textAfter("codeBlock", "const x = 1;", 0, 12)).toBe(
      "```\nconst x = 1;\n```",
    );
  });

  it("fences a multi-line selection as a single block", () => {
    expect(textAfter("codeBlock", "a\nb", 0, 3)).toBe("```\na\nb\n```");
  });

  it("inserts an empty block at a bare cursor", () => {
    expect(textAfter("codeBlock", "", 0)).toBe("```\n\n```\n");
  });

  it("unwraps a block the cursor is already inside", () => {
    const doc = "```\ncode\n```";

    // Cursor on the "code" line, between the two fences.
    expect(textAfter("codeBlock", doc, 5)).toBe("code");
  });
});

describe("horizontal rules", () => {
  it("adds a rule on its own line below a non-empty line", () => {
    expect(textAfter("horizontalRule", "text", 4)).toBe("text\n---\n");
  });

  it("does not add a blank line when the current line is empty", () => {
    expect(textAfter("horizontalRule", "", 0)).toBe("---\n");
  });
});

describe("multi-line selections spanning blank lines", () => {
  it("does not put a marker on a blank line", () => {
    expect(textAfter("bulletList", "one\n\ntwo", 0, 8)).toBe("- one\n\n- two");
  });
});
