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
import type { SelectionPayload } from "../shared/types";
import { detectInitialLang } from "../shared/i18nDetect";
import { clearVocab, deleteWord, getVocab, saveWord } from "./vocab";
import { handleTranslate } from "./translate";

// v2.2 D7 + D9: on first install, derive ui_language from the browser's
// own UI locale instead of the hardcoded zh-CN default. This handler runs
// once per install (Chrome distinguishes "install" / "update" / "reinstall"
// in `details.reason`) and we only intercept "install" — upgrade paths
// keep whatever ui_language the user already chose. After this, all
// detection logic lives in the user's hands via the Settings dropdown.
//
// The handler is `async` and awaited end-to-end so MV3's idle-eviction
// timer doesn't kill the service worker mid-write. detectInitialLang is
// a pure function (see shared/i18nDetect.ts) so the only async bit is
// the storage.set itself.
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    // Fresh install: seed Settings with detected lang. `getUILanguage()`
    // returns a BCP-47 tag like "fr-FR" / "ja" / "zh-TW"; detectInitialLang
    // folds region variants into the four supported product langs and
    // falls back to "en" for anything we don't ship. The try/catch is
    // belt-and-suspenders against a hypothetical chrome.i18n throw —
    // detectInitialLang itself can't throw (pure string ops on any input).
    let detected: typeof DEFAULT_SETTINGS.ui_language = "en";
    try {
      detected = detectInitialLang(chrome.i18n.getUILanguage());
    } catch {
      /* leave detected = "en" — international-friendly fallback */
    }
    // setPanelBehavior and the settings seed are independent — fan out.
    await Promise.all([
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }),
      chrome.storage.local.set({
        settings: { ...DEFAULT_SETTINGS, ui_language: detected },
      }),
    ]);
    return;
  }

  // Existing user (update / chrome_update / shared_module_update): only
  // seed defaults if storage is empty (e.g. CLEAR_DATA was just run); never
  // overwrite a user-chosen ui_language on an upgrade path.
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  const { settings } = await chrome.storage.local.get("settings");
  if (!settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
});

// Translation moved to ./translate.ts in v1.1 Phase A. The router below
// just dispatches TRANSLATE_REQUEST → handleTranslate.

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
// word's vocab details. Two jobs:
//   1. Stash the word_key in session storage so a freshly-opened side panel
//      can hydrate onto the Vocab tab at that word (late-open path).
//   2. Broadcast FOCUS_WORD for any already-open panel instance
//      (live-push path).
//
// v2.1.1 / DL-5: `sidePanel.open()` has moved to the content script (it
// needs a real user-gesture and this background path was breaking that
// chain — DESIGN.md Spike S1). We keep this handler minimal: session
// write + broadcast. The content side tried to open the panel just
// before sending this message, so by the time the broadcast lands the
// panel is (or is becoming) available to receive it.
async function handleFocusWordInVocab(word_key: string): Promise<void> {
  const key = word_key.trim().toLowerCase();
  if (!key) return;

  await chrome.storage.session.set({ [SESSION_KEY_PENDING_FOCUS]: key });

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
        handleTranslate(msg.text, msg.target ?? "zh-CN").then(sendResponse);
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
        // Bubble's "打开详情" link. v2.1.1 / DL-5: content side already
        // called `sidePanel.open({ tabId })` inside its click handler,
        // so we just do the session + broadcast half.
        void handleFocusWordInVocab(msg.word_key);
        return false;

      case "GET_TAB_ID":
        // v2.1.1 / DL-5: synchronous answer from the sender frame's own
        // metadata. `sender.tab` is undefined for extension-internal
        // senders (devtools, side panel); reply with `null` in that
        // case so the content side can distinguish "not a tab" from
        // "tab 0" (which is a valid Chrome tabId).
        sendResponse({ ok: true, data: sender.tab?.id ?? null });
        return false;

      case "SHOW_SELECTION":
      case "FOCUS_WORD":
      case "VOCAB_UPDATED":
        // These are broadcasts; we receive them when we also happen to be
        // listening (e.g. own sendMessage). Nothing to do here.
        return false;

      case "SAVE_WORD":
        respondWith(saveWord(msg.word), sendResponse);
        return true;

      case "DELETE_WORD":
        respondWith(deleteWord(msg.word_key), sendResponse);
        return true;

      case "GET_VOCAB":
        respondWith(getVocab(), sendResponse);
        return true;

      case "CLEAR_DATA":
        // Order matters: wipe vocab (clears write buffer + sync), then local
        // (settings + last_synced_at), then session (translation cache), and
        // only after everything is gone do we re-seed default settings so
        // the panel reloads into a clean first-run-completed state.
        respondWith(
          (async () => {
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
