import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdownRenderer";

describe("markdown rendering", () => {
  it("renders headings", () => {
    expect(renderMarkdown("# Title")).toContain("<h1>Title</h1>");
    expect(renderMarkdown("### Third")).toContain("<h3>Third</h3>");
  });

  it("renders emphasis, strong and strikethrough", () => {
    expect(renderMarkdown("*a*")).toContain("<em>a</em>");
    expect(renderMarkdown("**b**")).toContain("<strong>b</strong>");
    expect(renderMarkdown("~~c~~")).toContain("<s>c</s>");
  });

  it("renders links and images", () => {
    const link = renderMarkdown("[Example](https://example.com)");
    expect(link).toContain('href="https://example.com"');
    expect(link).toContain(">Example</a>");

    const image = renderMarkdown("![Alt text](https://example.com/a.png)");
    expect(image).toContain('src="https://example.com/a.png"');
    expect(image).toContain('alt="Alt text"');
  });

  it("renders blockquotes, lists and horizontal rules", () => {
    expect(renderMarkdown("> quoted")).toContain("<blockquote>");
    expect(renderMarkdown("- one\n- two")).toContain("<ul>");
    expect(renderMarkdown("1. one\n2. two")).toContain("<ol>");
    expect(renderMarkdown("---")).toContain("<hr>");
  });

  it("renders tables", () => {
    const html = renderMarkdown("| A | B |\n| - | - |\n| 1 | 2 |");

    expect(html).toContain("<table>");
    expect(html).toContain("<th>A</th>");
    expect(html).toContain("<td>2</td>");
  });

  it("renders inline code without highlighting it", () => {
    expect(renderMarkdown("`x = 1`")).toContain("<code>x = 1</code>");
  });

  it("highlights fenced code blocks with a known language", () => {
    const html = renderMarkdown("```js\nconst x = 1;\n```");

    expect(html).toContain('<pre class="hljs">');
    expect(html).toContain('class="language-js"');
    // highlight.js wraps tokens in spans; their absence means no highlighting.
    expect(html).toContain("<span");
  });

  it("falls back to plain text for an unknown code language", () => {
    const html = renderMarkdown("```notalanguage\nplain text\n```");

    expect(html).toContain("plain text");
    expect(html).toContain("<pre");
  });

  it("escapes code block content rather than interpreting it", () => {
    const html = renderMarkdown("```\n<script>alert(1)</script>\n```");

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders task lists as disabled checkboxes", () => {
    const html = renderMarkdown("- [ ] todo\n- [x] done");

    expect(html).toContain('type="checkbox"');
    expect(html).toContain("disabled");
    expect(html).toContain("checked");
    expect(html).toContain("todo");
    expect(html).toContain("done");
  });

  it("does not turn a bracketed phrase outside a list into a checkbox", () => {
    const html = renderMarkdown("The array is [ ] empty.");

    expect(html).not.toContain('type="checkbox"');
  });

  it("autolinks bare URLs", () => {
    expect(renderMarkdown("See https://example.com now")).toContain(
      'href="https://example.com"',
    );
  });

  it("returns an empty string for empty input", () => {
    expect(renderMarkdown("").trim()).toBe("");
  });
});

/**
 * Parse rendered output into live DOM.
 *
 * Asserting on the string alone cannot distinguish dangerous markup from the
 * same characters escaped into inert text - and escaping is exactly what
 * `html: false` does. These tests therefore ask the parser what elements
 * actually exist.
 */
function renderToDom(markdown: string): HTMLDivElement {
  const container = document.createElement("div");
  container.innerHTML = renderMarkdown(markdown);
  return container;
}

describe("HTML sanitization", () => {
  it("never produces a script element", () => {
    const dom = renderToDom("<script>alert('xss')</script>");

    expect(dom.querySelector("script")).toBeNull();
    // The source text is still shown to the user, just as inert text.
    expect(dom.textContent).toContain("alert('xss')");
  });

  it("escapes raw HTML instead of building elements from it", () => {
    const dom = renderToDom("<div id='raw'>hello</div>");

    expect(dom.querySelector("div")).toBeNull();
    expect(dom.textContent).toContain("hello");
  });

  it("never produces an element carrying an event handler", () => {
    const dom = renderToDom('<img src="x" onerror="alert(1)">');

    expect(dom.querySelector("img")).toBeNull();
    expect(dom.querySelector("[onerror]")).toBeNull();
  });

  it("does not build a link from a javascript: URL", () => {
    const dom = renderToDom("[click](javascript:alert(1))");

    expect(dom.querySelector("a")).toBeNull();
  });

  it("does not build a link from a data: URL", () => {
    const dom = renderToDom("[x](data:text/html,PGgxPmhpPC9oMT4=)");

    expect(dom.querySelector("a")).toBeNull();
  });

  it("never produces iframes, objects or embeds", () => {
    const dom = renderToDom(
      '<iframe src="https://evil.test"></iframe>\n\n<object data="x"></object>\n\n<embed src="y">',
    );

    expect(dom.querySelector("iframe")).toBeNull();
    expect(dom.querySelector("object")).toBeNull();
    expect(dom.querySelector("embed")).toBeNull();
  });

  it("never produces style elements or style attributes", () => {
    const dom = renderToDom(
      '<style>body{display:none}</style>\n\n<p style="color:red">x</p>',
    );

    expect(dom.querySelector("style")).toBeNull();
    expect(dom.querySelector("[style]")).toBeNull();
  });

  it("never produces form controls that could collect input", () => {
    const dom = renderToDom(
      '<form action="/x"><input name="pw" type="password"></form>',
    );

    expect(dom.querySelector("form")).toBeNull();
    expect(dom.querySelector('input[type="password"]')).toBeNull();
  });

  it("keeps the disabled checkbox the renderer itself produces", () => {
    // The allowlist must be tight enough to strip attacks yet wide enough for
    // our own task lists.
    const dom = renderToDom("- [x] done");
    const checkbox = dom.querySelector("input");

    expect(checkbox).not.toBeNull();
    expect(checkbox?.getAttribute("type")).toBe("checkbox");
    expect(checkbox?.hasAttribute("disabled")).toBe(true);
  });

  it("keeps ordinary https links intact", () => {
    const dom = renderToDom("[ok](https://example.com)");

    expect(dom.querySelector("a")?.getAttribute("href")).toBe(
      "https://example.com",
    );
  });
});
