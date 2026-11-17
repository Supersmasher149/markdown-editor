# Plan: personal workflow features

Five small features for day-to-day use. None of them need new Rust commands or
new Tauri capabilities. Everything goes through the existing `read_markdown_file`
and `save_settings` paths.

| # | Feature | Where it lives |
| --- | --- | --- |
| 1 | Recent files | settings `recentFiles`, Toolbar menu |
| 2 | Reopen last file on launch, with cursor | settings `reopenLastFile` + `lastFile`, `useSession` hook |
| 5 | Word count goal | settings `wordGoal`, StatusBar |
| 6 | Smart paste: URL over a selection → `[text](url)` | `smartPaste.ts` CodeMirror extension |
| 7 | Insert date / date-time | `insertDate.ts`, keymap + ¶ menu |

## Settings changes (shared by 1, 2, 5)

New `AppSettings` fields, all validated in `validateSettings` the same way as
the existing ones. A bad value falls back to its own default and leaves the
other fields alone.

```ts
recentFiles: string[];                              // newest first, max 10
reopenLastFile: boolean;                            // default true
lastFile: { path: string; anchor: number } | null;  // default null
wordGoal: number;                                   // 0 = off, 0..1_000_000
```

- `version` stays `1`. The new fields are additive, and an old settings file
  simply picks up their defaults. A version bump would wipe existing settings.
- `recentFiles` validation: keep only non-empty absolute strings (start with
  `/`), drop duplicates, cap at 10.
- `lastFile` validation: `path` must be an absolute string, and `anchor` a
  non-negative integer. Anything else becomes `null`.
- These are written through the existing debounced `persist`, so tracking
  them adds no new I/O path.

## 1. Recent files

- **Recording.** A new `useSession` hook subscribes to
  `useDocumentStore` and watches `document.filePath`. When it changes to a
  path, that path moves to the front of `recentFiles`. One subscription covers
  every entry point: Open, Open Recent, drag-and-drop, Save As on a new
  document, and the launch restore.
- **UI.** A `▾` button sits beside **Open** and opens a menu listing the files
  by name, with the full path as a tooltip, followed by **Clear Menu**. The
  Toolbar's single menu state becomes `openMenu: "recent" | "format" | null`,
  so only one menu is open at a time and they share outside-click/Escape
  dismissal.
- **Opening.** `useDocument.openRecent(path)` calls `confirmSafeToReplace`,
  then `openPath`. If the read fails with `FILE_NOT_FOUND`, the entry is
  removed from the list and the error still shows in the status bar.
  `openPath` returns the `AppError | null` so the caller can tell what happened.

## 2. Reopen last file on launch

- **Tracking.** The same `useSession` subscription sets
  `lastFile = { path, anchor: 0 }` when a path appears. If the path is
  unchanged, the stored anchor is kept, so a restore does not reset it. When
  the document goes back to untitled (New, Close), it sets `lastFile = null`,
  so you don't reopen something you deliberately closed.
- **Cursor.** AppShell already receives stats on every selection change. A
  1-second debounced effect reads the main selection head from the editor view
  and writes `lastFile.anchor`. It writes only when a file path exists and the
  anchor actually changed.
- **Restore.** Once settings have loaded, if `reopenLastFile` is on and
  `lastFile` is set:
  1. Set `uiStore.pendingCursor = lastFile.anchor`.
  2. `readFile(lastFile.path)` → `loadFromDisk`.
  3. `MarkdownEditor`'s content-swap effect normally sets the selection to
     0. If a pending cursor exists, it uses that position instead (clamped to
     the document length), centres it with `EditorView.scrollIntoView`, and
     clears the pending value.
  4. On failure (file moved or deleted), clear `lastFile` and `pendingCursor`
     quietly. A missing file at launch is not worth an error banner.
- The restore runs at most once per launch, guarded by a ref, the same way the
  stored layout is applied.
- **Setting.** "Reopen last file on launch" toggle under Behavior.

## 5. Word count goal

- **Setting.** "Word goal" number input under Editor (0 = off).
- **StatusBar.** When the goal is > 0, the word metric reads
  `1,240 / 2,000 words`, with a thin progress bar
  (`<progress>`, labelled for screen readers). When the goal is reached, the
  metric switches to the accent colour.
- **Logic.** A pure `goalProgress(words, goal)` in `documentStats.ts` returns
  `{ ratio, reached }`. It is unit-tested.

## 6. Smart paste

- **Logic.** A pure function `linkifyPaste(state, text): TransactionSpec | null`
  in `src/components/editor/smartPaste.ts`.
  - Applies only when the pasted text, trimmed, is a single `http(s)://` URL
    with no whitespace.
  - Applies only when every selection range is non-empty and single-line.
    With multiple selections, each range is wrapped.
  - Skips a selection that is itself a URL (pasting a URL over a URL means
    "replace it").
  - Result: `[selection](url)`, with the cursor placed after the `)`, as one
    transaction with `userEvent: "input.paste"`, so a single undo reverts it.
- **Wiring.** `EditorView.domEventHandlers({ paste })` reads
  `clipboardData.getData("text/plain")`. If `linkifyPaste` returns a spec, it
  dispatches it and calls `preventDefault`. Otherwise the default paste runs
  untouched.

## 7. Insert date / date-time

- **Logic.** Pure `formatDate(date, withTime)` → `2026-11-17` or
  `2026-11-17 14:32`, in local time, zero-padded. `insertDate(withTime)` returns
  a command that replaces every selection with the stamp.
- **Keys.** `⌘⇧D` inserts the date and `⌥⌘⇧D` inserts the date and time. Both
  are added to the existing `Prec.highest` formatting keymap. Neither chord is
  claimed by CodeMirror's defaults or by macOS. (`⌃⌘D` is system dictionary
  lookup, so it is avoided.)
- **Menu.** "Insert date" and "Insert date & time" go in the toolbar's ¶ menu
  under a separator.

## Tests

- `settingsStore.test.ts`: defaults round-trip, plus validation of each new
  field (bad types, relative paths, duplicates, cap at 10, negative anchor,
  goal clamping).
- `smartPaste.test.ts`: wraps a selection, ignores a non-URL, ignores an empty
  selection, ignores a multi-line selection, handles multiple ranges, trims the
  pasted URL, and skips a selection that is itself a URL.
- `insertDate.test.ts`: zero-padding, the with-time variant, and replacement
  across multiple selections.
- `documentStats.test.ts`: `goalProgress`, covering off, partial, reached, and
  over the goal.
- `recentFiles.ts`: a pure `pushRecent(list, path)` with tests for move to
  front, dedupe, and cap.

## Docs

The README gains feature bullets for all five, the two new shortcuts in the
shortcut table, and an updated test count. The "One document at a time"
limitation stays, because recent files do not change it.

## Out of scope

- A native macOS menu bar (Open Recent lives in the toolbar for now).
- Per-document word goals (front matter or similar).
- Restoring the exact scroll offset. The cursor is restored and centred,
  which is close enough.
