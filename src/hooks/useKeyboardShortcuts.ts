import { useEffect, useRef } from "react";

/**
 * Application-level keyboard shortcuts.
 *
 * These are bound on the window rather than inside CodeMirror so they work
 * regardless of what has focus - Command-S must save whether the caret is in
 * the editor, in the settings panel, or nowhere at all.
 *
 * Only chords the app genuinely owns are intercepted. Everything else,
 * including system text-editing shortcuts, is left to the OS and CodeMirror.
 */
export type ShortcutHandlers = {
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onToggleSettings: () => void;
};

export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  // Read through a ref so callers can pass a fresh object each render without
  // the listener being torn down and rebound every time. Updated in an effect
  // rather than during render, which React does not allow.
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Command on macOS; Control elsewhere so a non-mac dev build still works.
      if (!event.metaKey && !event.ctrlKey) return;
      if (event.altKey) return;

      const key = event.key.toLowerCase();

      switch (key) {
        case "n":
          if (event.shiftKey) return;
          event.preventDefault();
          handlersRef.current.onNew();
          break;
        case "o":
          if (event.shiftKey) return;
          event.preventDefault();
          handlersRef.current.onOpen();
          break;
        case "s":
          event.preventDefault();
          if (event.shiftKey) handlersRef.current.onSaveAs();
          else handlersRef.current.onSave();
          break;
        case ",":
          if (event.shiftKey) return;
          event.preventDefault();
          handlersRef.current.onToggleSettings();
          break;
        default:
          // Command-F, Command-Z, Command-B and friends belong to CodeMirror.
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
