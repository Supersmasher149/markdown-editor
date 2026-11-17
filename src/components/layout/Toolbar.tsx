import { useEffect, useRef, useState } from "react";
import type { FormatName } from "../editor/formattingCommands";
import type { LayoutMode } from "../../types";
import { displayName } from "../../services/recentFiles";

type ToolbarProps = {
  layout: LayoutMode;
  syncScroll: boolean;
  canReveal: boolean;
  isSaving: boolean;
  recentFiles: readonly string[];
  onNew: () => void;
  onOpen: () => void;
  onOpenRecent: (path: string) => void;
  onClearRecent: () => void;
  onSave: () => void;
  onLayoutChange: (layout: LayoutMode) => void;
  onSyncScrollChange: (syncScroll: boolean) => void;
  onFormat: (format: FormatName) => void;
  onInsertDate: (withTime: boolean) => void;
  onReveal: () => void;
  onPrint: () => void;
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

type MenuName = "recent" | "format" | "view";

export function Toolbar({
  layout,
  syncScroll,
  canReveal,
  isSaving,
  recentFiles,
  onNew,
  onOpen,
  onOpenRecent,
  onClearRecent,
  onSave,
  onLayoutChange,
  onSyncScrollChange,
  onFormat,
  onInsertDate,
  onReveal,
  onPrint,
  onOpenSettings,
}: ToolbarProps) {
  // At most one menu is open at a time, as with native menus.
  const [openMenu, setOpenMenu] = useState<MenuName | null>(null);
  const recentMenuRef = useRef<HTMLDivElement | null>(null);
  const formatMenuRef = useRef<HTMLDivElement | null>(null);
  const viewMenuRef = useRef<HTMLDivElement | null>(null);

  // Dismiss the menu on an outside click or Escape, the way a native menu does.
  useEffect(() => {
    if (openMenu === null) return;
    const activeRef = {
      recent: recentMenuRef,
      format: formatMenuRef,
      view: viewMenuRef,
    }[openMenu];

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !activeRef.current?.contains(event.target)
      ) {
        setOpenMenu(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenu]);

  const toggleMenu = (menu: MenuName) =>
    setOpenMenu((current) => (current === menu ? null : menu));

  /** Run a menu item's action and close the menu. */
  const choose = (action: () => void) => {
    action();
    setOpenMenu(null);
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
        <div className="toolbar__menu-wrap" ref={recentMenuRef}>
          <button
            type="button"
            className="toolbar__recent"
            onClick={() => toggleMenu("recent")}
            aria-haspopup="menu"
            aria-expanded={openMenu === "recent"}
            aria-label="Open Recent"
            title="Open Recent"
          >
            ▾
          </button>

          {openMenu === "recent" && (
            <div className="toolbar__menu" role="menu">
              {recentFiles.length === 0 ? (
                <span className="toolbar__menu-empty">No recent files</span>
              ) : (
                <>
                  {recentFiles.map((path) => (
                    <button
                      key={path}
                      type="button"
                      role="menuitem"
                      className="toolbar__menu-item--recent"
                      title={path}
                      onClick={() => choose(() => onOpenRecent(path))}
                    >
                      {displayName(path)}
                    </button>
                  ))}
                  <div className="toolbar__menu-separator" role="separator" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => choose(onClearRecent)}
                  >
                    Clear Menu
                  </button>
                </>
              )}
            </div>
          )}
        </div>
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

        <div className="toolbar__menu-wrap" ref={formatMenuRef}>
          <button
            type="button"
            onClick={() => toggleMenu("format")}
            aria-haspopup="menu"
            aria-expanded={openMenu === "format"}
            title="More formatting"
          >
            ¶ ▾
          </button>

          {openMenu === "format" && (
            <div className="toolbar__menu" role="menu">
              {MENU_FORMATS.map(({ format, label }) => (
                <button
                  key={format}
                  type="button"
                  role="menuitem"
                  onClick={() => choose(() => onFormat(format))}
                >
                  {label}
                </button>
              ))}
              <div className="toolbar__menu-separator" role="separator" />
              <button
                type="button"
                role="menuitem"
                title="⌘⇧D"
                onClick={() => choose(() => onInsertDate(false))}
              >
                Insert date
              </button>
              <button
                type="button"
                role="menuitem"
                title="⌥⌘⇧D"
                onClick={() => choose(() => onInsertDate(true))}
              >
                Insert date &amp; time
              </button>
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

      <div className="toolbar__menu-wrap" ref={viewMenuRef}>
        <button
          type="button"
          onClick={() => toggleMenu("view")}
          aria-haspopup="menu"
          aria-expanded={openMenu === "view"}
          title="View options"
        >
          View ▾
        </button>

        {openMenu === "view" && (
          <div className="toolbar__menu toolbar__menu--end" role="menu">
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={syncScroll}
              title="Keep the editor and preview scrolled together in Split view"
              onClick={() => choose(() => onSyncScrollChange(!syncScroll))}
            >
              <span className="toolbar__menu-check" aria-hidden="true">
                {syncScroll ? "✓" : ""}
              </span>
              Sync Scrolling
            </button>
          </div>
        )}
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
        <button type="button" onClick={onPrint} title="Print / Save as PDF  ⌘P">
          Print
        </button>
        <button type="button" onClick={onOpenSettings} title="Settings  ⌘,">
          ⚙
        </button>
      </div>
    </div>
  );
}
