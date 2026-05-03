# DualRead Architecture

Snapshot of the current codebase plus the agreed-upon target shape for the data-layer / i18n / translation-direction work tracked in `docs/feature-status.md`. Single Chrome MV3 extension, zero servers, BYO Chrome Sync. Scope: select text → translate → save to vocab → auto-highlight every recurrence on every page → export to CSV.

> Source-of-truth is the manifest + `src/` tree. README is the user-facing intro; `CLAUDE.md` records the post-2026-04-28 scope correction (no backend, no RAG, no agent). This document is the current "how the parts fit" reference and tracks the decisions that govern the next iteration.

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
            │                                              • schema migration    │
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

| Runtime        | File entry                | Lifetime                      | Owns                                                                       |
| -------------- | ------------------------- | ----------------------------- | -------------------------------------------------------------------------- |
| Content script | `src/content/index.ts`    | Per tab, document_idle        | DOM mutation, selection events, highlights, in-page bubble, FAB            |
| Background SW  | `src/background/index.ts` | Module SW, evicted on idle    | Network IO, storage writes, message routing, schema migration              |
| Side panel     | `src/sidepanel/main.tsx`  | Open while user keeps it open | All UI; reads/writes go through messages                                   |

Rule of thumb: **only the service worker touches the network**. Content script forwards everything. Side panel goes through the SW too — so rate limiting, error normalisation, caching, and migration live in one place.

---

## 2. Source layout

```
DualRead/
├── manifest.json                # source manifest (static)
├── package.json                 # vite 6 + react 19 + @crxjs/vite-plugin
├── vite.config.ts / tsconfig.*
├── icons/                       # 16 / 48 / 128
├── _locales/{en,zh_CN,ja,fr}/messages.json   # extName / extDescription per locale
├── src/
│   ├── shared/                  # cross-runtime contracts (no chrome.* imports)
│   │   ├── types.ts             # Settings, VocabWord, SelectionPayload, SYNC_VALUE_MAX_BYTES, CURRENT_SCHEMA_VERSION
│   │   ├── messages.ts          # Message union, sendMessage, storage keys
│   │   ├── highlightable.ts     # isHighlightable() predicate
│   │   ├── highlightable.test.ts
│   │   ├── migration.ts         # pure migrate(record, settings) → record (no chrome.*)
│   │   └── migration.test.ts    # vitest matrix — see §14
│   ├── background/
│   │   ├── index.ts             # install + cold-start schema check + message router
│   │   ├── translate.ts         # Google Translate proxy + session cache
│   │   └── vocab.ts             # write buffer (debounce + retry + lock-aware)
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
│       ├── index.html           # mounts #root
│       ├── main.tsx             # React entrypoint
│       ├── App.tsx              # screen state machine
│       ├── state.ts             # useSettings hook, Screen / Tab unions
│       ├── i18n.ts              # DR_STRINGS<Lang> dict — 4 locales
│       ├── tokens.ts            # design tokens (mirror of :root CSS vars)
│       ├── styles.css           # @font-face for self-hosted Noto Sans JP
│       ├── fonts/               # Noto Sans JP woff2 + LICENSE.txt (SIL OFL 1.1)
│       ├── components/          # LogoMark, MetaLabel, PanelHeader, Toggle
│       ├── screens/             # Welcome (4-lang grid), Translate{,Empty}, Vocab{,Empty}, Settings
│       ├── exportCsv.ts         # RFC4180 CSV + chrome.downloads
│       ├── useSelection.ts      # current selection + translation
│       ├── useVocab.ts          # mirrored vocab list, optimistic mutations
│       ├── useFocusWord.ts      # highlight-click → "jump to word"
│       └── useSyncStatus.ts     # 4-state sync indicator
└── dist/                        # @crxjs build output, loaded by Chrome (gitignored)
```

`shared/` is the single dependency anyone is allowed to import across runtimes — it contains no `chrome.*` calls and no React. `migration.ts` is deliberately pure: it takes a record and a `Settings` object, returns a new record. The SW handles storage IO and the lock; the migration logic itself is unit-testable in isolation.

---

## 3. Storage split (authoritative)

