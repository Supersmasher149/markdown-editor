import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useDocumentStore } from "../stores/documentStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useUiStore } from "../stores/uiStore";
import { saveDocument } from "../services/saveDocument";

/**
 * Intercept the window close button when there is unsaved work.
 *
 * Tauri's `onCloseRequested` lets us veto the close, prompt, and then destroy
 * the window once the user has decided. Without this the red button would
 * discard the buffer silently.
 *
 * This runs outside the component tree, so it reads the stores directly and
 * shares `saveDocument` with the rest of the app rather than reimplementing it.
 */
export function useCloseProtection(): void {
  useEffect(() => {
    const appWindow = getCurrentWindow();

    const unlistenPromise = appWindow.onCloseRequested(async (event) => {
      const document = useDocumentStore.getState().document;
      const { confirmDiscard } = useSettingsStore.getState().settings;

      if (!document.isDirty || !confirmDiscard) return;

      // Hold the window open while we ask; the branches below decide whether to
      // close it manually.
      event.preventDefault();

      const choice = await useUiStore
        .getState()
        .requestDiscardChoice(document.fileName);

      if (choice === "cancel") return;

      // A failed or cancelled save keeps the window open, so the content is
      // still there to retry with.
      if (choice === "save" && !(await saveDocument())) return;

      await appWindow.destroy();
    });

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);
}
