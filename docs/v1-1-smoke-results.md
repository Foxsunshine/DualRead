# DualRead v1.1 — Phase H Manual Test Log

Load `dist/` as an unpacked extension in Chrome (chrome://extensions,
Developer mode → Load unpacked → pick this repo's `dist` folder), then
walk through each block below. Tick each item as it passes; for a fail,
write a one-line note under the item.

Build under test: commit at `git rev-parse HEAD` (fill before run).

---

## Smoke (must pass)

- [ ] Reddit comments page: click a word → bubble appears with translation + [Save]
- [ ] Click 3 different words rapidly on same page → bubble replaces in place, no flicker, no stale translation
- [ ] Drag `"w Phase"` (partial) → snaps to `"new Phase"` → phrase translation in bubble
- [ ] Bubble open, press ESC → closes
- [ ] Bubble open, scroll page → closes
- [ ] Click saved (`.dr-hl`) word → bubble shows translation + note + "打开详情" link
- [ ] Click "打开详情" → side panel switches to Vocab tab + target row expands and scrolls into view

## Regression (must pass)

- [ ] Click word inside `<a>` → bubble does NOT appear, link navigates normally
- [ ] Click inside `<input>` / `<textarea>` / `contenteditable` → no bubble
- [ ] Click inside `<code>` / `<pre>` → no bubble
- [ ] Cmd/Ctrl+click a word → no bubble, native "open in new tab" still works
- [ ] Offline (DevTools → Network → Offline) → click word → bubble shows error state + [Retry]
- [ ] Trigger 429 by rapid repeated clicks → Gemini fallback activates (translation still appears)

## Phase F / G specific (v1.1 deltas)

- [ ] Side panel on Vocab tab → select new word in page → panel **auto-switches to Translate tab** (D43 / Phase F)
- [ ] Side panel on Settings tab → select new word in page → panel auto-switches to Translate tab
- [ ] PanelHeader click-to-translate toggle: tooltip reads "on (click to turn off)" when engaged
- [ ] Toggle off → click a word on page → **no bubble** appears
- [ ] Toggle off → drag-select still works (mouseup selection flow is independent)
- [ ] Toggle state persists after reopening side panel (read-through from `chrome.storage.local`)

## Perf (uses `docs/r3-benchmark.md` setup)

- [ ] Twitter feed scroll 10 s + click 5 words → bubble first paint <50 ms (Performance flame chart)
- [ ] `clickTranslate` / `bubble.show` single-call <50 ms
- [ ] CPU 4× throttle: bubble appears within 300 ms of click

## Notes / failures

_(free-form — paste anything anomalous here)_
