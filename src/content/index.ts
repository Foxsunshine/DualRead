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
import type { Settings, VocabWord, Lang } from "../shared/types";
import { STORAGE_PREFIX_VOCAB, sendMessage } from "../shared/messages";
import { isHighlightable } from "../shared/highlightable";
import { createHighlighter } from "./highlight";
import { snapOffsetsToWord } from "./wordBoundary";
import { stripOuterPunctuation } from "../shared/punctuation";
import { createBubble } from "./bubble";
import { createClickTranslator } from "./clickTranslate";
import { createFab } from "./fab";
import type { FabStrings } from "./fab";
import { createUndoToast } from "./toast";
import {
  hoverReducer,
  initialHoverState,
  HOVER_ENTER_DELAY_MS,
  HOVER_EXIT_DELAY_MS,
  type HoverCmd,
  type HoverEvent,
  type HoverState,
} from "./hoverReducer";

// FAB labels kept inline instead of importing `DR_STRINGS`. The side panel
// dict is ~70 keys and we only need two — copying here keeps the content
// bundle lean and decoupled from panel copy churn.
function fabStrings(lang: Lang): FabStrings {
  return lang === "zh-CN"
    ? {
        onLabel: "学习模式：已开启（点击关闭）",
        offLabel: "学习模式：已关闭（点击开启）",
      }
    : {
        onLabel: "Learning mode: on (click to turn off)",
        offLabel: "Learning mode: off (click to turn on)",
      };
}

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

    const context = extractContextSentence(sel);

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

    // v2.1.1 / DL-1: peel outer punctuation once here so both the bubble
    // (via showSelection) and the side-panel mirror (SELECTION_CHANGED)
    // see the same canonical form. If the selection was entirely
    // punctuation, drop the event — nothing meaningful to translate.
    text = stripOuterPunctuation(text);
    if (!text || text.length < 2) return;

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

// ───── Bubble + click-translate (v1.1) ───────────────────────
// Bubble is a per-frame singleton and cheap to keep alive — it allocates
// no DOM until the first `show()`. The click translator adopts it as a
// dependency; the highlighter (below) routes saved-word clicks through
// the same translator via `showSaved`, so both surfaces share one bubble.
const bubble = createBubble();

// v2.1 / D58: undo toast is also a per-frame singleton. Lives at this
// layer (not inside clickTranslate) because both the click-delete path
// and any future hover-triggered delete feed through the same surface,
// and the content-script orphan shutdown needs one reference to tear
// down. No DOM is allocated until the first `show()`.
const toast = createUndoToast();

// Mutable reference so the storage listener can update settings in-place
// and the click translator's `getSettings()` closure reads the current
// value on every click (toggle takes effect immediately).
let currentSettings: Settings = { ...DEFAULT_SETTINGS };

// v2.1 / §6.3: full VocabWord lookup map, keyed by `word_key` (canonical
// lowercased). The highlighter alone only needs the key *set* to build a
// regex; the hover path also needs `zh` + `note` to paint the bubble
// without a network round-trip (D59). We read once at boot and refresh on
// every sync-storage change that touches a `v:*` key — same trigger as
// the matcher rebuild, so the two never diverge.
let vocabMap: Map<string, VocabWord> = new Map();

// Forward-declared dispatcher so paintSavedBubble's onClose callback can
// notify the hover state machine without a circular module. Assigned in
// init() once the machine is wired up.
let dispatchHover: (event: HoverEvent) => void = () => {};

// v2.1.1 / DL-5: cache the frame's own tabId so the detail-icon handler
// can call `chrome.sidePanel.open({ tabId })` synchronously inside its
// click stack. `null` = sender.tab was undefined (shouldn't happen in a
// content-script context, but the type admits it); treat it as "no
// tab", meaning we silently skip the open attempt and let the
// FOCUS_WORD_IN_VOCAB + SESSION_KEY_PENDING_FOCUS pair carry the intent
// for next time the user opens the panel manually.
let cachedTabId: number | null = null;

// The user-gesture rule in MV3: `chrome.sidePanel.open` must be called
// synchronously inside the event handler that received the gesture. We
// do NOT `await` — kicking the promise off is enough to consume the
// gesture; the completion handler just logs a warning if it rejects.
// Chrome < 139 does not expose `chrome.sidePanel.open` to content
// scripts at all (the namespace is undefined), so we guard with optional
// chaining and a typeof check to avoid a TypeError on older browsers.
function openSidePanelFromGesture(): void {
  if (cachedTabId === null) return;
  try {
    if (
      typeof chrome !== "undefined" &&
      chrome.sidePanel &&
      typeof chrome.sidePanel.open === "function"
    ) {
      void chrome.sidePanel.open({ tabId: cachedTabId }).catch(() => {
        /* Already-open panels reject on some builds; also the rare case
           where the gesture window closed between handler entry and this
           call. Background still has the pending-focus session key from
           FOCUS_WORD_IN_VOCAB, so the next manual open recovers. */
      });
    }
  } catch {
    /* Chrome < 139, permissions quirk, or context teardown — quietly
       fall through to the background broadcast path. */
  }
}

