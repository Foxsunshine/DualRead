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
import type { SelectionPayload, TranslateResult } from "../shared/types";
import { clearVocab, deleteWord, getVocab, saveWord } from "./vocab";

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  const { settings } = await chrome.storage.local.get("settings");
  if (!settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
});

// ───── Translation ───────────────────────────────────────────
// Error codes bubble to the side panel and get mapped to i18n strings there.
//  "network"   — fetch failed (offline, DNS, CORS, etc.)
//  "rate_limit"— Google returned 429
//  "http_<n>"  — any other non-2xx
//  "parse"     — non-JSON / unexpected shape
type TranslateErrorCode = "network" | "rate_limit" | "parse" | `http_${number}`;

class TranslateError extends Error {
  code: TranslateErrorCode;
  constructor(code: TranslateErrorCode) {
    super(code);
    this.code = code;
    this.name = "TranslateError";
  }
}

function cacheKey(text: string, target: string): string {
  return `t:${target}:${text.trim().toLowerCase()}`;
}

async function getCached(text: string, target: string): Promise<TranslateResult | null> {
  const key = cacheKey(text, target);
  const res = await chrome.storage.session.get(key);
  return (res[key] as TranslateResult | undefined) ?? null;
}

async function setCached(text: string, target: string, result: TranslateResult): Promise<void> {
  await chrome.storage.session.set({ [cacheKey(text, target)]: result });
}

async function translateWithGoogle(
  text: string,
  target: "zh-CN" | "en"
): Promise<TranslateResult> {
  const url =
    `https://translate.googleapis.com/translate_a/single` +
    `?client=gtx&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;

  let resp: Response;
  try {
    resp = await fetch(url);
  } catch {
    throw new TranslateError("network");
  }
  if (resp.status === 429) throw new TranslateError("rate_limit");
  if (!resp.ok) throw new TranslateError(`http_${resp.status}`);

  try {
    const data = (await resp.json()) as [Array<[string, ...unknown[]]>, unknown, string];
    const translated = data[0].map((item) => item[0]).join("");
    const detectedLang = data[2] || "auto";
    return { translated, detectedLang };
  } catch {
    throw new TranslateError("parse");
  }
}

async function handleTranslate(text: string, target: "zh-CN" | "en"): Promise<MessageResponse> {
  try {
    const cached = await getCached(text, target);
    if (cached) return { ok: true, data: cached };
    const data = await translateWithGoogle(text, target);
    await setCached(text, target, data);
    return { ok: true, data };
  } catch (e) {
    const code = e instanceof TranslateError ? e.code : "parse";
    return { ok: false, error: code };
  }
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

// ───── Highlight click → panel focus ─────────────────────────
// Triggered by the content-script click handler. Two jobs:
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
async function handleOpenWord(word: string, tabId: number | undefined): Promise<void> {
  const word_key = word.trim().toLowerCase();
  if (!word_key) return;

  await chrome.storage.session.set({ [SESSION_KEY_PENDING_FOCUS]: word_key });

  if (tabId !== undefined) {
    try {
      await chrome.sidePanel.open({ tabId });
    } catch {
      /* user-gesture lost or panel already open — live broadcast below still fires */
    }
  }

  chrome.runtime
    .sendMessage({ type: "FOCUS_WORD", word_key })
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
      case "TRANSLATE":
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

      case "OPEN_WORD":
        // Content-script click on a `.dr-hl`. sender.tab.id is the page that
        // originated the click; we need it to route sidePanel.open() at the
        // correct window.
        void handleOpenWord(msg.word, sender.tab?.id);
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
