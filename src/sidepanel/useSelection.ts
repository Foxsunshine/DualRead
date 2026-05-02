// Side-panel hook that owns "the current selection" and its translation.
//
// Two input sources feed into one state machine:
//   1. chrome.storage.session — used when the panel opens *after* the user
//      already selected text (background persists the last selection there).
//   2. SHOW_SELECTION runtime messages — live pushes while the panel is open.
//
// A monotonic token guards against out-of-order TRANSLATE responses: if the
// user selects A → B in quick succession, the late A response must not
// overwrite B's state.

import { useEffect, useState } from "react";
import { SESSION_KEY_LATEST_SELECTION, sendMessage } from "../shared/messages";
import type { Message } from "../shared/messages";
import type { Lang, SelectionPayload, TranslateResult } from "../shared/types";
import type { TranslateData } from "./screens/Translate";

export type TranslateErrorCode = "rate_limit" | "network" | "generic";

interface State {
  data: TranslateData | null;
  loading: boolean;
  error: TranslateErrorCode | null;
}

// Background emits coded strings ("rate_limit" | "network" | `http_<n>` | "parse").
// The panel only needs a 3-way split for i18n, so collapse everything non-specific
// into "generic".
function classifyError(raw: string): TranslateErrorCode {
  if (raw === "rate_limit") return "rate_limit";
  if (raw === "network") return "network";
  return "generic";
}

// Display host for the "source" chip. Falls back to the raw URL if parsing
// fails (e.g. file:// or custom schemes).
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Splits the context sentence around the selected text so the UI can render
// "<before><mark>word</mark><after>". Case-insensitive; if the needle isn't
// found we return the whole sentence as `before` with `found:false` so the
// caller can decide whether to show a highlight.
function splitContext(ctx: string, needle: string): { before: string; after: string; found: boolean } {
  if (!ctx) return { before: "", after: "", found: false };
  const i = ctx.toLowerCase().indexOf(needle.toLowerCase());
  if (i < 0) return { before: ctx, after: "", found: false };
  return { before: ctx.slice(0, i), after: ctx.slice(i + needle.length), found: true };
}

export function useSelection(target: Lang = "zh-CN", source: Lang = "en") {
  const [state, setState] = useState<State>({ data: null, loading: false, error: null });

  useEffect(() => {
    let cancelled = false;
    // Monotonic token: each `run()` takes a snapshot; late responses whose
    // token no longer matches the latest are dropped.
    let token = 0;

    const run = async (payload: SelectionPayload) => {
      const my = ++token;
      if (cancelled) return;

      // Show the word + context immediately while the network call is in
      // flight. Translation field stays empty — App.translationText() reads
      // `loading=true` and renders the localized "translating…" label, so
      // any literal placeholder here would never reach the user.
      const { before, after, found } = splitContext(payload.context_sentence, payload.text);
      const placeholder: TranslateData = {
        word: payload.text,
        translation: "",
        contextBefore: found ? before : payload.context_sentence,
        contextAfter: found ? after : "",
        source: hostOf(payload.source_url),
        sourceUrl: payload.source_url,
        contextSentence: payload.context_sentence,
      };
      setState({ data: placeholder, loading: true, error: null });

      const resp = await sendMessage({
        type: "TRANSLATE_REQUEST",
        text: payload.text,
        target,
        source,
        requester: "sidepanel",
      });
      if (cancelled || my !== token) return;

      if (resp.ok) {
        const r = resp.data as TranslateResult;
        setState({
          data: { ...placeholder, translation: r.translated || "—" },
          loading: false,
          error: null,
        });
      } else {
        // Keep the placeholder (word + context) visible so the user still
        // has something useful; the panel maps `error` to an i18n string.
        setState({ data: placeholder, loading: false, error: classifyError(resp.error) });
      }
    };

    // Source 1: late-open path. If the user selected text before opening the
    // panel, background already saved the payload here. Only consume it if
    // no live message has arrived yet (token === 0) to avoid replacing a
    // fresher selection on mount.
    chrome.storage.session.get(SESSION_KEY_LATEST_SELECTION).then((res) => {
      const saved = res[SESSION_KEY_LATEST_SELECTION] as SelectionPayload | undefined;
      if (saved && !cancelled && token === 0) void run(saved);
    });

    // Source 2: live pushes while the panel is open.
    const listener = (msg: Message) => {
      if (msg.type === "SHOW_SELECTION") {
        void run({
          text: msg.text,
          context_sentence: msg.context_sentence,
          source_url: msg.source_url,
        });
      }
    };
    chrome.runtime.onMessage.addListener(listener);

    return () => {
      cancelled = true;
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [target, source]);

  return state;
}
