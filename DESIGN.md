# DualRead Learn — v1 Design Document

> Pivot of the existing DualRead translator into a language-learning Chrome extension for Chinese speakers learning English. This document is the output of a structured `/brainstorming` session followed by a multi-agent review pass. It captures the agreed understanding, design, risks, and decision log.

---

## 1. Understanding Summary

- **Product:** A Chrome MV3 extension that helps Chinese speakers learn English by letting them save unknown words while browsing. Saved words auto-highlight on every subsequent page, reinforcing recognition in real context.
- **Target user:** Chinese speakers learning English, adaptive across levels (user selects level at first run; affects future tutor behavior).
- **Core loop:** Select text → side panel shows translation → user saves unknown words → same words auto-highlight everywhere they reappear online → user exports vocab to Anki / CSV for deeper review.
- **Primary UI:** Chrome Side Panel API only. No popup. No floating tooltip. All interaction lives in the right-side panel.
- **v1 scope:** Translation + vocabulary builder with list + export. No AI tutor, no SRS review, no full-page bilingual mode, no multi-language support beyond CN↔EN.
- **Operational constraints:** Solo developer, ~$0–10/mo budget, no tracking/analytics, free-tier infra only, target 100–1,000 users over first 6 months.

---

## 2. Scope & Non-Goals

### In scope (v1)

- Side-panel UI with **Translate** and **Vocab** tabs
- Google Translate integration (anonymous; no account required)
- User-marked vocabulary list stored in `chrome.storage.sync`
- Auto-highlight of saved words on every webpage (user-toggled, ON by default)
- Click a highlighted word → opens Vocab tab on that word
- Export saved vocab to CSV
- Simplified Chinese UI by default; English as a setting

### Explicit non-goals (v1)

- ❌ AI tutor / grammar explanation *(deferred to v1.1)*
- ❌ Built-in SRS / flashcard review *(users review in Anki)*
- ❌ Anki `.apkg` export *(v1.1 — adds ~1 MB bundle for sql.js)*
- ❌ Cross-device sync beyond Chrome's own sync *(Supabase deferred to v1.1+)*
- ❌ User accounts / login *(not needed without a backend)*
- ❌ Full-page bilingual translation mode *(cut from DualRead)*
- ❌ Multi-language support beyond CN↔EN
- ❌ Shadow DOM / iframe highlighting
- ❌ Offline translation
- ❌ Analytics / telemetry

---

## Phase 3 message-catalog deltas (retrospective)

- **Added:** `FOCUS_WORD { word_key }` — background → sidepanel. Emitted when a highlight click routes through the background; consumed by `useFocusWord` in the panel.
- **Added:** `SESSION_KEY_PENDING_FOCUS = "pending_focus_word"` in `chrome.storage.session` — carries the click intent across the sidePanel-open gesture gap (D34, S1).

---

## 3. Architecture Overview

```
┌───────────────────────── Chrome Extension (MV3) ────────────────────────┐
│                                                                         │
│   content.js               background.js          sidepanel.html/js     │
│   ──────────               ──────────────         ──────────────────    │
│   • selection listener     • message router       • Translate tab       │
│   • highlight engine       • translate proxy      • Vocab tab           │
│     (TreeWalker +            (Google Translate)   • Settings            │
│      MutationObserver)     • side-panel opener                          │
│          ▲                        ▲                      ▲              │
│          └────── runtime msg ─────┴──────────────────────┘              │
│                                   ▼                                     │
│                         chrome.storage.sync                             │
│                  (vocab items, keyed `v:<word>`)                        │
│                         chrome.storage.local                            │
│                  (write buffer, settings, matcher cache)                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                   ▲
                                   │ Chrome handles sync automatically
                                   ▼
                       User's other Chrome profiles
                         (same Google account)
```

**Key properties:**