| Store                    | Keys                                                                                              | Purpose                                            | Why this store                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `chrome.storage.sync`    | `v:<word_key>` (one per saved word)                                                               | The vocab list                                     | Free cross-device sync via the user's Chrome account; ~500-word headroom under the 100 KB cap |
| `chrome.storage.local`   | `settings`, `write_buffer`, `last_synced_at`, `last_sync_error`, `schema_version`, `migration_lock` | Device-local config + sync metadata + migration state | Larger quota, no cross-device write contention; migration state must be device-local          |
| `chrome.storage.session` | `t:<source>:<target>:<text>`, `latest_selection`, `pending_focus_word`                            | Translation cache + cross-runtime intents          | Wiped on browser restart; perfect for ephemeral state                                         |

Last-write-wins is per-key — that's why each saved word gets its own `v:` key instead of one big array. The write buffer is the SW's defence against the ~120 writes/min sync quota; it absorbs bursts, mirrors itself into `local` for SW-eviction safety, and on failure rolls the snapshot back onto pending and retries.

**Single-value size limit on `sync` is ~8 KB.** A single oversize value rejects the whole `set(batch)` call, which would poison every word in the same flush. Enforcement lives in two layers — see §14 size discipline.

---

## 4. Data model (shared/types.ts)

```ts
type Lang = "zh-CN" | "en" | "ja" | "fr";
type HighlightStyle = "underline" | "background";

interface Settings {
  auto_highlight_enabled: boolean;
  highlight_style: HighlightStyle;
  ui_language: Lang;
  first_run_completed: boolean;
  learning_mode_enabled: boolean;
  fab_disabled_origins: string[];
}

interface VocabWord {
  word: string;          // display form, original casing
  word_key: string;      // canonical: trimmed + lowercased — matching identity
  translation: string;   // canonical translation; the only field readers consume
  source_lang?: Lang;    // language detected/declared at save time (historical metadata)
  target_lang?: Lang;    // ui_language at save time (historical metadata)
  ctx?: string;          // surrounding sentence at save-time
  source_url?: string;
  created_at: number;
  updated_at: number;
  schema_version: 2;     // bumped when shape changes; migration uses it as the resume marker
}

interface SelectionPayload {
  text: string;
  context_sentence: string;
  source_url: string;
}

interface TranslateResult {
  translated: string;
  detectedLang: Lang;
  alreadyInLang?: true;  // set when detectedLang matches the request's target_lang
}
```

Notes:

- `word_key` is the matching identity everywhere — storage keys, highlight regex inputs, focus messages. Display form is preserved for the UI but never used for equality.
- `Lang` was previously `"zh-CN" | "en"` and `Settings.level: "A2" | "B1" | "B2" | "C1"` was required. Both changed: see decisions D7 and D8.
- `VocabWord.translation` is the **single source of truth** for the saved meaning. Pre-migration records carried `zh` / `en` fields; migration writes `translation` and **removes** the legacy fields. Readers MUST NOT touch `zh` / `en` (D8).
- `source_lang` / `target_lang` are **historical metadata only**. Translate-time target is `Settings.ui_language`; source is always `"auto"` (Google detects it).
- `DEFAULT_SETTINGS` no longer carries `level`. Old storage objects that still contain a `level` field are tolerated on read; the next write strips the field (D18).

Cross-runtime constants live in `shared/types.ts`:

```ts
export const SYNC_VALUE_MAX_BYTES = 7800;       // ~8 KB cap minus safety margin
export const CURRENT_SCHEMA_VERSION = 2 as const;
```

The SW's write buffer and the side panel's optimistic-save path both consume `SYNC_VALUE_MAX_BYTES` (§14). `CURRENT_SCHEMA_VERSION` is the single source of truth for the version literal — `runMigrationIfNeeded()`, the cold-start `init()`, and `CLEAR_DATA` all read it.

> **Schema-version literal as explicit tech debt.** `VocabWord.schema_version: 2` is a literal type, not a `number`. Bumping to v3 means changing the type literal to `2 | 3`, adding a branch in `migrateRecord`, and recompiling every consumer. This is intentional: the type system forces every reader to acknowledge the version on the next bump. Not an accident, not a refactor target.

---

## 5. Message catalog (shared/messages.ts)

