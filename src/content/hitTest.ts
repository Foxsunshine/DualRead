// Point-in-rectangles hit test (v2.1.1 bugfix).
//
// Extracted as a pure function so it can be unit-tested without JSDOM.
// Used by `resolveWordAtPoint` to verify that a click actually landed
// inside the rendered glyph boxes of the word the caret snapped to —
// without this check, `document.caretRangeFromPoint` snaps clicks in
// block padding / margin / line-leading to the nearest text node's
// offset 0, which `wordAtOffset` then happily resolves to "the first
// word on the line." The user reported this as "clicking in specific
// whitespace shows the line's first word." Root cause filed in
// docs/bugs/bug-2026-04-24-whitespace-click-first-word.md.
//
// Tolerance: clicks on the 1-pixel glyph edge occasionally round to
// just outside the rect on HiDPI displays. 2 px matches Chrome's own
// pointer hit-target slop for text.

export interface RectLike {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export const HIT_TOLERANCE_PX = 2;

/**
 * Return true if (x, y) falls inside at least one of `rects`, expanded
 * outward by `tolerance` pixels on every side. Empty rects list → false.
 *
 * Multiple rects matter for wrapped words at a line break: a single
 * word like `"hello-"` that wraps across a line yields two DOMRects from
 * `Range.getClientRects()`. A click on either fragment should count.
 */
export function isPointInAnyRect(
  rects: readonly RectLike[],
  x: number,
  y: number,
  tolerance: number = HIT_TOLERANCE_PX
): boolean {
  for (const r of rects) {
    if (
      x >= r.left - tolerance &&
      x <= r.right + tolerance &&
      y >= r.top - tolerance &&
      y <= r.bottom + tolerance
    ) {
      return true;
    }
  }
  return false;
}
