// Click-to-translate pipeline (v1.1 F3, Phase D).
//
// Users reported in v1 that reaching the side panel's Save button broke
// reading flow. This module installs a capture-phase click listener that
// intercepts "click on a plain English word in the page" events, resolves
// the exact word under the cursor, and routes the result into the in-page
// bubble (src/content/bubble.ts).
//
// Filter chain (D39). Rejections are silent — we fall through to whatever
// the host page wanted to do with the click:
//   1. `settings.learning_mode_enabled === false` — master switch off (D52)
//   2. modifier keys (meta/ctrl/alt/shift) — preserve native nav like
//      Cmd+click-to-open-in-new-tab
//   3. drag > 4 px between mousedown and click — selection gesture, not
//      a click lookup; handled by the mouseup/SELECTION_CHANGED path
//   4. `e.defaultPrevented` — another handler already claimed this event
//   5. target in/is <a>, <button>, <input>, <textarea>, <select> — let
//      the host's interactive elements do their job
//   6. target in contenteditable — user is typing; don't hijack
//   7. target in EXCLUDED_TAGS (<code>, <pre>, <script>, <style>, etc.) —
//      these are code blocks and scripting areas, never prose
//   8. target inside `.dr-hl` — handled by highlight.ts's click handler
//      in Phase D; Phase E re-routes saved-word clicks into the same
//      bubble with a different state shape
//   9. `caretRangeFromPoint` must land on a text node AND `wordAtOffset`
//      must return a Latin word — click on whitespace / punctuation /
//      CJK / empty space yields no bubble
//
// Race handling: a monotonic token guards against stale TRANSLATE_RESULT
// responses — if the user clicks word A then word B within the network
// round-trip, word A's late response must not repaint over B.

import type { VocabWord, TranslateResult, Settings, Lang } from "../shared/types";
import type { BubbleHandle, BubbleAnchor } from "./bubble";
import type { ToastHandle } from "./toast";
import { sendMessage, STORAGE_PREFIX_VOCAB } from "../shared/messages";
import { wordAtOffset } from "./wordBoundary";
import { extractContext } from "./contextSentence";
import { bubbleStrings, toastStrings, translateErrorMessage } from "./i18n";

// Grace period between mouseleave-from-highlight (or mouseleave-from-bubble)
// and the actual hide. Lets the user move the cursor diagonally from the
// underlined word into the bubble itself without the bubble vanishing
// mid-traversal. 150 ms is the same beat as the side panel's hover
// animations; shorter feels jumpy, longer feels sticky.
const HOVER_HIDE_DELAY_MS = 150;

// ───── Constants ─────────────────────────────────────────────
//
// Filter-chain thresholds and tag lists. DRAG_THRESHOLD_PX comes from
// Chrome's own text-selection UI (it starts a drag after ~4 px) — matching
// the browser's intent threshold avoids surprising the user either way.
const DRAG_THRESHOLD_PX = 4;

// Matches highlight.ts's EXCLUDED_TAGS (kept in sync by hand). Duplicated
// deliberately so that module's filter and this one evolve independently
// when their needs diverge.
const EXCLUDED_TAG_SELECTOR =
  "script,style,noscript,textarea,input,select,option,code,pre,kbd,samp,iframe,object,embed";
const INTERACTIVE_SELECTOR = "a,button,input,textarea,select,option";
const CONTENTEDITABLE_SELECTOR =
  '[contenteditable], [contenteditable="true"], [contenteditable=""]';
const HIGHLIGHT_SELECTOR = "span.dr-hl";

// ───── Saved-word lookup ─────────────────────────────────────
//
// Read the full VocabWord from sync storage for a given key. Returns null
// when the word isn't saved or the read fails. We use this both as the
// initial "is saved?" check on click and after a successful SAVE_WORD to
// pick up the note/zh the background wrote.
async function readSavedWord(word_key: string): Promise<VocabWord | null> {
  try {
    const key = `${STORAGE_PREFIX_VOCAB}${word_key}`;
    const res = await chrome.storage.sync.get(key);
    return (res[key] as VocabWord | undefined) ?? null;
  } catch {
    return null;
  }
}

// ───── Caret → word resolution ───────────────────────────────
//
// Wraps `caretRangeFromPoint` (supported in Chromium; Firefox has
// `caretPositionFromPoint` with a different return shape — we only ship
// to Chrome in v1.x so this is fine). Returns the text node, the word
// offsets within it, and the word text. Callers own the bounding-rect
// computation because they need a Range anyway.

