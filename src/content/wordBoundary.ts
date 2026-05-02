// Word-boundary detection for the drag-snap feature (v1.1 F1).
//
// Problem: a drag that starts or ends mid-word ("w Phase" when the user
// meant "new Phase") currently sends the truncated string to the translator
// and produces garbage. We fix this by expanding each selection endpoint
// "outward" until it lands on a real word boundary, using ICU word-break
// rules via `Intl.Segmenter`.
//
// Why Intl.Segmenter, not a `\b` regex: the native segmenter understands
// English contractions (treats "don't" as one segment), handles quoted and
// hyphenated forms sensibly, and reports non-Latin scripts (CJK, Cyrillic)
// via per-character segments. A hand-written regex can't replicate ICU's
// locale tables without shipping them.
//
// Non-Latin handling: this iteration only supports English vocab, so we
// filter segments via `\p{Script=Latin}`. A selection that contains no
// Latin word-like segment returns null — the caller (content/index.ts)
// interprets that as "discard, don't translate".
//
// This module exports only pure functions. DOM wiring (reading Selection,
// mapping to block textContent, etc.) lives in content/index.ts; keeping
// the core pure lets us unit-test it without JSDOM.

const LATIN_RE = /\p{Script=Latin}/u;

export interface SnapResult {
  start: number;
  end: number;
  text: string;
}

// A segment counts as a "Latin word" when ICU flagged it as word-like
// (excludes whitespace, punctuation, pure numerics) AND it contains at
// least one Latin-script character (excludes CJK, Cyrillic, emoji).
function isLatinWord(seg: Intl.SegmentData): boolean {
  return seg.isWordLike === true && LATIN_RE.test(seg.segment);
}

// Constructing `Intl.Segmenter` is surprisingly non-trivial (~0.2 ms on a
// warm M1). `onMouseUp` fires on every selection so we memoize — the
// segmenter itself is stateless and reusable across calls.
let cachedSegmenter: Intl.Segmenter | null = null;
function getSegmenter(): Intl.Segmenter {
  if (!cachedSegmenter) {
    cachedSegmenter = new Intl.Segmenter("en", { granularity: "word" });
  }
  return cachedSegmenter;
}

// Expand `[start, end)` to cover complete Latin word-like segments.
//
// Rules:
//   - If `start` is strictly inside a Latin word segment, snap to the
//     segment's start.
//   - If `end` is strictly inside a Latin word segment, snap to the
//     segment's end (exclusive).
//   - An endpoint already on a boundary (whitespace, punctuation, or
//     exactly at a segment edge) stays put.
//   - If the final range contains no Latin word-like segment, return null.
//
// Boundary subtlety: `end` is exclusive, so `end === segStart` means the
// selection doesn't actually include the segment — we must not snap past
// it. The `end > segStart && end < segEnd` check enforces this.
export function snapOffsetsToWord(
  text: string,
  start: number,
  end: number
): SnapResult | null {
  if (start < 0 || end > text.length || start >= end) return null;

  const segments = Array.from(getSegmenter().segment(text));
  let newStart = start;
  let newEnd = end;

  for (const seg of segments) {
    if (!isLatinWord(seg)) continue;
    const segStart = seg.index;
    const segEnd = segStart + seg.segment.length;
    if (start > segStart && start < segEnd) newStart = segStart;
    if (end > segStart && end < segEnd) newEnd = segEnd;
  }

  const hasLatinWord = segments.some((seg) => {
    if (!isLatinWord(seg)) return false;
    const segStart = seg.index;
    const segEnd = segStart + seg.segment.length;
    return segEnd > newStart && segStart < newEnd;
  });
  if (!hasLatinWord) return null;

  return { start: newStart, end: newEnd, text: text.slice(newStart, newEnd) };
}

// Given a caret/click offset inside `text`, return the Latin word at that
// position or null if the caret is between words / on punctuation / on
// non-Latin script.
//
// Offset semantics: `offset >= segStart && offset < segEnd`. A caret at the
// exact *end* of a word (offset === segEnd) is treated as "between words"
// and returns null — this matches browser behavior where clicking the
// trailing space after a word puts the caret at that offset.
//
// Used by the Phase D click-to-translate pipeline, which calls this with
// the offset returned by `caretRangeFromPoint`.
export function wordAtOffset(text: string, offset: number): SnapResult | null {
  if (offset < 0 || offset > text.length) return null;
  for (const seg of getSegmenter().segment(text)) {
    if (!isLatinWord(seg)) continue;
    const segStart = seg.index;
    const segEnd = segStart + seg.segment.length;
    if (offset >= segStart && offset < segEnd) {
      return { start: segStart, end: segEnd, text: seg.segment };
    }
  }
  return null;
}
