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
import { sendMessage } from "../shared/messages";
import type { Message } from "../shared/messages";
import type { VocabWord } from "../shared/types";

interface State {
  words: VocabWord[];
  loaded: boolean;
}

export function useVocab() {
  const [state, setState] = useState<State>({ words: [], loaded: false });

  const refresh = useCallback(async () => {
    const resp = await sendMessage({ type: "GET_VOCAB" });
    if (!resp.ok) return;
    const words = (resp.data as VocabWord[] | undefined) ?? [];
    setState({ words, loaded: true });
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
  // will pull in the canonical order anyway.
  const save = useCallback(async (word: VocabWord) => {
    setState((s) => {
      const others = s.words.filter((w) => w.word_key !== word.word_key);
      return { ...s, words: [word, ...others] };
    });
    await sendMessage({ type: "SAVE_WORD", word });
  }, []);

  const remove = useCallback(async (word_key: string) => {
    setState((s) => ({ ...s, words: s.words.filter((w) => w.word_key !== word_key) }));
    await sendMessage({ type: "DELETE_WORD", word_key });
  }, []);

  // CLEAR_DATA wipes vocab + settings + session cache on the background side.
  // We reset local state first so the UI doesn't flash stale data between
  // the message round-trip.
  const clear = useCallback(async () => {
    setState({ words: [], loaded: true });
    await sendMessage({ type: "CLEAR_DATA" });
  }, []);

  return { ...state, save, remove, clear, refresh };
}

// Canonical dedup key: trimmed + lowercased. Must match the algorithm used
// when constructing VocabWord.word_key elsewhere so lookups line up.
export function wordKeyOf(text: string): string {
  return text.trim().toLowerCase();
}
