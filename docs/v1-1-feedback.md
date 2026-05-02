# DualRead v1.1 — User Feedback & Redesign

**Date:** 2026-04-22
**Status:** Shipped as v2.0.0 — submitted to Chrome Web Store on 2026-04-22, awaiting review
**Scope:** UX redesign driven by v1 real-usage feedback

---

## 1. Context — Why this iteration exists

DualRead v1 shipped on Chrome Web Store with a side-panel-only UX: user
selects text in the host page → side panel receives `SELECTION_CHANGED` →
translator runs inside the panel → result displayed, Save lives at panel
bottom. After hands-on testing the user surfaced four concrete pain points.

| # | Symptom | Root cause in v1 |
|---|---|---|
| F1 | Drag-select often grabs a partial word ("new Phase" → "w Phase") and translates the fragment | Mouseup pipeline has no word-boundary snapping; whatever `Selection.toString()` returns is what gets translated |
| F2 | Selecting a word while on vocab/settings tab does not auto-return to translate tab | D21 "sticky intent" guard in `App.tsx`: `userTab !== "translate"` blocks the auto-switch |
| F3 | Save button is in the side panel footer — requires a long mouse excursion from the host page text | Save UX is only in the panel; no host-page UI injected for save |
| F4 | Vocab list words have no way to jump back to the page they were originally saved from | `source_url` is stored on every `VocabWord` but never rendered as a link |

F1–F3 are in-scope for v1.1. **F4 is deferred to v1.2** (low urgency, trivial
to implement once prioritized).

---

## 2. Understanding Summary

**What is being built**
A UX redesign that moves the selection → translate → save loop primarily
onto the host page itself via an injected Shadow DOM bubble, leaves the
side panel in charge of the full vocab-management view, and refactors the
translator into a background-worker-owned service so both surfaces pull
from a single source.

**Why it exists**
Every v1 pain point above reflects the same underlying assumption: that
the user's attention should be in the side panel. Real reading behavior
keeps attention in the host page. The redesign honors that.

**Who it is for**
Same audience as v1: intermediate-to-advanced CN→EN learners reading
English web content (articles, tweets, comment threads) who want frictionless
word saving without breaking reading flow.

**Key constraints**
- Chrome MV3. Content scripts get DOM access but not most `chrome.*` privileged APIs; CORS applies to their fetches.
- Side panel may be closed during reading — the bubble cannot depend on it being open.
- `chrome.storage.sync` caps at 500 words (v1 cap, unchanged).
- No new runtime dependencies; no build-time CSS tooling added.
- Host page CSS / scripts are adversarial — Shadow DOM isolation required for any injected UI.

**Explicit non-goals**
- Not touching highlight engine perf model (DESIGN.md §9 budgets hold)
- Not adding multi-word highlight (still word-level only)
- Not adding mobile / touch support
- Not doing jump-to-source (F4) in this iteration
- Not pulling any remaining v1.0 Phase 5 candidates (AI tutor / Anki `.apkg` / Supabase sync / color-blind styles) into v1.1 — those stay in the backlog

---

## 3. Assumptions

**Performance**
- Bubble first-paint ≤50 ms from click/mouseup to visible DOM
- Shadow DOM injection adds negligible layout cost on host page
- Content script reading full VocabWord (not just keys) from `chrome.storage.sync` on each saved-word click: ~10–20 ms at 500-word cap, acceptable

**Security / privacy**
- All translation text written to bubble via `textContent`, never `innerHTML`
- Shadow root `mode: "closed"` — host page scripts cannot read bubble DOM
- `:host { all: initial }` resets in bubble styles to defend against host pages using `* { all: unset }` or similar aggressive resets
- `chrome.runtime?.id` liveness check before every `sendMessage`, mirroring the orphan-context pattern already in v1 content script

**UX**
- Bubble max width ~280px, max height ~140px; longer notes truncated with ellipsis at 60 chars
- User can select text inside the bubble (for copy) without dismissing it
- Bubble reacts within ~300 ms on CPU-throttled Chrome (4× slowdown)

**Scale**
- Click frequency: ≤3 clicks/second typical reading; bubble must handle rapid replacement without flicker
- Translation API: unchanged from v1 (Google MT primary, Gemini fallback on 429)

---

## 4. Decision Log

All decisions below are v1.1-scope additions. Numbering continues from
DESIGN.md D37. Where a decision overrides a prior one, it is marked
**supersedes Dxx**.

