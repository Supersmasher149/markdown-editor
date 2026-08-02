import {
  Compartment,
  EditorState,
  Prec,
  type Extension,
} from "@codemirror/state";
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers as lineNumbersExtension,
  rectangularSelection,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  redo,
} from "@codemirror/commands";
import {
  HighlightStyle,
  bracketMatching,
  defaultHighlightStyle,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import {
  highlightSelectionMatches,
  search,
  searchKeymap,
} from "@codemirror/search";
import { oneDark } from "@codemirror/theme-one-dark";
import { tags } from "@lezer/highlight";
import type { AppSettings, ResolvedTheme } from "../../types";
import { applyFormat, type FormatName } from "./formattingCommands";

/**
 * CodeMirror configuration.
 *
 * Settings that can change at runtime live behind compartments so they can be
 * reconfigured in place - the editor instance itself is created once and never
 * torn down, which is what preserves undo history and cursor position.
 */
export const themeCompartment = new Compartment();
export const fontSizeCompartment = new Compartment();
export const lineNumbersCompartment = new Compartment();
export const lineWrapCompartment = new Compartment();
export const tabSizeCompartment = new Compartment();

/**
 * Markdown-aware syntax colouring layered over the stock highlight style.
 *
 * Headings get visible weight and structural punctuation is muted, so the
 * source reads like a document rather than like code.
 */
function markdownHighlightStyle(theme: ResolvedTheme): HighlightStyle {
  const heading = theme === "dark" ? "#82aaff" : "#1c4e80";
  const emphasis = theme === "dark" ? "#c3e88d" : "#2a6f3f";
  const code = theme === "dark" ? "#f78c6c" : "#a13d1e";
  const muted = theme === "dark" ? "#6b7a99" : "#9aa3b0";
  const link = theme === "dark" ? "#89ddff" : "#0b5fa5";

  return HighlightStyle.define([
    {
      tag: tags.heading1,
      color: heading,
      fontWeight: "700",
      fontSize: "1.4em",
    },
    {
      tag: tags.heading2,
      color: heading,
      fontWeight: "700",
      fontSize: "1.25em",
    },
    {
      tag: tags.heading3,
      color: heading,
      fontWeight: "600",
      fontSize: "1.12em",
    },
    {
      tag: [tags.heading4, tags.heading5, tags.heading6],
      color: heading,
      fontWeight: "600",
    },
    { tag: tags.strong, fontWeight: "700" },
    { tag: tags.emphasis, fontStyle: "italic", color: emphasis },
    { tag: tags.strikethrough, textDecoration: "line-through" },
    { tag: [tags.monospace], color: code },
    { tag: tags.link, color: link, textDecoration: "underline" },
    { tag: tags.url, color: link },
    { tag: tags.quote, color: muted, fontStyle: "italic" },
    { tag: [tags.processingInstruction, tags.meta], color: muted },
    { tag: tags.list, color: heading },
  ]);
}

/** Colours for the editor chrome itself (gutter, selection, active line). */
function lightTheme(): Extension {
  return EditorView.theme(
    {
      "&": { color: "#1d1d1f", backgroundColor: "#ffffff" },
      ".cm-content": { caretColor: "#0b5fa5" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#0b5fa5" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
        { backgroundColor: "#cfe4ff" },
      ".cm-activeLine": { backgroundColor: "#f4f6f9" },
      ".cm-gutters": {
        backgroundColor: "#fafafa",
        color: "#a0a4ab",
        border: "none",
        borderRight: "1px solid #ececf0",
      },
      ".cm-activeLineGutter": { backgroundColor: "#eef1f6", color: "#5b6068" },
      ".cm-matchingBracket, .cm-nonmatchingBracket": {
        backgroundColor: "#dbeafe",
        outline: "none",
      },
      ".cm-selectionMatch": { backgroundColor: "#e7edf6" },
      ".cm-panels": {
        backgroundColor: "#f5f5f7",
        color: "#1d1d1f",
        borderTop: "1px solid #e0e0e4",
      },
      ".cm-searchMatch": { backgroundColor: "#ffe9a8" },
      ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#ffc94d" },
    },
    { dark: false },
  );
}

export function themeExtension(theme: ResolvedTheme): Extension {
  return [
    theme === "dark" ? oneDark : lightTheme(),
    // The stock style supplies tags the Markdown style leaves untouched, such
    // as those inside fenced code blocks.
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    syntaxHighlighting(markdownHighlightStyle(theme)),
  ];
}

export function fontSizeExtension(fontSize: number): Extension {
  return EditorView.theme({
    "&": { fontSize: `${fontSize}px` },
    ".cm-content": { lineHeight: "1.65" },
    ".cm-gutters": { fontSize: `${Math.max(10, fontSize - 2)}px` },
  });
}

export function lineNumbersExtensionFor(show: boolean): Extension {
  return show ? [lineNumbersExtension(), highlightActiveLineGutter()] : [];
}

export function lineWrapExtension(softWrap: boolean): Extension {
  return softWrap ? EditorView.lineWrapping : [];
}

export function tabSizeExtension(tabSize: number): Extension {
  return [EditorState.tabSize.of(tabSize), indentUnit.of(" ".repeat(tabSize))];
}

/** Formatting shortcuts, keyed to the macOS conventions users expect. */
const FORMAT_KEYS: ReadonlyArray<{ key: string; format: FormatName }> = [
  { key: "Mod-b", format: "bold" },
  { key: "Mod-i", format: "italic" },
  { key: "Mod-k", format: "link" },
  { key: "Mod-e", format: "inlineCode" },
  { key: "Mod-Shift-1", format: "heading1" },
  { key: "Mod-Shift-2", format: "heading2" },
  { key: "Mod-Shift-3", format: "heading3" },
  { key: "Mod-Shift-.", format: "blockquote" },
  { key: "Mod-Shift-8", format: "bulletList" },
  { key: "Mod-Shift-7", format: "orderedList" },
];

const formattingKeymap = keymap.of(
  FORMAT_KEYS.map(({ key, format }) => ({
    key,
    run: (view: EditorView) => applyFormat(view, format),
  })),
);

/**
 * Extensions that never change for the life of the editor.
 *
 * File-level shortcuts (Command-S, Command-O, Command-N) are deliberately not
 * here - they are handled by a window-level listener so they work whether or
 * not the editor has focus.
 */
export function baseExtensions(): Extension[] {
  return [
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    bracketMatching(),
    closeBrackets(),
    search({ top: true }),
    markdown({ base: markdownLanguage, addKeymap: true }),
    EditorView.contentAttributes.of({ spellcheck: "true" }),
    // Our formatting bindings must outrank the default keymap, which claims
    // some of the same chords.
    Prec.highest(formattingKeymap),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      // macOS convention; the default keymap only binds Mod-Shift-z on Linux.
      { key: "Mod-Shift-z", run: redo },
      indentWithTab,
    ]),
  ];
}

/** Build the compartmented, settings-driven half of the configuration. */
export function settingsExtensions(
  settings: AppSettings,
  theme: ResolvedTheme,
): Extension[] {
  return [
    themeCompartment.of(themeExtension(theme)),
    fontSizeCompartment.of(fontSizeExtension(settings.fontSize)),
    lineNumbersCompartment.of(
      lineNumbersExtensionFor(settings.showLineNumbers),
    ),
    lineWrapCompartment.of(lineWrapExtension(settings.softWrap)),
    tabSizeCompartment.of(tabSizeExtension(settings.tabSize)),
  ];
}