const clickTranslator = createClickTranslator({
  bubble,
  toast,
  getSettings: () => currentSettings,
  onClickBubbleClose: () => dispatchHover({ type: "bubble_dismiss" }),
  openSidePanelFromGesture,
});

// FAB is mounted in init() (needs document.body) — module-scope holder
// lets the storage listener and shutdown path reach it.
let fab: ReturnType<typeof createFab> | null = null;

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
    if (!enabled) bubble.hide();
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
    // v2.1 / D61 row 9: clicking a highlighted mark takes the bubble from
    // whatever hover state it was in. Dispatch BEFORE running the click
    // flow so the state machine exits any PENDING_SHOW / PENDING_HIDE /
    // SHOWN into CLICK_OWNED — this keeps a late exit_timer_fired from
    // closing the bubble we're about to paint.
    dispatchHover({ type: "click_mark" });
    void handleHighlightClick(word_key, element);
  },
});

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
    const box = element.getBoundingClientRect();
    clickTranslator.showSaved({
      anchor: {
        top: box.top,
        left: box.left,
        right: box.right,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      },
      saved,
    });
  } catch {
    shutdownIfOrphaned();
  }
}

// Pull the saved vocab directly from chrome.storage.sync rather than
// round-tripping through GET_VOCAB. Reading storage is cheaper and keeps
// the service worker asleep on page load.
//
// v2.1 extension: we now return both the highlightable key list (for the
// matcher) and a full map (for hover preview lookups). Previously we
// threw the values away and kept only keys — cheap at the time, but hover
// needs `zh` + `note` and we'd rather not do a point-read per hover event.
async function readVocab(): Promise<{ keys: string[]; map: Map<string, VocabWord> }> {
  const all = await chrome.storage.sync.get(null);
  const keys: string[] = [];
  const map = new Map<string, VocabWord>();
  for (const [k, v] of Object.entries(all)) {
    if (!k.startsWith(STORAGE_PREFIX_VOCAB)) continue;
    const word = v as VocabWord | undefined;
    if (!word) continue;
    // `word_key` is the canonical lowercased dedupe key. Fall back to the
    // storage key suffix if an older record is missing the field (defensive;
    // shouldn't happen in practice).
    const key = word.word_key ?? k.slice(STORAGE_PREFIX_VOCAB.length);
    map.set(key, word);
    // Sentences and non-Latin entries are stored but not fed to the matcher:
    // `\b...\b` on long/non-Latin text never yields useful hits, and keeping
    // them out of the regex keeps alternation cost bounded. See
    // shared/highlightable.ts for the full rationale. We still put them in
    // the map so a hover over *already wrapped* non-standard entries (none
    // today, but defensive) could find them.
    if (!isHighlightable(key)) continue;
    keys.push(key);
  }
  return { keys, map };
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

  const [settings, vocab] = await Promise.all([readSettings(), readVocab()]);
  currentSettings = settings;
  vocabMap = vocab.map;

  // v2.1.1 / DL-5: prime the tabId cache. Deliberately fire-and-forget —
  // if the first GET_TAB_ID round-trip is still in flight when the user
  // clicks a detail icon, we skip the open-from-gesture path and fall
  // back to the FOCUS_WORD_IN_VOCAB broadcast (which still works, just
  // won't open a closed panel). In practice the init handshake lands
  // in <50 ms on warm workers, well before any click.
  void sendMessage({ type: "GET_TAB_ID" }).then((resp) => {
    if (resp.ok && typeof resp.data === "number") {
      cachedTabId = resp.data;
    }
  });
  highlighter.setStyle(settings.highlight_style);
  highlighter.setVocab(vocab.keys);
  // Highlighter is gated on both the per-feature auto_highlight setting
  // and the master learning_mode switch. When learning is off we want a
  // fully clean page — highlights unwrapped too.
  highlighter.setEnabled(settings.auto_highlight_enabled && settings.learning_mode_enabled);

  // ───── Hover state machine wiring (v2.1 / §6.3) ─────
  //
  // A single driver owns the hover timers and applies reducer-emitted
  // commands. Event sources: document-level mouseover/mouseout delegated
  // to `.dr-hl` spans + the bubble's shadow host, plus document-level
  // dragstart. `hover_enabled` short-circuits the whole pipeline when
  // learning mode / auto-highlight is off so FAB-OFF pages pay zero cost.
  const hover = createHoverDriver({
    showBubble: (mark, word_key) => {
      const saved = vocabMap.get(word_key);
      if (!saved) return; // SPA/race: key was in the matcher but the value
      //                    evicted between match and hover. Drop the show
      //                    rather than paint an empty bubble.
      const rect = mark.getBoundingClientRect();
      clickTranslator.showHover({
        anchor: {
          top: rect.top,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
        saved,
      });
    },
    hideBubble: () => bubble.hide(),
    isEnabled: () =>
      currentSettings.auto_highlight_enabled && currentSettings.learning_mode_enabled,
  });
  dispatchHover = hover.dispatch;

  fab = createFab({
    enabled: settings.learning_mode_enabled,
    strings: fabStrings(settings.ui_language),
    onToggle: () => void setLearningMode(!currentSettings.learning_mode_enabled),
  });

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
        void readVocab()
          .then((next) => {
            vocabMap = next.map;
            highlighter.setVocab(next.keys);
          })
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
    hover.dispose();
    clickTranslator.dispose();
    bubble.dispose();
    toast.dispose();
    highlighter.dispose();
    fab?.dispose();
    fab = null;
  };
}

