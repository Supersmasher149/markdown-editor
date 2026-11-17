import { useEffect, useRef, type RefObject } from "react";
import type { EditorView } from "@codemirror/view";
import { useDocumentStore } from "../stores/documentStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useUiStore } from "../stores/uiStore";
import * as fileService from "../services/fileService";
import { pushRecent } from "../services/recentFiles";

/** How long the cursor must rest before its position is recorded. */
const CURSOR_DEBOUNCE_MS = 1000;

/**
 * Remembers what you were working on: the recent-files list, the last open
 * file, and where the cursor was in it. Restores that file on launch.
 *
 * Everything is stored in settings, so it shares their validation and their
 * debounced, atomic persistence.
 */
export function useSession(
  editorViewRef: RefObject<EditorView | null>,
  /** Changes whenever the cursor moves; its value is not read. */
  cursorKey: string,
): void {
  const isLoaded = useSettingsStore((state) => state.isLoaded);

  // Track the active file. Watching the store rather than each action covers
  // Open, Open Recent, drag-and-drop, Save As, and the launch restore alike.
  useEffect(() => {
    return useDocumentStore.subscribe((state, prev) => {
      const path = state.document.filePath;
      if (path === prev.document.filePath) return;

      const {
        settings,
        isLoaded: loaded,
        update,
      } = useSettingsStore.getState();
      // Writing before the stored settings arrive would persist defaults over
      // them.
      if (!loaded) return;

      if (path === null) {
        // New or Close: don't reopen something deliberately put away.
        update({ lastFile: null });
        return;
      }

      update({
        recentFiles: pushRecent(settings.recentFiles, path),
        // Keep the stored cursor when this is the same file coming back, so
        // the launch restore does not reset it to the top.
        lastFile:
          settings.lastFile?.path === path
            ? settings.lastFile
            : { path, anchor: 0 },
      });
    });
  }, []);

  // Reopen the last file once, as soon as settings are available.
  const hasRestored = useRef(false);
  useEffect(() => {
    if (!isLoaded || hasRestored.current) return;
    hasRestored.current = true;

    const { settings, update } = useSettingsStore.getState();
    const lastFile = settings.lastFile;
    if (!settings.reopenLastFile || !lastFile) return;

    void fileService
      .readFile(lastFile.path)
      .then((file) => {
        // Don't clobber anything typed or opened while the read was running.
        const current = useDocumentStore.getState().document;
        if (current.filePath !== null || current.content !== "") return;

        // Set together so the editor receives content and cursor in one render.
        useUiStore.getState().setPendingCursor(lastFile.anchor);
        useDocumentStore.getState().loadFromDisk(file);
      })
      .catch(() => {
        // Moved or deleted since last time. Not worth an error at launch.
        update({ lastFile: null });
      });
  }, [isLoaded]);

  // Record where the cursor rests, so the restore lands in the same place.
  useEffect(() => {
    if (!isLoaded) return;

    const timer = setTimeout(() => {
      const view = editorViewRef.current;
      const { settings, update } = useSettingsStore.getState();
      const path = useDocumentStore.getState().document.filePath;
      if (!view || !path || settings.lastFile?.path !== path) return;

      const anchor = view.state.selection.main.head;
      if (anchor !== settings.lastFile.anchor) {
        update({ lastFile: { path, anchor } });
      }
    }, CURSOR_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [cursorKey, isLoaded, editorViewRef]);
}
