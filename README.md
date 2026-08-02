# Markdown Editor

[![CI](https://github.com/Supersmasher149/markdown-editor/actions/workflows/ci.yml/badge.svg)](https://github.com/Supersmasher149/markdown-editor/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Platform: macOS](https://img.shields.io/badge/platform-macOS-lightgrey.svg)

A local-first Markdown editor for macOS, built with Tauri 2, Rust, React, TypeScript, and CodeMirror 6.

Markdown is the source of truth. This is a plain-text editor with a live preview, not a WYSIWYG editor — what you type is exactly what lands on disk.

It works entirely offline. There are no accounts and no telemetry; the only thing that ever leaves the app is a link you deliberately click, which opens in your browser.

## Features

- Create, open, edit, and save `.md`, `.markdown`, and `.txt` files
- Markdown syntax highlighting, line numbers, bracket matching, multiple selections, search, and undo/redo
- Live rendered preview with syntax-highlighted code blocks, tables, and task lists
- Editor-only, split, and preview-only layouts with a draggable divider
- Formatting commands for bold, italic, inline code, links, headings, blockquotes, lists, task lists, code blocks, and horizontal rules
- Unsaved-change protection when creating, opening, or closing
- Light, dark, and system themes; configurable font size, tab size, soft wrapping, and line numbers
- Settings persisted locally as JSON

## Requirements

- macOS 10.15 or later
- [Node.js](https://nodejs.org/) 20 or later
- [Rust](https://rustup.rs/) (stable) with the Xcode command line tools installed

## Development

```bash
npm install        # install frontend dependencies
npm run tauri dev  # run the app with hot reload
```

The first `tauri dev` compiles the Rust dependency tree and takes a few minutes. Later runs are fast.

`npm run dev` serves the frontend on its own at <http://localhost:1420>, but the app does not run there: it asks Tauri for the current window on mount, which fails outside the Tauri runtime. Use `npm run tauri dev` — the Vite server it starts still gives you hot reload and browser devtools.

## Checks

```bash
npm run test       # frontend tests (Vitest)
npm run lint       # ESLint + Prettier
npm run typecheck  # TypeScript, no emit
```

```bash
cd src-tauri
cargo test         # Rust unit tests
cargo clippy --all-targets -- -D warnings
cargo fmt --check
```

## Production build

```bash
npm run tauri build
```

Produces `src-tauri/target/release/bundle/macos/Markdown Editor.app`, and a `.dmg` beside it in `bundle/dmg/`.

To build only the app bundle and skip disk-image packaging:

```bash
npm run tauri build -- --bundles app
```

Two caveats:

- **DMG packaging needs Finder automation.** Tauri's `bundle_dmg.sh` drives Finder over AppleScript to lay out the disk image window. In a terminal without Automation permission — a CI runner, or a shell that cannot show the macOS consent prompt — that step fails with `-1743: Not authorized to send Apple events to Finder`, and the build reports `error running bundle_dmg.sh` and exits, *after* the `.app` has already been written successfully.

  Either grant the terminal Automation access under System Settings → Privacy & Security → Automation (enable **Finder** for your terminal; if it was denied once, `tccutil reset AppleEvents` makes it prompt again), or sidestep Finder entirely:

  ```bash
  scripts/make-dmg.sh           # package the .app already in target/
  scripts/make-dmg.sh --build   # build the .app first, then package it
  ```

  That script builds the disk image with `hdiutil` alone — the app plus the usual `/Applications` drag target — so it needs no GUI permission and works on a CI runner. What it gives up is only cosmetic: no custom background or icon positioning.

- **The build is unsigned.** macOS will refuse to open it on another machine until it is signed and notarized, or until the user right-clicks and chooses Open. Signing is out of scope for this version — see [Tauri's macOS signing guide](https://tauri.app/distribute/sign/macos/) to add it.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `⌘N` | New document |
| `⌘O` | Open… |
| `⌘S` | Save |
| `⌘⇧S` | Save As… |
| `⌘,` | Settings |
| `⌘F` | Find |
| `⌘Z` / `⌘⇧Z` | Undo / redo |
| `⌘B` | Bold |
| `⌘I` | Italic |
| `⌘K` | Link |
| `⌘E` | Inline code |
| `⌘⇧1` … `⌘⇧3` | Heading 1–3 |
| `⌘⇧8` / `⌘⇧7` | Bullet / numbered list |
| `⌘⇧.` | Blockquote |

File-level shortcuts are bound on the window so they work regardless of focus. Editing shortcuts belong to CodeMirror. No standard system shortcut is overridden.

## Architecture

```text
src/
├── components/
│   ├── editor/       CodeMirror host, extensions, formatting commands, statistics
│   ├── preview/      markdown-it pipeline, sanitization, preview styling
│   ├── layout/       AppShell, Toolbar, SplitView, StatusBar, ConfirmDialog
│   └── settings/     SettingsPanel
├── hooks/            document lifecycle, settings, shortcuts, window title, close protection
├── services/         fileService (the only Tauri boundary), saveDocument
├── stores/           document, settings, and UI state (Zustand)
├── types/            shared types, mirrored by the Rust side
└── styles/           application chrome

src-tauri/src/
├── commands/files.rs     read, write, reveal
├── commands/settings.rs  settings persistence
├── error.rs              structured AppError shared with the frontend
└── lib.rs                plugin and command wiring
```

A few decisions worth knowing about:

**The document model is the single source of truth.** `MarkdownDocument` holds both `content` and `savedContent`, and `isDirty` is always *derived* from `content !== savedContent`, never assigned. Every state transition goes through `createDocument`, so the flag cannot drift out of step with the text it describes. CodeMirror is a view onto this state, not the state itself.

**The editor instance is created once and never rebuilt.** Rebuilding it on every content change would discard undo history, cursor position, and scroll offset. Settings that change at runtime (theme, font size, line numbers, wrapping, tab size) live behind CodeMirror `Compartment`s and are reconfigured in place. External content changes (open, new) are pushed in through a dispatch that runs only when the editor's text actually differs from the store's.

**Both panes stay mounted in every layout.** Switching to preview-only hides the editor with CSS rather than unmounting it, which is what preserves the cursor across layout changes. The editor is asked to re-measure when it becomes visible again, since it measures zero height while hidden.

**There is exactly one save implementation.** `services/saveDocument.ts` owns writing, and both the `useDocument` hook and the window close handler call it. The close handler runs outside the React tree and cannot use a hook, which is precisely why that logic lives in a plain module rather than in the hook.

**`savedContent` only ever advances to text that actually reached disk.** The content being written is snapshotted before the write starts, so if the user keeps typing during a save, the document correctly stays dirty afterwards.

**Preview rendering never happens during a React render.** It runs in a debounced effect (150 ms), and a render whose text has already been superseded is discarded, so a slow parse cannot overwrite a newer result. The markdown-it instance is built once and reused.

**Writes are atomic.** Rust writes to a temporary file in the destination directory, flushes and fsyncs it, then renames it over the target. A crash mid-save leaves either the old file or the new one, never a truncated hybrid.

**The frontend has no filesystem access.** It cannot read or write a path on its own; it can only ask Rust to. The dialog plugin lets it *choose* a path, which grants no ability to touch it.

## Security

Markdown from a file is untrusted input, and the preview is where it becomes markup. The controls, in layers:

- **Raw HTML is disabled.** markdown-it runs with `html: false`, so HTML in a document is escaped and displayed as text, never parsed into elements. A `<script>` in a document cannot execute because no script element is ever created.
- **Output is sanitized anyway.** Everything markdown-it produces goes through DOMPurify with an explicit tag and attribute allowlist before it reaches the DOM. Event handlers, `style`, `iframe`, `object`, `form`, and data attributes are stripped.
- **Link schemes are validated twice.** Only `http:` and `https:` links open, and they open in the default browser rather than navigating the app window. The check in `fileService.isAllowedExternalUrl` is mirrored by the `opener:allow-open-url` capability scope, so a scheme that slipped past the first check would still fail at the IPC boundary.
- **A restrictive CSP is enforced.** `default-src 'self'`, no `object-src`, no frames, no workers, no form actions. `style-src` allows inline styles because CodeMirror injects them.
- **Paths are validated in Rust.** Every path must be absolute, free of interior NUL bytes, and free of `..` segments before any syscall happens.
- **No shell access.** The shell and process plugins are not installed. Revealing a file in Finder goes through a Rust command that validates the path first, so the frontend is never handed a general "reveal this" permission.

### Tauri capabilities

Every permission granted to the main window, and why:

| Permission | Why it is needed |
| --- | --- |
| `core:default` | Baseline IPC required for any Tauri app to function. |
| `core:window:allow-set-title` | Keeps the title bar in step with the file name and dirty marker. |
| `core:window:allow-close` / `allow-destroy` | The unsaved-changes prompt vetoes the close event, then closes the window itself once the user decides. |
| `dialog:allow-open` | The native Open panel. Choosing a path does not grant access to it. |
| `dialog:allow-save` | The native Save panel, same caveat. |
| `opener:allow-open-url`, scoped to `http://*` and `https://*` | Opens preview links in the default browser. The scope is what stops every other scheme. |

Deliberately **not** granted: `fs:*` (all disk access goes through our own commands), `shell:*`, `process:*`, `opener:allow-reveal-item-in-dir` (reached only via a validating Rust command), and `opener:allow-open-path`.

## Known limitations

- **One document at a time.** No tabs or extra windows; opening a file replaces the current one, after prompting if there are unsaved changes.
- **No external-change detection.** If a file changes on disk while it is open here, saving overwrites it without warning. There is no file watcher.
- **No session recovery.** Unsaved content is not preserved across a crash or force-quit.
- **Local images are not displayed.** The CSP allows `https:` and `data:` images but not `file:`, so `![](./diagram.png)` shows a broken image. Supporting it needs Tauri's asset protocol with a scoped directory.
- **`mailto:` links do not open.** Only `http`/`https` are permitted; a mail link renders but does nothing when clicked.
- **No scroll synchronization** between the editor and preview.
- **No export.** No PDF or HTML output; the Markdown file is the only artifact.
- **No Mermaid diagrams or math notation.**
- **No outline sidebar, backlinks, or document library.**
- **Files above 32 MB are refused** with a clear message. Performance targets documents up to roughly 500 KB; beyond that, preview updates get noticeably slower because the whole document is re-parsed on each debounced render.
- **A UTF-8 BOM is stripped on load** and not written back. Non-UTF-8 files are refused rather than guessed at.
- **The build is unsigned**, so distributing the `.app` requires signing and notarization.
- **No automatic updates.**

## Recommended next features

Roughly in order of value relative to effort:

1. **External-change detection.** Compare the file's modification time before writing and warn on a conflict. This is the most valuable missing safeguard, since a silent overwrite loses data.
2. **Scroll synchronization** between editor and preview — the most commonly missed convenience in split view.
3. **Local image support** via Tauri's asset protocol, scoped to the open document's directory.
4. **A document outline** derived from headings, as a collapsible sidebar.
5. **Multiple tabs.** The document store is already a single well-defined record, so this is mostly a matter of holding a list of them plus an active index.
6. **Session recovery**, by periodically writing the buffer to the app's cache directory.
7. **HTML and PDF export**, reusing the existing sanitized render pipeline.
8. **Incremental preview rendering** for large documents, so typing stays smooth well past 500 KB.

## Testing

125 frontend tests and 19 Rust tests, focused on the parts where a mistake is expensive rather than on line coverage:

- Dirty-state derivation and store transitions, including the case where the user keeps typing during a save
- Word and character counting against Markdown syntax
- Markdown rendering across every supported construct
- HTML sanitization, asserted against the **parsed DOM** rather than the output string — with `html: false`, dangerous markup and its escaped, inert text form are indistinguishable as strings
- All thirteen formatting commands, with and without a selection
- Settings defaults, validation, clamping, and version rejection
- Rust: UTF-8 reading, invalid-UTF-8 rejection, atomic overwrite, path validation, and error conversion

Every check listed under [Checks](#checks) runs on macOS in CI for each push and pull request to `main`.

## License

[MIT](LICENSE) © Walter Gibbons
