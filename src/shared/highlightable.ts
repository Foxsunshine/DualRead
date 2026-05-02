// Predicate: can this saved vocab key produce useful highlights on arbitrary
// webpages? Long sentences and non-Latin content are persisted unchanged —
// users still see them in the Vocab tab and CSV export — but the highlight
// engine skips them because `\b(...)\b` is only meaningful for short Latin
// tokens, and a 50-char sentence effectively never appears verbatim on
// another page so highlighting it is wasted work.
//
// Rules:
//   1. Latin letters + marks + apostrophe + hyphen + spaces only.
//      (Chinese / Japanese / Korean and other scripts have no `\b` word
//      boundary semantics in V8's regex, so we'd never match anyway.)
//   2. ≤ 3 whitespace-separated tokens.
//      (Covers the common phrasal-verb shapes: "give up", "give up on",
//      "in spite of". Longer items are sentences or quotes, which belong
//      in the vocab list but not in the matcher.)
//
// Keep this predicate single-sourced: the content script consumes it when
// building the regex, and the side panel may later use it to annotate rows
// as "not highlighted" so users understand why.
export function isHighlightable(key: string): boolean {
  const trimmed = key.trim();
  if (!trimmed) return false;
  // Latin-script unicode property covers a–z, A–Z, accented letters, etc.
  // \p{M} allows combining marks (e.g., café normalized forms). Punctuation
  // kept: apostrophe (don't), hyphen (well-read). Digits intentionally
  // excluded — we're not trying to highlight "2024" or version numbers.
  if (!/^[\p{Script=Latin}\p{M}'\- ]+$/u.test(trimmed)) return false;
  const tokens = trimmed.split(/\s+/);
  return tokens.length <= 3;
}