void init();

// ───── Hover driver (v2.1 / §6.3) ─────────────────────────────
//
// Glue between the DOM and the pure `hoverReducer`. Owns the two
// timers (enter 300 ms / exit 150 ms), delegates bubble show/hide into
// the caller-provided closures, and bridges MutationObserver node
// removals into `detach` events so SPAs that rip a mark out of the DOM
// while the user is hovering don't leave a ghost bubble.

interface HoverDriverDeps {
  showBubble: (mark: HTMLElement, word_key: string) => void;
  hideBubble: () => void;
  isEnabled: () => boolean;
}

interface HoverDriver {
  dispatch: (event: HoverEvent) => void;
  dispose: () => void;
}

function createHoverDriver(deps: HoverDriverDeps): HoverDriver {
  const { showBubble, hideBubble, isEnabled } = deps;
  let state: HoverState = initialHoverState();

  // Timers live here (not in the reducer) because JS timers are a side
  // effect. The reducer returns `start_*` / `clear_*` commands which we
  // turn into `setTimeout` / `clearTimeout` calls.
  let enterTimer: number | null = null;
  let exitTimer: number | null = null;

  const clearEnter = (): void => {
    if (enterTimer !== null) {
      window.clearTimeout(enterTimer);
      enterTimer = null;
    }
  };
  const clearExit = (): void => {
    if (exitTimer !== null) {
      window.clearTimeout(exitTimer);
      exitTimer = null;
    }
  };

  function dispatch(event: HoverEvent): void {
    // Master gate: when the hover feature is disabled (FAB off, vocab
    // empty, auto_highlight off), we still accept `bubble_dismiss` so a
    // CLICK_OWNED state created before the toggle cleans up — but every
    // hover-specific event becomes a no-op.
    if (!isEnabled() && event.type !== "bubble_dismiss") {
      // If the machine is carrying timers from before the disable, flush
      // them so we don't promote to SHOWN after the user turned hover off.
      if (state.kind !== "idle" && state.kind !== "click_owned") {
        clearEnter();
        clearExit();
        state = initialHoverState();
      }
      return;
    }
    const step = hoverReducer(state, event);
    state = step.state;
    for (const cmd of step.cmds) applyCmd(cmd);
  }

  function applyCmd(cmd: HoverCmd): void {
    switch (cmd.type) {
      case "clear_enter_timer":
        clearEnter();
        return;
      case "clear_exit_timer":
        clearExit();
        return;
      case "start_enter_timer":
        clearEnter();
        enterTimer = window.setTimeout(() => {
          enterTimer = null;
          dispatch({ type: "enter_timer_fired" });
        }, HOVER_ENTER_DELAY_MS);
        return;
      case "start_exit_timer":
        clearExit();
        exitTimer = window.setTimeout(() => {
          exitTimer = null;
          dispatch({ type: "exit_timer_fired" });
        }, HOVER_EXIT_DELAY_MS);
        return;
      case "show_bubble":
        showBubble(cmd.ctx.mark as HTMLElement, cmd.ctx.word_key);
        return;
      case "hide_bubble":
        hideBubble();
        return;
    }
  }

  // ───── DOM plumbing ─────
  //
  // Delegation: one `mouseover` / `mouseout` pair on `document` rather
  // than per-span listeners. Span lifecycle is managed by highlight.ts
  // and SPA re-renders can churn dozens per second; delegation avoids
  // the attach/detach storm.

  const HL_SELECTOR = "span.dr-hl";
  // Identifies the bubble's shadow host. We own this attribute in
  // bubble.ts; events that retarget to the host (closed shadow root)
  // land with `e.target` equal to the host element, which we detect
  // via this attribute.
  const BUBBLE_HOST_ATTR = "data-dualread-bubble";

  function targetMark(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    return target.closest(HL_SELECTOR) as HTMLElement | null;
  }

  function targetIsBubble(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    return target.hasAttribute(BUBBLE_HOST_ATTR);
  }

  const onMouseOver = (e: MouseEvent): void => {
    const bubbleHit = targetIsBubble(e.target);
    if (bubbleHit) {
      dispatch({ type: "mouseover_bubble" });
      return;
    }
    const mark = targetMark(e.target);
    if (!mark) return;
    const word_key = mark.dataset.word;
    if (!word_key) return;
    // `relatedTarget` is where the cursor came FROM. If it's the same
    // mark (e.g. moving between text nodes inside the span), skip — the
    // reducer would treat it as a redundant mouseover_mark which is
    // already a no-op for same-mark case, but early-returning saves a
    // function call on dense pages.
    if (e.relatedTarget instanceof Element && e.relatedTarget.closest(HL_SELECTOR) === mark) {
      return;
    }
    dispatch({ type: "mouseover_mark", ctx: { mark, word_key } });
  };

  const onMouseOut = (e: MouseEvent): void => {
    const bubbleHit = targetIsBubble(e.target);
    if (bubbleHit) {
      // Don't fire `mouseout_bubble` when the cursor merely moved into a
      // child of the bubble shadow host (impossible here — shadow root
      // is closed — but the check is cheap insurance).
      if (
        e.relatedTarget instanceof Element &&
        e.relatedTarget.hasAttribute(BUBBLE_HOST_ATTR)
      ) {
        return;
      }
      dispatch({ type: "mouseout_bubble" });
      return;
    }
    const mark = targetMark(e.target);
    if (!mark) return;
    // Ignore same-mark internal moves (see onMouseOver comment).
    if (e.relatedTarget instanceof Element && e.relatedTarget.closest(HL_SELECTOR) === mark) {
      return;
    }
    dispatch({ type: "mouseout_mark", mark });
  };

  // dragstart fires once when the user begins selecting text (or drags
  // an image / link). Either way the bubble should clear so it doesn't
  // interfere with the drag target's hit area.
  const onDragStart = (): void => {
    dispatch({ type: "dragstart" });
  };

  document.addEventListener("mouseover", onMouseOver);
  document.addEventListener("mouseout", onMouseOut);
  document.addEventListener("dragstart", onDragStart);

  // Detach observer: SPAs (YouTube, Gmail, X/Twitter) frequently detach
  // subtrees containing our `.dr-hl` spans. If the currently-shown mark
  // goes away under us, we want to close the bubble rather than leave it
  // floating over empty space. We reuse a narrow MutationObserver (body
  // subtree, childList only) — cheap even on busy pages because the
  // handler early-outs when hover isn't referencing anything.
  const detachObserver = new MutationObserver((mutations) => {
    if (state.kind === "idle" || state.kind === "click_owned") return;
    for (const m of mutations) {
      for (const n of m.removedNodes) {
        if (!(n instanceof Element)) continue;
        // If the removed node *is* a mark or *contains* the state mark,
        // fire detach. Using `.contains` covers cases where a framework
        // removed a parent, taking the span with it.
        const refMark =
          state.kind === "pending_show" ||
          state.kind === "shown" ||
          state.kind === "pending_hide"
            ? (state.ctx.mark as HTMLElement)
            : null;
        if (!refMark) continue;
        if (n === refMark || n.contains(refMark)) {
          dispatch({ type: "detach", mark: refMark });
          return;
        }
      }
    }
  });
  if (document.body) {
    detachObserver.observe(document.body, { childList: true, subtree: true });
  }

  return {
    dispatch,
    dispose(): void {
      clearEnter();
      clearExit();
      detachObserver.disconnect();
      document.removeEventListener("mouseover", onMouseOver);
      document.removeEventListener("mouseout", onMouseOut);
      document.removeEventListener("dragstart", onDragStart);
    },
  };
}
