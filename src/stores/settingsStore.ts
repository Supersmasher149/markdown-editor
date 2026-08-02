import { create } from "zustand";
import type { AppSettings, LayoutMode, ThemeSetting } from "../types";
import * as fileService from "../services/fileService";

/**
 * Settings are stored as JSON written by an untrusted-ish source (a file the
 * user can hand-edit, or an older version of this app). Everything read back
 * goes through {@link validateSettings}, which never throws and never returns a
 * partial object.
 */

export const SETTINGS_VERSION = 1 as const;

export const DEFAULT_SETTINGS: AppSettings = {
  version: SETTINGS_VERSION,
  theme: "system",
  fontSize: 14,
  tabSize: 2,
  softWrap: true,
  showLineNumbers: true,
  defaultLayout: "split",
  rememberLayout: true,
  confirmDiscard: true,
  splitPosition: 0.5,
};

/** Bounds for the numeric settings, shared by the UI controls and validation. */
export const FONT_SIZE_MIN = 10;
export const FONT_SIZE_MAX = 28;
export const TAB_SIZE_MIN = 1;
export const TAB_SIZE_MAX = 8;
/** Keeps both panes usable at the 800px minimum window width. */
export const SPLIT_MIN = 0.2;
export const SPLIT_MAX = 0.8;

const THEMES: readonly ThemeSetting[] = ["system", "light", "dark"];
const LAYOUTS: readonly LayoutMode[] = ["editor", "split", "preview"];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Read a bounded, rounded integer, falling back when the value is unusable. */
function intOr(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return clamp(Math.round(value), min, max);
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * Coerce arbitrary parsed JSON into a complete, valid `AppSettings`.
 *
 * Invalid or missing fields fall back to their default individually, so one bad
 * value does not discard the user's other preferences. Settings written by a
 * future version are not migrated backwards - the whole object is reset.
 */
export function validateSettings(raw: unknown): AppSettings {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ...DEFAULT_SETTINGS };
  }

  const input = raw as Record<string, unknown>;

  // An unrecognised version means the file was written by a different build.
  // Reading its fields would be guesswork, so start clean.
  if (input.version !== SETTINGS_VERSION) {
    return { ...DEFAULT_SETTINGS };
  }

  const splitPosition =
    typeof input.splitPosition === "number" &&
    Number.isFinite(input.splitPosition)
      ? clamp(input.splitPosition, SPLIT_MIN, SPLIT_MAX)
      : DEFAULT_SETTINGS.splitPosition;

  return {
    version: SETTINGS_VERSION,
    theme: oneOf(input.theme, THEMES, DEFAULT_SETTINGS.theme),
    fontSize: intOr(
      input.fontSize,
      DEFAULT_SETTINGS.fontSize,
      FONT_SIZE_MIN,
      FONT_SIZE_MAX,
    ),
    tabSize: intOr(
      input.tabSize,
      DEFAULT_SETTINGS.tabSize,
      TAB_SIZE_MIN,
      TAB_SIZE_MAX,
    ),
    softWrap: boolOr(input.softWrap, DEFAULT_SETTINGS.softWrap),
    showLineNumbers: boolOr(
      input.showLineNumbers,
      DEFAULT_SETTINGS.showLineNumbers,
    ),
    defaultLayout: oneOf(
      input.defaultLayout,
      LAYOUTS,
      DEFAULT_SETTINGS.defaultLayout,
    ),
    rememberLayout: boolOr(
      input.rememberLayout,
      DEFAULT_SETTINGS.rememberLayout,
    ),
    confirmDiscard: boolOr(
      input.confirmDiscard,
      DEFAULT_SETTINGS.confirmDiscard,
    ),
    splitPosition,
  };
}

type SettingsState = {
  settings: AppSettings;
  /** False until the stored file has been read, so startup can wait for it. */
  isLoaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<AppSettings>) => void;
  reset: () => void;
};

/**
 * Writes are debounced: dragging the split divider or holding a stepper would
 * otherwise fsync a file on every animation frame.
 */
const PERSIST_DEBOUNCE_MS = 400;
let persistTimer: ReturnType<typeof setTimeout> | undefined;

function persist(settings: AppSettings): void {
  if (persistTimer !== undefined) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    // Settings are a convenience, not data the user typed. A failure here is
    // logged rather than escalated into a modal error.
    void fileService.saveSettings(settings).catch((error: unknown) => {
      console.warn("Could not persist settings", error);
    });
  }, PERSIST_DEBOUNCE_MS);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  isLoaded: false,

  load: async () => {
    const stored = await fileService.loadSettings();
    set({ settings: validateSettings(stored), isLoaded: true });
  },

  update: (patch) => {
    const next = validateSettings({ ...get().settings, ...patch });
    set({ settings: next });
    persist(next);
  },

  reset: () => {
    const next = { ...DEFAULT_SETTINGS };
    set({ settings: next });
    persist(next);
  },
}));
