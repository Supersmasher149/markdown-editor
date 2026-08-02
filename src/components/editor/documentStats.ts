/**
 * Readable-text statistics for the status bar.
 *
 * The goal is a count that matches what a reader would say is in the document,
 * not a token count of the Markdown source.
 */

/** Fenced and indented code blocks, which are not prose. */
const FENCED_CODE = /^```[\s\S]*?^```/gm;
/** Inline constructs whose punctuation should not become words. */
const INLINE_CODE = /`[^`\n]*`/g;
/** Link and image targets: the label counts, the URL does not. */
const LINK_TARGET = /\]\([^)\s]*(?:\s+"[^"]*")?\)/g;
const IMAGE_OR_LINK_OPEN = /!?\[/g;
/** Leading block markers: `#`, `>`, `-`, `1.`, and task checkboxes. */
const BLOCK_MARKERS =
  /^[ \t]*(?:[#>]+|[-*+]|\d+\.)[ \t]*(?:\[[ xX]\][ \t]*)?/gm;
/** Emphasis and strikethrough runs. */
const EMPHASIS = /(\*{1,3}|_{1,3}|~~)/g;
/** A token must contain at least one letter or digit to count as a word. */
const HAS_ALPHANUMERIC = /[\p{L}\p{N}]/u;

/**
 * Count the words a reader would see.
 *
 * Markdown syntax is stripped first so that a bullet, a heading hash, or a URL
 * does not inflate the count. This is a readable approximation, not a
 * linguistically exact tokenizer - hyphenated compounds count as one word and
 * contractions are left intact.
 */
export function countWords(markdown: string): number {
  if (markdown.trim() === "") return 0;

  // Order matters: block markers are stripped before brackets, or the `[x]` of
  // a task item would lose its brackets first and leave a stray "x" behind.
  const prose = markdown
    .replace(FENCED_CODE, " ")
    .replace(INLINE_CODE, " ")
    .replace(BLOCK_MARKERS, " ")
    .replace(LINK_TARGET, "] ")
    .replace(IMAGE_OR_LINK_OPEN, " ")
    .replace(/\]/g, " ")
    .replace(EMPHASIS, " ");

  let count = 0;
  for (const token of prose.split(/\s+/)) {
    if (token !== "" && HAS_ALPHANUMERIC.test(token)) count++;
  }
  return count;
}

/** Character count of the raw source, matching what the editor holds. */
export function countCharacters(markdown: string): number {
  return markdown.length;
}