| Message               | Sender → Receiver        | Payload                                              | Purpose                                        |
| --------------------- | ------------------------ | ---------------------------------------------------- | ---------------------------------------------- |
| `TRANSLATE_REQUEST`   | sidepanel \| bubble → SW | `text, source_lang?, target_lang?, requester?`       | Single RPC for translation; cache-first        |
| `SELECTION_CHANGED`   | content → SW             | `SelectionPayload`                                   | Fire-and-forget; SW persists + relays to panel |
| `SHOW_SELECTION`      | SW → sidepanel           | `SelectionPayload`                                   | Live push when panel is open                   |
| `FOCUS_WORD_IN_VOCAB` | content → SW             | `word_key`                                           | "Open details" link in the bubble              |
| `FOCUS_WORD`          | SW → sidepanel           | `word_key`                                           | Panel opens Vocab tab scrolled to that word    |
| `SAVE_WORD`           | sidepanel \| bubble → SW | `VocabWord`                                          | Routed through the write buffer; size-checked  |
| `DELETE_WORD`         | sidepanel \| bubble → SW | `word_key`                                           | Same                                           |
| `GET_VOCAB`           | sidepanel → SW           | —                                                    | Initial hydrate; flushes pending first         |
| `CLEAR_DATA`          | sidepanel → SW           | —                                                    | Settings → wipe; resets to first-run; reseeds `schema_version` |
| `VOCAB_UPDATED`       | SW → broadcast           | —                                                    | All panels and content scripts re-pull         |

`MessageResponse = { ok: true, data? } | { ok: false, error, warning? }`. The `warning` channel surfaces non-fatal events such as ctx truncation or schema downgrade hints (§14). `chrome.runtime.sendMessage` is always wrapped by `sendMessage()` in `shared/messages.ts` — that helper translates the callback API + `chrome.runtime.lastError` into a Promise.

`TRANSLATE_REQUEST` callers pass `target = Settings.ui_language`; `source` is always `"auto"` so Google Translate detects the input language. The SW's response carries `alreadyInLang: true` when the detected language matches `target`; the bubble paints the `alreadyInLang` state from this signal (D10).

### Cross-runtime intent stash (session storage)

`SESSION_KEY_PENDING_FOCUS = "pending_focus_word"` carries a click intent across the gesture gap when `chrome.sidePanel.open()` has to run _before_ the panel mounts a `FOCUS_WORD` listener. The SW writes the key and tries `sidePanel.open()`; the panel reads + clears it on mount.

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

The matcher is **schema-version agnostic** — it only consumes `word_key`, which exists in every shape. Schema migrations do not require highlight-engine changes.

---

## 7. In-page bubble + click-to-translate

- `bubble.ts` is **vanilla DOM in a closed Shadow root**, attached to `<html>` (not `<body>`, which hostile pages may rewrite). React would inject ~140 KB into every host page for a ~200-line widget — not worth it.
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
  9. `caretRangeFromPoint` must land on a word in a known script
- A **monotonic token** guards against stale `TRANSLATE_RESULT` repaints: click A → click B during the network round-trip, A's late response must not paint over B.
- A **single global instance** — rapid clicks replace content in-place rather than stacking bubbles.

The drag-selection path uses `wordBoundary.ts`'s `Intl.Segmenter` (locale-aware, `granularity: "word"`) to expand half-selected ranges to whole words.

### BubbleState evolution

The bubble's state machine:

```ts
type BubbleState =
  | { kind: "loading"; word: string }
  | { kind: "translated"; word: string; translation: string; saved: boolean; showDeleteButton?: boolean }
  | { kind: "alreadyInLang"; word: string; targetLangName: string }
  | { kind: "error"; word: string; message: string };
```

Hover-on-saved and click-on-saved both render the `translated` variant with `saved: true` and a single delete affordance — the same surface, the same buttons. Only the dismiss timer differs (orchestrator-side): hover bubbles auto-hide after the cursor leaves both the highlight and the bubble itself; click bubbles stay until outside-click / ESC / scroll.

The `alreadyInLang` state appears when the SW response carries `alreadyInLang: true` (Google's detected language matches the request's `target`); it offers a "translate anyway" override that re-issues the flow with `force: true`.

---

## 8. Side-panel state model

`App.tsx` is a screen state machine driven by three derived signals:

- `settings.first_run_completed` → Welcome vs. main flow
- The active tab (`translate` | `vocab` | `settings`)
- Whether each tab has content (`Translate` vs. `TranslateEmpty`, `Vocab` vs. `VocabEmpty`)

Hooks:

| Hook                   | Owns                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| `useSettings`          | Hydrate + optimistic update of `chrome.storage.local["settings"]`; strips legacy `level` and `translation_direction` on read |
| `useSelection(target)` | Latest selection + its translation; exposes `epoch` counter that increments only on a new selection event |
| `useVocab`             | Mirrored word list; optimistic save/remove/clear; reconciles on `VOCAB_UPDATED`; size-check at ingress |
| `useFocusWord`         | Late-open + live-push paths for "jump to this word"                                                   |
| `useSyncStatus`        | Pure reducer over `online + write_buffer + last_sync_error` → `synced \| syncing \| offline \| error` |

