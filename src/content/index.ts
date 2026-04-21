// DualRead content script.
//
// Responsibilities:
//   1. Selection relay — forward mouseup selections (+ surrounding sentence)
//      to the background so the side panel can translate them. Phase 0.
//   2. Highlight engine — wrap saved vocab on the page, observe DOM changes,
//      and forward click-on-highlight to the background. Phase 3.
//
// Everything page-facing lives here. Network IO, storage writes, and routing
// stay in the service worker — this file only mutates the host DOM and emits
// runtime messages.

import { DEFAULT_SETTINGS } from "../shared/types";
import type { Settings, VocabWord } from "../shared/types";
import { STORAGE_PREFIX_VOCAB } from "../shared/messages";
import { createHighlighter } from "./highlight";

// ───── Selection relay ───────────────────────────────────────
// Debounce identical selections so repeated mouseups on the same highlight
// don't spam the background. A fresh selection with different text clears
// the dedupe.
let lastSent = "";

document.addEventListener("mouseup", () => {
  // Defer a tick so `window.getSelection()` reflects the final range — some
  // browsers update it on the next frame after mouseup.
  window.setTimeout(() => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (!text || text.length < 2 || text === lastSent) return;
    lastSent = text;

    chrome.runtime.sendMessage({
      type: "SELECTION_CHANGED",
      text,
      context_sentence: extractContextSentence(sel),
      source_url: location.href,
    });
  }, 10);
});

// Walk up from the selection anchor to the nearest block element and return
// its collapsed innerText, trimmed to 400 chars. Gives the side panel a useful
// "in context" sentence without needing real sentence segmentation.
function extractContextSentence(selection: Selection | null): string {
  try {
    const node = selection?.anchorNode ?? null;
    const block =
      node?.nodeType === Node.TEXT_NODE
        ? (node.parentElement?.closest(
            "p, li, h1, h2, h3, h4, h5, h6, blockquote, td, figcaption, div"
          ) as HTMLElement | null)
        : null;
    const text = (block?.innerText || "").replace(/\s+/g, " ").trim();
    if (!text) return "";
    return text.length > 400 ? text.slice(0, 400) + "…" : text;
  } catch {
    return "";
  }
}

// ───── Highlight orchestration ───────────────────────────────
// One highlighter instance per frame. The module-scope singleton is fine
// because content scripts are per-frame anyway.
const highlighter = createHighlighter();

// Pull the saved vocab directly from chrome.storage.sync rather than
// round-tripping through GET_VOCAB. The content script only needs the key
// set (not the full VocabWord values) — reading storage is cheaper and keeps
// the service worker asleep on page load.
async function readVocabKeys(): Promise<string[]> {
  const all = await chrome.storage.sync.get(null);
  const keys: string[] = [];
  for (const [k, v] of Object.entries(all)) {
    if (!k.startsWith(STORAGE_PREFIX_VOCAB)) continue;
    const word = v as VocabWord | undefined;
    // `word_key` is the canonical lowercased dedupe key. Fall back to the
    // storage key suffix if an older record is missing the field (defensive;
    // shouldn't happen in practice).
    keys.push(word?.word_key ?? k.slice(STORAGE_PREFIX_VOCAB.length));
  }
  return keys;
}

async function readSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(settings as Partial<Settings> | undefined) };
}

// Boot sequence. `document_idle` run_at means DOMContentLoaded has typically
// already fired, but the DESIGN.md §3 gotcha #10 calls out rare edge cases
// where body isn't mounted yet.
async function init(): Promise<void> {
  if (!document.body) {
    await new Promise<void>((resolve) =>
      document.addEventListener("DOMContentLoaded", () => resolve(), { once: true })
    );
  }

  const [settings, keys] = await Promise.all([readSettings(), readVocabKeys()]);
  highlighter.setStyle(settings.highlight_style);
  highlighter.setVocab(keys);
  highlighter.setEnabled(settings.auto_highlight_enabled);

  // React to cross-context state changes:
  //  - sync area, any `v:*` key → vocab membership changed → rebuild matcher.
  //  - local area, `settings` key → toggle / style flip.
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "sync") {
      const touchedVocab = Object.keys(changes).some((k) =>
        k.startsWith(STORAGE_PREFIX_VOCAB)
      );
      if (touchedVocab) {
        void readVocabKeys().then((next) => highlighter.setVocab(next));
      }
      return;
    }
    if (areaName === "local" && changes.settings) {
      const next = {
        ...DEFAULT_SETTINGS,
        ...((changes.settings.newValue as Partial<Settings> | undefined) ?? {}),
      };
      highlighter.setStyle(next.highlight_style);
      highlighter.setEnabled(next.auto_highlight_enabled);
    }
  });
}

void init();
