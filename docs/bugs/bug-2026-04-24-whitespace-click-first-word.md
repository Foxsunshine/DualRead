# Bug: Clicking in "gutter" whitespace shows the row's first word

**Reported**: 2026-04-24 (right after v2.1.1 landed)
**Fix landed**: 2026-04-24
**Severity**: P2 — functional noise, not data corruption
**Affected surfaces**: in-page click-to-translate bubble (content script)

---

## Symptom

> "点击某些特定空白区域的时候会显示行首的单词"

Clicking in certain blank regions — specifically the left padding / margin
of a block element, a line-leading gap, or the empty space before the first
word of a line — pops the translation bubble for that line's **first
word**, even though the cursor never touched the word itself.

End-of-line clicks, clicks between words mid-line, and clicks far outside
any paragraph all work correctly. The problem is asymmetric and only shows
up on the "left shoulder" of text blocks.

---

## Reproduction

Pre-conditions: learning mode on; at least one vocab word saved; a
paragraph on the page whose first word is English and whose containing
block has non-zero left padding / margin / `text-indent`.

Steps:

1. Open any article page (Wikipedia, Medium, etc.)
2. Find a paragraph like `<p style="padding-left: 24px">Hello world…</p>`
3. Click **inside the 24 px of left padding**, vertically aligned with the
   first line of text.

Expected: nothing happens (or, at most, browser default selection caret).
Observed (pre-fix): translation bubble appears, anchored to the first word
of the line ("Hello") with its translation.

---

## Root cause

`document.caretRangeFromPoint(x, y)` is a **nearest-caret** API, not a
hit-test. When `(x, y)` doesn't land inside any rendered glyph box,
Chrome still returns a `Range` — the caret is snapped to the **nearest
valid insertion point**, which for clicks in left-shoulder whitespace is
`startContainer = firstTextNode`, `startOffset = 0`.

Our `resolveWordAtPoint` trusted that caret without verifying the click
landed inside the rendered text:

```ts
// src/content/clickTranslate.ts (pre-fix)
function resolveWordAtPoint(x, y) {
  const caret = document.caretRangeFromPoint(x, y);
  if (!caret) return null;
  const node = caret.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return null;
  const hit = wordAtOffset((node as Text).data, caret.startOffset);
  if (!hit) return null;
  return { textNode: node as Text, start: hit.start, end: hit.end, word: hit.text };
}
```

`wordAtOffset(text, offset)` uses `offset >= segStart && offset < segEnd`
(`src/content/wordBoundary.ts:111`). For text starting with a letter
(e.g. `"Hello world"`), `offset = 0` is inside the first segment —
`0 >= 0 && 0 < 5` — so the function returns the first word.

### Why end-of-line works

Clicks past the end of a line snap to `offset === text.length`, which is
also `offset === segEnd` for the last segment. The strict `<` in the
`offset < segEnd` guard correctly rejects that case ("caret at trailing
space" is treated as between words). The asymmetry between `>=` at the
start and `<` at the end is what hides the bug — only the start of a
segment is vulnerable.

### Chain

```
click at (x=10, y=109)   ← 10 px < paragraph's 24 px left padding
  │
  ▼
caretRangeFromPoint(10, 109)
  │
  ▼ snaps to nearest caret position
Range{ startContainer: <first text node>, startOffset: 0 }
  │
  ▼
wordAtOffset("Hello world…", 0)
  │
  ▼ 0 >= 0 && 0 < 5  →  matches first segment
{ start: 0, end: 5, text: "Hello" }
  │
  ▼
resolveWordAtPoint returns { word: "Hello", … }
  │
  ▼
onClick preventDefaults, startFlow fires the bubble for "Hello"
```

---

## Fix

Add a bounding-rect verification after `wordAtOffset` resolves a candidate:
compute the word's client rects via `Range.getClientRects()`, and reject
the click if `(x, y)` is not inside any rect (with a small tolerance for
sub-pixel rounding). Wrapped words that span a line break yield multiple
rects — we accept a click on any of them.

The rect math is factored into a tiny pure helper (`src/content/hitTest.ts`)
so it can be unit-tested without a DOM.

```ts
// src/content/clickTranslate.ts (post-fix) — insertion after the
// wordAtOffset call:
const wordRange = document.createRange();
wordRange.setStart(textNode, hit.start);
wordRange.setEnd(textNode, hit.end);
const rects = Array.from(wordRange.getClientRects());
if (rects.length === 0) return null;         // display:none ancestor etc.
if (!isPointInAnyRect(rects, x, y)) return null;
```

`HIT_TOLERANCE_PX = 2` matches Chrome's own pointer hit-target slop for
text — without it, clicks exactly on a 1 px glyph edge sometimes round
to just outside the rect on HiDPI displays.

### Why not a cheaper check

- **"text[offset] isn't whitespace"** — doesn't help. For text that starts
  with a letter, `offset=0` returns a letter, so this check would still
  pass on the buggy case.
- **"caret at offset 0 is suspicious, drop it"** — false negatives on
  legitimate clicks on the very first letter of a text node.
- **"clamp x to be > paragraph.padding-left"** — requires walking ancestor
  computed styles; fragile and expensive.

The rect check is O(rects) where `rects` is almost always 1, rarely 2–3.
Measurably trivial.

---

## Files changed

| File | Change |
|---|---|
| `src/content/hitTest.ts` ✚ | New module: `isPointInAnyRect(rects, x, y, tol)` + `HIT_TOLERANCE_PX` |
| `src/content/hitTest.test.ts` ✚ | 8 unit tests including a regression pin for the buggy case |
| `src/content/clickTranslate.ts` | Import `isPointInAnyRect`; `resolveWordAtPoint` now verifies the click rect before returning |

---

## Verification

**Automated**:
- `npm run typecheck` → clean
- `npm test` → 90 passed (8 new)
- `npm run build` → clean

**Manual smoke** (run after extension reload):

- [ ] Paragraph with `padding-left: 24px`: click inside the padding →
      no bubble. Click on the first word itself → bubble fires.
- [ ] Paragraph with `text-indent: 2em`: click the indent → no bubble.
- [ ] Line-break inside a paragraph: click the first word of the second
      visual line → bubble fires against the correct rect (wrapped case).
- [ ] Word that itself wraps (rare; e.g. narrow column with a long
      hyphenated compound): click either fragment → bubble fires.
- [ ] End-of-line click past the last word → no bubble (already worked;
      confirm no regression).
- [ ] `<code>` / `<pre>` inside paragraph left-shoulder: still filtered
      by the EXCLUDED_TAG_SELECTOR chain (no change).

---

## Prevention

- Unit test in `src/content/hitTest.test.ts` includes a regression pin
  (`regression: reject clicks that caretRangeFromPoint would snap to
  row's first word`) so the tolerance / edge semantics stay honest.
- `HIT_TOLERANCE_PX` is hard-pinned to `2` in a dedicated test; any
  retune forces a review of this document.

---

## Related

- v2.1.1 brainstorm (`docs/v2-1-1-brainstorm.md`) — DL-1 added outer
  punctuation stripping but did not address caret-snap semantics; this
  bug was latent since v1.1 Phase D and only became noticeable after the
  hover preview (v2.1.0) made accidental first-word bubbles more
  visible.
- MDN `Document.caretRangeFromPoint` — documents the nearest-caret
  behavior, just not prominently. Upstream WICG discussion of a proper
  `elementFromPoint`-style text hit test has existed for years without
  resolution; this is the canonical workaround.
