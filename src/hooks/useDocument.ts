import { useCallback } from "react";
import { useDocumentStore } from "../stores/documentStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useUiStore } from "../stores/uiStore";
import * as fileService from "../services/fileService";
import { saveDocument, saveDocumentAs } from "../services/saveDocument";

/**
 * The document lifecycle: new, open, save, save as, close, reveal.
 *
 * All of it lives here so there is exactly one place that decides whether
 * unsaved work needs protecting. The writing itself is delegated to
 * `services/saveDocument`, which the close handler shares.
 */
export function useDocument() {
  const document = useDocumentStore((state) => state.document);
  const setError = useDocumentStore((state) => state.setError);
  const confirmDiscard = useSettingsStore(
    (state) => state.settings.confirmDiscard,
  );

  const save = useCallback(() => saveDocument(), []);
  const saveAs = useCallback(() => saveDocumentAs(), []);

  /**
   * Give the user a chance to save before their work is replaced.
   *
   * Returns true when it is safe to proceed. Every action that would otherwise
   * discard the buffer goes through this first.
   */
  const confirmSafeToReplace = useCallback(async (): Promise<boolean> => {
    const current = useDocumentStore.getState().document;
    if (!current.isDirty || !confirmDiscard) return true;

    const choice = await useUiStore
      .getState()
      .requestDiscardChoice(current.fileName);

    if (choice === "cancel") return false;
    if (choice === "discard") return true;

    // "Save" only clears the way if the save actually succeeded; a failed or
    // cancelled save must not drop the content it was trying to protect.
    return saveDocument();
  }, [confirmDiscard]);

  const newDocument = useCallback(async (): Promise<void> => {
    if (!(await confirmSafeToReplace())) return;
    useDocumentStore.getState().reset();
  }, [confirmSafeToReplace]);

  const openFile = useCallback(async (): Promise<void> => {
    if (!(await confirmSafeToReplace())) return;

    const path = await fileService.pickFileToOpen();
    // A cancelled dialog is a normal outcome, not an error to report.
    if (!path) return;

    try {
      const file = await fileService.readFile(path);
      useDocumentStore.getState().loadFromDisk(file);
    } catch (thrown) {
      setError(fileService.toAppError(thrown));
    }
  }, [confirmSafeToReplace, setError]);

  /** Close the active document, returning to an empty untitled buffer. */
  const closeDocument = useCallback(async (): Promise<void> => {
    if (!(await confirmSafeToReplace())) return;
    useDocumentStore.getState().reset();
  }, [confirmSafeToReplace]);

  const revealInFinder = useCallback(async (): Promise<void> => {
    const path = useDocumentStore.getState().document.filePath;
    if (!path) return;

    try {
      await fileService.revealInFileManager(path);
    } catch (thrown) {
      setError(fileService.toAppError(thrown));
    }
  }, [setError]);

  return {
    document,
    newDocument,
    openFile,
    save,
    saveAs,
    closeDocument,
    revealInFinder,
    confirmSafeToReplace,
  };
}
