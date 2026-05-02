// Side-panel hook that owns the "jump to this word" intent coming from
// highlight clicks.
//
// Two input paths mirror useSelection.ts:
//   1. Late-open path — user clicked a highlight, sidePanel.open() couldn't
//      fire because of gesture loss, so the background wrote the word_key
//      into chrome.storage.session. On mount we read it once and consume it.
//   2. Live path — the panel was already open, so the background just
//      broadcasts a FOCUS_WORD runtime message, which we handle as it arrives.
//
// The hook returns the currently-focused word_key plus a monotonic tick that
// lets consumers re-trigger scroll/expand even when the same key is set twice.

import { useCallback, useEffect, useState } from "react";
import { SESSION_KEY_PENDING_FOCUS } from "../shared/messages";
import type { Message } from "../shared/messages";

export function useFocusWord() {
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  // A monotonically increasing tick, bumped every time focus is (re)set.
  // Lets the consumer re-trigger scroll/expand even when the same word_key
  // is focused twice in a row — setState dedupes identical values otherwise.
  const [tick, setTick] = useState(0);

  const focus = useCallback((word_key: string | null) => {
    setFocusedKey(word_key);
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Late-open path. Read and immediately clear so a later manual navigation
    // to Vocab doesn't re-jump to a stale word.
    chrome.storage.session.get(SESSION_KEY_PENDING_FOCUS).then((res) => {
      if (cancelled) return;
      const pending = res[SESSION_KEY_PENDING_FOCUS] as string | undefined;
      if (pending) {
        focus(pending);
        void chrome.storage.session.remove(SESSION_KEY_PENDING_FOCUS);
      }
    });

    const listener = (msg: Message) => {
      if (msg.type === "FOCUS_WORD") focus(msg.word_key);
    };
    chrome.runtime.onMessage.addListener(listener);

    return () => {
      cancelled = true;
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [focus]);

  return { focusedKey, focusTick: tick };
}