A fresh selection always forces the Translate tab — the side-panel root effect depends on `selection.epoch`, not `selection.data`, so retranslation triggered by a UI-language change does not yank the user off Settings or Vocab. Last selection is preserved across tab switches until a new one arrives.

`level` (the former CEFR field) is removed from `Settings`. Four consumers historically wrote or merged it; only one needs runtime cleanup:

- `useSettings` (panel hydrate + optimistic write) — `delete merged.level` before writing to `chrome.storage.local["settings"]`. This is the lazy strip path (D18).
- Content-script settings loader — merges from `DEFAULT_SETTINGS` which no longer contains `level`; old storage values flow through unchanged but are never written back from this path.
- Background `onInstalled` install seed — seeds `DEFAULT_SETTINGS` only; cannot reintroduce `level`.
- Background `CLEAR_DATA` re-seed — same.

Old storage objects retaining `level` are tolerated on read (the field falls off the typed `Settings` shape silently); the next user-driven settings change cleans it up via `useSettings`.

The Welcome screen is a **language-selection grid** (zh-CN / en / ja / fr). The previous CEFR level grid (A2/B1/B2/C1) is removed. Translation target follows `ui_language` directly — there is no separate direction setting.

i18n is the **`DR_STRINGS<Lang>` dict in `i18n.ts`**, not `chrome.i18n`. `_locales/` carries only `extName` / `extDescription` per locale so the Web Store listing localises; everything else is runtime-driven so the user's UI-language toggle takes effect without an extension reload.

---

## 9. Service-worker discipline

- **Module SW** (`background.type: "module"`). Top-level imports are fine; module-scope state is not — it's gone the next time the SW wakes. Anything important must round-trip through `chrome.storage.*`.
- **Cold-start hook.** Every SW wake calls a small `init()` that reads `local["schema_version"]` and, if behind, takes the migration lock and runs the migrate path. This is the dual-track partner of `onInstalled("update")` — `onInstalled` covers update events at install time, the cold-start check covers any case where `onInstalled` was missed (race against eviction, multi-version jumps, etc.). See §14.
- **`migrationReady` promise — the listener-vs-init ordering contract.** `chrome.runtime.onMessage.addListener` is registered at module top (must be — otherwise the first message after a wake is dropped). `init()` runs concurrently and resolves a module-scope `migrationReady` promise when the migration check finishes (no-op resolve when no migration was needed). **Every storage-touching message handler awaits `migrationReady` as its first line** (`SAVE_WORD`, `DELETE_WORD`, `CLEAR_DATA`, `GET_VOCAB` — `GET_VOCAB` is a read but must wait or it would return v1-shaped data). Pure passthroughs that never touch vocab storage (`TRANSLATE_REQUEST`) do not await. This keeps the listener registered for delivery while gating actual storage access until migration is done. **Time-budget invariant: migration must finish in ≤ 5 s.** Chrome's message reply timeout (~30 s) and the user's perception of "save button hung" both bound this. Exceeding 5 s is a design bug requiring batched migration, not a tolerable state.
- **The vocab write buffer** mirrors itself into `chrome.storage.local` before each scheduled flush; on cold wake it `hydrate()`s back. The handler-level `await migrationReady` is the **primary gate** — no `SAVE_WORD` / `DELETE_WORD` reaches `vocab.ts` during the lock window. The buffer's `flush()` is also gated on the lock as **defense in depth**: future code paths that bypass the message router (e.g. background-initiated writes during migration itself) must still not flush partial-schema data. The buffer's `hydrated` boolean is the contract; concurrent `hydrate()` calls during `init()` and a first `SAVE_WORD` are guarded inside `vocab.ts`, not at the architecture layer.
- **`chrome.runtime.onSuspend`** awaits a final `flushBuffer()` plus a lock release on a clean exit. This is **best-effort, not a correctness guarantee**: `onSuspend` has a ~5 s budget, may be skipped on hard kill, and runs after the SW is told to wind down. The cold-start `init()` is the actual safety net.
- **Translation cache is in `chrome.storage.session`** — process-independent, survives SW eviction within a browser session. The cache key includes both source and target language to prevent cross-direction hits (§3).
- **Error taxonomy** from `translate.ts`: `"network" | "rate_limit" | "parse" | "http_<n>"`. Side panel collapses to a small set of i18n buckets; verbose code is preserved in `last_sync_error` for bug reports.

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

