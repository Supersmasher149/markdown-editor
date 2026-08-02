import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { AppSettings, DocumentStats, ResolvedTheme } from "../../types";
import {
  baseExtensions,
  fontSizeCompartment,
  fontSizeExtension,
  lineNumbersCompartment,
  lineNumbersExtensionFor,
  lineWrapCompartment,
  lineWrapExtension,
  settingsExtensions,
  tabSizeCompartment,
  tabSizeExtension,
  themeCompartment,
  themeExtension,
} from "./editorExtensions";
import { countWords } from "./documentStats";

type MarkdownEditorProps = {
  content: string;
  settings: AppSettings;
  theme: ResolvedTheme;
  /** True when the editor pane is on screen; drives a re-measure on reveal. */
  isVisible: boolean;
  onChange: (content: string) => void;
  onStatsChange: (stats: DocumentStats) => void;
  onReady: (view: EditorView | null) => void;
};

/**
 * The CodeMirror host.
 *
 * The `EditorView` is created once on mount and reconfigured in place from then
 * on. It is never rebuilt in response to content or settings changes, because
 * doing so would discard undo history, the cursor, and the scroll position.
 */
export function MarkdownEditor({
  content,
  settings,
  theme,
  isVisible,
  onChange,
  onStatsChange,
  onReady,
}: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Callbacks are read through refs so that a new function identity from the
  // parent does not force the editor to be recreated. Updated in an effect
  // rather than during render, which React does not allow.
  const onChangeRef = useRef(onChange);
  const onStatsChangeRef = useRef(onStatsChange);

  useEffect(() => {
    onChangeRef.current = onChange;
    onStatsChangeRef.current = onStatsChange;
  });

  // Settings are read through a ref for the same reason: only the initial
  // values are needed at construction time, and a dedicated effect below
  // reconfigures the compartments afterwards.
  const initialConfigRef = useRef({ content, settings, theme });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const {
      content: initialContent,
      settings: initialSettings,
      theme: initialTheme,
    } = initialConfigRef.current;

    const view = new EditorView({
      state: EditorState.create({
        doc: initialContent,
        extensions: [
          ...baseExtensions(),
          ...settingsExtensions(initialSettings, initialTheme),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }

            // Selection moves without a doc change, so statistics have to be
            // recomputed on both.
            if (update.docChanged || update.selectionSet) {
              const state = update.state;
              const head = state.selection.main.head;
              const line = state.doc.lineAt(head);
              const text = state.doc.toString();

              onStatsChangeRef.current({
                characters: text.length,
                words: countWords(text),
                line: line.number,
                column: head - line.from + 1,
              });
            }
          }),
        ],
      }),
      parent: host,
    });

    viewRef.current = view;
    onReady(view);
    view.focus();

    return () => {
      onReady(null);
      viewRef.current = null;
      view.destroy();
    };
    // Deliberately runs once. Everything mutable is handled by the effects
    // below or read through a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push external content changes (open, new, revert) into the editor without
  // disturbing it when the change originated from typing.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const current = view.state.doc.toString();
    if (current === content) return;

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: content },
      // A document swap should start at the top with a collapsed selection
      // rather than trying to preserve a position from a different file.
      selection: { anchor: 0 },
    });
  }, [content]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartment.reconfigure(themeExtension(theme)),
    });
  }, [theme]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: fontSizeCompartment.reconfigure(
        fontSizeExtension(settings.fontSize),
      ),
    });
  }, [settings.fontSize]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: lineNumbersCompartment.reconfigure(
        lineNumbersExtensionFor(settings.showLineNumbers),
      ),
    });
  }, [settings.showLineNumbers]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: lineWrapCompartment.reconfigure(
        lineWrapExtension(settings.softWrap),
      ),
    });
  }, [settings.softWrap]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: tabSizeCompartment.reconfigure(
        tabSizeExtension(settings.tabSize),
      ),
    });
  }, [settings.tabSize]);

  // The pane is hidden with CSS rather than unmounted, so CodeMirror measures
  // zero height while it is off screen. Ask it to re-measure on the way back.
  useEffect(() => {
    if (!isVisible) return;
    const view = viewRef.current;
    if (!view) return;

    view.requestMeasure();
    view.focus();
  }, [isVisible]);

  return (
    <div className="editor-host" ref={hostRef} data-testid="editor-host" />
  );
}