interface ResolvedWord {
  textNode: Text;
  start: number;
  end: number;
  word: string;
}

function resolveWordAtPoint(x: number, y: number): ResolvedWord | null {
  // `caretRangeFromPoint` returns null for uncatched coordinates (e.g.,
  // clicks outside any text-containing element).
  const caret = document.caretRangeFromPoint(x, y);
  if (!caret) return null;
  const node = caret.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return null;
  const textNode = node as Text;
  const hit = wordAtOffset(textNode.data, caret.startOffset);
  if (!hit) return null;
  return { textNode, start: hit.start, end: hit.end, word: hit.text };
}

function rectForWord(textNode: Text, start: number, end: number): BubbleAnchor {
  const r = document.createRange();
  r.setStart(textNode, start);
  r.setEnd(textNode, end);
  const box = r.getBoundingClientRect();
  // Some layouts (wrap boundaries, ruby-text) can return 0×0 rects. When
  // that happens we fall back to a collapsed-point rect at the range start
  // so the bubble has *something* to anchor to rather than {0,0}.
  if (box.width === 0 && box.height === 0) {
    r.collapse(true);
    const fallback = r.getBoundingClientRect();
    return {
      top: fallback.top,
      left: fallback.left,
      right: fallback.left,
      bottom: fallback.top,
      width: 0,
      height: 0,
    };
  }
  return {
    top: box.top,
    left: box.left,
    right: box.right,
    bottom: box.bottom,
    width: box.width,
    height: box.height,
  };
}

// ───── Public factory ────────────────────────────────────────

export interface ClickTranslatorDeps {
  bubble: BubbleHandle;
  toast: ToastHandle;
  // Pulled via callback (not value) so the toggle reflects live settings
  // changes — the content script listens to storage.onChanged and the
  // click handler re-reads on every click.
  getSettings(): Settings;
}

export interface ClickTranslatorHandle {
  dispose(): void;
  // Saved-word entry point (v1.1 D42 + Phase E). Called by the highlight
  // engine when the user clicks a `.dr-hl` span. Anchor is a bounding
  // rect (usually `element.getBoundingClientRect()` converted to our
  // BubbleAnchor shape). The bubble shows zh + note + "打开详情" link and
  // no Save button because the word is already saved. On "打开详情" click
  // the handler sends FOCUS_WORD_IN_VOCAB so the side panel opens/focuses
  // the word in its Vocab tab.
  showSaved(args: { anchor: BubbleAnchor; saved: VocabWord }): void;
  // Drag-selection entry point (v1.1 post-Phase-H feedback). Called from
  // content/index.ts after a valid mouseup selection has been snapped to
  // word boundaries. Runs the same translate + save-check flow as a single
  // click, but with a pre-computed anchor (the selection's bounding rect)
  // and text. This makes multi-word phrases surface the same in-page UI
  // as single-word clicks instead of silently routing to the side panel.
  showSelection(args: { text: string; anchor: BubbleAnchor; context: string }): void;
  // Hover-preview entry point. Read-only translation surface for an
  // already-saved word; the bubble enters its `hoverPreview` state.
  // Replaces any existing hover preview; a click on the same highlight
  // promotes the bubble to the full saved variant via showSaved.
  showHover(args: { anchor: BubbleAnchor; saved: VocabWord }): void;
  // Schedule (debounced) hide of an active hover preview. No-op if the
  // active flow has been promoted to `click`/`saved` — those flows
  // own their own dismissal (mousedown-outside / ESC / scroll).
  hideHover(): void;
  // Cancel a pending hover-hide. Called when the cursor moves into the
  // bubble itself so the user can interact with note text without the
  // surface vanishing.
  cancelHoverHide(): void;
}

