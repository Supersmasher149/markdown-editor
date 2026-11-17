import { useEffect, type RefObject } from "react";
import type { EditorView } from "@codemirror/view";
import { SOURCE_LINE_ATTR } from "../components/preview/markdownRenderer";
import {
  lineToOffset,
  normalizeAnchors,
  offsetToLine,
  type ScrollAnchor,
} from "../components/layout/scrollSync";

type Pane = "editor" | "preview";

/** Within this many pixels of the end counts as scrolled to the bottom. */
const BOTTOM_SLACK = 2;

function maxScroll(el: HTMLElement): number {
  return Math.max(0, el.scrollHeight - el.clientHeight);
}

/**
 * Keep the editor and preview scrolled to the same part of the document.
 *
 * Only the pane the user is working in drives the other. That pane is whichever
 * last saw a wheel, pointer, touch, key or focus event, so a scroll this hook
 * applies to the other pane can never echo back and start a feedback loop.
 */
export function useScrollSync(
  enabled: boolean,
  editorViewRef: RefObject<EditorView | null>,
  previewRef: RefObject<HTMLDivElement | null>,
): void {
  useEffect(() => {
    const view = editorViewRef.current;
    const preview = previewRef.current;
    if (!enabled || !view || !preview) return;

    const editorScroller = view.scrollDOM;
    let driver: Pane = "editor";
    let anchors: ScrollAnchor[] | null = null;
    let frame: number | undefined;

    /** Rendered-block positions, measured lazily and cached until invalidated. */
    const getAnchors = (): ScrollAnchor[] => {
      if (anchors) return anchors;
      const base = preview.getBoundingClientRect().top - preview.scrollTop;
      const raw: ScrollAnchor[] = [];
      for (const el of preview.querySelectorAll(`[${SOURCE_LINE_ATTR}]`)) {
        const line = Number(el.getAttribute(SOURCE_LINE_ATTR));
        if (!Number.isInteger(line)) continue;
        raw.push({ line, top: el.getBoundingClientRect().top - base });
      }
      anchors = normalizeAnchors(
        raw,
        view.state.doc.lines,
        preview.scrollHeight,
      );
      return anchors;
    };

    /** Fractional, 0-based line at the top of the editor viewport. */
    const editorTopLine = (): number => {
      const docY =
        editorScroller.getBoundingClientRect().top - view.documentTop;
      const block = view.lineBlockAtHeight(Math.max(0, docY));
      const line = view.state.doc.lineAt(block.from).number - 1;
      const within = block.height > 0 ? (docY - block.top) / block.height : 0;
      return line + Math.min(1, Math.max(0, within));
    };

    const syncPreviewToEditor = () => {
      if (editorScroller.scrollTop <= 0) {
        preview.scrollTop = 0;
      } else if (
        editorScroller.scrollTop >=
        maxScroll(editorScroller) - BOTTOM_SLACK
      ) {
        preview.scrollTop = maxScroll(preview);
      } else {
        preview.scrollTop = lineToOffset(getAnchors(), editorTopLine());
      }
    };

    const syncEditorToPreview = () => {
      if (preview.scrollTop <= 0) {
        editorScroller.scrollTop = 0;
        return;
      }
      if (preview.scrollTop >= maxScroll(preview) - BOTTOM_SLACK) {
        editorScroller.scrollTop = maxScroll(editorScroller);
        return;
      }

      const target = offsetToLine(getAnchors(), preview.scrollTop);
      const doc = view.state.doc;
      const lineNumber = Math.min(doc.lines, Math.floor(target) + 1);
      const block = view.lineBlockAt(doc.line(lineNumber).from);
      const fraction = target - (lineNumber - 1);
      const targetY = block.top + Math.min(1, fraction) * block.height;
      const currentY =
        editorScroller.getBoundingClientRect().top - view.documentTop;
      editorScroller.scrollTop += targetY - currentY;
    };

    const sync = () => {
      frame = undefined;
      if (driver === "editor") syncPreviewToEditor();
      else syncEditorToPreview();
    };

    const schedule = () => {
      frame ??= requestAnimationFrame(sync);
    };

    const onScroll = (pane: Pane) => () => {
      if (pane === driver) schedule();
    };
    const onEditorScroll = onScroll("editor");
    const onPreviewScroll = onScroll("preview");

    const claim = (pane: Pane) => () => {
      driver = pane;
    };
    const claimEditor = claim("editor");
    const claimPreview = claim("preview");
    const CLAIM_EVENTS = [
      "wheel",
      "pointerdown",
      "touchstart",
      "keydown",
      "focusin",
    ] as const;

    // Anchors move whenever the preview re-renders or reflows (typing, images
    // loading, the divider being dragged), so measure again and re-align.
    const invalidate = () => {
      anchors = null;
      schedule();
    };
    const mutations = new MutationObserver(invalidate);
    mutations.observe(preview, { childList: true, subtree: true });
    const resizes = new ResizeObserver(invalidate);
    resizes.observe(preview);
    if (preview.firstElementChild) resizes.observe(preview.firstElementChild);
    resizes.observe(view.contentDOM);

    editorScroller.addEventListener("scroll", onEditorScroll, {
      passive: true,
    });
    preview.addEventListener("scroll", onPreviewScroll, { passive: true });
    for (const type of CLAIM_EVENTS) {
      view.dom.addEventListener(type, claimEditor, { passive: true });
      preview.addEventListener(type, claimPreview, { passive: true });
    }

    // Line the panes up as soon as sync is turned on.
    schedule();

    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      mutations.disconnect();
      resizes.disconnect();
      editorScroller.removeEventListener("scroll", onEditorScroll);
      preview.removeEventListener("scroll", onPreviewScroll);
      for (const type of CLAIM_EVENTS) {
        view.dom.removeEventListener(type, claimEditor);
        preview.removeEventListener(type, claimPreview);
      }
    };
  }, [enabled, editorViewRef, previewRef]);
}
