import { useEffect, useSyncExternalStore } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import type { ResolvedTheme, ThemeSetting } from "../types";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeToSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Returns a primitive, so React can compare snapshots by value. */
function getSystemTheme(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

/**
 * Resolve the "system" theme setting against the OS appearance, keeping it
 * current if the user switches appearance while the app is running.
 *
 * The OS appearance is genuinely external state, so it is subscribed to
 * directly rather than mirrored into a `useState` from an effect.
 */
export function useResolvedTheme(theme: ThemeSetting): ResolvedTheme {
  const systemTheme = useSyncExternalStore(
    subscribeToSystemTheme,
    getSystemTheme,
  );

  return theme === "system" ? systemTheme : theme;
}

/**
 * Load persisted settings once at startup and expose the store.
 *
 * A failure to read settings is not fatal: the store keeps its defaults and the
 * app starts normally.
 */
export function useSettings() {
  const settings = useSettingsStore((state) => state.settings);
  const isLoaded = useSettingsStore((state) => state.isLoaded);
  const update = useSettingsStore((state) => state.update);
  const reset = useSettingsStore((state) => state.reset);

  useEffect(() => {
    void useSettingsStore
      .getState()
      .load()
      .catch((error: unknown) => {
        console.warn("Could not load settings; using defaults", error);
        useSettingsStore.setState({ isLoaded: true });
      });
  }, []);

  const theme = useResolvedTheme(settings.theme);

  // Applied to the document root so plain CSS can key off it.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  return { settings, isLoaded, theme, update, reset };
}
