import { useCallback, useEffect, useRef, useState } from "react";
import { SPLIT_MAX, SPLIT_MIN } from "../../stores/settingsStore";
import type { LayoutMode } from "../../types";

type SplitViewProps = {
  layout: LayoutMode;
  /** Editor pane width as a fraction of the container, between 0 and 1. */
  splitPosition: number;
  onSplitPositionChange: (position: number) => void;
  editor: React.ReactNode;
  preview: React.ReactNode;
};

/**
 * The two panes and the divider between them.
 *
 * Both panes stay mounted in every layout and are hidden with CSS instead of
 * being unmounted. That is what preserves the editor's cursor, scroll position
 * and undo history when the user switches layouts.
 */
export function SplitView({
  layout,
  splitPosition,
  onSplitPositionChange,
  editor,
  preview,
}: SplitViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const positionFromClientX = useCallback((clientX: number): number | null => {
    const container = containerRef.current;
    if (!container) return null;

    const bounds = container.getBoundingClientRect();
    if (bounds.width === 0) return null;

    const fraction = (clientX - bounds.left) / bounds.width;
    return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, fraction));
  }, []);

  // Listeners live on the window so a fast drag that outruns the pointer still
  // tracks, and still ends when the button is released outside the divider.
  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (event: PointerEvent) => {
      const next = positionFromClientX(event.clientX);
      if (next !== null) onSplitPositionChange(next);
    };
    const stop = () => setIsDragging(false);

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [isDragging, onSplitPositionChange, positionFromClientX]);

  // Keyboard access to the divider, since a drag handle is otherwise
  // unreachable without a pointer.
  const handleKeyDown = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 0.1 : 0.02;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onSplitPositionChange(Math.max(SPLIT_MIN, splitPosition - step));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      onSplitPositionChange(Math.min(SPLIT_MAX, splitPosition + step));
    } else if (event.key === "Home") {
      event.preventDefault();
      onSplitPositionChange(0.5);
    }
  };

  const isSplit = layout === "split";
  const editorWidth = isSplit ? `${splitPosition * 100}%` : "100%";

  return (
    <div
      className={`split-view${isDragging ? " is-dragging" : ""}`}
      ref={containerRef}
    >
      <div
        className="split-pane split-pane--editor"
        style={{ width: editorWidth }}
        hidden={layout === "preview"}
      >
        {editor}
      </div>

      {isSplit && (
        <div
          className="split-divider"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize editor and preview"
          aria-valuenow={Math.round(splitPosition * 100)}
          aria-valuemin={Math.round(SPLIT_MIN * 100)}
          aria-valuemax={Math.round(SPLIT_MAX * 100)}
          tabIndex={0}
          onPointerDown={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onKeyDown={handleKeyDown}
          onDoubleClick={() => onSplitPositionChange(0.5)}
        />
      )}

      <div
        className="split-pane split-pane--preview"
        hidden={layout === "editor"}
      >
        {preview}
      </div>
    </div>
  );
}
