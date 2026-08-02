import { useEffect, useRef } from "react";
import type { DiscardChoice } from "../../types";

type ConfirmDialogProps = {
  fileName: string;
  onChoose: (choice: DiscardChoice) => void;
};

/**
 * The unsaved-changes prompt.
 *
 * A custom dialog rather than the native one because the decision genuinely has
 * three answers, and the platform `ask` dialog offers only two.
 */
export function ConfirmDialog({ fileName, onChoose }: ConfirmDialogProps) {
  const saveButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    saveButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    // Escape cancels. Captured so the shortcut handler underneath never sees it.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onChoose("cancel");
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onChoose]);

  return (
    <div className="modal-backdrop">
      <div
        className="modal modal--confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
      >
        <h2 id="confirm-title">Save changes to “{fileName}”?</h2>
        <p id="confirm-body">
          Your changes will be lost if you don’t save them.
        </p>

        <div className="modal__actions">
          <button
            type="button"
            className="button--danger"
            onClick={() => onChoose("discard")}
          >
            Don’t Save
          </button>
          <span className="modal__actions-spacer" />
          <button type="button" onClick={() => onChoose("cancel")}>
            Cancel
          </button>
          <button
            type="button"
            className="button--primary"
            ref={saveButtonRef}
            onClick={() => onChoose("save")}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
