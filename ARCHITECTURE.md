# DualRead Architecture

Snapshot of the v2.0.1 codebase. Single Chrome MV3 extension, zero servers, BYO Chrome Sync. Scope: select English text → translate → save to vocab → auto-highlight every recurrence on every page → export to CSV.

> Source-of-truth is the manifest + `src/` tree. README is the user-facing intro; `CLAUDE.md` records the post-2026-04-28 scope correction (no backend, no RAG, no agent). This document is the current "how the parts fit" reference.

---

## 1. Three runtimes, one extension

```
            ┌──────────────────────────── Chrome MV3 ────────────────────────────┐
            │                                                                    │
  user ───▶ │   content script   ◀──── runtime msg ────▶   service worker        │
  selection │   (per tab)                                  (background, module)  │
            │   • selection relay                          • message router      │
            │   • highlight engine                         • Google Translate    │
            │   • click bubble (Shadow DOM)                  proxy + session     │
            │   • drag→word snap                             cache               │
            │   • learning-mode FAB                        • vocab write buffer  │
            │                                                (debounced flush)   │
            │                                                       │            │
            │                                                       ▼            │
            │                                          chrome.storage.{sync,     │
            │                                          local, session}           │
            │                                                       ▲            │
            │                                                       │            │
            │   side panel (React, Shadow root in extension page)   │            │
            │   • Translate / Vocab / Settings tabs ◀───────────────┘            │
            │   • hooks: useSelection, useVocab, useFocusWord, useSyncStatus     │
            │                                                                    │
            └────────────────────────────────────────────────────────────────────┘
```

| Runtime        | File entry                | Lifetime                      | Owns                                                            |
| -------------- | ------------------------- | ----------------------------- | --------------------------------------------------------------- |
| Content script | `src/content/index.ts`    | Per tab, document_idle        | DOM mutation, selection events, highlights, in-page bubble, FAB |
| Background SW  | `src/background/index.ts` | Module SW, evicted on idle    | Network IO, storage writes, message routing                     |
| Side panel     | `src/sidepanel/main.tsx`  | Open while user keeps it open | All UI; reads/writes go through messages                        |

Rule of thumb: **only the service worker touches the network**. Content script forwards everything. Side panel goes through the SW too — so rate limiting, error normalisation, and caching live in one place.

---

## 2. Source layout

```
DualRead/
├── manifest.json                # source manifest (v2.0.1 form, static)
├── package.json                 # vite 6 + react 19 + @crxjs/vite-plugin
├── vite.config.ts / tsconfig.*
├── icons/                       # 16 / 48 / 128
├── _locales/{en,zh_CN}/messages.json   # only extName / extDescription
├── src/
│   ├── shared/                  # cross-runtime contracts (no chrome.* imports)
│   │   ├── types.ts             # Settings, VocabWord, SelectionPayload, …
│   │   ├── messages.ts          # Message union, sendMessage, storage keys
│   │   ├── highlightable.ts     # isHighlightable() predicate
│   │   └── highlightable.test.ts
│   ├── background/
│   │   ├── index.ts             # install + message router
│   │   ├── translate.ts         # Google Translate proxy + session cache
│   │   └── vocab.ts             # write buffer (debounce + retry)
│   ├── content/
│   │   ├── index.ts             # selection relay + orchestrator
│   │   ├── highlight.ts         # TreeWalker + MutationObserver wrapper engine
│   │   ├── bubble.ts            # Shadow-DOM translation bubble (vanilla)
│   │   ├── bubbleStyles.ts
│   │   ├── clickTranslate.ts    # capture-phase click pipeline → bubble
│   │   ├── wordBoundary.ts      # Intl.Segmenter drag→word snap
│   │   ├── wordBoundary.test.ts
│   │   ├── fab.ts               # learning-mode floating switch
│   │   └── content.css          # `.dr-hl` styles + a11y resets
│   └── sidepanel/
│       ├── index.html           # mounts #root, links Google Fonts
│       ├── main.tsx             # React entrypoint
│       ├── App.tsx              # screen state machine
│       ├── state.ts             # useSettings hook, Screen / Tab unions
│       ├── i18n.ts              # DR_STRINGS<Lang> dict
│       ├── tokens.ts            # design tokens (mirror of :root CSS vars)
│       ├── styles.css
│       ├── components/          # LogoMark, MetaLabel, PanelHeader, Toggle
│       ├── screens/             # Welcome, Translate{,Empty}, Vocab{,Empty}, Settings
│       ├── exportCsv.ts         # RFC4180 CSV + chrome.downloads
│       ├── useSelection.ts      # current selection + translation
│       ├── useVocab.ts          # mirrored vocab list, optimistic mutations
│       ├── useFocusWord.ts      # highlight-click → "jump to word"
│       └── useSyncStatus.ts     # 4-state sync indicator
└── dist/                        # @crxjs build output, loaded by Chrome (gitignored)
```

