// Side-panel hook that mirrors the background's vocab state into React.
//
// Contract:
//   - On mount: fetch current vocab via GET_VOCAB.
//   - Subscribe to VOCAB_UPDATED broadcasts so other panel instances / other
//     tabs editing the list stay in sync.
//   - Mutations (save / remove / clear) update state optimistically and then
//     send the message to background; the authoritative VOCAB_UPDATED that
//     follows reconciles anything the optimistic path got wrong.
//
// Sync-status metadata (last synced timestamp, last error, pending count)
// lives in `useSyncStatus` — keep this hook focused on the word list alone.

import { useCallback, useEffect, useState } from "react";
import { sendMessage, SYNC_VALUE_MAX_BYTES } from "../shared/messages";
import type { ImportResult, Message } from "../shared/messages";
import { estimateRecordBytes } from "../shared/migration";
import type { VocabWord } from "../shared/types";

export class VocabRecordTooLargeError extends Error {
  readonly bytes: number;
  readonly limit: number;
  constructor(bytes: number) {
    super(`Vocab record is ${bytes} bytes, exceeds ${SYNC_VALUE_MAX_BYTES}-byte sync cap`);
    this.name = "VocabRecordTooLargeError";
    this.bytes = bytes;
    this.limit = SYNC_VALUE_MAX_BYTES;
  }
}

export function useVocab() {
  const [words, setWords] = useState<VocabWord[]>([]);

  const refresh = useCallback(async () => {
    const resp = await sendMessage({ type: "GET_VOCAB" });
    if (!resp.ok) return;
    setWords((resp.data as VocabWord[] | undefined) ?? []);
  }, []);

  useEffect(() => {
    void refresh();
    const listener = (msg: Message) => {
      if (msg.type === "VOCAB_UPDATED") void refresh();
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [refresh]);

  // Optimistic upsert: put the word at the top immediately so the UI feels
  // instant. The VOCAB_UPDATED that the background broadcasts after flushing
  // will pull in the canonical order anyway. The size check throws so the
  // caller can surface a toast; a silent bounce at flush time would leave
  // the panel showing a "saved" word that was never persisted.
  const save = useCallback(async (word: VocabWord) => {
    const bytes = estimateRecordBytes(word);
    if (bytes > SYNC_VALUE_MAX_BYTES) throw new VocabRecordTooLargeError(bytes);
    setWords((prev) => [word, ...prev.filter((w) => w.word_key !== word.word_key)]);
    await sendMessage({ type: "SAVE_WORD", word });
  }, []);

  // Bulk import: merge new rows into local state in one setWords pass —
  // calling save() in a loop would trigger N React renders for an N-row
  // import. Sends IMPORT_WORDS, which the background fans out to saveWord
  // so the write buffer can coalesce the burst into one sync.set. The
  // returned counts come from the background's pre-import snapshot and
  // feed the dialog's success summary.
  const importMany = useCallback(
    async (rows: VocabWord[]): Promise<ImportResult> => {
      if (rows.length === 0) return { added: 0, updated: 0, skipped: 0 };
      setWords((prev) => {
        const byKey = new Map<string, VocabWord>();
        for (const w of prev) byKey.set(w.word_key, w);
        for (const w of rows) {
          const prior = byKey.get(w.word_key);
          // Mirror the background's upsert: preserve the original
          // created_at so the list ordering and the "today / Xd" badge
          // don't jump for already-saved words.
          byKey.set(w.word_key, {
            ...w,
            created_at: prior?.created_at ?? w.created_at,
          });
        }
        return Array.from(byKey.values()).sort(
          (a, b) => b.created_at - a.created_at
        );
      });
      const resp = await sendMessage({ type: "IMPORT_WORDS", words: rows });
      if (!resp.ok) {
        throw new Error(resp.error);
      }
      const data = resp.data as ImportResult | null | undefined;
      return data ?? { added: 0, updated: 0, skipped: 0 };
    },
    []
  );

  const remove = useCallback(async (word_key: string) => {
    setWords((prev) => prev.filter((w) => w.word_key !== word_key));
    await sendMessage({ type: "DELETE_WORD", word_key });
  }, []);

  // CLEAR_DATA wipes vocab + settings + session cache on the background side.
  // We reset local state first so the UI doesn't flash stale data between
  // the message round-trip.
  const clear = useCallback(async () => {
    setWords([]);
    await sendMessage({ type: "CLEAR_DATA" });
  }, []);

  return { words, save, importMany, remove, clear };
}

// Canonical dedup key: trimmed + lowercased. Must match the algorithm used
// when constructing VocabWord.word_key elsewhere so lookups line up.
export function wordKeyOf(text: string): string {
  return text.trim().toLowerCase();
}
