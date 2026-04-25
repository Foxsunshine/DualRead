// Outer-punctuation stripper (v2.1.1 / DL-1).
//
// Trims leading and trailing punctuation from a user-selected string so
// bubble display, translation requests, and `word_key` all normalize to
// the same clean form. Interior punctuation is preserved — `don't` and
// `state-of-the-art` survive intact. This is the canonical normalizer
// used everywhere a selection enters the pipeline (click handler, drag-
// selection handler, post-snap fallback).
//
// Why a dedicated module instead of a regex inline?
//   - The character set spans ASCII + CJK full-width + a few em/en dashes;
//     a literal class in a regex string quickly stops being reviewable.
//   - Three callers (clickTranslate / wordBoundary / potential future
//     highlight matcher) need identical behavior; centralizing the set
//     is the only way to keep them in lockstep.
//   - Unit tests need a pure function — no DOM, no Chrome APIs.
//
// What's *not* here:
//   - No interior normalization. `Mr.` stays `Mr` after stripping a
//     trailing `.`; we do not attempt to detect "this is a sentence-end
//     dot, not an abbreviation." R8 in the brainstorm documents this as
//     accepted behavior.
//   - No case folding. That's the caller's job (`word_key` lowercases
//     separately in clickTranslate).
//   - No whitespace handling. Whitespace is "not punctuation" for this
//     module; callers `.trim()` before or after as appropriate.

// ───── Character set ─────────────────────────────────────────
//
// Split into three buckets for reviewability. The runtime joins them
// into one Set on first call; the Set lookup is O(1) per character,
// which is the cheapest shape for a hot path that runs on every click.

// ASCII punctuation that can legitimately appear at selection edges.
// Notably excluded: `_` (often part of identifiers, e.g. `word_key`).
// `-` is special — it's a legit word-internal character in hyphenated
// compounds, so we only strip it when it's at the very edge and the
// remaining text is still non-empty (guaranteed by the main loop).
const ASCII_OUTER = [
  ",", ".", "!", "?", ":", ";",
  '"', "'", "`",
  "(", ")", "[", "]", "{", "}", "<", ">",
  "—", "–", "-",
  "…", "~", "*", "/", "\\",
];

// Chinese / Japanese full-width punctuation. `「」` appear in Japanese
// quoted speech; included defensively for users reading JP content even
// though the primary locale is zh-CN.
const CJK_OUTER = [
  "，", "。", "！", "？", "：", "；",
  "“", "”", "‘", "’",
  "（", "）", "【", "】", "「", "」",
  "…", // full-width ellipsis (different codepoint from ASCII "…")
];

// Multi-character sequences that users often include at edges as a single
// "punctuation unit" (e.g. selecting "word——" in a Chinese typography
// context). We strip these greedily before falling back to per-character
// stripping, so `——word——` becomes `word` in one pass rather than leaving
// a stray em-dash behind.
const MULTICHAR_OUTER = [
  "——", // CJK em-dash pair (U+2014 x2)
  "...", // ASCII triple-dot ellipsis
];

// Build the Set once at module load. TypeScript module initialization is
// deterministic so this is safe without locking.
const OUTER_CHAR_SET: ReadonlySet<string> = new Set([...ASCII_OUTER, ...CJK_OUTER]);

// ───── Public API ────────────────────────────────────────────

/**
 * Strip outer (leading + trailing) punctuation from `text`. Interior
 * punctuation is preserved. Returns the stripped string, which may be
 * empty if the entire input was punctuation.
 *
 * Caller contract:
 *   - Input should be pre-trimmed of whitespace if whitespace-adjacency
 *     would confuse downstream code. This function does not touch
 *     whitespace.
 *   - Output can be empty — callers MUST handle that case (the bubble
 *     layer short-circuits to "no selection" when it is).
 *   - Idempotent: `strip(strip(x)) === strip(x)` for all x.
 */
export function stripOuterPunctuation(text: string): string {
  if (!text) return text;

  // First pass: peel known multi-character sequences from each end.
  // Loop until a pass makes no progress so "——…" at the edge gets
  // fully consumed even though each round only removes one sequence.
  let s = text;
  let changed = true;
  while (changed) {
    changed = false;
    for (const seq of MULTICHAR_OUTER) {
      if (s.startsWith(seq)) {
        s = s.slice(seq.length);
        changed = true;
      }
      if (s.endsWith(seq)) {
        s = s.slice(0, -seq.length);
        changed = true;
      }
    }
  }

  // Second pass: per-character strip using the outer set. Walking from
  // each end independently keeps the complexity O(n) and lets asymmetric
  // inputs (`"don't."`) strip cleanly (`"` from the left, `."` from the
  // right in two iterations).
  let start = 0;
  let end = s.length;
  while (start < end && OUTER_CHAR_SET.has(s[start])) start++;
  while (end > start && OUTER_CHAR_SET.has(s[end - 1])) end--;

  return s.slice(start, end);
}
