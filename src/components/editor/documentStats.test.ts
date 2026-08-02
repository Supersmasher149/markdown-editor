import { describe, expect, it } from "vitest";
import { countCharacters, countWords } from "./documentStats";

describe("word count", () => {
  it("counts plain prose", () => {
    expect(countWords("one two three")).toBe(3);
  });

  it("is zero for empty or whitespace-only input", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n\n\t ")).toBe(0);
  });

  it("collapses runs of whitespace", () => {
    expect(countWords("one   two\n\n\nthree\tfour")).toBe(4);
  });

  it("does not count heading markers as words", () => {
    expect(countWords("# Title")).toBe(1);
    expect(countWords("### A longer heading here")).toBe(4);
  });

  it("does not count list markers as words", () => {
    expect(countWords("- one\n- two\n- three")).toBe(3);
    expect(countWords("1. one\n2. two")).toBe(2);
  });

  it("does not count task checkboxes as words", () => {
    expect(countWords("- [ ] buy milk\n- [x] call back")).toBe(4);
  });

  it("does not count blockquote markers as words", () => {
    expect(countWords("> quoted text")).toBe(2);
  });

  it("does not count emphasis punctuation as words", () => {
    expect(countWords("**bold** and *italic*")).toBe(3);
  });

  it("counts a link's label but not its URL", () => {
    expect(countWords("[the label](https://example.com/page)")).toBe(2);
  });

  it("ignores fenced code blocks", () => {
    const doc = "Some prose here.\n\n```js\nconst x = 1;\n```\n\nMore prose.";

    // "Some prose here." (3) + "More prose." (2)
    expect(countWords(doc)).toBe(5);
  });

  it("ignores inline code", () => {
    // "Call" and "twice"; the call expression itself is not prose.
    expect(countWords("Call `someFunction(a, b)` twice")).toBe(2);
  });

  it("does not count a bare horizontal rule", () => {
    expect(countWords("---")).toBe(0);
  });

  it("counts words containing digits", () => {
    expect(countWords("version 2 released")).toBe(3);
  });

  it("counts hyphenated compounds as one word", () => {
    expect(countWords("a well-known example")).toBe(3);
  });

  it("handles non-ASCII prose", () => {
    expect(countWords("café naïve 東京")).toBe(3);
  });
});

describe("character count", () => {
  it("counts the raw source including markup and newlines", () => {
    expect(countCharacters("# Hi")).toBe(4);
    expect(countCharacters("a\nb")).toBe(3);
    expect(countCharacters("")).toBe(0);
  });
});