Noto Sans JP is bundled under `src/sidepanel/fonts/` and loaded via `@font-face` in `styles.css`. The SIL OFL 1.1 license text lives at `src/sidepanel/fonts/LICENSE.txt`; CWS reviews check this path.

---

## 11. Manifest surface

- `manifest_version: 3`
- `permissions`: `storage`, `sidePanel`, `downloads`
- `host_permissions`: `https://translate.googleapis.com/*` (only)
- `side_panel.default_path`: `src/sidepanel/index.html` (rewritten to bundled path by crxjs)
- `background.service_worker`: `src/background/index.ts` (rewritten)
- `content_scripts`: `<all_urls>`, `run_at: document_idle`, `all_frames: false`
- `content_security_policy.extension_pages`: `script-src 'self'; object-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self';`

`font-src` is `'self'` only — fonts are self-hosted. No Google Fonts CDN.

`_locales/` ships four locales: `en`, `zh_CN`, `ja`, `fr`. Each carries only `extName` / `extDescription`. **Editing `_locales/` triggers a CWS full re-review (7–21 days)** — schedule its release independently from the runtime i18n work.

No `default_popup` (would override `sidePanel` open-on-action). No `activeTab` (side-panel messaging doesn't need it). No `contextMenus`. No `identity` / `oauth2` / backend host (Tier 0, BYOK, see CLAUDE.md scope correction).

---

## 12. Privacy posture

- The only network egress is `translate.googleapis.com`, only triggered by user selection / click.
- No analytics. No telemetry. No accounts. No backend operated by us. No third-party font CDN.
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
- Multi-node agent frameworks, eval harnesses
- Cross-device sync beyond Chrome Sync (no Supabase, no Postgres)
- Full-page bilingual translation mode
- Shadow DOM / iframe highlighting on host pages
- Offline translation
- CEFR-level adaptive content (the level field is being phased out — D18)

If the next iteration triggers Tier 1 (lightweight translate proxy because BYOK turns away too many users), the new stack target is **Cloudflare Workers / Vercel Edge**, not FastAPI / Postgres.

---

## 14. Schema migration

The data model in §4 is `schema_version: 2`. Records written by earlier builds carry `zh` / `en` instead of `translation` / `source_lang` / `target_lang`. Migration upgrades them in place.

### Trigger model (D9, D16)

Migration is **dual-track**:

1. `chrome.runtime.onInstalled` with `details.reason === "update"` invokes `runMigrationIfNeeded()`.
2. Every cold SW wake (`init()` at module top) calls the same `runMigrationIfNeeded()`.

`runMigrationIfNeeded()` reads `local["schema_version"]`, compares with the code constant `CURRENT_SCHEMA_VERSION`, and short-circuits when equal. It is idempotent and safe to call repeatedly.

Track 1 catches the normal upgrade path. Track 2 is the actual safety net — it covers SW eviction races, multi-version jumps where `onInstalled` reflects only the most recent transition, and any case where the listener was lost before it fired.

### Lock model

`local["migration_lock"] = { holder: string, startedAt: number }` is taken at the start of `runMigrationIfNeeded()` and released on completion (or on a 60 s expiry as a self-heal).

**Concurrency assumption: SW single-instance.** Chrome MV3 guarantees one service-worker instance per origin at a time; concurrent SW wakes that both think they hold the lock cannot happen by platform contract (D20). The lock is therefore **not** a cross-instance mutex — it is the resume marker that lets a re-entered SW recognise unfinished work after a kill mid-migration.

`holder` is a UUID generated once per SW wake (`crypto.randomUUID()`). It exists for **observability of the self-heal path**, not mutual exclusion. A re-entering SW that finds an expired lock (>60 s) with `holder !== my_id` logs the takeover into `last_sync_error`. A re-entering SW that finds an unexpired lock with `holder !== my_id` aborts loudly — this state should be impossible under the single-instance assumption and indicates a Chrome platform bug worth surfacing.

**Time-budget invariant: ≤ 5 s.** Migration must complete within this window because (1) write-path message handlers `await migrationReady` (§9) and Chrome's message timeout is ~30 s, (2) UI "save" buttons appear hung during the wait. At ~500 records × O(1) `migrateRecord` cost + one `sync.get(null)` + one buffered flush + one `local.set`, the budget is comfortable. Larger vocab sizes that approach the cap require batched migration, not budget relaxation.

While the lock is held:

- `SAVE_WORD` / `DELETE_WORD` / `CLEAR_DATA` / `GET_VOCAB` handlers queue at the message-handler layer via `await migrationReady` (§9). This is the primary gate — no user-driven write reaches `vocab.ts` during the lock window.
- `vocab.ts` `flush()` is also gated by the lock as defense in depth — covers any non-handler write path the migration code itself might trigger.
- Translation requests (`TRANSLATE_REQUEST`) are unaffected.

Once `migrationReady` resolves, queued handlers proceed normally and the buffer flushes on the usual debounce.

Lock holders write only `chrome.storage.local`; they never write `chrome.storage.sync` directly — they hand records to the buffer, which flushes after the lock releases.

### Broadcast policy during migration

`VOCAB_UPDATED` is **suppressed while `migration_lock` is held**. The buffer's `flush()` is the only place that emits the broadcast in normal operation, and `flush()` is gated by the lock — so the suppression is a structural consequence, not a separate gate.

Step 9 (`broadcast VOCAB_UPDATED` after lock release) emits exactly one broadcast covering the entire migration. Side panels and content scripts receive this single signal and re-pull the full vocab list — they never see partial / mixed-schema state mid-migration (D23).

### Migration steps (v1 → v2)

1. Acquire `migration_lock`.
2. `hydrate()` the write buffer from `local["write_buffer"]` if not already in memory.
3. **Upgrade buffer entries in place** — for each pending v1 record, run `migrateRecord(record, currentSettings)` (§14 buffer migration, D17). Buffer is now uniformly v2.
4. Read all `v:` keys from `chrome.storage.sync` via `chrome.storage.sync.get(null)`.
5. For each v1 record (`translation` absent, `zh` present):
   - `translation = record.zh` (skip the record entirely if `zh` is empty — D-misc, do not invent defaults)
   - `source_lang` left undefined (Google detects it at translate time)
   - `target_lang = currentSettings.ui_language`
   - `delete record.zh; delete record.en` (D8 — `translation` is the only canonical field)
   - `schema_version = 2`
   - Apply size discipline (§14 size discipline).
6. Write upgraded records back to the **buffer** (not directly to sync). The buffer flushes via its normal debounce after the lock releases.
7. Set `local["schema_version"] = 2`.
8. Release `migration_lock`.
9. Broadcast `VOCAB_UPDATED`.

If the SW is killed mid-step, the next cold start re-enters `runMigrationIfNeeded()`. Because `schema_version` is bumped only at step 7 and `migrateRecord()` is idempotent on already-v2 records (`translation` already present), partial progress is safe to resume.

### Size discipline (D15, two layers)

`SYNC_VALUE_MAX_BYTES` (`shared/types.ts`) is the universal threshold.

**Layer 1 — ingress.** `useVocab.save()` and the bubble's save handler `JSON.stringify` the candidate `VocabWord` and reject when over the cap. Rejection surfaces a UI warning: "this entry is too long to sync". The record never enters the write buffer.

**Layer 2 — flush.** Before each `chrome.storage.sync.set(batch)`, `vocab.ts` re-checks every value's size. Migration produces records that bypass the ingress check, so this layer must hold. On overflow:

1. **Truncate `ctx` first** (D-3b). Append `…` to the truncated string and re-measure.
2. If still over the cap, hard-reject the single record. Other records in the batch proceed. The rejected record is logged to `last_sync_error` with its `word_key` so the UI can surface it.

Truncation returns a `warning: "ctx_truncated"` channel on the message response. The side panel surfaces a non-blocking toast.

### CLEAR_DATA discipline

`CLEAR_DATA` clears `chrome.storage.sync`, then clears `chrome.storage.local`, then **re-seeds**:

- `local["settings"] = DEFAULT_SETTINGS`
- `local["schema_version"] = CURRENT_SCHEMA_VERSION`

Without the re-seed, the next cold start would see `schema_version` absent and unnecessarily invoke `runMigrationIfNeeded()` against an already-empty store. Harmless but wasteful — the re-seed makes intent explicit.

### Test matrix (`shared/migration.test.ts`)

`migrateRecord()` is pure and unit-tested directly:

- empty input list (no-op)
- all-v1 records
- mixed v1 / v2 records
- v1 record with empty `zh` (skipped, not defaulted)
- record whose `JSON.stringify().length` exceeds `SYNC_VALUE_MAX_BYTES` even after `ctx` truncation
- record whose total length exceeds the cap only because of `ctx` (truncates and passes)
- partial-progress resume: half the input list is already v2, the other half is v1 (idempotent on the v2 half)
- buffer-side migration: pending v1 record + current settings → v2 record matching the same shape

The orchestration around `migrateRecord()` (lock acquisition, storage IO, broadcast) is integration-tested with a fake `chrome.storage` mock.

---

## 15. Decision log

| #   | Decision                                                                                                                                              | Alternatives considered                                                | Why                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| D1  | `feature-status.md` is organised by capability domain, not version number                                                                             | Group by version                                                       | Version grouping hides the dependency graph; capability framing makes blocking relationships visible         |
| D2  | Bubble UX work splits into two stages: vocab-UX polish (no deps) ships before alreadyInLang (depends on §3 + §5)                                       | One bubble rewrite covering both                                       | Combining them blocks the no-prereq vocab-UX work behind schema migration; the staged union (§7) is explicit |
| D3  | `Lang` union extension and `isValidLang` type guard are the same atomic change                                                                         | Track them as separate items                                           | The guard is the runtime half of the type extension; shipping one without the other defeats type safety     |
| D4  | `VocabWord.translation` is the canonical field; `zh` is removed during migration                                                                       | Keep `zh` as v1 fossil with a precedence rule                          | Two readable fields guarantee read-path drift; `schema_version` is the rollback handle, not parallel fields  |
| D5  | Welcome screen language grid + CEFR removal must ship in the same release                                                                              | Ship them in separate releases                                         | They share the same UI surface; staggering creates a transitional Welcome with both or neither               |
| D6  | `_locales/{ja,fr}` is released independently from the runtime i18n change                                                                              | Bundle into the same release                                           | `_locales/` edits trigger CWS full re-review; coupling slows the runtime change unnecessarily                |
| D7  | Migration uses dual-track triggers: `onInstalled("update")` plus a cold-start `schema_version` check on every SW wake, both calling the same idempotent function | Pure `onInstalled` (unreliable); pure lazy on read                     | `onInstalled` can race against SW eviction; lazy read paths force every reader to handle two schemas         |
| D8  | A `migration_lock` in `local` blocks `flush()` while migration runs; lock self-expires at 60 s                                                          | No lock; lock without expiry                                           | Without a lock, mid-migration writes flush in mixed shapes; without expiry, a crashed migration deadlocks    |
| D9  | After migration, `delete record.zh; delete record.en`; readers consume only `translation`                                                              | Keep both fields and use `translation ?? zh` precedence                 | One canonical field eliminates the class of bugs where one consumer reads the wrong source                   |
| D10 | `alreadyInLang` is a result-field (`TranslateResult.alreadyInLang?: true`), not a new message                                                          | New `LANG_MATCH` message                                               | Bubble already awaits `TRANSLATE_RESULT`; one extra optional field is the smallest viable change             |
| D11 | Noto Sans JP self-hosted under `src/sidepanel/fonts/`; CSP `font-src 'self'`; license file at `src/sidepanel/fonts/LICENSE.txt`                          | Google Fonts CDN; system-font fallback                                  | CWS audit + privacy-policy claim of "no third-party network" both require self-hosting; license path checked |
| D12 | Architecture document drops version numbers in favour of "current snapshot + target shape"                                                             | Tag the doc against a specific version (e.g. v2.0.1)                    | Mirrors `feature-status.md`; version tagging desyncs whenever code lands                                     |
| D13 | Read-path precedence is a non-question: `translation` is the only field readers may touch; the type system enforces it (no `zh` / `en` after migration) | `translation ?? zh` runtime precedence                                  | Removing the alternative is more robust than documenting a precedence rule contributors must remember       |
| D14 | `zh` and `en` deleted in the same migration pass, not on a delayed schedule                                                                            | 30-day grace period before deletion                                     | The grace period creates two-schema overlap with no offsetting benefit; rollback uses `schema_version`       |
| D15 | Size cap enforced at **two** layers: ingress (`useVocab.save` + bubble save handler) and flush (`vocab.ts` pre-batch); ctx-truncate first, hard-reject on still-overflow | Single layer at ingress; single layer at flush                          | Migration produces records that bypass ingress; flush must hold. Ingress alone misses migration; flush alone leaks oversize records into the buffer |
| D16 | Cold-start `schema_version` check is the safety net for missed `onInstalled` events, not a separate decision from D7                                    | Document it as a fallback only                                          | Pure `onInstalled` is unreliable; the cold-start check is structural, not a patch                            |
| D17 | Write-buffer entries are upgraded in place during migration using `migrateRecord(record, currentSettings)`                                              | Drop the buffer; quarantine to a side key; flush v1 first then migrate sync | Same lock and same migration function covers both; no side keys; flush failure during migration is non-blocking |
| D18 | `Level` type alias and `Settings.level` field both deleted from the type; `DEFAULT_SETTINGS` no longer carries it; old storage objects retaining `level` are tolerated on read; `useSettings` strips the field on the next write | Keep `level` in defaults; full settings migration                       | The field is unused after CEFR removal; lazy strip avoids a second migration path                            |
| D19 | Translate-time direction is read from `Settings.translation_direction`; `VocabWord.source_lang` / `target_lang` are historical metadata used only by export and detail views | Per-word fields authoritative; user-toggle to switch                    | Single authoritative source for `alreadyInLang` and SW translate target; per-word history preserved without affecting live translation |
| D20 | Lock concurrency model relies on Chrome MV3's single-instance SW guarantee; `holder` UUID is for self-heal observability only, not mutual exclusion | Compare-and-swap dance; multi-instance lock | MV3 guarantees one SW instance per origin; building a CAS for an impossible race adds complexity with no payoff. `holder` keeps the self-heal path observable and surfaces platform-bug states loudly |
| D21 | `chrome.runtime.onMessage.addListener` is registered at module top; write-path handlers await a `migrationReady` promise as their first line; migration time-budget invariant is ≤ 5 s | Defer listener registration until after migration; defer-and-retry from UI; queue messages in side-storage | Deferred listener loses first-message-after-wake; UI retry pushes coordination cost into every screen; module-top listener + `await migrationReady` is the smallest correct shape, and the 5 s budget keeps it within Chrome's message timeout |
| D22 | Single-release migration: no intermediate "`zh` optional" tolerance release before the canonical migration ships | Two-release strategy that publishes a `zh`-optional read-tolerance build first | The current install base does not warrant a multi-release rollout. Working assumption: Chrome auto-update reaches the vast majority of installs within 24 h (assumption, not measured against this extension's telemetry — we have none). The two-release strategy adds CWS review time with no offsetting safety for this user volume |
| D23 | `VOCAB_UPDATED` is suppressed while `migration_lock` is held; one broadcast fires after lock release covering the whole migration | Broadcast on each batch; broadcast nothing | One post-migration broadcast guarantees consumers never observe mixed-schema state; per-batch broadcasts would force every consumer to handle partial views |
| D24 | Translation target follows `Settings.ui_language` directly; the previous `translation_direction` pair (and its `direction_user_overridden` latch) are removed; `source` is always `"auto"` so Google Translate detects it | Keep the dual dropdown picker; keep target as a separate setting from UI language | Google Translate's source-detection makes the source dropdown redundant. A separate target picker doubled the surface area of the language settings while delivering negligible value over "translate into the language I read in." Removing the latch also fixes the screen-jump (D25) without extra logic |
| D25 | Side-panel screen routing follows `useSelection.epoch`, not `selection.data` reference identity | Track only `selection.data`; track a separate `selectionId` produced by background | Retranslation triggered by switching UI language re-runs the `useSelection` effect, which updates `selection.data`. Routing on `data` would yank the user to the Translate tab on every settings change. The epoch counter increments only on a fresh `SHOW_SELECTION` push or initial session restore, so retranslation is invisible to the router |
| D26 | Hover and click on a saved highlight render the same bubble (translation + delete); only the dismiss timer differs | Hover stays read-only; click is the only path to delete; introduce a third state | Two visually different surfaces for the same data created an unnecessary mode the user had to learn. Unifying lets the user reach the delete affordance from the lighter-weight hover gesture without first promoting to click. The closed shadow root's `mouseenter` cancels the hover-dismiss timer so the cursor can travel from the highlight into the bubble |
| D27 | `VocabWord.note` is dropped from the type without a migration pass | Active migration that strips the field from existing records | The field had low usage and existing rows simply ignore the orphan field on the next write. CLAUDE.md's early-stage discipline ("minimum quality, can run, can verify, can rollback") favours the silent drop |
