import { useEffect } from "react";
import * as fileService from "../services/fileService";
import { useUiStore } from "../stores/uiStore";

/**
 * Opens a file dropped onto the window and drives the drag-active indicator.
 *
 * `onDrop` should already be guarding against discarding unsaved work; this
 * hook only wires the OS event to it.
 */
export function useFileDrop(onDrop: (path: string) => void): void {
  const setDragActive = useUiStore((state) => state.setDragActive);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    // The listener promise can resolve after unmount; this guards against
    // leaving it attached in that case instead of storing it for cleanup.
    let unmounted = false;

    void fileService
      .onFileDrop((event) => {
        switch (event.type) {
          case "hover":
            setDragActive(true);
            break;
          case "cancel":
            setDragActive(false);
            break;
          case "drop":
            setDragActive(false);
            onDrop(event.path);
            break;
        }
      })
      .then((fn) => {
        if (unmounted) fn();
        else unlisten = fn;
      });

    return () => {
      unmounted = true;
      unlisten?.();
      setDragActive(false);
    };
  }, [onDrop, setDragActive]);
}
