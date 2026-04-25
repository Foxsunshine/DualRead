import type { Lang, SelectionPayload, TranslateResult, VocabWord } from "./types";
import type { SessionUser } from "./session";

// Snapshot of "is this device signed in to DualRead, and as whom?"
// Returned by GET_AUTH_STATE and SIGN_IN. The signed-out variant
// has no user fields so a discriminated render in the panel can
// switch on `signedIn` without optional-chaining everywhere.
export type AuthState =
  | { signedIn: false }
  | { signedIn: true; user: SessionUser; expires_at: number };

export type Message =
  // v1.1 rename: `TRANSLATE` → `TRANSLATE_REQUEST`. The old name predated the
  // bubble/sidepanel split and read as a command; the new name reads as a
  // one-entry RPC that either surface can fire. `requester` is optional
  // metadata used only for logs/telemetry (if we ever add telemetry) — the
  // response contract is identical regardless of caller.
  | {
      type: "TRANSLATE_REQUEST";
      text: string;
      // v2.3: target widened from the v1.1 "zh-CN" | "en" literal to the
      // full 4-language Lang union. Google MT supports all 12 cross-pairs
      // via sl=auto + tl=…; this just lets the bubble / sidepanel ask
      // for the user's currently-selected ui_language.
      target?: Lang;
      requester?: "sidepanel" | "bubble";
    }
  | ({ type: "SELECTION_CHANGED" } & SelectionPayload)
  | ({ type: "SHOW_SELECTION" } & SelectionPayload)
  // v1.1 rename of the content→background trigger (D51, supersedes D34).
  // The old name `OPEN_WORD` implied "open the side panel at this word".
  // With v1.1's saved-word bubble, the side panel is opened only on
  // explicit "打开详情" clicks; the sole job of this message is "the
  // panel should focus this word in the vocab tab". `FOCUS_WORD`
  // (below) remains the background → panel broadcast counterpart.
  | { type: "FOCUS_WORD_IN_VOCAB"; word_key: string }
  | { type: "FOCUS_WORD"; word_key: string }
  | { type: "SAVE_WORD"; word: VocabWord }
  | { type: "DELETE_WORD"; word_key: string }
  | { type: "GET_VOCAB" }
  | { type: "CLEAR_DATA" }
  | { type: "VOCAB_UPDATED" }
  // v2.1.1 / DL-5: content script asks the background for its own tabId
  // once at init so it can later call `chrome.sidePanel.open({ tabId })`
  // directly inside a user-gesture stack. Background reads the answer
  // straight off `sender.tab.id` (cheap, synchronous). Separate from
  // SELECTION_CHANGED because that one is fire-and-forget and we don't
  // want to weld a response contract onto it.
  | { type: "GET_TAB_ID" }
  // v3.0 W4 — backend auth. The sidepanel never touches chrome.identity
  // directly because the API is service-worker-blessed but pops a UI;
  // running it from the background keeps the gesture chain clean and
  // also keeps the access_token off the panel's call stack so a panel
  // crash mid-flow can't strand a token in memory. native_language
  // hint piggybacks on SIGN_IN so the backend's first-signup row
  // creation has the right value without a follow-up call.
  | { type: "SIGN_IN"; native_language: Lang }
  | { type: "SIGN_OUT" }
  | { type: "GET_AUTH_STATE" };

export type MessageResponse =
  | { ok: true; data?: TranslateResult | VocabWord[] | AuthState | null | unknown }
  | { ok: false; error: string };

// `chrome.runtime.sendMessage` can fail in two distinct ways:
//   (1) the call returns a runtime error via `chrome.runtime.lastError` —
//       handled in the callback path below;
//   (2) the call itself THROWS synchronously when the extension context
//       has been invalidated (the page survived a service-worker reload
//       and is now talking to a dead worker). The Promise constructor
//       would convert that throw into a rejection, and any caller that
//       forgets `.catch()` (or uses `void sendMessage(...)`) would
//       surface it as an "Uncaught (in promise)" — exactly the v2.1.1
//       Reddit-page report.
// Wrapping the inner call in try/catch normalizes both paths into a
// resolved `{ ok: false, error }` so every caller — including
// fire-and-forget ones — sees a single contract.
export function sendMessage<T extends Message>(msg: T): Promise<MessageResponse> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (resp: MessageResponse | undefined) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            error: chrome.runtime.lastError.message ?? "runtime error",
          });
          return;
        }
        resolve(resp ?? { ok: false, error: "no response" });
      });
    } catch (e) {
      resolve({
        ok: false,
        error: e instanceof Error ? e.message : "context_invalidated",
      });
    }
  });
}

export const SESSION_KEY_LATEST_SELECTION = "latest_selection";
// Stores the word_key of a highlight the user just clicked on the host page.
// The background writes it before attempting sidePanel.open(); the panel reads
// it on mount (late-open path) and clears it. Session-scoped so it naturally
// expires when the browser restarts.
export const SESSION_KEY_PENDING_FOCUS = "pending_focus_word";
export const LOCAL_KEY_WRITE_BUFFER = "write_buffer";
export const LOCAL_KEY_LAST_SYNCED = "last_synced_at";
// Last sync failure, written by the vocab write-buffer on a failed flush and
// cleared on a subsequent successful one. Exists so the Settings Sync-status
// indicator can surface "error" (R5 / D24) with a copy-pasteable detail for
// bug reports.
export const LOCAL_KEY_LAST_ERROR = "last_sync_error";
export const STORAGE_PREFIX_VOCAB = "v:";
export const VOCAB_QUOTA_WARN_AT = 450;

// Shape of what lands in chrome.storage.local under LOCAL_KEY_LAST_ERROR.
// `code` is deliberately a free-form string (Chrome's errors surface as either
// lastError.message or a thrown Error) — the panel collapses it into a state
// + shows the raw string in the detail line.
export interface SyncErrorRecord {
  code: string;
  at: number;
}
