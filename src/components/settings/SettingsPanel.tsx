import { useEffect, useRef } from "react";
import type { AppSettings, LayoutMode, ThemeSetting } from "../../types";
import {
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  TAB_SIZE_MAX,
  TAB_SIZE_MIN,
} from "../../stores/settingsStore";

type SettingsPanelProps = {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  onReset: () => void;
  onClose: () => void;
};

const THEME_OPTIONS: ReadonlyArray<{ value: ThemeSetting; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const LAYOUT_OPTIONS: ReadonlyArray<{ value: LayoutMode; label: string }> = [
  { value: "editor", label: "Editor" },
  { value: "split", label: "Split" },
  { value: "preview", label: "Preview" },
];

/** A labelled on/off row. */
function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="settings__row settings__row--toggle">
      <span className="settings__label">
        {label}
        {hint && <span className="settings__hint">{hint}</span>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

export function SettingsPanel({
  settings,
  onChange,
  onReset,
  onClose,
}: SettingsPanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onPointerDown={(event) => {
        // Only a click on the backdrop itself dismisses, not one that started
        // inside the panel and drifted out.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal modal--settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header className="modal__header">
          <h2 id="settings-title">Settings</h2>
          <button
            type="button"
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close settings"
          >
            ✕
          </button>
        </header>

        <div className="modal__body">
          <section className="settings__section">
            <h3>Appearance</h3>
            <div className="settings__row">
              <span className="settings__label">Theme</span>
              <div className="segmented">
                {THEME_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    className={
                      settings.theme === value ? "is-active" : undefined
                    }
                    aria-pressed={settings.theme === value}
                    onClick={() => onChange({ theme: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="settings__section">
            <h3>Editor</h3>

            <label className="settings__row">
              <span className="settings__label">Font size</span>
              <span className="settings__control">
                <input
                  type="range"
                  min={FONT_SIZE_MIN}
                  max={FONT_SIZE_MAX}
                  step={1}
                  value={settings.fontSize}
                  onChange={(event) =>
                    onChange({ fontSize: Number(event.target.value) })
                  }
                />
                <span className="settings__value">{settings.fontSize}px</span>
              </span>
            </label>

            <label className="settings__row">
              <span className="settings__label">Tab size</span>
              <span className="settings__control">
                <input
                  type="number"
                  min={TAB_SIZE_MIN}
                  max={TAB_SIZE_MAX}
                  step={1}
                  value={settings.tabSize}
                  onChange={(event) =>
                    onChange({ tabSize: Number(event.target.value) })
                  }
                />
                <span className="settings__value">spaces</span>
              </span>
            </label>

            <ToggleRow
              label="Soft wrapping"
              hint="Wrap long lines instead of scrolling sideways"
              checked={settings.softWrap}
              onChange={(softWrap) => onChange({ softWrap })}
            />

            <ToggleRow
              label="Line numbers"
              checked={settings.showLineNumbers}
              onChange={(showLineNumbers) => onChange({ showLineNumbers })}
            />
          </section>

          <section className="settings__section">
            <h3>Behavior</h3>

            <div className="settings__row">
              <span className="settings__label">
                Default layout
                {settings.rememberLayout && (
                  <span className="settings__hint">
                    Following the last layout you used
                  </span>
                )}
              </span>
              <div className="segmented">
                {LAYOUT_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    className={
                      settings.defaultLayout === value ? "is-active" : undefined
                    }
                    aria-pressed={settings.defaultLayout === value}
                    onClick={() => onChange({ defaultLayout: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <ToggleRow
              label="Remember last layout"
              hint="Reopen in whichever layout you were last using"
              checked={settings.rememberLayout}
              onChange={(rememberLayout) => onChange({ rememberLayout })}
            />

            <ToggleRow
              label="Confirm before discarding changes"
              hint="Turning this off will discard unsaved work without asking"
              checked={settings.confirmDiscard}
              onChange={(confirmDiscard) => onChange({ confirmDiscard })}
            />
          </section>
        </div>

        <footer className="modal__actions">
          <button type="button" onClick={onReset}>
            Restore Defaults
          </button>
          <span className="modal__actions-spacer" />
          <button type="button" className="button--primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
