import { useDocumentStore } from "../stores/documentStore";
import * as fileService from "./fileService";

/**
 * The one and only implementation of saving.
 *
 * It lives outside React because two callers need it: the `useDocument` hook,
 * and the window close handler, which runs outside the component tree and
 * therefore cannot use a hook. Both go through here so the store transitions
 * and the failure handling are identical.
 */

/** Derive the display name from a path chosen in the save panel. */
export function fileNameFromPath(path: string, fallback: string): string {
  return path.split("/").pop() || fallback;
}

/**
 * Write the current content to `path`.
 *
 * Returns false if a save was already running or the write failed; the error is
 * recorded on the store either way.
 */
export async function writeCurrentDocument(
  path: string,
  fileName: string,
): Promise<boolean> {
  const store = useDocumentStore.getState();

  // Refuses when a save is already in flight, so a repeated Command-S cannot
  // start two overlapping writes to the same path.
  if (!store.beginSave()) return false;

  // Snapshot what is being written. The user may keep typing during the write,
  // and `savedContent` must reflect only what actually reached disk.
  const content = store.document.content;

  try {
    await fileService.writeFile(path, content);
    useDocumentStore
      .getState()
      .completeSave({ content, filePath: path, fileName });
    return true;
  } catch (thrown) {
    useDocumentStore.getState().failSave(fileService.toAppError(thrown));
    return false;
  }
}

/**
 * Prompt for a location, then save there.
 *
 * Returns false when the user cancels the dialog, which is a normal outcome
 * rather than an error.
 */
export async function saveDocumentAs(): Promise<boolean> {
  const document = useDocumentStore.getState().document;

  const path = await fileService.pickFileToSave(document.fileName);
  if (!path) return false;

  return writeCurrentDocument(path, fileNameFromPath(path, document.fileName));
}

/** Save to the existing path, falling back to Save As for a new document. */
export async function saveDocument(): Promise<boolean> {
  const document = useDocumentStore.getState().document;

  if (!document.filePath) return saveDocumentAs();
  return writeCurrentDocument(document.filePath, document.fileName);
}
