// DualRead background service worker (MV3).
//
// Responsibilities:
//   - Bootstrap on install (default settings, open-on-action behavior).
//   - Translation proxy: Google Translate endpoint, session-scoped cache,
//     classified error codes for the panel to i18n.
//   - Selection relay: content script → session storage + live panel push.
//   - Vocab dispatch: SAVE / DELETE / GET / CLEAR routed to the write buffer
//     in ./vocab.ts.
//
// Important: this is a module service worker and gets evicted on idle. Any
// in-memory state (translation-in-flight promises, flush timers) must either
// be recoverable on wake or persisted to chrome.storage.*.

import type { Message, MessageResponse } from "../shared/messages";
import {
  SESSION_KEY_LATEST_SELECTION,
  SESSION_KEY_PENDING_FOCUS,
} from "../shared/messages";
import { DEFAULT_SETTINGS } from "../shared/types";
import type { Lang, SelectionPayload, Settings, TranslationDirection, VocabWord } from "../shared/types";
import { clearVocab, deleteWord, flushPending, getVocab, saveWord } from "./vocab";
import { handleTranslate } from "./translate";
import { runMigration } from "./migrate";

// Map a BCP-47 tag like "ja-JP" / "fr-CA" to one of the four supported UI
// languages. Used on first install to pick a sensible default; falls back
// to English when nothing matches so users on unsupported locales see the
// reference language rather than a Chinese default.
function detectInstallLang(tag: string | undefined): Lang {
  const primary = (tag ?? "").toLowerCase().split("-")[0];
  if (primary === "ja") return "ja";
  if (primary === "fr") return "fr";
  if (primary === "zh") return "zh-CN";
  if (primary === "en") return "en";
  return "en";
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  const { settings } = await chrome.storage.local.get("settings");
  if (!settings) {
    // Fresh install path: seed defaults and pick the UI language from the
    // browser locale so first-run users land on a panel that already speaks
    // their language. The default translation target follows the detected
    // language too — Japanese-locale users get ja as both UI and translation
    // target without a second trip through Settings — except when the locale
    // is English, where keeping source=en would collapse with target=en;
    // there we fall back to zh-CN as the most common Chinese-speaker target.
    const installLang = detectInstallLang(navigator.language);
    // English-locale users keep DEFAULT_SETTINGS' en→zh-CN direction (the
    // most common workflow: English-speakers translating into Chinese, and
    // also the v1 default). Non-English locales pin target to the install
    // lang and keep source as English.
    const direction =
      installLang === "en"
        ? DEFAULT_SETTINGS.translation_direction
        : { source: "en" as Lang, target: installLang };
    const seeded: Settings = {
      ...DEFAULT_SETTINGS,
      ui_language: installLang,
      translation_direction: direction,
    };
    await chrome.storage.local.set({ settings: seeded });
  }
});

// migrationReady gates every write path so SAVE / DELETE / CLEAR can never
// race against an in-flight upgrade pass. TRANSLATE_REQUEST is deliberately
// not awaited — it doesn't touch vocab storage and the user-facing latency
// for a cold-start translation already includes a network round-trip; adding
// a migration await would block the bubble for no correctness gain.
//
// init() is invoked at module top-level so the listener registration below
// fires synchronously on SW wake; the first write message that lands during
// migration suspends on `await migrationReady` and resumes once the pass
// settles. If init() throws (e.g. storage corruption), migrationReady
// rejects and writers surface a structured error to the side panel rather
// than corrupting storage further.
let migrationReady: Promise<void>;

function init(): Promise<void> {
  return runMigration({
    readLocal: (keys) => chrome.storage.local.get(keys),
    writeLocal: (entries) => chrome.storage.local.set(entries),
    removeLocal: (keys) => chrome.storage.local.remove(keys),
    readAllSync: () => chrome.storage.sync.get(null) as Promise<Record<string, unknown>>,
    writeSync: (entries: Record<string, VocabWord>) => chrome.storage.sync.set(entries),
    removeSync: (keys) => chrome.storage.sync.remove(keys),
    defaultSettings: DEFAULT_SETTINGS,
    now: () => Date.now(),
  });
}

migrationReady = init();

// Best-effort: drain pending writes before the SW is suspended. If this
// races with the suspension window the next cold start re-hydrates from the
// write_buffer mirror, so this handler is an optimisation, not a correctness
// requirement.
chrome.runtime.onSuspend.addListener(() => {
  void flushPending();
});

// Translation moved to ./translate.ts in v1.1 Phase A. The router below
// just dispatches TRANSLATE_REQUEST → handleTranslate.

// Reads the persisted translation direction from chrome.storage.local. The
// background does not maintain its own in-memory copy of Settings (the SW
// is evicted between requests anyway) so every translation pulls a fresh
// snapshot. Defaults are merged so a missing/legacy record still resolves
// to a valid pair instead of throwing.
async function readDirection(): Promise<TranslationDirection> {
  const { settings } = await chrome.storage.local.get("settings");
  const dir = (settings as Partial<Settings> | undefined)?.translation_direction;
  return dir ?? DEFAULT_SETTINGS.translation_direction;
}