export function createClickTranslator(deps: ClickTranslatorDeps): ClickTranslatorHandle {
  const { bubble, toast, getSettings } = deps;

  // Drag tracking. Every mousedown resets the origin; the click handler
  // compares against it to decide drag-vs-click.
  let mouseDownX = 0;
  let mouseDownY = 0;
  const onMouseDown = (e: MouseEvent): void => {
    mouseDownX = e.clientX;
    mouseDownY = e.clientY;
  };

  // Monotonic token for race-guard against stale network responses.
  // Shared across click / selection / saved / hover entry points so a
  // newer flow always wins regardless of which surface produced it.
  let currentToken = 0;

  // The click that produced the currently-open bubble. Used by Save and
  // Retry handlers to re-issue work against the same anchor and word.
  type FlowKind = "click" | "selection" | "saved" | "hover";
  interface CurrentClick {
    token: number;
    kind: FlowKind;
    word: string;
    anchor: BubbleAnchor;
    context: string;
    lang: Lang;
  }
  let active: CurrentClick | null = null;

  // Hover-hide debounce state. The orchestrator calls hideHover on
  // mouseleave-from-highlight and again on mouseleave-from-bubble; we
  // coalesce both into one timer keyed off the latest call. cancelHoverHide
  // (mouseenter-bubble) clears it.
  let hoverHideTimer: number | null = null;
  function clearHoverHideTimer(): void {
    if (hoverHideTimer !== null) {
      window.clearTimeout(hoverHideTimer);
      hoverHideTimer = null;
    }
  }

  async function startFlow(click: CurrentClick): Promise<void> {
    active = click;
    const strings = bubbleStrings(click.lang);
    const word_key = click.word.trim().toLowerCase();

    bubble.show({
      anchor: click.anchor,
      state: { kind: "loading", word: click.word },
      strings,
      onClose: () => {
        if (active?.token === click.token) active = null;
      },
    });

    // Translate and saved-check in parallel — both involve I/O, neither
    // depends on the other, and the bubble reveals the combined result.
    const [saved, resp] = await Promise.all([
      readSavedWord(word_key),
      sendMessage({
        type: "TRANSLATE_REQUEST",
        text: click.word,
        target: "zh-CN",
        requester: "bubble",
      }),
    ]);

    // Stale response guard: if the user clicked another word (or closed
    // the bubble) in the meantime, drop this result silently.
    if (active?.token !== click.token) return;

    if (!resp.ok) {
      bubble.show({
        anchor: click.anchor,
        state: { kind: "error", word: click.word, message: translateErrorMessage(resp.error, click.lang) },
        strings,
        onRetry: () => void startFlow({ ...click, token: ++currentToken }),
        onClose: () => {
          if (active?.token === click.token) active = null;
        },
      });
      return;
    }

    const translation = (resp.data as TranslateResult | undefined)?.translated || "—";
    renderTranslated(click, translation, saved);
  }

  function renderTranslated(click: CurrentClick, translation: string, saved: VocabWord | null): void {
    const strings = bubbleStrings(click.lang);
    bubble.show({
      anchor: click.anchor,
      state: {
        kind: "translated",
        word: click.word,
        translation,
        saved: saved !== null,
        note: saved?.note,
        showDeleteButton: saved !== null,
      },
      strings,
      onSave: saved ? undefined : () => void handleSave(click, translation),
      onDelete: saved
        ? () => {
            const snapshot: VocabWord = { ...saved };
            const tokenAtClick = click.token;
            if (active?.token === tokenAtClick) active = null;
            bubble.hide();
            toast.showDeleted({
              word: snapshot,
              strings: toastStrings(click.lang),
              onUndo: (restored) => void handleUndoRestore(restored),
            });
            try {
              if (!chrome.runtime?.id) return;
              void sendMessage({ type: "DELETE_WORD", word_key: snapshot.word_key }).catch(() => {
                /* swallow — see showSaved.onDelete */
              });
            } catch {
              /* context invalidated */
            }
          }
        : undefined,
      onClose: () => {
        if (active?.token === click.token) active = null;
      },
    });
  }

  async function handleSave(click: CurrentClick, translation: string): Promise<void> {
    const now = Date.now();
    const word_key = click.word.trim().toLowerCase();
    const vw: VocabWord = {
      word: click.word,
      word_key,
      translation,
      ctx: click.context || undefined,
      source_url: location.href,
      created_at: now,
      updated_at: now,
      schema_version: 2,
    };
    try {
      if (!chrome.runtime?.id) return;
      const resp = await sendMessage({ type: "SAVE_WORD", word: vw });
      // Only flip the bubble to "saved" if we're still the active flow.
      // The user may have clicked another word while the save was
      // in-flight; don't paint onto someone else's bubble.
      if (active?.token !== click.token) return;
      if (resp.ok) renderTranslated(click, translation, vw);
    } catch {
      /* context invalidated or save failed — silently keep Save enabled so
         the user can retry. A future iteration could surface a toast. */
    }
  }

  // ───── Filter chain ──────────────────────────────────────────

  function passesFilterChain(e: MouseEvent): boolean {
    const settings = getSettings();
    if (!settings.learning_mode_enabled) return false;
    if (e.defaultPrevented) return false;
    // Only left-button plain clicks. Modifier keys preserve native
    // behaviors (Cmd-click = new tab, Shift-click = extend selection).
    if (e.button !== 0) return false;
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return false;
    const dx = e.clientX - mouseDownX;
    const dy = e.clientY - mouseDownY;
    if (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return false;

    const target = e.target as Element | null;
    if (!target || typeof target.closest !== "function") return false;
    if (target.closest(HIGHLIGHT_SELECTOR)) return false;
    if (target.closest(INTERACTIVE_SELECTOR)) return false;
    if (target.closest(CONTENTEDITABLE_SELECTOR)) return false;
    if (target.closest(EXCLUDED_TAG_SELECTOR)) return false;
    return true;
  }

  const onClick = (e: MouseEvent): void => {
    if (!passesFilterChain(e)) return;

    const resolved = resolveWordAtPoint(e.clientX, e.clientY);
    if (!resolved) return;

    // Commit: prevent the host page from reacting to the click. This is
    // the first side effect in the pipeline — everything above is a
    // read-only inspection.
    e.preventDefault();
    e.stopPropagation();

    const context = extractContext(resolved.textNode);
    const click: CurrentClick = {
      token: ++currentToken,
      kind: "click",
      word: resolved.word,
      anchor: rectForWord(resolved.textNode, resolved.start, resolved.end),
      context,
      lang: getSettings().ui_language,
    };
    // A click in the document supersedes any pending hover dismissal.
    clearHoverHideTimer();
    // Mirror the bubble's lookup into the side panel so the Translate tab
    // shows the same word + context + source_url and — via Phase F's
    // selection effect — auto-switches from Vocab/Settings back to
    // Translate. Best-effort: the bubble is the authoritative result
    // surface, so a failed sidepanel sync shouldn't block the bubble.
    try {
      if (chrome.runtime?.id) {
        void chrome.runtime
          .sendMessage({
            type: "SELECTION_CHANGED",
            text: resolved.word,
            context_sentence: context,
            source_url: location.href,
          })
          .catch(() => {
            /* sidepanel may be closed; TRANSLATE_REQUEST below still lights the bubble */
          });
      }
    } catch {
      /* extension context invalidated — swallow, bubble flow will fail next */
    }
    void startFlow(click);
  };

  // Capture phase so host `stopPropagation`s in bubble-phase listeners
  // can't deny us the event. Mousedown is bubble phase because we only
  // need the coordinates — any handler that preventDefaults mousedown
  // (rare, usually drag-drop libraries) implies the page wants the
  // click for itself, which the click-phase filter will catch anyway.
  document.addEventListener("mousedown", onMouseDown);
  document.addEventListener("click", onClick, { capture: true });

  // Saved-word flow (Phase E). Deliberately separate from startFlow: no
  // TRANSLATE_REQUEST (we already have `zh`), no Save button (word is
  // already saved), adds the "打开详情" detail link. Reuses the same
  // monotonic token so a fresh click-to-translate can still race this
  // out — a later click wins regardless of which flow opened the bubble.
  function showSaved(args: { anchor: BubbleAnchor; saved: VocabWord }): void {
    const { anchor, saved } = args;
    const lang = getSettings().ui_language;
    const strings = bubbleStrings(lang);
    const token = ++currentToken;
    const click: CurrentClick = {
      token,
      kind: "saved",
      word: saved.word || saved.word_key,
      anchor,
      context: saved.ctx ?? "",
      lang,
    };
    active = click;
    // A click that promoted the surface to saved supersedes any pending
    // hover-hide schedule from the same hover the user came in on.
    clearHoverHideTimer();

    bubble.show({
      anchor,
      state: {
        kind: "translated",
        word: click.word,
        translation: saved.translation || "—",
        saved: true,
        note: saved.note,
        showDetailLink: true,
        showDeleteButton: true,
      },
      strings,
      onDetail: () => {
        try {
          if (!chrome.runtime?.id) return;
          void sendMessage({
            type: "FOCUS_WORD_IN_VOCAB",
            word_key: saved.word_key,
          });
        } catch {
          /* context invalidated between check and send — swallow */
        }
        bubble.hide();
        if (active?.token === token) active = null;
      },
      onDelete: () => {
        // Capture the snapshot BEFORE we hide the bubble — we need
        // the full VocabWord (note, ctx, created_at, …) intact so the
        // undo path can re-emit the exact same record.
        const snapshot: VocabWord = { ...saved };
        if (active?.token === token) active = null;
        bubble.hide();
        // Show the toast first so the user sees the affordance even
        // if DELETE_WORD takes a beat. Storage commits in parallel.
        toast.showDeleted({
          word: snapshot,
          strings: toastStrings(lang),
          onUndo: (restored) => void handleUndoRestore(restored),
        });
        try {
          if (!chrome.runtime?.id) return;
          void sendMessage({ type: "DELETE_WORD", word_key: snapshot.word_key }).catch(() => {
            /* swallow — orchestrator's storage listener will reconcile */
          });
        } catch {
          /* context invalidated — toast still gives the user a non-destructive escape */
        }
      },
      onClose: () => {
        if (active?.token === token) active = null;
      },
    });
  }

  // Hover preview. No translate round trip — we already have `zh` from
  // storage. Anchor and word_key share the same race-guard token as the
  // click flow so a fresh click overrides an in-flight hover seamlessly.
  function showHover(args: { anchor: BubbleAnchor; saved: VocabWord }): void {
    const { anchor, saved } = args;
    const lang = getSettings().ui_language;
    const strings = bubbleStrings(lang);
    const token = ++currentToken;
    const click: CurrentClick = {
      token,
      kind: "hover",
      word: saved.word || saved.word_key,
      anchor,
      context: saved.ctx ?? "",
      lang,
    };
    active = click;
    // Cursor re-entered a highlight; cancel any pending hide from the
    // previous leave-bubble or leave-highlight transition.
    clearHoverHideTimer();

    bubble.show({
      anchor,
      state: {
        kind: "hoverPreview",
        word: click.word,
        translation: saved.zh || "—",
        note: saved.note,
      },
      strings,
      onMouseEnter: () => clearHoverHideTimer(),
      onMouseLeave: () => hideHover(),
      onClose: () => {
        if (active?.token === token) active = null;
      },
    });
  }

  function hideHover(): void {
    // Only hover-state flows are eligible for the auto-hide. Once the
    // bubble has been promoted to saved/click/selection (e.g., the user
    // clicked the highlight while we were previewing), dismissal is
    // owned by the bubble's own click-outside / ESC / scroll handlers.
    if (active?.kind !== "hover") return;
    if (hoverHideTimer !== null) return;
    const tokenAtSchedule = active.token;
    hoverHideTimer = window.setTimeout(() => {
      hoverHideTimer = null;
      // Re-check on fire: the surface may have been promoted (or a new
      // hover may have replaced this one) during the grace period.
      if (active?.kind !== "hover") return;
      if (active.token !== tokenAtSchedule) return;
      bubble.hide();
      active = null;
    }, HOVER_HIDE_DELAY_MS);
  }

  function cancelHoverHide(): void {
    clearHoverHideTimer();
  }

  // Undo path. Re-emits SAVE_WORD with the snapshot the toast popped
  // out of the stash. Mirrors handleSave's contract — same shape goes
  // back to the background, no schema migration needed.
  async function handleUndoRestore(snapshot: VocabWord): Promise<void> {
    try {
      if (!chrome.runtime?.id) return;
      // Bump updated_at on restore so the side panel's list re-sorts the
      // word to the top, matching the user's mental model ("I just acted
      // on this word"). created_at is preserved.
      const restored: VocabWord = { ...snapshot, updated_at: Date.now() };
      await sendMessage({ type: "SAVE_WORD", word: restored });
    } catch {
      /* context invalidated — best-effort restore */
    }
  }

  // Drag-selection bubble (post-Phase-H). Same translate + save-check
  // flow as `startFlow` but driven by a precomputed anchor/text/context
  // instead of a click-derived word resolution. Allocates a new token so
  // it races against any in-flight click or prior selection on equal
  // footing — whichever fires last wins the bubble.
  function showSelection(args: { text: string; anchor: BubbleAnchor; context: string }): void {
    const lang = getSettings().ui_language;
    const click: CurrentClick = {
      token: ++currentToken,
      kind: "selection",
      word: args.text,
      anchor: args.anchor,
      context: args.context,
      lang,
    };
    clearHoverHideTimer();
    void startFlow(click);
  }

  return {
    dispose(): void {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("click", onClick, { capture: true });
      clearHoverHideTimer();
      active = null;
    },
    showSaved,
    showSelection,
    showHover,
    hideHover,
    cancelHoverHide,
  };
}
