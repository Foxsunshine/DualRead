import type { Lang, SelectionPayload, TranslateResult, VocabWord } from "./types";

export type Message =
  // v1.1 rename: `TRANSLATE` → `TRANSLATE_REQUEST`. The old name predated the
  // bubble/sidepanel split and read as a command; the new name reads as a
  // one-entry RPC that either surface can fire. `requester` is optional
  // metadata used only for logs/telemetry (if we ever add telemetry) — the
  // response contract is identical regardless of caller.
  //
  // `target` is optional: callers may pass it explicitly (sidepanel/bubble
  // pulled from Settings.translation_direction) or omit it and let the
  // background fall back to the persisted direction. Both paths converge on
  // the same source of truth so a missed read on the caller side cannot
  // produce a translation that disagrees with the user's Settings choice.
  | {
      type: "TRANSLATE_REQUEST";
      text: string;
      target?: Lang;
      source?: Lang;
      requester?: "sidepanel" | "bubble";
      // When true, bypass the alreadyInLang heuristic: the response will
      // come back with `alreadyInLang === false` even if the detected
      // source language matches the target. The bubble's "translate
      // anyway" button sets this so the user can force a translation
      // round-trip after dismissing the alreadyInLang notice.
      force?: boolean;
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
  | { type: "VOCAB_UPDATED" };

export type MessageResponse =
  | { ok: true; data?: TranslateResult | VocabWord[] | null | unknown }
  | { ok: false; error: string };

export function sendMessage<T extends Message>(msg: T): Promise<MessageResponse> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp: MessageResponse | undefined) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message ?? "runtime error" });
        return;
      }
      resolve(resp ?? { ok: false, error: "no response" });
    });
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
export const LOCAL_KEY_SETTINGS = "settings";
export const STORAGE_PREFIX_VOCAB = "v:";
export const VOCAB_QUOTA_WARN_AT = 450;
// chrome.storage.sync hard-limits a single value to 8 KB after JSON
// serialisation. We reserve ~400 bytes as headroom for the storage key prefix
// and Chrome's own envelope overhead. Both ingress (side-panel save) and
// flush (background buffer) check against this; ingress shows a UI error,
// flush truncates ctx then hard-rejects with last_sync_error.
export const SYNC_VALUE_MAX_BYTES = 7800;
// Tracks whether the running build's schema matches what is in
// chrome.storage.sync. Stored under chrome.storage.local. Plain number
// rather than the literal CURRENT_SCHEMA_VERSION because once written it
// represents an arbitrary historical version.
export const LOCAL_KEY_SCHEMA_VERSION = "schema_version";
// Held while a migration pass is running so two SW wakes don't fight over
// the same storage.sync record set. Self-heals after MIGRATION_LOCK_TTL_MS
// in case a previous wake crashed mid-flight.
export const LOCAL_KEY_MIGRATION_LOCK = "migration_lock";
export const MIGRATION_LOCK_TTL_MS = 60_000;

// Shape of what lands in chrome.storage.local under LOCAL_KEY_LAST_ERROR.
// `code` is deliberately a free-form string (Chrome's errors surface as either
// lastError.message or a thrown Error) — the panel collapses it into a state
// + shows the raw string in the detail line.
export interface SyncErrorRecord {
  code: string;
  at: number;
}