`shared/` is the single dependency anyone is allowed to import across runtimes — it contains no `chrome.*` calls and no React, so it bundles into all three entries cleanly.

---

## 3. Storage split (authoritative)

| Store                    | Keys                                                            | Purpose                                   | Why this store                                                                                |
| ------------------------ | --------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| `chrome.storage.sync`    | `v:<word_key>` (one per saved word)                             | The vocab list                            | Free cross-device sync via the user's Chrome account; ~500-word headroom under the 100 KB cap |
| `chrome.storage.local`   | `settings`, `write_buffer`, `last_synced_at`, `last_sync_error` | Device-local config + sync metadata       | Larger quota, no cross-device write contention                                                |
| `chrome.storage.session` | `t:<target>:<text>`, `latest_selection`, `pending_focus_word`   | Translation cache + cross-runtime intents | Wiped on browser restart; perfect for ephemeral state                                         |

Last-write-wins is per-key — that's why each saved word gets its own `v:` key instead of one big array. The write buffer is the SW's defence against the ~120 writes/min sync quota; it absorbs bursts, mirrors itself into `local` for SW-eviction safety, and on failure rolls the snapshot back onto pending and retries.

---

## 4. Data model (shared/types.ts)

```ts
type Lang = "zh-CN" | "en";
type HighlightStyle = "underline" | "background";
type Level = "A2" | "B1" | "B2" | "C1";

interface Settings {
  auto_highlight_enabled: boolean;
  highlight_style: HighlightStyle;
  ui_language: Lang;
  first_run_completed: boolean;
  level: Level;
  learning_mode_enabled: boolean; // master switch for the content script
}

interface VocabWord {
  word: string; // display form, original casing
  word_key: string; // canonical: trimmed + lowercased
  zh: string; // translation (target zh-CN)
  en?: string; // reverse translation, optional
  ctx?: string; // surrounding sentence at save-time
  source_url?: string;
  note?: string;
  created_at: number;
  updated_at: number;
}

interface SelectionPayload {
  text: string;
  context_sentence: string;
  source_url: string;
}
```

`word_key` is the matching identity everywhere — storage keys, highlight regex inputs, focus messages. Display form is preserved for the UI but never used for equality.

---

## 5. Message catalog (shared/messages.ts)

| Message               | Sender → Receiver        | Payload                     | Purpose                                        |
| --------------------- | ------------------------ | --------------------------- | ---------------------------------------------- |
| `TRANSLATE_REQUEST`   | sidepanel \| bubble → SW | `text, target?, requester?` | Single RPC for translation; cache-first        |
| `SELECTION_CHANGED`   | content → SW             | `SelectionPayload`          | Fire-and-forget; SW persists + relays to panel |
| `SHOW_SELECTION`      | SW → sidepanel           | `SelectionPayload`          | Live push when panel is open                   |
| `FOCUS_WORD_IN_VOCAB` | content → SW             | `word_key`                  | "Open details" link in the bubble              |
| `FOCUS_WORD`          | SW → sidepanel           | `word_key`                  | Panel opens Vocab tab scrolled to that word    |
| `SAVE_WORD`           | sidepanel \| bubble → SW | `VocabWord`                 | Routed through the write buffer                |
| `DELETE_WORD`         | sidepanel → SW           | `word_key`                  | Same                                           |
| `GET_VOCAB`           | sidepanel → SW           | —                           | Initial hydrate; flushes pending first         |
| `CLEAR_DATA`          | sidepanel → SW           | —                           | Settings → wipe; resets to first-run           |
| `VOCAB_UPDATED`       | SW → broadcast           | —                           | All panels and content scripts re-pull         |

`MessageResponse = { ok: true, data? } | { ok: false, error }`. `chrome.runtime.sendMessage` is always wrapped by `sendMessage()` in `shared/messages.ts` — that helper translates the callback API + `chrome.runtime.lastError` into a Promise.

### Cross-runtime intent stash (session storage)

`SESSION_KEY_PENDING_FOCUS = "pending_focus_word"` carries a click intent across the tiny gesture gap when `chrome.sidePanel.open()` has to run _before_ the panel mounts a `FOCUS_WORD` listener. The SW writes the key and tries `sidePanel.open()`; the panel reads + clears it on mount. Live broadcast still fires for the panel-already-open case.