// ───── Selection relay ───────────────────────────────────────
async function handleSelectionChanged(payload: SelectionPayload): Promise<void> {
  await chrome.storage.session.set({ [SESSION_KEY_LATEST_SELECTION]: payload });
  chrome.runtime
    .sendMessage({ type: "SHOW_SELECTION", ...payload })
    .catch(() => {
      /* side panel not open — payload persists for next open */
    });
}

// ───── Vocab-focus request → panel ───────────────────────────
// Triggered by the content script when the user explicitly asks to see a
// word's vocab details — in v1 this fired on any highlight click; in v1.1
// it fires only from the bubble's "打开详情" link (D51). Two jobs:
//   1. Stash the word_key in session storage so a freshly-opened side panel
//      can hydrate onto the Vocab tab at that word (late-open path).
//   2. Attempt to open the side panel for the originating tab, then broadcast
//      FOCUS_WORD for any already-open panel instance (live-push path).
//
// DESIGN.md Spike S1: content → background → sidePanel.open() can break the
// user-gesture chain in practice. We still *try* sidePanel.open because it
// succeeds in enough cases to matter (toolbar already opened once, chain
// preserved, etc.); when it fails we silently fall back to "panel opens next
// time the user clicks the toolbar, and picks up the pending word then".
async function handleFocusWordInVocab(word_key: string, tabId: number | undefined): Promise<void> {
  const key = word_key.trim().toLowerCase();
  if (!key) return;

  await chrome.storage.session.set({ [SESSION_KEY_PENDING_FOCUS]: key });

  if (tabId !== undefined) {
    try {
      await chrome.sidePanel.open({ tabId });
    } catch {
      /* user-gesture lost or panel already open — live broadcast below still fires */
    }
  }

  chrome.runtime
    .sendMessage({ type: "FOCUS_WORD", word_key: key })
    .catch(() => {
      /* no panel listening right now — session storage carries the intent */
    });
}

// ───── Message router ────────────────────────────────────────
// Chrome's sendMessage contract: returning `true` from the listener keeps
// the channel open for an async sendResponse. `false` (or nothing) closes it.
// Fire-and-forget broadcasts (SHOW_SELECTION, VOCAB_UPDATED) are `false`
// because nobody waits on them; request/response handlers are `true`.

// Small adapter: run a promise, shape its resolution as MessageResponse.
// `void` resolutions (SAVE / DELETE / CLEAR) still send { ok: true }; data
// resolutions (GET_VOCAB → VocabWord[]) ride in the `data` field.
function respondWith(
  promise: Promise<unknown>,
  sendResponse: (r: MessageResponse) => void
): void {
  promise
    .then((data) => sendResponse({ ok: true, data: data ?? null }))
    .catch((e) => sendResponse({ ok: false, error: String(e) }));
}

chrome.runtime.onMessage.addListener(
  (msg: Message, sender, sendResponse: (r: MessageResponse) => void) => {
    switch (msg.type) {
      case "TRANSLATE_REQUEST":
        // Caller-supplied target wins; otherwise pull the persisted direction
        // so the bubble and side panel always agree with Settings even when
        // a stale caller forgot to forward it.
        (async () => {
          const target = msg.target ?? (await readDirection()).target;
          const source = msg.source ?? "auto";
          const resp = await handleTranslate(msg.text, target, source);
          sendResponse(resp);
        })();
        return true;

      case "SELECTION_CHANGED":
        // Fire-and-forget — the content script doesn't need a reply.
        void handleSelectionChanged({
          text: msg.text,
          context_sentence: msg.context_sentence,
          source_url: msg.source_url,
        });
        return false;

      case "FOCUS_WORD_IN_VOCAB":
        // Bubble's "打开详情" link (v1.1). sender.tab.id is the page that
        // originated the click; we need it to route sidePanel.open() at the
        // correct window.
        void handleFocusWordInVocab(msg.word_key, sender.tab?.id);
        return false;

      case "SHOW_SELECTION":
      case "FOCUS_WORD":
      case "VOCAB_UPDATED":
        // These are broadcasts; we receive them when we also happen to be
        // listening (e.g. own sendMessage). Nothing to do here.
        return false;

      case "SAVE_WORD":
        respondWith(
          (async () => {
            await migrationReady;
            return saveWord(msg.word);
          })(),
          sendResponse
        );
        return true;

      case "DELETE_WORD":
        respondWith(
          (async () => {
            await migrationReady;
            return deleteWord(msg.word_key);
          })(),
          sendResponse
        );
        return true;

      case "GET_VOCAB":
        // Reads also wait so the panel never sees a half-migrated snapshot.
        respondWith(
          (async () => {
            await migrationReady;
            return getVocab();
          })(),
          sendResponse
        );
        return true;

      case "CLEAR_DATA":
        // Order matters: wipe vocab (clears write buffer + sync), then local
        // (settings + last_synced_at + schema_version), then session
        // (translation cache), then re-seed default settings so the panel
        // reloads into a clean first-run-completed state.
        respondWith(
          (async () => {
            await migrationReady;
            await clearVocab();
            await chrome.storage.local.clear();
            await chrome.storage.session.clear();
            await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
          })(),
          sendResponse
        );
        return true;

      default:
        return false;
    }
  }
);
