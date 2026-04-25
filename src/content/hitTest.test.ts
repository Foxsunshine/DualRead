// Unit tests for the hit-test helper (bug-2026-04-24).
//
// These are the regression tests for the whitespace-click-first-word
// bug. The real repro lives in-browser (click the left padding of a
// paragraph with a saved vocab word at its start), but the underlying
// decision is "is this click inside a rect?" — which is a pure-function
// check we can cover exhaustively without a DOM.

import { describe, expect, it } from "vitest";
import {
  HIT_TOLERANCE_PX,
  isPointInAnyRect,
  type RectLike,
} from "./hitTest";

const rect = (left: number, top: number, right: number, bottom: number): RectLike => ({
  left,
  top,
  right,
  bottom,
});

describe("isPointInAnyRect", () => {
  it("returns false for empty rect list", () => {
    expect(isPointInAnyRect([], 10, 10)).toBe(false);
  });

  it("returns true for a point strictly inside a single rect", () => {
    const rects = [rect(10, 10, 50, 30)];
    expect(isPointInAnyRect(rects, 30, 20)).toBe(true);
  });

  it("returns false for a point far outside all rects", () => {
    const rects = [rect(10, 10, 50, 30)];
    // Left of all rects by more than tolerance
    expect(isPointInAnyRect(rects, 0, 20)).toBe(false);
    // Above all rects
    expect(isPointInAnyRect(rects, 30, 0)).toBe(false);
  });

  it("returns true for a point inside any of multiple rects (wrapped word case)", () => {
    // A word that wraps across two lines yields two client rects.
    const rects = [
      rect(100, 10, 200, 30), // end of line 1
      rect(0, 30, 50, 50), // start of line 2
    ];
    expect(isPointInAnyRect(rects, 150, 20)).toBe(true); // inside rect 1
    expect(isPointInAnyRect(rects, 25, 40)).toBe(true); // inside rect 2
    expect(isPointInAnyRect(rects, 75, 25)).toBe(false); // in the gap between
  });

  it("honors the default HIT_TOLERANCE_PX at edges", () => {
    const rects = [rect(10, 10, 50, 30)];
    // Just outside left edge by 1 px — inside tolerance (default 2)
    expect(isPointInAnyRect(rects, 9, 20)).toBe(true);
    expect(isPointInAnyRect(rects, 8, 20)).toBe(true);
    // Past tolerance
    expect(isPointInAnyRect(rects, 7, 20)).toBe(false);
  });

  it("accepts a custom tolerance (0 = strict)", () => {
    const rects = [rect(10, 10, 50, 30)];
    // With 0 tolerance, a point 1 px outside the edge fails.
    expect(isPointInAnyRect(rects, 9, 20, 0)).toBe(false);
    // On the exact edge still counts (≤ / ≥ on all four sides).
    expect(isPointInAnyRect(rects, 10, 20, 0)).toBe(true);
    expect(isPointInAnyRect(rects, 50, 20, 0)).toBe(true);
  });

  it("HIT_TOLERANCE_PX is the documented 2 (regression pin)", () => {
    // If anyone retunes this, the bug doc and the implementation notes
    // need a matching update. Hard pin as a reminder.
    expect(HIT_TOLERANCE_PX).toBe(2);
  });

  it("regression: reject clicks that caretRangeFromPoint would snap to row's first word", () => {
    // Simulate a paragraph's first word bounding rect.
    const firstWordRect = rect(40, 100, 90, 118);
    // The user clicked at (10, 109) — that's in the <p>'s left padding,
    // well outside the glyph box. The old code would have accepted this
    // after caretRangeFromPoint snapped caret to offset 0. The hit test
    // must reject.
    expect(isPointInAnyRect([firstWordRect], 10, 109)).toBe(false);
  });
});