`SESSION_KEY_LATEST_SELECTION = "latest_selection"` is the same pattern for selections — panel opens → reads stash → renders Translate tab.

---

## 6. Highlight engine (`src/content/highlight.ts`)

- **DOM-wrap, not CSS Custom Highlight API.** We need per-element click events on each match.
- **TreeWalker + MutationObserver.** Initial scan is one walk; after that the MO watches added subtrees, debounced 100 ms.
- **One batched regex.** `\b(word1|word2|…)\b` with `i`. The `isHighlightable` predicate (`shared/highlightable.ts`) drops keys that wouldn't match anyway: anything outside `\p{Script=Latin}\p{M}'\- ` or longer than 3 tokens. Long phrases and CJK sentences still live in the vocab list and CSV export.
- **Idempotent on our own mutations.** Wrapped spans carry `.dr-hl`; the visit predicate rejects any text node already inside one, so MO callbacks triggered by our own `createElement`/`splitText` walk-through don't recurse.
- **Excluded tags:** `SCRIPT`, `STYLE`, `NOSCRIPT`, `TEXTAREA`, `INPUT`, `SELECT`, `OPTION`, `CODE`, `PRE`, `KBD`, `SAMP`, `IFRAME`, `OBJECT`, `EMBED`. Same list duplicated in `clickTranslate.ts`'s filter chain — kept independent so they can evolve separately.
- **Throttle.** Vocab-set rebuilds throttle to 500 ms so 20 tabs reacting to one `VOCAB_UPDATED` broadcast don't thunder-herd.
- **No `innerHTML`.** Only `createElement` + `splitText`. Hostile host-page strings can't smuggle markup into our tree.

Public surface: `createHighlighter({ onHighlightClick })` → `{ setVocab, setEnabled, setStyle, dispose }`. The orchestrator in `content/index.ts` owns the instance and drives it from `Settings` + the saved-word list.

---

## 7. In-page bubble + click-to-translate

- `bubble.ts` is **vanilla DOM in a closed Shadow root**, attached to `<html>` (not `<body>`, which hostile pages may rewrite). React would inject ~140 KB into every host page for a 200-line widget — not worth it.
- `:host { all: initial }` resets every inherited CSS property so the bubble looks the same regardless of the host's resets.
- `clickTranslate.ts` installs a **capture-phase click listener**. Filter chain (rejections fall through silently to the host's own behavior):
  1. `learning_mode_enabled === false` → master switch off
  2. modifier keys (meta/ctrl/alt/shift) → preserve native nav (Cmd-click etc.)
  3. drag > 4 px → user is selecting, not clicking
  4. `event.defaultPrevented` → another handler claimed it
  5. target in/is `<a>`, `<button>`, `<input>`, `<textarea>`, `<select>` → leave interactive elements alone
  6. target in `[contenteditable]` → user is typing
  7. target in excluded tags → code blocks etc.
  8. target inside `.dr-hl` → handled by the highlight click handler
  9. `caretRangeFromPoint` must land on a Latin word
- A **monotonic token** guards against stale `TRANSLATE_RESULT` repaints: click A → click B during the network round-trip, A's late response must not paint over B.
- A **single global instance** — rapid clicks replace content in-place rather than stacking bubbles.

The drag-selection path uses `wordBoundary.ts`'s `Intl.Segmenter` (English locale, `granularity: "word"`) to expand half-selected ranges to whole words — mid-word drags like "w Phase" snap out to "new Phase" before the translate request fires.

---

## 8. Side-panel state model

`App.tsx` is a screen state machine driven by three derived signals:

- `settings.first_run_completed` → Welcome vs. main flow
- The active tab (`translate` | `vocab` | `settings`)
- Whether each tab has content (`Translate` vs. `TranslateEmpty`, `Vocab` vs. `VocabEmpty`)

Hooks:

| Hook                   | Owns                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| `useSettings`          | Hydrate + optimistic update of `chrome.storage.local["settings"]`                                     |
| `useSelection(target)` | Latest selection + its translation; collapses error codes to 3 i18n strings                           |
| `useVocab`             | Mirrored word list; optimistic save/remove/clear; reconciles on `VOCAB_UPDATED`                       |
| `useFocusWord`         | Late-open + live-push paths for "jump to this word"                                                   |
| `useSyncStatus`        | Pure reducer over `online + write_buffer + last_sync_error` → `synced \| syncing \| offline \| error` |

A fresh selection always forces the Translate tab (v1.1 D43, supersedes the older "sticky intent" design). Last selection is preserved across tab switches until a new one arrives.

i18n is the **`DR_STRINGS<Lang>` dict in `i18n.ts`**, not `chrome.i18n`. `_locales/` carries only `extName` / `extDescription` so the Web Store listing localises; everything else is runtime-driven so the user's UI-language toggle takes effect without an extension reload.

---

## 9. Service-worker discipline

- **Module SW** (`background.type: "module"`). Top-level imports are fine; module-scope state is not — it's gone the next time the SW wakes. Anything important must round-trip through `chrome.storage.*`.
- The vocab write buffer **mirrors itself into `chrome.storage.local`** before each scheduled flush; on cold wake it `hydrate()`s back. `setTimeout` debounce is fine because the debounce window is 100 ms — well below the SW idle threshold. Long retry timers (>25 s) would need `chrome.alarms`; the current 2 s retry doesn't.
- Translation **cache is in `chrome.storage.session`** — process-independent, survives SW eviction within a browser session.
- Error taxonomy from `translate.ts`: `"network" | "rate_limit" | "parse" | "http_<n>"`. Side panel collapses to 3 i18n buckets; verbose code is preserved in `last_sync_error` for bug reports.

---

## 10. Build & toolchain

| Layer    | Choice                      | Version                     |
| -------- | --------------------------- | --------------------------- |
| Language | TypeScript (strict)         | 5.7                         |
| UI       | React                       | 19                          |
| Bundler  | Vite + `@crxjs/vite-plugin` | Vite 6 / crx 2.0-beta       |
| Styling  | Native CSS + CSS variables  | — (no Tailwind / CSS-in-JS) |
| Tests    | Vitest                      | 4.x                         |
| Node     | 20 (pinned via `.nvmrc`)    | —                           |

```sh
npm install
npm run dev          # Vite dev server, HMR for the side panel
npm run typecheck    # tsc -b --noEmit
npm run build        # tsc -b && vite build → dist/
npm run test         # vitest run
```

`@crxjs/vite-plugin` reads `manifest.json`, rewrites TS entries to hashed JS in `assets/`, emits `service-worker-loader.js`, and copies `_locales/` and `icons/` into `dist/`. **Always Load Unpacked from `dist/`, never the project root.** Side-panel changes hot-reload; content-script and background changes require the extension's reload button at `chrome://extensions`.

