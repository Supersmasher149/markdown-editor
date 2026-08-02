import MarkdownItFactory, { type MarkdownIt } from "markdown-it";
import hljs from "highlight.js/lib/common";
import DOMPurify from "dompurify";

/**
 * Markdown to safe HTML.
 *
 * Two independent controls keep untrusted document content from executing:
 * markdown-it is configured with `html: false`, so raw HTML in the source is
 * escaped rather than parsed, and the result is then run through DOMPurify.
 * Either alone would very likely suffice; both together are cheap insurance.
 */

/**
 * markdown-it is expensive to construct and stateless between calls, so one
 * instance is built lazily and reused. Re-creating it per render was the single
 * biggest cost in an early version of the preview.
 */
let renderer: MarkdownIt | undefined;

/** `- [ ] ` / `- [x] ` at the start of a list item's text. */
const TASK_ITEM = /^\[([ xX])\]\s+/;

function highlightCode(code: string, language: string): string {
  // Only languages highlight.js actually knows; an unknown hint from an
  // untrusted document must not throw.
  if (language && hljs.getLanguage(language)) {
    try {
      return hljs.highlight(code, { language, ignoreIllegals: true }).value;
    } catch {
      // Fall through to the escaped-plaintext path in the caller.
    }
  }
  return "";
}

/**
 * Render GitHub-style task lists.
 *
 * Implemented as a core rule over the token stream rather than a renderer hack,
 * so it sees the parsed structure and cannot misfire on a literal "[ ]" that
 * happens to appear outside a list.
 */
function installTaskLists(md: MarkdownIt): void {
  md.core.ruler.after("inline", "task_lists", (state) => {
    const tokens = state.tokens;

    for (let i = 2; i < tokens.length; i++) {
      const inline = tokens[i];
      if (
        inline?.type !== "inline" ||
        tokens[i - 1]?.type !== "paragraph_open" ||
        tokens[i - 2]?.type !== "list_item_open"
      ) {
        continue;
      }

      const match = TASK_ITEM.exec(inline.content);
      if (!match) continue;

      tokens[i - 2]?.attrJoin("class", "task-list-item");
      inline.content = inline.content.slice(match[0].length);

      const children = inline.children ?? [];
      const first = children[0];
      if (first?.type === "text") {
        first.content = first.content.slice(match[0].length);
      }

      const checkbox = new state.Token("task_checkbox", "", 0);
      checkbox.meta = { checked: match[1] !== " " };
      inline.children = [checkbox, ...children];
    }

    return true;
  });

  md.renderer.rules.task_checkbox = (tokens, idx) => {
    const meta = tokens[idx]?.meta as { checked?: boolean } | undefined;
    const checked = meta?.checked === true ? " checked" : "";
    return `<input class="task-list-item-checkbox" type="checkbox" disabled${checked}> `;
  };
}

function createRenderer(): MarkdownIt {
  // Annotated because `highlight` below refers to `md`, which would otherwise
  // make the initializer circular from the type checker's point of view.
  const md: MarkdownIt = new MarkdownItFactory({
    // Raw HTML in the source is escaped, never parsed. This is the primary
    // reason a <script> written into a document can never run.
    html: false,
    linkify: true,
    typographer: false,
    breaks: false,
    highlight: (code, language) => {
      const highlighted = highlightCode(code, language);
      const languageClass = language
        ? ` class="language-${md.utils.escapeHtml(language)}"`
        : "";

      return highlighted
        ? `<pre class="hljs"><code${languageClass}>${highlighted}</code></pre>`
        : `<pre class="hljs"><code${languageClass}>${md.utils.escapeHtml(code)}</code></pre>`;
    },
  });

  md.enable(["table", "strikethrough"]);
  installTaskLists(md);

  return md;
}

/** The shared, lazily built renderer. */
export function getRenderer(): MarkdownIt {
  renderer ??= createRenderer();
  return renderer;
}

/**
 * DOMPurify allowlist, covering exactly the output the renderer above produces.
 *
 * Anything else - `style`, `iframe`, `form`, event handlers, data attributes -
 * is stripped. `javascript:` and similar active URLs are rejected by
 * DOMPurify's own URI check, and the preview additionally validates the scheme
 * of every link before opening it.
 */
const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "br",
    "hr",
    "strong",
    "em",
    "s",
    "del",
    "blockquote",
    "ul",
    "ol",
    "li",
    "input",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "pre",
    "code",
    "span",
    "a",
    "img",
  ],
  ALLOWED_ATTR: [
    "href",
    "title",
    "alt",
    "src",
    "class",
    "type",
    "checked",
    "disabled",
    "align",
    "colspan",
    "rowspan",
  ],
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
  FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form", "link"],
  FORBID_ATTR: ["style", "srcset", "formaction", "onerror", "onload"],
};

/**
 * Render Markdown to sanitized HTML.
 *
 * The result is the only markup in the app derived from document content, and
 * the only string ever assigned to `innerHTML`.
 */
export function renderMarkdown(source: string): string {
  const rawHtml = getRenderer().render(source);
  return DOMPurify.sanitize(rawHtml, PURIFY_CONFIG);
}
