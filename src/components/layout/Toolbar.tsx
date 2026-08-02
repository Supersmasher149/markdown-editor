import { useEffect, useRef, useState } from "react";
import type { FormatName } from "../editor/formattingCommands";
import type { LayoutMode } from "../../types";

type ToolbarProps = {
  layout: LayoutMode;
  canReveal: boolean;
  isSaving: boolean;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onLayoutChange: (layout: LayoutMode) => void;
  onFormat: (format: FormatName) => void;
  onReveal: () => void;
  onOpenSettings: () => void;
};

/** Formatting actions common enough to earn a permanent button. */
const PRIMARY_FORMATS: ReadonlyArray<{
  format: FormatName;
  label: string;
  title: string;
}> = [
  { format: "bold", label: "B", title: "Bold  ⌘B" },
  { format: "italic", label: "I", title: "Italic  ⌘I" },
  { format: "inlineCode", label: "<>", title: "Inline code  ⌘E" },
  { format: "link", label: "🔗", title: "Link  ⌘K" },
];

/** Everything else, kept in a menu so the toolbar stays readable. */
const MENU_FORMATS: ReadonlyArray<{ format: FormatName; label: string }> = [
  { format: "heading1", label: "Heading 1" },
  { format: "heading2", label: "Heading 2" },
  { format: "heading3", label: "Heading 3" },
  { format: "blockquote", label: "Blockquote" },
  { format: "bulletList", label: "Bullet list" },
  { format: "orderedList", label: "Numbered list" },
  { format: "taskList", label: "Task list" },
  { format: "codeBlock", label: "Code block" },
  { format: "horizontalRule", label: "Horizontal rule" },
];

const LAYOUTS: ReadonlyArray<{
  mode: LayoutMode;
  label: string;
  title: string;
}> = [
  { mode: "editor", label: "Editor", title: "Editor only" },
  { mode: "split", label: "Split", title: "Editor and preview" },
  { mode: "preview", label: "Preview", title: "Preview only" },
];

export function Toolbar({
  layout,
  canReveal,
  isSaving,
  onNew,
  onOpen,
  onSave,
  onLayoutChange,
  onFormat,
  onReveal,
  onOpenSettings,
}: ToolbarProps) {
  const [isMenuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Dismiss the menu on an outside click or Escape, the way a native menu does.
  useEffect(() => {
    if (!isMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  const runFormat = (format: FormatName) => {
    onFormat(format);
    setMenuOpen(false);
  };

  return (
    <div className="toolbar" role="toolbar" aria-label="Document actions">
      <div className="toolbar__group">
        <button type="button" onClick={onNew} title="New  ⌘N">
          New
        </button>
        <button type="button" onClick={onOpen} title="Open…  ⌘O">
          Open
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          title="Save  ⌘S"
        >
          {isSaving ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="toolbar__separator" aria-hidden="true" />

      <div className="toolbar__group">
        {PRIMARY_FORMATS.map(({ format, label, title }) => (
          <button
            key={format}
            type="button"
            className={`toolbar__format toolbar__format--${format}`}
            onClick={() => onFormat(format)}
            title={title}
            aria-label={title}
          >
            {label}
          </button>
        ))}

        <div className="toolbar__menu-wrap" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            title="More formatting"
          >
            ¶ ▾
          </button>

          {isMenuOpen && (
            <div className="toolbar__menu" role="menu">
              {MENU_FORMATS.map(({ format, label }) => (
                <button
                  key={format}
                  type="button"
                  role="menuitem"
                  onClick={() => runFormat(format)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="toolbar__spacer" />

      <div className="toolbar__group toolbar__group--segmented">
        {LAYOUTS.map(({ mode, label, title }) => (
          <button
            key={mode}
            type="button"
            className={layout === mode ? "is-active" : undefined}
            aria-pressed={layout === mode}
            onClick={() => onLayoutChange(mode)}
            title={title}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="toolbar__group">
        <button
          type="button"
          onClick={onReveal}
          disabled={!canReveal}
          title={
            canReveal
              ? "Reveal in Finder"
              : "Save the document first to reveal it in Finder"
          }
        >
          Reveal
        </button>
        <button type="button" onClick={onOpenSettings} title="Settings  ⌘,">
          ⚙
        </button>
      </div>
    </div>
  );
}
