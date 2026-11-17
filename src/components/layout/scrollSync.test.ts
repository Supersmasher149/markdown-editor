import { describe, expect, it } from "vitest";
import { lineToOffset, normalizeAnchors, offsetToLine } from "./scrollSync";

describe("normalizeAnchors", () => {
  it("brackets the anchors with the document start and end", () => {
    const anchors = normalizeAnchors([{ line: 2, top: 100 }], 10, 500);
    expect(anchors).toEqual([
      { line: 0, top: 0 },
      { line: 2, top: 100 },
      { line: 10, top: 500 },
    ]);
  });

  it("keeps the outermost block when several start on one line", () => {
    const anchors = normalizeAnchors(
      [
        { line: 3, top: 140 },
        { line: 3, top: 120 },
      ],
      5,
      300,
    );
    expect(anchors[1]).toEqual({ line: 3, top: 120 });
    expect(anchors).toHaveLength(3);
  });

  it("drops anchors that would run backwards or fall outside the document", () => {
    const anchors = normalizeAnchors(
      [
        { line: 1, top: 200 },
        { line: 2, top: 150 },
        { line: 99, top: 400 },
      ],
      5,
      500,
    );
    expect(anchors.map((a) => a.line)).toEqual([0, 1, 5]);
  });
});

describe("line and offset mapping", () => {
  const anchors = normalizeAnchors(
    [
      { line: 0, top: 48 },
      { line: 4, top: 248 },
    ],
    8,
    648,
  );

  it("interpolates between anchors", () => {
    expect(lineToOffset(anchors, 2)).toBe(148);
    expect(offsetToLine(anchors, 148)).toBe(2);
  });

  it("round-trips", () => {
    for (const line of [0.5, 3, 5.25, 7.9]) {
      expect(offsetToLine(anchors, lineToOffset(anchors, line))).toBeCloseTo(
        line,
      );
    }
  });

  it("clamps outside the document", () => {
    expect(lineToOffset(anchors, -3)).toBe(48);
    expect(lineToOffset(anchors, 50)).toBe(648);
    expect(offsetToLine(anchors, 10_000)).toBe(8);
  });
});
