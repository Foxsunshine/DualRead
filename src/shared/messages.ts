import type { SelectionPayload, TranslateResult, VocabWord } from "./types";

export type Message =
  | { type: "TRANSLATE"; text: string; target?: "zh-CN" | "en" }
  | ({ type: "SELECTION_CHANGED" } & SelectionPayload)
  | ({ type: "SHOW_SELECTION" } & SelectionPayload)
  | { type: "OPEN_WORD"; word: string }
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
