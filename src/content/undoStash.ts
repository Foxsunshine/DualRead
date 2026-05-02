// Undo stash — in-memory hold for words the user just deleted via the
// in-page bubble. Drives the "did you mean to delete?" toast: if the
// user clicks Undo within the TTL, we pop the snapshot and re-fire
// SAVE_WORD with the exact same VocabWord so created_at/note/etc. are
// preserved. After expiry the entry is dropped silently.
//
// Pure module: no DOM, no chrome.* — so vitest can exercise it in
// the default node environment. The toast widget owns one instance
// per content script and forwards put/pop calls.
//
// Concurrency note: a second deletion of the same word_key while a
// stash entry already exists replaces the entry (the older toast is
// dismissed before the new one is shown, so we never leak overlapping
// timers).

import type { VocabWord } from "../shared/types";

export interface UndoStash {
  put(word: VocabWord, ttlMs: number, onExpire: (word: VocabWord) => void): void;
  pop(word_key: string): VocabWord | null;
  has(word_key: string): boolean;
  size(): number;
  clearAll(): void;
}

interface Entry {
  word: VocabWord;
  // setTimeout handle — cleared when the entry is popped or replaced
  // so the expiry callback never fires after a successful undo.
  timer: ReturnType<typeof setTimeout>;
}

export interface UndoStashOptions {
  // Injectable timer factory so tests can drive expiry deterministically
  // with vi.useFakeTimers / vi.advanceTimersByTime. Defaults to the
  // global setTimeout/clearTimeout pair.
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (handle: ReturnType<typeof setTimeout>) => void;
}

export function createUndoStash(options: UndoStashOptions = {}): UndoStash {
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((h) => clearTimeout(h));

  const map = new Map<string, Entry>();

  function dropEntry(word_key: string): void {
    const existing = map.get(word_key);
    if (!existing) return;
    clearTimer(existing.timer);
    map.delete(word_key);
  }

  return {
    put(word, ttlMs, onExpire): void {
      // Replace any existing entry for the same key. The older toast
      // should already be on its way out (caller hides it), so we just
      // need to make sure the older timer can't double-fire onExpire
      // for the same word_key.
      dropEntry(word.word_key);
      const timer = setTimer(() => {
        const entry = map.get(word.word_key);
        if (!entry) return;
        map.delete(word.word_key);
        onExpire(entry.word);
      }, ttlMs);
      map.set(word.word_key, { word, timer });
    },

    pop(word_key): VocabWord | null {
      const entry = map.get(word_key);
      if (!entry) return null;
      clearTimer(entry.timer);
      map.delete(word_key);
      return entry.word;
    },

    has(word_key): boolean {
      return map.has(word_key);
    },

    size(): number {
      return map.size;
    },

    clearAll(): void {
      for (const entry of map.values()) clearTimer(entry.timer);
      map.clear();
    },
  };
}
