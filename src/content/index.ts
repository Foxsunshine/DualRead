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
import { isHighlightable } from "../shared/highlightable";
import { createHighlighter } from "./highlight";
import { snapOffsetsToWord } from "./wordBoundary";
import { createBubble } from "./bubble";
import { createClickTranslator } from "./clickTranslate";
import { createFab } from "./fab";
import { createToast } from "./toast";
import { extractContext } from "./contextSentence";
import { fabStrings } from "./i18n";

// ───── Extension-context liveness ────────────────────────────
// When the user reloads the extension (or Chrome silently updates it while
// tabs are open), the *page* survives but this script's chrome.* bindings
// point at a dead worker. Touching `chrome.runtime.sendMessage` then throws
// "Extension context invalidated." We poll `chrome.runtime?.id` — undefined
// means we've been orphaned — and on the first dead read we tear down every
// listener we installed so the page goes quiet instead of spamming red
// errors on every mouseup / mutation.
function isExtensionAlive(): boolean {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

let shutdown: (() => void) | null = null;

function shutdownIfOrphaned(): boolean {
  if (isExtensionAlive()) return false;
  const fn = shutdown;
  shutdown = null;
  fn?.();
  return true;
}

// ───── Selection relay ───────────────────────────────────────
// Debounce identical selections so repeated mouseups on the same highlight
// don't spam the background. A fresh selection with different text clears
// the dedupe.
let lastSent = "";

const onMouseUp = (): void => {
  // Defer a tick so `window.getSelection()` reflects the final range — some
  // browsers update it on the next frame after mouseup.
  window.setTimeout(() => {
    if (shutdownIfOrphaned()) return;
    // Master switch (D52). When off, the content script is fully dormant
    // page-side — no bubble, no selection relay. FAB remains visible so
    // the user can re-enable. Checked here at handler entry so we don't
    // even compute `rawText` on pages where learning mode is off.
    if (!currentSettings.learning_mode_enabled) return;
    const sel = window.getSelection();
    const rawText = sel?.toString().trim() ?? "";
    if (!rawText || rawText.length < 2) return;

    const context = extractContext(sel?.anchorNode ?? null);

    // Drag-snap (v1.1 F1): locate the raw selection inside the block's
    // innerText and expand either endpoint that landed mid-word. If the
    // snap returns null, the selection is non-Latin (CJK / emoji) — we
    // drop it because v1.1 translation only targets English vocab.
    //
    // Fallbacks: when the raw text can't be found in the block context
    // (cross-block drag, or innerText normalization stripped something
    // the Selection kept), we send the raw text unchanged — worse than a
    // snap but no worse than v1 behavior.
    let text = rawText;
    if (context) {
      const idx = context.toLowerCase().indexOf(rawText.toLowerCase());
      if (idx >= 0) {
        const snapped = snapOffsetsToWord(context, idx, idx + rawText.length);
        if (snapped === null) return;
        text = snapped.text;
      }
    }

    // Show the in-page bubble for this selection (post-Phase-H fix). We do
    // this BEFORE the lastSent dedupe so that re-selecting the same text
    // re-opens the bubble — the dedupe only exists to avoid spamming the
    // side panel with redundant SELECTION_CHANGED messages; the bubble is
    // a user-facing surface and should respond to every fresh gesture.
    // Master-switch gating happens at handler entry, so by this point we
    // know learning mode is on.
    if (sel && sel.rangeCount > 0) {
      try {
        const range = sel.getRangeAt(0);
        const box = range.getBoundingClientRect();
        if (box.width > 0 || box.height > 0) {
          clickTranslator.showSelection({
            text,
            context,
            anchor: {
              top: box.top,
              left: box.left,
              right: box.right,
              bottom: box.bottom,
              width: box.width,
              height: box.height,
            },
          });
        }
      } catch {
        /* DOM may have mutated under us; skip the bubble silently */
      }
    }

    if (text === lastSent) return;
    lastSent = text;

    // Swallow send errors — the only expected failure here is a context
    // invalidation racing us between the liveness check and the call.
    chrome.runtime
      .sendMessage({
        type: "SELECTION_CHANGED",
        text,
        context_sentence: context,
        source_url: location.href,
      })
      .catch(() => {
        shutdownIfOrphaned();
      });
  }, 10);
};
document.addEventListener("mouseup", onMouseUp);

// ───── Bubble + click-translate (v1.1) ───────────────────────
// Bubble is a per-frame singleton and cheap to keep alive — it allocates
// no DOM until the first `show()`. The click translator adopts it as a
// dependency; the highlighter (below) routes saved-word clicks through
// the same translator via `showSaved`, so both surfaces share one bubble.
const bubble = createBubble();
const toast = createToast();

// Mutable reference so the storage listener can update settings in-place
// and the click translator's `getSettings()` closure reads the current
// value on every click (toggle takes effect immediately).
let currentSettings: Settings = { ...DEFAULT_SETTINGS };

const clickTranslator = createClickTranslator({
  bubble,
  toast,
  getSettings: () => currentSettings,
});

// FAB is mounted in init() (needs document.body) — module-scope holder
// lets the storage listener and shutdown path reach it.
let fab: ReturnType<typeof createFab> | null = null;

// True when the user has added the current page's origin to the FAB
// hide-list. We only check `location.origin` once per page load — origin
// can't change without a navigation.
function isFabDisabledHere(settings: Settings): boolean {
  return settings.fab_disabled_origins.includes(location.origin);
}

function mountFab(settings: Settings): ReturnType<typeof createFab> {
  return createFab({
    enabled: settings.learning_mode_enabled,
    strings: fabStrings(settings.ui_language),
    onToggle: () => void setLearningMode(!currentSettings.learning_mode_enabled),
  });
}

// Persist a new learning-mode value. Bubble is dismissed on turn-off so
// a user who pauses mid-translation doesn't see a stale bubble linger.
async function setLearningMode(enabled: boolean): Promise<void> {
  try {
    if (!chrome.runtime?.id) return;
    const { settings } = await chrome.storage.local.get("settings");
    const next: Settings = {
      ...DEFAULT_SETTINGS,
      ...((settings as Partial<Settings> | undefined) ?? {}),
      learning_mode_enabled: enabled,
    };
    await chrome.storage.local.set({ settings: next });
    // Storage listener will pick this up and re-sync currentSettings /
    // highlighter / FAB visual — we don't double-apply here.
    if (!enabled) {
      bubble.hide();
      toast.hide();
    }
  } catch {
    shutdownIfOrphaned();
  }
}

// ───── Highlight orchestration ───────────────────────────────
// One highlighter instance per frame. The module-scope singleton is fine
// because content scripts are per-frame anyway. v1.1: the click handler
// now routes through the bubble (D42 / Phase E) — we read the full
// VocabWord from storage and hand it to `showSaved`. If the read fails
// (extension context dead, word just deleted in another tab), we bail
// silently — a missed highlight click is better than a crash.
const highlighter = createHighlighter({
  onHighlightClick: ({ word_key, element }) => {
    void handleHighlightClick(word_key, element);
  },
  onHighlightHover: ({ word_key, element, kind }) => {
    if (kind === "enter") void handleHighlightHoverEnter(word_key, element);
    else clickTranslator.hideHover();
  },
});

function rectFromElement(element: HTMLElement) {
  const box = element.getBoundingClientRect();
  return {
    top: box.top,
    left: box.left,
    right: box.right,
    bottom: box.bottom,
    width: box.width,
    height: box.height,
  };
}

async function handleHighlightClick(
  word_key: string,
  element: HTMLElement
): Promise<void> {
  try {
    if (!chrome.runtime?.id) return;
    const key = `${STORAGE_PREFIX_VOCAB}${word_key}`;
    const res = await chrome.storage.sync.get(key);
    const saved = res[key] as VocabWord | undefined;
    if (!saved) return;
    // Snapshot the rect *after* the storage round trip — element may have
    // been scrolled / reflowed by the host page between click and now.
    clickTranslator.showSaved({
      anchor: rectFromElement(element),
      saved,
    });
  } catch {
    shutdownIfOrphaned();
  }
}

// Hover entry. Reads the saved record then opens the unified saved
// bubble with a debounced hide timer. Skipped while learning mode is
// paused — the content script should look fully dormant in that state.
// If the storage read finishes after a click already promoted the
// surface, the click translator's monotonic token guard drops the stale
// read.
async function handleHighlightHoverEnter(
  word_key: string,
  element: HTMLElement
): Promise<void> {
  try {
    if (!chrome.runtime?.id) return;
    if (!currentSettings.learning_mode_enabled) return;
    const key = `${STORAGE_PREFIX_VOCAB}${word_key}`;
    const res = await chrome.storage.sync.get(key);
    const saved = res[key] as VocabWord | undefined;
    if (!saved) return;
    clickTranslator.showHover({
      anchor: rectFromElement(element),
      saved,
    });
  } catch {
    shutdownIfOrphaned();
  }
}

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
    const key = word?.word_key ?? k.slice(STORAGE_PREFIX_VOCAB.length);
    // Sentences and non-Latin entries are stored but not fed to the matcher:
    // `\b...\b` on long/non-Latin text never yields useful hits, and keeping
    // them out of the regex keeps alternation cost bounded. See
    // shared/highlightable.ts for the full rationale.
    if (!isHighlightable(key)) continue;
    keys.push(key);
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

  const [settings, keys] = await Promise.all([
    readSettings(),
    readVocabKeys(),
  ]);
  currentSettings = settings;
  highlighter.setStyle(settings.highlight_style);
  highlighter.setVocab(keys);
  // Highlighter is gated on both the per-feature auto_highlight setting
  // and the master learning_mode switch. When learning is off we want a
  // fully clean page — highlights unwrapped too.
  highlighter.setEnabled(settings.auto_highlight_enabled && settings.learning_mode_enabled);

  if (!isFabDisabledHere(settings)) {
    fab = mountFab(settings);
  }

  // React to cross-context state changes:
  //  - sync area, any `v:*` key → vocab membership changed → rebuild matcher.
  //  - local area, `settings` key → toggle / style flip.
  const onStorageChanged = (
    changes: { [k: string]: chrome.storage.StorageChange },
    areaName: chrome.storage.AreaName
  ): void => {
    if (shutdownIfOrphaned()) return;
    if (areaName === "sync") {
      const touchedVocab = Object.keys(changes).some((k) =>
        k.startsWith(STORAGE_PREFIX_VOCAB)
      );
      if (touchedVocab) {
        void readVocabKeys()
          .then((next) => highlighter.setVocab(next))
          .catch(() => shutdownIfOrphaned());
      }
      return;
    }
    if (areaName === "local" && changes.settings) {
      const next = {
        ...DEFAULT_SETTINGS,
        ...((changes.settings.newValue as Partial<Settings> | undefined) ?? {}),
      };
      const prev = currentSettings;
      currentSettings = next;
      highlighter.setStyle(next.highlight_style);
      highlighter.setEnabled(next.auto_highlight_enabled && next.learning_mode_enabled);
      fab?.setEnabled(next.learning_mode_enabled);
      if (next.ui_language !== prev.ui_language) {
        fab?.setStrings(fabStrings(next.ui_language));
      }
      // React to per-origin hide-list flips. Tearing down `fab` rather than
      // hiding it via CSS keeps the host DOM completely free of our element
      // when the user has opted out — closer to "FAB never existed".
      const wasDisabled = isFabDisabledHere(prev);
      const nowDisabled = isFabDisabledHere(next);
      if (!wasDisabled && nowDisabled) {
        fab?.dispose();
        fab = null;
      } else if (wasDisabled && !nowDisabled) {
        fab = mountFab(next);
      }
    }
  };
  chrome.storage.onChanged.addListener(onStorageChanged);

  // Register the teardown path. Called once, on the first detection of an
  // invalidated extension context. We remove DOM listeners we own and dispose
  // the highlighter; the storage listener is best-effort (the API may throw
  // when chrome.* is already dead — that's why it's wrapped).
  shutdown = () => {
    document.removeEventListener("mouseup", onMouseUp);
    try {
      chrome.storage.onChanged.removeListener(onStorageChanged);
    } catch {
      /* chrome.* already dead — nothing to do */
    }
    clickTranslator.dispose();
    bubble.dispose();
    toast.dispose();
    highlighter.dispose();
    fab?.dispose();
    fab = null;
  };
}

void init();
