import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { MarkdownEditor } from "../editor/MarkdownEditor";
import { MarkdownPreview } from "../preview/MarkdownPreview";
import { applyFormat, type FormatName } from "../editor/formattingCommands";
import { Toolbar } from "./Toolbar";
import { StatusBar } from "./StatusBar";
import { SplitView } from "./SplitView";
import { ConfirmDialog } from "./ConfirmDialog";
import { SettingsPanel } from "../settings/SettingsPanel";
import { useDocument } from "../../hooks/useDocument";
import { useSettings } from "../../hooks/useSettings";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useWindowTitle } from "../../hooks/useWindowTitle";
import { useCloseProtection } from "../../hooks/useCloseProtection";
import { useFileDrop } from "../../hooks/useFileDrop";
import { useSession } from "../../hooks/useSession";
import { useScrollSync } from "../../hooks/useScrollSync";
import { insertDate } from "../editor/insertDate";
import { useDocumentStore } from "../../stores/documentStore";
import { useUiStore } from "../../stores/uiStore";
import type { DocumentStats } from "../../types";

const EMPTY_STATS: DocumentStats = {
  words: 0,
  characters: 0,
  line: 1,
  column: 1,
};

/**
 * Composition root for the interface.
 *
 * Holds no domain logic of its own - it connects the stores and hooks to the
 * presentational components below it.
 */
export function AppShell() {
  const { settings, isLoaded, theme, update, reset } = useSettings();
  const {
    document,
    newDocument,
    openFile,
    openDroppedFile,
    openRecent,
    save,
    saveAs,
    revealInFinder,
    printDocument,
  } = useDocument();

  const setContent = useDocumentStore((state) => state.setContent);
  const error = useDocumentStore((state) => state.error);
  const setError = useDocumentStore((state) => state.setError);

  const layout = useUiStore((state) => state.layout);
  const setLayout = useUiStore((state) => state.setLayout);
  const isSettingsOpen = useUiStore((state) => state.isSettingsOpen);
  const setSettingsOpen = useUiStore((state) => state.setSettingsOpen);
  const isDragActive = useUiStore((state) => state.isDragActive);
  const confirmRequest = useUiStore((state) => state.confirmRequest);
  const resolveDiscardChoice = useUiStore(
    (state) => state.resolveDiscardChoice,
  );
  const pendingCursor = useUiStore((state) => state.pendingCursor);
  const setPendingCursor = useUiStore((state) => state.setPendingCursor);

  const [stats, setStats] = useState<DocumentStats>(EMPTY_STATS);
  const editorViewRef = useRef<EditorView | null>(null);
  const previewScrollRef = useRef<HTMLDivElement | null>(null);

  useWindowTitle(document);
  useCloseProtection();
  useFileDrop(openDroppedFile);
  useSession(editorViewRef, `${stats.line}:${stats.column}`);
  useScrollSync(
    settings.syncScroll && layout === "split",
    editorViewRef,
    previewScrollRef,
  );

  // Adopt the stored layout once, when settings finish loading. Later changes
  // to `defaultLayout` come from the user switching layouts, and re-applying
  // them here would fight with that.
  const hasAppliedStoredLayout = useRef(false);
  useEffect(() => {
    if (!isLoaded || hasAppliedStoredLayout.current) return;
    hasAppliedStoredLayout.current = true;
    setLayout(settings.defaultLayout);
  }, [isLoaded, settings.defaultLayout, setLayout]);

  const handleLayoutChange = useCallback(
    (next: typeof layout) => {
      setLayout(next);
      // "Remember last layout" is implemented by letting the current layout
      // become the startup layout, which is what the setting means to a user.
      if (settings.rememberLayout) update({ defaultLayout: next });
    },
    [setLayout, settings.rememberLayout, update],
  );

  const handleFormat = useCallback((format: FormatName) => {
    const view = editorViewRef.current;
    if (view) applyFormat(view, format);
  }, []);

  const handleInsertDate = useCallback((withTime: boolean) => {
    const view = editorViewRef.current;
    if (view) insertDate(view, withTime);
  }, []);

  const handleCursorRestored = useCallback(
    () => setPendingCursor(null),
    [setPendingCursor],
  );

  const handleEditorReady = useCallback((view: EditorView | null) => {
    editorViewRef.current = view;
  }, []);

  const handlePrint = useCallback(() => {
    void printDocument();
  }, [printDocument]);

  useKeyboardShortcuts({
    onNew: () => void newDocument(),
    onOpen: () => void openFile(),
    onSave: () => void save(),
    onSaveAs: () => void saveAs(),
    onPrint: handlePrint,
    onToggleSettings: () => setSettingsOpen(!isSettingsOpen),
  });

  return (
    <div className="app-shell">
      <Toolbar
        layout={layout}
        syncScroll={settings.syncScroll}
        canReveal={document.filePath !== null}
        isSaving={document.isSaving}
        recentFiles={settings.recentFiles}
        onNew={() => void newDocument()}
        onOpen={() => void openFile()}
        onOpenRecent={(path) => void openRecent(path)}
        onClearRecent={() => update({ recentFiles: [] })}
        onSave={() => void save()}
        onLayoutChange={handleLayoutChange}
        onSyncScrollChange={(syncScroll) => update({ syncScroll })}
        onFormat={handleFormat}
        onInsertDate={handleInsertDate}
        onReveal={() => void revealInFinder()}
        onPrint={handlePrint}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="app-shell__body">
        <SplitView
          layout={layout}
          splitPosition={settings.splitPosition}
          onSplitPositionChange={(splitPosition) => update({ splitPosition })}
          editor={
            <MarkdownEditor
              content={document.content}
              settings={settings}
              theme={theme}
              isVisible={layout !== "preview"}
              onChange={setContent}
              onStatsChange={setStats}
              onReady={handleEditorReady}
              pendingCursor={pendingCursor}
              onCursorRestored={handleCursorRestored}
            />
          }
          preview={
            <MarkdownPreview
              content={document.content}
              scrollRef={previewScrollRef}
            />
          }
        />
      </main>

      <StatusBar
        document={document}
        stats={stats}
        error={error}
        wordGoal={settings.wordGoal}
        onDismissError={() => setError(null)}
      />

      {isDragActive && (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-overlay__panel">Drop to open</div>
        </div>
      )}

      {confirmRequest && (
        <ConfirmDialog
          fileName={confirmRequest.fileName}
          onChoose={resolveDiscardChoice}
        />
      )}

      {isSettingsOpen && (
        <SettingsPanel
          settings={settings}
          onChange={update}
          onReset={reset}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
