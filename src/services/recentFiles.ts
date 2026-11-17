/** How many entries the Open Recent menu keeps. */
export const MAX_RECENT_FILES = 10;

/**
 * Move `path` to the front of the recent-files list.
 *
 * Returns a new array: deduplicated, newest first, capped at
 * {@link MAX_RECENT_FILES}.
 */
export function pushRecent(list: readonly string[], path: string): string[] {
  return [path, ...list.filter((entry) => entry !== path)].slice(
    0,
    MAX_RECENT_FILES,
  );
}

/** The file name shown in the menu; the full path goes in the tooltip. */
export function displayName(path: string): string {
  return path.split("/").pop() || path;
}