| # | Decision | Alternatives considered | Why this option |
|---|---|---|---|
| D38 | **Dual-channel selection:** click = single-word translate; drag ≥ 2 words = phrase translate; partial drag auto-snaps to `\b` word boundaries | Boundary-snap only / click-only / reuse highlight click handler / toggle-gated click mode | Matches natural reading gestures; zero new interaction to learn; fixes F1 directly |
| D39 | **Any-click triggers**, gated by 7 hard filters + 2 soft filters (excludes `<a>` / `<button>` / `<input>` / `<textarea>` / `contenteditable` / `EXCLUDED_TAGS` / already-`.dr-hl` / already-preventDefaulted / modifier-key clicks / drag releases with >4 px movement; then requires `caretRangeFromPoint` to land on a non-whitespace word) | Double-click / Alt+click / hover-delay / per-user toggle | Most fluent for reading; filter list neutralizes link/button hijack risk; double-click adds a gesture users didn't ask for |
| D40 | **Click-to-translate toggle in PanelHeader** (always-accessible icon button), not buried in Settings | Toggle in Settings / no toggle / host-page FAB | User needs per-site fast opt-out (e.g., when a site's `<a>` density is too high and reading wants link clicks through) |
| D41 | **Bubble content = brief translation + Save + close-×** | Save-only / full translation / toast-only | 80/20: a one-line translation satisfies most lookups; full context / editable note / saved-word management stays in the panel where there's room |
| D42 | **Saved-word bubble:** shows translation + user note (if any) + "打开详情" link; no Save button (already saved) | "Saved" label only / jump-to-vocab-tab / no trigger | Review use case (re-reading an article with prior saves) needs instant meaning + note recall without tab switching |
| D43 | **Selection always forces translate tab.** Supersedes D21 (sticky-intent) | Keep sticky / empty→translate only / unread-badge | User explicit request (F2); sticky-intent was an over-engineered protection against a problem users didn't have |
| D44 | **Bubble dismissal paths:** click outside / ESC / new selection / page scroll. `mousedown` inside bubble does not count as "outside" (allows text copy) | Click-outside only / pinned 10 s / scroll-follow | Covers every "user stopped caring" signal; scroll-dismiss avoids the sticky-bubble-on-wrong-paragraph problem |
| D45 | **Bubble anchor:** selection/word bounding box, below-centered; flips above on viewport overflow; clamps to 8 px viewport margin horizontally | Mouse-release position / configurable / fixed corner | Uses native `getBoundingClientRect()` — no jitter; flip logic is ~20 lines, no Popper.js dependency |
| D46 | **Docs split:** main v1.1 content lives in `docs/v1-1-feedback.md`; DESIGN.md gets a short "v1.1 Iteration" section at the end with a pointer | All in DESIGN.md / pointer-only in DESIGN.md | Keeps DESIGN.md's spec-driven narrative intact while preserving this feedback-driven iteration's full decision trail in one place |
| D47 | **Bubble implementation: vanilla DOM inside Shadow DOM (`mode: "closed"`)**, inline CSS via `<style>` tag | React inside Shadow DOM | Avoids ~140 KB React runtime injected into every host page; a 200-line imperative bubble class is simpler than React state-synced rendering for a single transient widget |
| D48 | **Word-boundary detection via `Intl.Segmenter('en', { granularity: 'word' })`** with `type === 'word'` filtering | Hand-written `\b` regex | Native handling of apostrophes ("don't"), hyphens ("state-of-the-art"), and non-Latin scripts (no-op on CJK); browser-provided, no library |
| D49 | **Background becomes the translation hub.** Move translator + session cache from `src/sidepanel/useSelection.ts` to `src/background/translate.ts`. Sidepanel and bubble both request via `TRANSLATE_REQUEST`. Dedup via existing session cache keyed by `word_key` | Keep in sidepanel + relay / two parallel copies | Content scripts can't reliably call translation APIs (CORS); moving to background is necessary. Once moved, sidepanel deduplicates trivially by pulling from the same cache |
| D50 | **Testing:** unit tests for `wordBoundary.ts` only (`snapSelection` edge cases); everything else stays in the manual checklist in §8 | Full e2e / no tests | Pure-function coverage on the one algorithm with real regression potential; Playwright-extension e2e setup is a 4–6 h sunk cost this iteration doesn't justify |
| D51 | **Rename `OPEN_WORD` → `FOCUS_WORD_IN_VOCAB`.** Supersedes part of D34 | Keep `OPEN_WORD` name | The new flow no longer opens the side panel (D43 auto-opens it on any selection); the message's only job is "position vocab tab on this word". Renaming prevents future contributors from assuming side-panel-open side effects |
| D52 | **Master on/off via page-level FAB** stored in `settings.learning_mode_enabled` (local, default true). One switch gates all page-facing behavior | Side-panel only toggle / per-domain / per-tab | User requested a one-gesture pause reachable from any page without opening the side panel; global is the simplest mental model and matches "Grammarly-style" feature switching; per-domain deferred to v1.2 |
| D53 | **"Off" means fully dormant page-side:** no mouseup selection relay, no click/drag bubble, no `.dr-hl` highlights rendered. Side panel remains functional | Keep highlights on / keep selection relay / disable side panel | "Off" has to match user expectations — a partial silencing would read as buggy; side panel stays available because it's already-open trusted surface for reviewing past lookups |
| D54 | **Paused banner on Translate tab** when master is off: "学习模式已暂停 / Learning mode paused" + pointer to the FAB | Blank screen / disable side panel / toast | Tells the user where the re-enable control lives so they don't conclude the extension is broken |
| D55 | **FAB chrome:** fixed bottom-right, 44×44 circular, closed Shadow DOM, `z-index: 2147483645` (one below the bubble so an overlapping bubble wins), mounted on `<body>` (not `<html>`) after Reddit Shreddit compatibility testing, custom tag `dualread-fab` to avoid prefix collisions | Draggable / top-right / `<html>`-mounted / short `dr-fab` tag | 44px matches the WCAG tap-target minimum; body-mount + namespaced tag were required for cross-site reliability; draggable + per-domain hide deferred to v1.2 |
| D56 | **D52 supersedes D40.** The PanelHeader click-to-translate toggle is removed; `settings.click_to_translate` field is deleted. Master switch plus `auto_highlight_enabled` is the full control surface | Keep both (master + sub-toggle) / collapse master into Settings | Reduces concept count; the PanelHeader toggle landed in Phase G but field testing confirmed a page-level control is strictly more reachable and makes the header toggle redundant |
| D57 | **`auto_highlight_enabled` stays as a Settings-screen sub-preference** active only when master is on | Collapse into master | Users may want silent-recognition mode (highlights without bubbles); preserving this dial costs one checkbox and keeps the useful shape |

**Post-Phase-H follow-ups (user field testing 2026-04-22):**
- Drag-to-select now also opens the in-page bubble (previously drag only routed to the side panel). Implemented as `clickTranslator.showSelection({text, anchor, context})` called from the mouseup handler.
- Click-to-translate path now also dispatches `SELECTION_CHANGED` so the side panel's Translate tab mirrors bubble lookups and Phase F's auto-switch fires for clicks, not just drags.

**Three supersessions** — updated in the cross-reference table in DESIGN.md:
- D43 supersedes D21 (sticky tab intent)
- D51 supersedes D34 (OPEN_WORD semantics)
- D52 supersedes D40 (PanelHeader click-to-translate toggle)

---

## 5. Architecture

```
host page DOM
  │
  ├─ content script ─────┐
  │    ├─ clickTranslate │  (new: filter chain + caret → word)
  │    ├─ mouseup relay  │  (existing, augmented with wordBoundary snap)
  │    ├─ highlight.ts   │  (existing; click now routes to bubble)
  │    └─ bubble.ts      │  (new: Shadow DOM manager, lifecycle, positioning)
  │
  │  ▲ SELECTION_CHANGED
  │  ▼ TRANSLATE_REQUEST / TRANSLATE_RESULT
  │
  ├─ background worker
  │    └─ translate.ts   (new: owns API calls + session cache)
  │
  ├─ VOCAB_UPDATED / TRANSLATE_RESULT broadcast
  │
  └─ side panel
       └─ translate tab  (React, receives results, D43 auto-switch)
```

**Invariants**
- Translation is a pure-read service owned by the background worker; every
  UI surface is a subscriber.
- Shadow DOM (`mode: "closed"`) is the only injection mechanism into the
  host page; no plain-DOM elements outside of the existing `.dr-hl` spans.
- Content script never calls external HTTP directly — CORS would break it.

---

## 6. Components

**New files**

| Path | Responsibility | Approx LOC |
|---|---|---|
| `src/background/translate.ts` | Full translator: Google MT primary, Gemini fallback on 429, `chrome.storage.session` cache keyed by `word_key`, error taxonomy (`rate_limit` / `network` / `auth` / `unknown`) | ~150 |
| `src/content/bubble.ts` | Shadow DOM bubble manager. Exports `createBubble()` factory returning `{ show(opts), hide(), dispose() }`. Internally tracks `currentWordKey` for race dedup | ~200 |
| `src/content/bubbleStyles.ts` | Bubble CSS as a template literal, mirrors `tokens.ts` palette, injected via `<style>` into the shadow root | ~80 |
| `src/content/clickTranslate.ts` | Capture-phase `click` handler. Runs the 9-rule filter chain, `caretRangeFromPoint` → word resolution, routes to `bubble.show()` | ~120 |
| `src/content/wordBoundary.ts` | `Intl.Segmenter` wrapper. Exports `expandToWord(container, offset): Range | null` and `snapSelection(selection): Selection | null` | ~60 |

**Modified files**

| Path | Change |
|---|---|
| `src/background/index.ts` | Register `TRANSLATE_REQUEST` handler; delegate to `translate.ts` |
| `src/shared/messages.ts` | Add `TRANSLATE_REQUEST` / `TRANSLATE_RESULT`; rename `OPEN_WORD` → `FOCUS_WORD_IN_VOCAB` (D51) |
| `src/shared/types.ts` | Add `Settings.click_to_translate: boolean` (default `true`) |
| `src/content/index.ts` | Wire `clickTranslate` + `bubble` instances; pass saved-word data into bubble for highlight clicks; extend orphan-shutdown to dispose bubble |
| `src/content/highlight.ts` | `onClick`: read full `VocabWord` from storage, call `bubble.show(...)` instead of `sendMessage(OPEN_WORD)` |
| `src/sidepanel/useSelection.ts` | Replace direct translator call with `sendMessage(TRANSLATE_REQUEST)` |
| `src/sidepanel/App.tsx` | Remove sticky-intent guard; all `selection.data` updates force `setScreen("translate")` (D43) |
| `src/sidepanel/components/PanelHeader.tsx` | New `click_to_translate` toggle icon on right side of header |

**Deletions**
- Google MT HTTP logic + Gemini fallback + `chrome.storage.session` cache writes in `useSelection.ts` — now in `background/translate.ts`

---

## 7. Data Flows

### 7.1 Click on unsaved word

```
user click on <span>word</span>
  → clickTranslate: 9-rule filter passes
  → caretRangeFromPoint + Intl.Segmenter → full word "Phase"
  → bubble.show({ word, context, state: "loading" })
  → sendMessage(TRANSLATE_REQUEST, { word, context, source_url, requester: "bubble" })
      [background]
        ↳ session cache hit? → return cached TRANSLATE_RESULT
        ↳ miss → Google MT → (429) → Gemini → write cache → return
  → bubble receives TRANSLATE_RESULT → swap loading → "word → 译文" + [Save]
  ↑ in parallel
  → content/index.ts also fires SELECTION_CHANGED → side panel
      [sidepanel]
        ↳ useSelection: sendMessage(TRANSLATE_REQUEST) for same word
        ↳ background: cache hit (just written) → instant return
        ↳ D43: setScreen("translate")
```

Both requests share the session cache, so the second is always free.

### 7.2 Drag ≥ 2 words

```
user drag → mouseup
  → content/index.ts reads selection.toString()
  → wordBoundary.snapSelection: expand both ends to \b ("w Phase" → "new Phase")
  → if snapped text still ≥ 2 words → phrase branch
  → bubble.show({ phrase, context }) + SELECTION_CHANGED
  → identical to 7.1 from here
```

### 7.3 Click on saved word (`.dr-hl` span)

```
user click on .dr-hl
  → highlight.ts onClick (no OPEN_WORD send)
  → chrome.storage.sync.get(`v:${word_key}`) → VocabWord with note, zh, ctx
  → bubble.show({
      word, translation: cachedZh, note, showDetailLink: true
    })
    - No TRANSLATE_REQUEST (we already have zh)
    - No Save button (already saved)
  → if user clicks "打开详情" → sendMessage(FOCUS_WORD_IN_VOCAB, { word_key })
      → sidepanel: setScreen("vocab") + focus word
```

### 7.4 Save from bubble

```
user clicks [Save] in bubble
  → sendMessage(SAVE_WORD, { word: VocabWord })
  → background: write to storage + broadcast VOCAB_UPDATED
  → bubble receives VOCAB_UPDATED, checks word_key matches current →
     [Save] → [✓ Saved] (disabled)
```

---

## 8. Error Handling & Edge Cases

**Translation errors**
- `TRANSLATE_RESULT` carries `error?: "rate_limit" | "network" | "auth" | "unknown"`
- Bubble loading state with error → "翻译失败：{code-specific hint}" + [Retry] button; Save disabled until retry succeeds
- Side panel reuses existing `TranslateErrorCode` handling

**Extension context invalidated**
- Bubble `[Save]` handler guards `chrome.runtime?.id` + try/catch; on failure, silently close the bubble
- `shutdownIfOrphaned()` in content/index.ts extended to dispose bubble and clickTranslate listeners

**Word boundary edge cases**
- `Intl.Segmenter` treats "don't" / "state-of-the-art" as one word segment (filter `seg.isWordLike === true` or `type === 'word'`)
- Click lands on whitespace / punctuation / digit-only: `expandToWord` returns null → no bubble
- Click on CJK or other non-Latin text: Segmenter returns non-Latin segment → no bubble (English-only lookup in v1.1)

**Bubble positioning edges**
- Selection bottom → viewport bottom gap < bubble height → flip to above
- Horizontal overflow → clamp to 8 px from viewport edge
- Window resize while bubble open → reposition (throttled 100 ms)

**Concurrency**
- User clicks word A, then word B within ~200 ms: bubble's `currentWordKey` updates to B; when A's `TRANSLATE_RESULT` arrives, key mismatch → drop silently
- Single bubble instance — no overlapping bubbles possible by construction

**Shadow DOM defenses**
- `mode: "closed"` — host page scripts can't traverse into bubble
- `:host { all: initial; ... }` resets isolate from aggressive host CSS (`* { all: unset }`)
- `z-index: 2147483646` — below fullscreen API, above everything else normal pages use

**Scenarios we explicitly give up on**
- Nested iframes (Medium's tweet embeds, etc.): content script not injected in iframes (v1 limit, unchanged)
- Text rendered in `<video>` / `<canvas>` / WebGL: no caret position retrievable
- Shadow DOM closed components on host page (very rare): caret position may miss

---

## 9. Testing Strategy

**Unit tests** (new `vitest` config, limited scope)
- `wordBoundary.test.ts`: snapshot cases for
  - `"w Phase"` → `"new Phase"` (partial left)
  - `"new Phas"` → `"new Phase"` (partial right)
  - `"don't worry"` → `"don't worry"` (apostrophe preserved)
  - `"state-of-the-art"` → `"state-of-the-art"` (hyphenated single token when dragged fully)
  - `"中文 English mix"` when clicking in CJK → returns null
  - Click on whitespace between words → returns null
  - Single-letter "I" / "a" → returns the word (no minimum length rejection)

**Integration / e2e: deferred to v1.2.** Playwright-extension setup is a
4–6 h cost this iteration doesn't justify.

**Manual smoke test** (pre-commit, ~10 min)

- [ ] Reddit comments page: click word → bubble appears with translation + [Save]
- [ ] Click 3 different words rapidly on same page → bubble replaces in place, no flicker, no stale translation
- [ ] Drag "w Phase" (partial) → snaps to "new Phase" → phrase translation
- [ ] Bubble open, press ESC → closes
- [ ] Bubble open, scroll page → closes
- [ ] Click saved (`.dr-hl`) word → bubble with translation + note + "打开详情"
- [ ] Click "打开详情" → side panel switches to vocab tab + focuses word

**Manual regression test** (per-PR)

- [ ] Click word inside `<a>` → bubble does NOT appear, link navigates
- [ ] Click inside `<input>` / `<textarea>` / `contenteditable` → no bubble
- [ ] Click inside `<code>` / `<pre>` → no bubble
- [ ] Cmd/Ctrl+click word → no bubble, native "open in new tab" works
- [ ] Offline → click word → bubble shows error state + [Retry]
- [ ] Trigger 429 by repeated rapid clicks → Gemini fallback activates

**Manual perf test** (per milestone, uses `docs/r3-benchmark.md` setup)

- [ ] Twitter feed scroll 10 s + click 5 words → bubble first paint <50 ms (Performance flame chart)
- [ ] `clickTranslate` / `bubble.show` single-call <50 ms
- [ ] CPU 4× throttle: bubble appears within 300 ms of click

---

## 10. Open Questions (resolved at build time)

1. **Bubble Save button localization:** "Save" / "保存" text or icon-only `💾`? **Resolved:** label-text ("Save" / "保存"), matches side panel Translate tab convention.
2. **Click-to-translate toggle icon:** which Material/Lucide glyph? **Obsolete:** Phase G's PanelHeader toggle was removed by D56; master switch lives on the FAB instead.
3. **Bubble-to-panel visual parity:** should the bubble reuse exact `tokens.ts` colors or get its own palette? **Resolved:** exact parity — bubble and FAB both import from `src/sidepanel/tokens.ts`.

---

## 11. Implementation Plan (status)

All phases shipped green (typecheck + tests + build) as of 2026-04-22.

| Phase | Scope | Status |
|---|---|---|
| A | Translator migration to `background/translate.ts`; `TRANSLATE_REQUEST`/`RESULT` messages | ✅ shipped |
| B | `wordBoundary.ts` + 15 vitest cases; drag-snap wired into mouseup | ✅ shipped |
| C | `bubble.ts` + `bubbleStyles.ts` (closed Shadow DOM) | ✅ shipped |
| D | `clickTranslate.ts` filter chain + caret→word; bubble connected | ✅ shipped |
| E | Saved-word bubble variant; `FOCUS_WORD_IN_VOCAB` rename | ✅ shipped |
| F | Remove D21 sticky-intent; selection unconditionally forces Translate tab | ✅ shipped |
| G | *(Obsolete — superseded by Phase I per D56.)* PanelHeader `click_to_translate` toggle shipped, then removed | ⚠️ reverted |
| H | Manual smoke sweep (`docs/v1-1-smoke-results.md`); two field-test fixes (drag-bubble + click-side `SELECTION_CHANGED` sync) | ✅ shipped |
| I | **Master-switch FAB (D52–D57):** `src/content/fab.ts`; `learning_mode_enabled` in Settings; paused banner on Translate tab; Phase G toggle removed; `IconBtn` component + `.dr-icon-btn--active` CSS purged as unused; new brand icon at `icons/icon{16,48,128}.png` matching the sidepanel `LogoMark` | ✅ shipped |

**Deferred to v1.2** (out of v1.1 scope, tracked here for memory):
- Per-domain FAB hide
- Draggable FAB position
- Jump-from-vocab-list-to-source-URL (original F4)
- Playwright-extension e2e test setup

---

## 12. Submission log

| Date | Event |
|---|---|
| 2026-04-22 | v2.0.0 `dist/` zipped as `dualread-v2.0.0.zip` (91 KB, 23 files) — manifest v2.0.0, new brand icons, FAB, in-page bubble, drag-snap, background translator |
| 2026-04-22 | Store listing copy rewritten in `store-listing.md` (zh-CN primary + en) to reflect v2.0 features; Gemini-fallback copy removed (planned but not yet implemented — `src/background/translate.ts:76-77` surfaces `rate_limit` on 429 instead) |
| 2026-04-22 | Screenshots regenerated at 1280×800 (Chrome Web Store strict 16:10 requirement); originally rendered at 1200×800 which would have failed upload validation |
| 2026-04-22 | `privacy-policy.html` touched up for v2.0 (bubble + FAB in content-script scope); privacy-practices form filled per `store-listing.md` guide, "remote code" declared **not in use** (only JSON + CSS + fonts leave the extension, no executable remote code) |
| 2026-04-22 | Package uploaded to Chrome Web Store Developer Dashboard; **awaiting review** |

**Known debt at submission time** (see also `project_dualread_pending.md` in user memory):
- R3 SPA highlight benchmark never measured on Twitter/X or YouTube comments — fallback plan (viewport-only scanning) not triggered because we have no data to trigger it from.
- Full v1.1 smoke checklist at `docs/v1-1-smoke-results.md` only spot-checked (Reddit FAB visibility on 2026-04-22); other regression items not walked through.

---

*End of v1.1 design.*