---

## 11. Manifest (v2.0.1 surface)

- `manifest_version: 3`
- `permissions`: `storage`, `sidePanel`, `downloads`
- `host_permissions`: `https://translate.googleapis.com/*` (only)
- `side_panel.default_path`: `src/sidepanel/index.html` (rewritten to bundled path by crxjs)
- `background.service_worker`: `src/background/index.ts` (rewritten)
- `content_scripts`: `<all_urls>`, `run_at: document_idle`, `all_frames: false`
- `content_security_policy.extension_pages`: `script-src 'self'; object-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com;`

No `default_popup` (would override `sidePanel` open-on-action). No `activeTab` (side-panel messaging doesn't need it). No `contextMenus` for v2.0.1 (dropped per `2e6db67`). No `identity` / `oauth2` / backend host (Tier 0, BYOK, see CLAUDE.md scope correction).

---

## 12. Privacy posture

- The only network egress is `translate.googleapis.com`, only triggered by user selection / click.
- No analytics. No telemetry. No accounts. No backend operated by us.
- Vocab lives in Chrome Sync (Google account) per the user's existing Chrome trust boundary.
- Translation cache is session-scoped and disappears on browser restart.
- Privacy policy: `privacy-policy.html` at the repo root; CWS listing references it.

---

## 13. Out of scope

Per `CLAUDE.md` (2026-04-28 scope correction), all of these were considered and explicitly cut:

- AI tutor / grammar explanation
- Built-in SRS / flashcard review
- Anki `.apkg` export (CSV is enough)
- Custom backend, OAuth, JWT sessions
- RAG / vector search / pgvector
- LangGraph multi-node agent, Langfuse, BLEU/LLM-judge eval
- Cross-device sync beyond Chrome Sync (no Supabase, no Postgres)
- Full-page bilingual translation mode
- Multi-language UI beyond {zh-CN, en} (extended to JA + FR in later v2.x branches; v2.0.1 ships zh-CN + en only)
- Shadow DOM / iframe highlighting on host pages
- Offline translation

If the next iteration triggers Tier 1 (lightweight translate proxy because BYOK turns away too many users), the new stack target is **Cloudflare Workers / Vercel Edge**, not FastAPI / Postgres.