- **No server, no auth.** Chrome Sync (tied to the user's Google-Chrome account) provides free cross-device sync out of the box.
- **Privacy by default.** No data touches any server of ours. Only selected text ever leaves the browser, and only to Google Translate.
- **Service worker owns network IO.** Translation requests go through `background.js` so rate-limiting and error handling live in one place.
- **Content script is dumb.** Listens for selection, renders highlights, forwards everything else to background / side panel.
- **MV3-native throughout.** All async work that survives idle must use `chrome.alarms` / storage events, not `setTimeout`/module-scope state. Module-scope variables in `background.js` are ephemeral.

### Storage split (authoritative)

| Store | Keys | Why |
|---|---|---|
| `chrome.storage.sync` | `v:<word>` (one per saved word) | Cross-device via Chrome Sync; 512-item / 100 KB cap budget-managed |
| `chrome.storage.local` | `settings`, `write_buffer`, `matcher_cache` | Settings are device-local (D14); buffer and cache must not consume sync quota |

### Manifest v1 (complete shape — source form, pre-build)

```json
{
  "manifest_version": 3,
  "name": "DualRead",
  "version": "2.0.0",
  "permissions": ["storage", "sidePanel", "contextMenus", "downloads"],
  "host_permissions": ["https://translate.googleapis.com/*"],
  "action": {
    "default_icon": { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" }
    // ⚠️ NO "default_popup" — its presence overrides sidePanel on-click behavior
  },
  "side_panel": { "default_path": "src/sidepanel/index.html" },
  "background": { "service_worker": "src/background/index.ts", "type": "module" },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["src/content/index.ts"],
    "css": ["src/content/content.css"],
    "run_at": "document_idle",
    "all_frames": false
  }],
  "icons": { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" },
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com;"
  }
}
```

**Notes:**
- This is the **source** manifest. `@crxjs/vite-plugin` reads it, rewrites TS entries to hashed JS (`assets/*.js`), emits `service-worker-loader.js`, and writes a compliant MV3 manifest to `dist/manifest.json`. Chrome loads `dist/`, not the project root.
- `default_locale` strategy (D27): runtime `DR_STRINGS` dict drives all in-panel UI language, not `chrome.i18n`. Phase 4 re-adds `default_locale: "en"` + `_locales/{en,zh_CN}/messages.json` with **only** `extName` / `extDescription` messages so the Chrome Web Store listing and browser extensions list localize correctly. `__MSG_*__` references are confined to `manifest.json#name` and `#description`; no other runtime surface uses `chrome.i18n`. `@crxjs/vite-plugin` auto-copies `_locales/` into `dist/`.
- CSP block allows Google Fonts (`fonts.googleapis.com` stylesheet + `fonts.gstatic.com` font files); `script-src 'self'` remains strict per MV3.

**Removed vs original DualRead manifest:** `generativelanguage.googleapis.com` host permission; `default_popup`; `activeTab` (side-panel messaging doesn't need it).

**Added:** `sidePanel`, `downloads` (CSV), `side_panel.default_path`, `background.type: module`, `content_scripts.run_at`, `all_frames: false`, `content_security_policy.extension_pages`.

### Build & Tooling (resolves S2, S3)

**Stack:**
| Layer | Choice | Version |
|---|---|---|
| Language | TypeScript (strict) | 5.7.x |
| UI | React | 19.x |
| Bundler | Vite + `@crxjs/vite-plugin` | Vite 6 / crx 2.0-beta |
| Styling | Native CSS + CSS variables | — (no Tailwind / CSS-in-JS) |
| Node | Node 20 (pinned via `.nvmrc`) | 20.x |

**Source tree:**
```
dualRead/
├── manifest.json              # source manifest, read by @crxjs
├── package.json / tsconfig.*.json / vite.config.ts / .nvmrc
├── src/
│   ├── shared/                # types, message contracts, storage wrapper
│   │   ├── types.ts
│   │   ├── messages.ts
│   │   └── storage.ts
│   ├── background/index.ts    # service worker
│   ├── content/
│   │   ├── index.ts
│   │   └── content.css
│   └── sidepanel/
│       ├── index.html         # <link>s Google Fonts, mounts <App/>
│       ├── main.tsx           # React entrypoint
│       ├── App.tsx            # root: screen state machine
│       ├── state.ts           # useSettings() hook, Screen/Tab unions
│       ├── i18n.ts            # DR_STRINGS<Lang>
│       ├── tokens.ts          # design tokens (mirror of CSS vars)
│       ├── styles.css         # :root CSS variables + component styles
│       ├── components/        # LogoMark, IconBtn, MetaLabel, Toggle, PanelHeader
│       └── screens/           # Welcome, TranslateEmpty, Translate, VocabEmpty, Vocab, Settings
├── icons/                     # 16 / 48 / 128
└── dist/                      # build output → loaded by Chrome (.gitignore)
```

**Scripts:**
- `npm run dev` — Vite dev server with HMR; side-panel hot-reloads on edit
- `npm run build` — `tsc -b && vite build` → `dist/`
- `npm run typecheck` — `tsc -b --noEmit`

**Loading in Chrome:** always point "Load unpacked" at `dist/`, not the project root. Rebuild (or `npm run dev`) regenerates `dist/`.

### Message catalog (runtime messages)

| Message | Sender → Receiver | Payload | Purpose |
|---|---|---|---|
| `SELECTION_CHANGED` | content → background | `{ text, context_sentence, source_url, tab_id }` | User selected text |
| `OPEN_WORD` | content → background | `{ word }` | User clicked a `.dr-hl` |
| `SAVE_WORD` | sidepanel → background | `{ word, original, translation, context_sentence, source_url }` | Save to vocab |
| `DELETE_WORD` | sidepanel → background | `{ word }` | Remove from vocab |
| `TRANSLATE` | sidepanel → background | `{ text }` | Proxy Google Translate call |
| `VOCAB_UPDATED` | background → content (per tab via `chrome.tabs.sendMessage`) | `{ added[], removed[] }` | Trigger matcher rebuild + re-scan |
| `SHOW_SELECTION` | background → sidepanel | `{ text, context_sentence, source_url }` | Side panel focuses Translate tab on selection |
| `FOCUS_WORD` | background → sidepanel | `{ word }` | Side panel opens Vocab tab scrolled to word |

Side-panel state survives tab switches but the *Translate tab preserves the last selection* until a new one arrives (documented per-tab behavior — selection from Tab A stays visible after switching to Tab B; resolved by design, not a bug).

### Chrome-extension correctness notes (MV3 gotchas)

1. **Service-worker scheduling must use `chrome.alarms`.** `setTimeout`/`setInterval` die when the SW is evicted. Write-buffer debounce = 100 ms in-memory (cheap), but any flush scheduled >25 s out must go through `chrome.alarms.create`.
2. **Message targeting is directional.**
   - content → background: `chrome.runtime.sendMessage`
   - sidepanel → background: `chrome.runtime.sendMessage`
   - background → *specific* content tab: `chrome.tabs.sendMessage(tabId, …)`
   - background → sidepanel: `chrome.runtime.sendMessage` (only one listener, routes by `type`)
3. **`VOCAB_UPDATED` fan-out.** On vocab change, iterate open tabs via `chrome.tabs.query({})` and `tabs.sendMessage` each. Per-tab re-scan is also **throttled to 500 ms** to prevent thundering-herd if 20 tabs are open.
4. **`chrome.sidePanel.open()` needs a `tabId`.** Capture `sender.tab.id` from the inbound `SELECTION_CHANGED` / `OPEN_WORD` message; pass it into `open({ tabId })`.
5. **Extension CSP.** Side-panel pages run under MV3 CSP — **no inline scripts, no `eval`**. All UI code is ESM + bundled through Vite (S2/S3 resolved: React 19 + TypeScript, see §3 Build & Tooling and D26).
6. **Content-script orphaning on extension update.** Old content scripts in already-loaded tabs lose their runtime. Detect via port `onDisconnect` or silently degrade — highlights stop updating until tab reload. Accept and document.
7. **`chrome.storage.sync` silent fallback.** If user is signed out of Chrome Sync, `sync` quietly acts like `local` — no cross-device sync, no error. Detect via a heartbeat check and surface in the Sync status indicator (D24).
8. **Quota detection.** Use `chrome.storage.sync.getBytesInUse(null)` + item count via `Object.keys(get(null)).length` for the ≥450-word warning (D25). Check on every successful save.
9. **Highlight CSS isolation.** Host pages can override `.dr-hl` with higher-specificity selectors. Use a unique class prefix plus `all: revert` reset inside the rule, or constrain via `:where()` / `!important` on the decorative properties only. Do not use Shadow DOM — `.dr-hl` must remain selectable by the click handler.
10. **`document.body` guard.** On some pages content script runs before body exists at `document_idle`, but edge cases (rare). Guard: `if (!document.body) await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }))`.
11. **Install / update bootstrap.** In `chrome.runtime.onInstalled`: call `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`, seed default settings if absent, schedule any needed alarms. Idempotent so re-install/update is safe.

---

## 4. Components

### content.js

**Responsibilities:**
- Listen for `mouseup` / `keyup` events, capture text selections of ≥1 character.
- Forward the selection (text + surrounding sentence + page URL) to `background.js` via `chrome.runtime.sendMessage`.
- Run the highlight engine over the page DOM (see §7).
- Subscribe to `chrome.storage.onChanged`; rebuild matcher and re-scan when vocab changes.
- Expose a delegated click handler on `.dr-hl` elements → message to background → open side panel on that word.

**Must NOT:** directly touch `chrome.storage.sync` for writes (to centralize write throttling), talk to Google Translate, or render any full UI in the page.

### background.js

**Responsibilities:**
- Route messages between content script and side panel.
- Proxy Google Translate requests (with rate-limit buffering + error surfacing).
- Manage the **write buffer** (§6) that batches rapid vocab changes before calling `chrome.storage.sync.set`.
- Configure `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` at install.
- Handle side-panel open requests (selection-triggered + click-on-highlight-triggered).

### sidepanel.html / sidepanel.js

**Layout:** tabbed interface — **Translate** (active on selection), **Vocab** (saved words), **Settings**.

- **Translate tab:** shows current selection + translation + "Save" button. Includes the source sentence and a "Go to page" back-link.
- **Vocab tab:** searchable/sortable list of saved words. Each row: original, translation, note field, delete button. "Export CSV" action at top.
- **Settings:** auto-highlight toggle, highlight style (underline / background), UI language (zh-CN / en), "Clear all data" destructive action.

---

## 5. Data Model

### Storage keys (`chrome.storage.sync`)

One entry **per word**, namespaced with `v:` prefix:

```js
"v:running": {
  word:             "running",            // lowercased + trimmed (match key)
  original:         "Running",            // first-seen display form
  translation:      "跑步",                // cached from Google Translate
  context_sentence: "She was running fast.",
  source_url:       "https://example.com/article",
  note:             "",                   // user-editable
  created_at:       1713542400000,        // ms epoch
  updated_at:       1713542400000
}
```

**Settings** — stored in `chrome.storage.local` (D14, device-local in v1):

```js
// chrome.storage.local:
"settings": {
  auto_highlight_enabled: true,
  highlight_style:        "underline",    // "underline" | "background"
  ui_language:            "zh-CN",        // "zh-CN" | "en"
  first_run_completed:    true
}
```

### Why per-word keying

- `chrome.storage.sync` caps at **512 items** and **100 KB total** (8 KB per item).
- Per-word keys give ~500 word capacity. A monolithic vocab object would hit the 100 KB total cap sooner (~200 words) and re-serialize on every edit.
- Independent items = independent Chrome Sync conflict resolution per word (last-write-wins per key, not per entire vocab).

### Quota realism

| Metric | Limit | v1 capacity |
|---|---|---|
| Items | 512 | ~500 saved words |
| Bytes total | 100 KB | Most users stay well below |
| Bytes per item | 8 KB | Plenty; average item ~200 bytes |
| Writes/min | 120 | Handled by write buffer (§6) |
| Writes/hour | 1,800 | Well above normal use |

When a user approaches ~450 words, the Vocab tab surfaces a gentle banner: *"You're close to the 500-word limit. Export your list to CSV and archive older words."*

---

## 6. Sync Model

There is no application-level sync logic. Chrome Sync propagates `chrome.storage.sync` changes across the user's signed-in Chrome installs automatically.

**Write buffer (local-only optimization):**

Because the API caps writes at 120/min and users may save words in bursts (e.g., skimming an article), `background.js` buffers writes:

```
content → "save word" message → background
background:
  append to chrome.storage.local.write_buffer
  schedule flush (100ms debounce, max 1000ms wait)
flush:
  take all pending items from buffer
  single chrome.storage.sync.set({ <many keys> })
  on error: return items to buffer, exponential backoff
```

The buffer persists across service-worker eviction. On SW wake, if buffer non-empty, schedule a flush.

**Conflict handling:** Chrome Sync's last-write-wins per key. Rare in practice for single-user data. Not addressed further in v1.

**Online / offline:** `chrome.storage.sync` transparently queues writes when offline and flushes on reconnect. No custom code needed.

---

## 7. Highlight Engine

The most technically sensitive component. Must be fast, survive SPA re-renders, and never break host pages.

### Approach

DOM-wrap via `TreeWalker` + `MutationObserver`. Rejected: CSS Custom Highlight API (cannot receive per-element click events, which we need for "click word → open in panel").

### Matcher

Built from the vocab key set (`Object.keys(vocab).filter(k => k.startsWith("v:"))`), chunked into regex batches of up to 1,000 words:

```js
const re = /\b(running|cat|important|…)\b/gi;
```

- `\b` word-boundary prevents matching inside larger words (`cat` ≠ `category`).
- `i` flag matches "Running", "RUNNING", etc.
- At 500-word v1 cap, one regex is sufficient.

### Walker

```js
function scan(root) {
  const walker = document.createTreeWalker(
    root, NodeFilter.SHOW_TEXT,
    { acceptNode: node => shouldVisit(node) ? FILTER_ACCEPT : FILTER_REJECT }
  );
  // For each accepted text node, split on matches and wrap.
}

function shouldVisit(textNode) {
  const p = textNode.parentElement;
  if (!p) return false;
  const tag = p.tagName;
  if (EXCLUDED_TAGS.has(tag)) return false;              // SCRIPT, STYLE, TEXTAREA, INPUT, CODE, PRE
  if (p.closest("[contenteditable=true]")) return false;
  if (p.closest(".dr-hl")) return false;                 // already wrapped
  return true;
}
```

### Wrapping

Never use `innerHTML`. Only `document.createElement` + `textNode.splitText`. No XSS vectors.

```html
<span class="dr-hl" data-word="running">Running</span>
```

### MutationObserver

One observer on `document.body`, `subtree: true`, `childList: true`. Debounced 100 ms. On callback, scan **added nodes only**, not the whole document.

### Click handling

Single delegated listener on `document`:

```js
document.addEventListener("click", e => {
  const hl = e.target.closest(".dr-hl");
  if (!hl) return;
  chrome.runtime.sendMessage({ type: "open_word", word: hl.dataset.word });
});
```

### Toggle off

When user disables auto-highlight: disconnect observer, unwrap all existing `.dr-hl` spans (replace with text nodes). No CSS-only hiding — full opt-out = no DOM mutation.

### Default style

```css
.dr-hl {
  border-bottom: 2px dotted #ffa500;
  cursor: pointer;
}
.dr-hl:hover { background: rgba(255, 165, 0, .15); }
```

Color-blind-friendly variant planned for v1.1.

### Performance expectations & risks

- **Typical article (~2,000 text nodes, 500-word vocab):** initial scan 80–120 ms. Acceptable.
- **Heavy SPAs (Twitter/X, YouTube comments):** unverified. **A benchmark milestone is part of Phase 3.** If perf is unacceptable, fallbacks include: viewport-only scanning, further debounce, or disabling highlight on specific domains.

---

## 8. Interaction Flows

### First run

1. User installs extension.
2. Toolbar icon click → side panel opens.
3. Side panel shows **Welcome** screen (zh-CN):
   - Short explanation of the vocab loop
   - CTA: "Try selecting some text on this page"
   - Settings preview: highlight ON, UI language zh-CN
4. Dismiss → Translate tab (empty state: "Select text on any page to begin").

### Save a word

1. User selects text on any page.
2. content.js → background.js → side panel opens (or focuses) on Translate tab.
3. Translate tab shows: selected text + translation + source sentence + "Save" button.
4. Click Save:
   - background.js appends to write buffer; side panel shows "Saved" toast instantly.
   - Within ~100 ms, word appears in Vocab tab and is added to highlight matcher.
5. Content script re-scans the current page; the word is highlighted.

### See a saved word in the wild

1. User on a new page; saved word appears on it.
2. content.js highlights matches on initial scan.
3. User clicks the highlight → side panel opens to Vocab tab, scrolled to that word, edit-ready.

### Export

1. Vocab tab → "Export CSV" button.
2. Browser download: `dualread-vocab-YYYY-MM-DD.csv`.
3. Columns: `word, translation, context_sentence, source_url, note, created_at`.
4. User imports into Anki or their tool of choice.

### Clear data

1. Settings → "Clear all data" → confirm dialog (zh-CN: warns this cannot be undone).
2. `chrome.storage.sync.clear()` + `chrome.storage.local.clear()`.
3. All highlights unwrap across open tabs via storage.onChanged.

---

## 9. Non-Functional Requirements

| Area | Target | Notes |
|---|---|---|
| Selection → panel visible | <200 ms | Cached translations <50 ms |
| Google Translate request | 300–800 ms typical | Shows spinner |
| Highlight initial scan | <120 ms on typical article | Unverified on heavy SPAs — benchmark in Phase 3 |
| Vocab save → highlighted | <500 ms across open tabs | Bounded by storage.onChanged propagation |
| Privacy | Zero server data | Only selected text leaves browser, only to Google Translate |
| Offline | Vocab viewable + editable | Writes queue in buffer; translation requires network |
| Scale | 100–1,000 users; ≤500 words/user | No backend cost |
| Cost | $0/month | No infra at all in v1 |
| Maintenance | Solo dev, best-effort | No SLA |

---

## 10. Risks & Open Questions

### R1 — Google Translate unofficial endpoint (CRITICAL)

The current DualRead uses `translate.googleapis.com` directly. This endpoint is undocumented and outside Google's official ToS. It may be throttled or blocked at any time.

**Plan B:** If the endpoint fails in production,
- Switch to official Google Cloud Translate API with a user-supplied key (same pattern as current Gemini key input).
- Or fall back to DeepL free tier (500k chars/month) with user-supplied key.

**Action:** Document this clearly in the extension's README and settings. Do not market reliability.

### R2 — 500-word practical cap on `chrome.storage.sync`

For most early learners this is generous, but power users will outgrow it. When they do:
- Vocab tab shows a blocking banner at ~450 words.
- User options: export + delete mastered words, or wait for v1.1 migration to Supabase (opt-in cloud account).

**Action:** Build the warning banner in Phase 2. Plan Supabase migration path as a post-v1 item.

### R3 — SPA highlight perf (Twitter/X, YouTube)

Targets are unverified on heavy SPAs.

**Action:** Benchmark milestone in Phase 3 (selection → highlight end-to-end on Twitter/X feed and YouTube comments). If >300 ms sustained, fall back to viewport-only scanning.

### R4 — Last-write-wins on Chrome Sync across devices

Two devices editing the same word's note simultaneously → one note silently overwritten.

**Action:** Accepted for v1 (edge case). Document. Consider a soft "edited on another device at ${time}" hint in v1.1.

### R5 — No observability

No telemetry means silent failures at scale are hard to diagnose. Deliberate per the no-tracking stance.

**Action:** Ship a verbose, user-visible "Sync status" indicator in the Settings tab (synced / offline / error + last event timestamp). Users can copy-paste this into bug reports.

### Open question O1 — Product name

"DualRead" originated as a translator brand. The new product is a vocabulary learning tool. Options:
- Keep DualRead for brand continuity (existing store reviews carry over)
- Rename (e.g., "DualRead Learn" as a sub-brand, or a fresh name)
- **Deferred — not gating v1 implementation.**

### Open question O2 — Highlight accessibility

Dotted-orange underline may be hard to see on orange backgrounds or for some visual impairments.

**Action:** Ship with current default, add alternative styles in v1.1.

### Open architecture questions & Phase-1 spikes

These are design gaps that need a short timeboxed spike during Phase 1 before the rest of the plan solidifies:

- **S1 — Side-panel auto-open from selection gesture.** `chrome.sidePanel.open()` requires a user gesture. The hop `content.js → background.js → sidePanel.open()` may break the gesture chain. Spike: test if mouseup + async message preserves gesture. Fallback if not: user opens panel once via toolbar icon, after which selection just populates it.
- **S2 — UI framework for side panel. ✅ RESOLVED (D26):** React 19 + TypeScript (strict). Rationale: user preference, ecosystem fit for later phases (vocab list virtualization, context providers for settings), and Vite handles the MV3 CSP constraint out of the box.
- **S3 — Build system. ✅ RESOLVED (D26):** Vite 6 + `@crxjs/vite-plugin`. Reads `manifest.json`, emits MV3-correct bundle to `dist/`, HMR for side-panel in dev. Chosen over plain esbuild because `@crxjs` handles service-worker + content-script manifest rewrites, asset hashing, and dev-reload wiring that would otherwise be hand-rolled.
- **S4 — i18n mechanism.** Use Chrome's built-in `_locales/<lang>/messages.json` + `chrome.i18n.getMessage()`. Standard, cache-friendly, zero runtime cost. Confirm no blockers for dynamic language switching (may require page reload for the side panel).
- **S5 — CSV export delivery.** Use `chrome.downloads` API from side panel (Blob URL). Confirm permission requirements — may need `"downloads"` added to manifest.
- **S6 — Cross-tab side-panel state.** Side panel is global by default. Confirm behavior is as described in the message catalog (last selection persists); if Chrome renders per-tab state, adjust.

Spikes must complete before locking Phase 2 start.

**Phase 1 spike resolutions (retrospective):**
- **S1 — side-panel auto-open on selection gesture:** content→background→`sidePanel.open()` does break the user-gesture chain in practice. Adopted fallback: the user opens the panel once via the toolbar icon; subsequent selections live-push via `SHOW_SELECTION`, and the last selection also persists in `chrome.storage.session` so the panel can hydrate if opened later. Not a blocker.
- **S4 — i18n mechanism:** superseded by D27. Runtime `DR_STRINGS` dict is the v1 answer; `_locales` returns in Phase 4 only for Chrome Web Store listing localization.
- **S5 — CSV export:** `chrome.downloads` + Blob URL works from the side panel; `downloads` permission added to the manifest. UTF-8 BOM + CRLF + RFC 4180 quoting in `src/sidepanel/exportCsv.ts` (see D32).
- **S6 — cross-tab side-panel state:** confirmed — the panel is a single global instance. "Last selection persists" per the message catalog is the actual behavior; no code changes needed.

---

## 11. Implementation Roadmap

### Phase 0 — Strip DualRead & migrate to TS+React (DONE)

- Remove Gemini integration, all non-Chinese/English language code, full-page bilingual mode, old popup UI.
- Keep: manifest base, icons, Google Translate call site (moved into `src/background/index.ts`).
- Rebuild side-panel shell from Claude Design handoff: all 6 screens (Welcome / Translate-empty / Translate / Vocab-empty / Vocab / Settings) rendered pixel-accurate in React + CSS variables, with zh-CN + en runtime i18n.
- Migrate to Vite + `@crxjs/vite-plugin` + TypeScript strict. Chrome now loads `dist/`.

### Phase 1 — Side panel shell (DONE)

- `chrome.sidePanel` permission + `src/sidepanel/index.html` wired.
- `setPanelBehavior({ openPanelOnActionClick: true })` set on install.
- Translate / Vocab / Settings tabs render from React components with zh-CN + en runtime i18n.
- Content script (`src/content/index.ts`): `mouseup` listener dedupes via `lastSent`, extracts context sentence from closest block element, sends `SELECTION_CHANGED`.
- Background (`src/background/index.ts`): Google Translate proxy with `chrome.storage.session` cache + classified error codes (`network` / `rate_limit` / `http_<n>` / `parse`) → side panel maps to i18n strings.
- `useSelection` hook hydrates from `SESSION_KEY_LATEST_SELECTION` (late-open path) and subscribes to `SHOW_SELECTION` (live path); monotonic token guards against stale async results.

### Phase 2 — Vocab storage (DONE)

- Per-word keys `v:<word_key>` in `chrome.storage.sync` per §5.
- Write buffer in `src/background/vocab.ts`: in-memory `{ sets, deletes }` mirrored to `chrome.storage.local.write_buffer` (survives SW eviction), 100 ms debounced flush, snapshot-based rollback + 2 s retry on failure.
- Messages wired: `SAVE_WORD` / `DELETE_WORD` / `GET_VOCAB` / `CLEAR_DATA` / `VOCAB_UPDATED` (broadcast after every successful flush).
- Side panel:
  - `useVocab` hook — optimistic save/remove, refresh on `VOCAB_UPDATED`, exposes `lastSyncedAt`.
  - Vocab tab — live search (word / zh / note), Recent ↔ A→Z sort toggle, expand-to-edit rows, inline note textarea (Cmd+Enter commit / blur commit / Esc cancel), Delete.
  - Translate tab Save button shows `saved` state when the selection's `word_key` already exists; re-Save preserves `created_at` + existing `note` (acts as "refresh translation / context").
  - Quota banner surfaces at `≥450` words (`VOCAB_QUOTA_WARN_AT`).
  - CSV export via `chrome.downloads` + Blob URL with UTF-8 BOM; RFC 4180 escaping; columns: `word, translation, context, note, source_url, created_at`.
  - Settings "Last synced" line shows real `HH:MM` from `last_synced_at` and live item count.
  - Clear-all-data routes through `CLEAR_DATA`: clears vocab → local → session → re-seeds default settings.
- Project guideline file `CLAUDE.md` added: commenting policy (write comments, explain *why*), tech-stack summary, storage layer map, build commands.

### Phase 3 — Highlight engine (DONE except benchmark)

- `src/content/highlight.ts` — factory `createHighlighter()` exposing `setVocab / setEnabled / setStyle / dispose`.
  - Matcher: `\b(w1|w2|…)\b` case-insensitive, built from the vocab key set; longest-first alternation as defensive insurance for future multi-word entries.
  - TreeWalker scan rejects `SCRIPT / STYLE / NOSCRIPT / TEXTAREA / INPUT / SELECT / OPTION / CODE / PRE / KBD / SAMP / IFRAME / OBJECT / EMBED`, any `[contenteditable]` ancestor, and any existing `.dr-hl` ancestor (no re-wrapping).
  - Wrap path uses `createElement` + `splitText` + `textContent` only — never `innerHTML`. Span shape: `<span class="dr-hl" data-word="<lowercased key>">Match</span>`.
  - Unwrap path replaces spans with text nodes and `normalize()`s each touched parent so the DOM looks like we were never there.
  - MutationObserver on `document.body` (`childList + subtree`), 100 ms debounce, rescans *added subtrees only*. Our own inserted `.dr-hl` spans are filtered at enqueue time so we don't recurse into our own mutations.
  - Vocab-rebuild throttle: leading-edge drain + trailing drain with `REBUILD_THROTTLE_MS = 500` (§3 #3 thundering-herd mitigation).
  - Style variant keyed off `<html data-dr-hl-style="underline|background">` — one DOM write per flip, survives SPA navigation.
  - Single capture-phase `document.click` delegate. On `.dr-hl`, `preventDefault + stopPropagation`, sends `OPEN_WORD { word }` to the background (D21).
- `src/content/index.ts` — orchestrator. Reads settings + vocab keys directly from `chrome.storage.{local,sync}` on boot (keeps SW asleep on page load), applies them to the highlighter, then subscribes to `chrome.storage.onChanged`:
  - `sync` area, any `v:*` key → re-read keys and `setVocab(next)`.
  - `local` area, `settings` → `setStyle(next) + setEnabled(next.auto_highlight_enabled)`.
- `src/content/content.css` — `:root { --dr-hl-color / --dr-hl-soft / --dr-hl-ink }` mirrors the panel accent token. Underline = dotted 2 px orange; Background = soft orange chip with 2 px padding compensated by −1 px margin. `box-decoration-break: clone` keeps multi-line highlights visually whole. `:focus-visible` outline for keyboard users.
- Click-to-open-in-panel flow:
  - New message `FOCUS_WORD { word_key }` (background → sidepanel).
  - New session key `SESSION_KEY_PENDING_FOCUS` in `src/shared/messages.ts`.
  - Background `handleOpenWord(word, tabId)` (D34):
    1. Stash `word_key` in `chrome.storage.session` (late-open path).
    2. Try `chrome.sidePanel.open({ tabId })` — swallows gesture-loss errors (spike S1).
    3. Broadcast `FOCUS_WORD` for any already-open panel (live path).
  - Side panel `useFocusWord()` hook: reads+clears the session key on mount, subscribes to `FOCUS_WORD`, exposes `{ focusedKey, focusTick, clear }`. `focusTick` bumps on every set so re-clicking the same highlight re-triggers scroll-into-view even with an unchanged key.
  - `App.tsx` watches `(focusedKey, focusTick)` → sets `userTab = "vocab"` and `screen = "vocab"` (overrides the selection-driven auto-switch).
  - `Vocab.tsx` accepts `focusedKey` + `focusTick`: expands the row, drops the search query if it would hide the row, and `scrollIntoView({ block: "center", behavior: "smooth" })` after one `requestAnimationFrame` so the row has laid out with its focused styling.
- Toggle on/off: already wired in Settings (`auto_highlight_enabled` → `chrome.storage.local`); orchestrator's `storage.onChanged` listener propagates to `setEnabled()`, which disconnects the observer and unwraps every existing `.dr-hl` (full DOM opt-out per §7).
- Open items:
  - **Benchmark** on real SPAs (Twitter/X feed, YouTube comments) is still pending per R3. If `scanAll` >300 ms sustained, fall back to viewport-only scanning before Phase 4.

### Phase 4 — Polish & release (code-complete; pending manual verification + submission)

**Shipped (in-repo):**
- **First-run welcome** — `Welcome` screen routed when `settings.first_run_completed === false`. `onStart` / `onSkipToSettings` flip the flag; `CLEAR_DATA` re-seeds `DEFAULT_SETTINGS` so a wipe restarts the welcome flow.
- **Sync-status indicator** — `useSyncStatus()` hook derives a 4-state signal (`synced` / `syncing` / `offline` / `error`) from `navigator.onLine`, `LOCAL_KEY_WRITE_BUFFER` (pending count), and `LOCAL_KEY_LAST_ERROR`. Precedence: `offline > error > syncing > synced`. Settings screen shows dot + label + detail line (raw error code copyable for bug reports — R5).
- **Sync-error plumbing** — `src/background/vocab.ts` success path bumps `LOCAL_KEY_LAST_SYNCED` and clears `LOCAL_KEY_LAST_ERROR`; failure path preserves the *first* error's timestamp (`existing ?? record`) and always broadcasts `VOCAB_UPDATED` so the panel recomputes even when sync storage didn't change.
- **Clear-all-data** — `CLEAR_DATA` in `src/background/index.ts`: clears vocab (which also drops `LOCAL_KEY_LAST_ERROR`, write buffer, last-synced) → `chrome.storage.local.clear()` → `chrome.storage.session.clear()` → re-seeds default settings. Panel then hard-reloads via `window.location.reload()` so no stale React state leaks across the wipe.
- **README + privacy policy** — `README.md` and `privacy-policy.html` rewritten for the v2 vocabulary-learner product (dropped all Gemini/translator copy). `store-listing.md` carries the Chrome Web Store copy.
- **Store-listing i18n (D27 reopen)** — `manifest.json` uses `default_locale: "en"` and `__MSG_extName__` / `__MSG_extDescription__`; `_locales/{en,zh_CN}/messages.json` provide the two entries. `@crxjs/vite-plugin` auto-copies `_locales/` into `dist/`. Confined to store-visible fields only — no other runtime surface uses `chrome.i18n`.

**Refactor pass (before release):**
- Deleted `src/shared/storage.ts`; `DEFAULT_SETTINGS` moved to `src/shared/types.ts`. `useSettings` inlined the 1-line storage get/set.
- `useVocab` no longer tracks `lastSyncedAt` — `useSyncStatus` owns it. One source of truth for sync metadata.
- Dropped unused `online` from `SyncStatus` public shape (internal state still drives `deriveState`).

**Still pending — manual-only:**
- **R3 benchmark** — §9 budget says `scanAll` must stay <120 ms on a typical article and <300 ms sustained on heavy SPAs. Must be measured in Chrome on Twitter/X feed and YouTube comments. Fallback if busted: viewport-only scanning (IntersectionObserver-gated) or domain deny-list.
- **Store screenshots** — `store-listing.md` §Screenshots lists the five shots required (welcome / translate / vocab / highlighted page / settings).
- **Chrome Web Store submission** — developer dashboard upload of the `dist/` zip, privacy-policy URL, screenshots, listing copy. Happens outside the repo.

**v1.1 candidates (not in v1):**
- AI tutor tab (Gemini with user-supplied key)
- Anki `.apkg` export
- Right-click "unhighlight this word" context menu
- Opt-in Supabase sync for users above 500-word cap
- Color-blind-friendly highlight styles

---

## 12. Decision Log

| # | Decision | Alternatives | Rationale |
|---|---|---|---|
| D1 | Pivot DualRead entirely into a learning tool | Evolve as sibling / hybrid popup switch | Clearer positioning; translation becomes a utility sub-feature |
| D2 | Unified panel with tabs (Translate / Vocab) | Word-centric, smart-dispatch, hover preview | Most flexible; matches side-panel UX |
| D3 | Auto-highlight user-toggled, **ON by default** | Always on / always off / off by default | Feature is "armed" immediately but dormant until first save |
| D4 | User-marked unknowns | Frequency-based / inverse-of-known | User owns the list explicitly; predictable behavior |
| D5 | List + CSV export, no built-in SRS | Full SRS / minimal review / Anki-first | YAGNI; Anki is the best flashcard tool, ship integration later |
| D6 | AI tutor deferred to v1.1 | Ship simultaneously | MVP validation first; reduces Gemini-key friction |
| D7 | CN↔EN only, strip 10 other languages | Keep multi-language | Focus; smaller surface area; target is Chinese learners |
| D8 | Cut full-page bilingual mode | Keep as utility | Simplifies v1; little signal it's essential for learners |
| D9 | Chrome Side Panel API replaces popup | Popup + tooltip / iframe injection | Matches modern AI-extension UX; no CSS conflicts with host pages |
| D10 | No floating tooltip; all selection UI in side panel | Tooltip + side panel hybrid | Simpler content script; no CSS fights |
| D11 | `chrome.storage.sync` for vocab (not Supabase) **— revised** | Supabase cloud backend | Reviewer flagged free-tier capacity + backend overhead unjustified for list-only data at v1 scale. ~500-word cap accepted |
| D12 | No auth, no accounts in v1 **— revised** | Google OAuth + email OTP via Supabase | Follows from D11; zero infra, zero friction. Auth returns in v1.1 only if opt-in Supabase migration ships |
| D13 | Per-word keys (`v:<word>`) in storage.sync | Single monolithic vocab object | Fits more words before hitting 100 KB total cap; per-key conflict resolution |
| D14 | Settings local-only in v1 | Cross-device settings sync | YAGNI; settings rarely change |
| D15 | Word key = lowercased + trimmed; `original` preserves display | Case-sensitive matching | Enables case-insensitive highlight match |
| D16 | Write buffer in `chrome.storage.local`, debounce 100 ms | Direct write per save | Protects against 120 writes/min sync rate limit |
| D17 | Google Translate anonymous (no auth) for translation | Gate behind sign-in | Lowers friction; matches privacy story |
| D18 | DOM-wrap highlighting | CSS Custom Highlight API | Need per-element click events |
| D19 | Regex matcher, chunked if vocab >1,000 words | Trie / Aho-Corasick | Simpler; adequate at v1 scale |
| D20 | v1 skips Shadow DOM + iframes | Universal coverage | Compat nightmare; YAGNI |
| D21 | Click highlight → open side panel on that word | Inline edit / context menu | Keeps all interaction in the panel |
| D22 | UI default language = Simplified Chinese | English default | Target user is Chinese speakers |
| D23 | CSV export only in v1; Anki `.apkg` in v1.1 | Ship `.apkg` now | sql.js adds ~1 MB to bundle; YAGNI |
| D24 | Sync status indicator in settings | Silent sync | Mitigates no-telemetry blind spot |
| D25 | Quota warning banner at ~450 words | Hard cap with no warning | Gives user runway to export |
| D26 | TypeScript (strict) + React 19 + Vite 6 + `@crxjs/vite-plugin` | Vanilla JS / Preact / Lit / esbuild-only / webpack | User preference; `@crxjs` handles MV3 manifest rewriting + HMR that plain esbuild would require hand-rolling; React ecosystem pays off once vocab list, edit dialogs, and context providers land. Cost: ~67 KB gzipped React runtime — acceptable for a side-panel, not shipped to content pages |
| D27 | Runtime `DR_STRINGS<Lang>` dict for UI copy; `_locales/{en,zh_CN}/messages.json` scoped to store-visible manifest fields only (`extName`, `extDescription`) | `chrome.i18n.getMessage()` everywhere with `_locales/` as the single source of truth | Instant language toggle without page reload; simpler for a 2-language product. Phase 4 closed the reopen: `manifest.json` uses `__MSG_extName__` / `__MSG_extDescription__` with `default_locale: "en"` so Chrome Web Store localizes the listing, while all in-panel copy stays in `DR_STRINGS` |
| D28 | Native CSS + CSS variables (`:root { --dr-*: ... }`) mirror `tokens.ts` | Tailwind / CSS Modules / vanilla-extract / CSS-in-JS | Preserves the exact palette handed off from Claude Design; CSS vars let runtime theme tweaks happen without a rebuild; small surface (one `styles.css`) doesn't justify build-time CSS tooling |
| D29 | Write buffer: in-memory `{ sets, deletes }` + `chrome.storage.local` mirror; snapshot-rollback on flush failure, 2 s retry | Direct per-write to sync / fire-and-forget buffer | Snapshot isolation lets concurrent saves during flight land in a fresh pending bucket without data loss; mirroring to local survives SW eviction; rollback-into-pending (not lose) on failure is the only safe behavior for user-written data |
| D30 | `VOCAB_UPDATED` broadcast on every flush + on `CLEAR_DATA` | Side-panel polls `GET_VOCAB` on focus | Broadcasts let any number of panel instances (including future multi-window) stay coherent cheaply; `.catch()` is acceptable since "no listener" is the common case |
| D31 | Save on already-saved word = refresh translation/context, preserve `created_at` + `note` | Reject / show confirmation | Users re-encountering a word often have a better context sentence now; overwriting `updated_at` while keeping `created_at` mirrors Chrome Sync's per-key last-write-wins and keeps the note safe |
| D32 | CSV export: CRLF + UTF-8 BOM, RFC 4180 quoting | LF-only / no BOM | Excel on Windows mojibakes `zh` column without BOM; CRLF is the RFC 4180 norm; stable column order enables Anki template authoring |
| D33 | Project-level commenting policy: write comments, explain *why* | Default Claude "no comments unless non-obvious" | User preference for this project; captured in `CLAUDE.md` so future sessions inherit the rule |
| D34 | Highlight click → `OPEN_WORD` → background writes `SESSION_KEY_PENDING_FOCUS` + tries `sidePanel.open({ tabId })` + broadcasts `FOCUS_WORD` | Single live-only `chrome.tabs.sendMessage` to panel / direct `sidePanel.open` from content | Content scripts can't call `sidePanel.open` (no access). Spike S1 confirmed gesture loss over async hops, so the session-key stash is the only reliable late-open path; the broadcast handles the already-open case; the `sidePanel.open` attempt handles the still-warm-gesture case. Three paths, one intent |
| D35 | Highlight variant keyed off `<html data-dr-hl-style>` attribute, not per-span class | Per-span `.dr-hl--underline` / `.dr-hl--background` class | One DOM write flips every span; survives SPA navigation without rewriting inserted markup; keeps the wrap path's hot loop branch-free |
| D36 | Vocab-rebuild throttle is leading-edge + trailing drain (500 ms), MO flush is pure trailing-edge debounce (100 ms) | One uniform debounce for both | First paint of highlights must be immediate when a page loads (user just opened a page, expects to see their words now); subsequent bursts from `VOCAB_UPDATED` fanout across 20 tabs must coalesce to one scan. MO mutations are always already-debounceable by their nature (host-page burst writes) so trailing-only is correct there |
| D37 | Highlight click does `preventDefault + stopPropagation` on the click | Let the host handler run alongside ours | User clicked a decorated word, not a link. Opening the panel is the unambiguous intent (D21); letting a containing `<a>` navigate away on the same gesture is worse than letting the panel open |

---

## Appendix A — Multi-Agent Review Disposition

This design has been reviewed by Skeptic, Constraint Guardian, and User Advocate roles and integrated by the Arbiter. The findings that drove design changes (vs. the pre-review draft) were:

- **Critical:** Supabase free-tier capacity math did not hold at stated scale → revised to `chrome.storage.sync` (D11, D12)
- **Critical:** `chrome.storage.local` monolithic writes were a perf trap → per-word keys (D13)
- **Critical:** UI language must default to Simplified Chinese (D22)
- **Critical:** Google Translate unofficial endpoint is a latent risk → Plan B documented (R1)
- **Worth addressing:** SPA highlight perf unverified → Phase 3 benchmark (R3)
- **Worth addressing:** Quota approach needs a warning UX → D25
- **Worth addressing:** Observability gap → sync status indicator (D24)

Final disposition: **APPROVED WITH REVISIONS APPLIED**.

---

*End of design document.*
