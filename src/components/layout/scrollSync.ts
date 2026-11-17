/**
 * Pure helpers for keeping the editor and preview scrolled to the same place.
 *
 * The two panes are linked through source lines: every rendered block carries
 * the line it starts on, which gives a list of (line, offset) anchors. Positions
 * between anchors are interpolated linearly, so a long paragraph or code block
 * scrolls smoothly rather than jumping block to block.
 */

/** A rendered block: its 0-based source line and its offset in the preview. */
export type ScrollAnchor = { line: number; top: number };

/**
 * Sort anchors and drop any that would make the mapping non-monotonic, such as
 * nested blocks that share a line with their parent, or blocks rendered above
 * an earlier one. Bracketed by the document's start and end.
 */
export function normalizeAnchors(
  anchors: readonly ScrollAnchor[],
  lineCount: number,
  contentHeight: number,
): ScrollAnchor[] {
  const sorted = [...anchors].sort((a, b) => a.line - b.line || a.top - b.top);
  const result: ScrollAnchor[] = [];

  for (const anchor of sorted) {
    if (anchor.line < 0 || anchor.line >= lineCount) continue;
    const last = result[result.length - 1];
    // The outermost block on a line sorts first; children on it add nothing.
    if (last && (anchor.line === last.line || anchor.top < last.top)) continue;
    result.push(anchor);
  }

  // A block on the first line already marks where the document begins.
  if (result[0]?.line !== 0) result.unshift({ line: 0, top: 0 });

  const last = result[result.length - 1]!;
  if (lineCount > last.line && contentHeight >= last.top) {
    result.push({ line: lineCount, top: contentHeight });
  }
  return result;
}

function interpolate(
  anchors: readonly ScrollAnchor[],
  value: number,
  from: "line" | "top",
  to: "line" | "top",
): number {
  if (anchors.length === 0) return 0;
  const first = anchors[0]!;
  if (value <= first[from]) return first[to];

  for (let i = 1; i < anchors.length; i++) {
    const next = anchors[i]!;
    if (value > next[from]) continue;
    const prev = anchors[i - 1]!;
    const span = next[from] - prev[from];
    const ratio = span === 0 ? 0 : (value - prev[from]) / span;
    return prev[to] + ratio * (next[to] - prev[to]);
  }
  return anchors[anchors.length - 1]![to];
}

/** Preview offset for a fractional, 0-based source line. */
export function lineToOffset(
  anchors: readonly ScrollAnchor[],
  line: number,
): number {
  return interpolate(anchors, line, "line", "top");
}

/** Fractional, 0-based source line for a preview offset. */
export function offsetToLine(
  anchors: readonly ScrollAnchor[],
  top: number,
): number {
  return interpolate(anchors, top, "top", "line");
}
