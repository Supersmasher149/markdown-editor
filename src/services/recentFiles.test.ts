import { describe, expect, it } from "vitest";
import { MAX_RECENT_FILES, displayName, pushRecent } from "./recentFiles";

describe("pushRecent", () => {
  it("puts the newest path first", () => {
    expect(pushRecent(["/a.md"], "/b.md")).toEqual(["/b.md", "/a.md"]);
  });

  it("moves an existing path to the front instead of duplicating it", () => {
    expect(pushRecent(["/a.md", "/b.md", "/c.md"], "/c.md")).toEqual([
      "/c.md",
      "/a.md",
      "/b.md",
    ]);
  });

  it("drops the oldest entry beyond the cap", () => {
    const full = Array.from(
      { length: MAX_RECENT_FILES },
      (_, i) => `/f${i}.md`,
    );
    const next = pushRecent(full, "/new.md");

    expect(next).toHaveLength(MAX_RECENT_FILES);
    expect(next[0]).toBe("/new.md");
    expect(next).not.toContain(`/f${MAX_RECENT_FILES - 1}.md`);
  });

  it("does not mutate the input", () => {
    const list = ["/a.md"];
    pushRecent(list, "/b.md");
    expect(list).toEqual(["/a.md"]);
  });
});

describe("displayName", () => {
  it("shows the file name", () => {
    expect(displayName("/Users/me/Notes/today.md")).toBe("today.md");
  });
});
