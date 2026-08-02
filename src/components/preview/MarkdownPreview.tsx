import { useEffect, useRef, useState } from "react";
import { renderMarkdown } from "./markdownRenderer";
import { openExternalUrl } from "../../services/fileService";
import "./preview.css";

/** Roughly one keystroke pause; long enough to skip most intermediate states. */
export const PREVIEW_DEBOUNCE_MS = 150;

type MarkdownPreviewProps = {
  content: string;
};

/**
 * The rendered document.
 *
 * Rendering is debounced and happens outside React's render pass, so typing
 * never waits on a Markdown parse. The HTML is injected via `innerHTML` because
 * it is a sanitized string rather than a React tree.
 */
export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  const [html, setHtml] = useState<string>("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // A render scheduled for text the user has already replaced is discarded,
    // so a slow parse can never overwrite a newer result.
    let cancelled = false;

    const timer = setTimeout(() => {
      const rendered = renderMarkdown(content);
      if (!cancelled) setHtml(rendered);
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [content]);

  // Links are handled here rather than by the anchors themselves: navigating
  // the window would replace the application, and the scheme has to be checked
  // before anything is handed to the OS.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a");
      if (!anchor) return;

      // Nothing in the preview should ever navigate the webview.
      event.preventDefault();

      const href = anchor.getAttribute("href");
      if (!href) return;

      // Silently ignored when the scheme is not http(s) - see
      // `isAllowedExternalUrl`. In-page anchors are simply not supported.
      void openExternalUrl(href).catch((error: unknown) => {
        console.warn("Could not open link", error);
      });
    };

    container.addEventListener("click", handleClick);
    return () => container.removeEventListener("click", handleClick);
  }, []);

  return (
    <div className="preview-scroll" data-testid="preview">
      <div
        className="preview-body markdown-body"
        ref={containerRef}
        // Safe by construction: `renderMarkdown` returns DOMPurify output.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
