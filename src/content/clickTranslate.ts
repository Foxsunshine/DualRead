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
import { detectInitialLang } from "../shared/i18nDetect";
import type { BubbleHandle, BubbleAnchor, BubbleStrings } from "./bubble";
import type { UndoToastHandle } from "./toast";
import { sendMessage, STORAGE_PREFIX_VOCAB } from "../shared/messages";
import { wordAtOffset } from "./wordBoundary";
import { stripOuterPunctuation } from "../shared/punctuation";
import { isPointInAnyRect } from "./hitTest";

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

// ───── i18n (bubble-local, minimal) ──────────────────────────
//
// Intentionally not importing `DR_STRINGS` from the side panel: that dict
// is ~70 keys per locale and this module only needs 6. Copying them keeps
// the content-script bundle lean and decouples bubble copy from the panel
// screens' evolution.
// v2.2 D4a: ternary → Record<Lang, BubbleStrings> lookup. The Record type
// forces every Lang variant to have a complete entry; missing ja or fr
// keys are caught at compile time. JA buttons in 命令形 (保存/削除/再試行),
// FR buttons in impératif (Enregistrer/Supprimer/Réessayer) per the
// register matrix in v2-2 brainstorm §9.2 P1-S2.
const BUBBLE_STRINGS: Record<Lang, BubbleStrings> = {
  "zh-CN": {
    save: "保存",
    saved: "已保存",
    detail: "打开详情",
    close: "关闭",
    loading: "翻译中…",
    retry: "重试",
    del: "删除",
  },
  en: {
    save: "Save",
    saved: "Saved",
    detail: "View details",
    close: "Close",
    loading: "Translating…",
    retry: "Retry",
    del: "Delete",
  },
  ja: {
    save: "保存",
    saved: "保存済み",
    detail: "詳細を表示",
    close: "閉じる",
    loading: "翻訳中…",
    retry: "再試行",
    del: "削除",
  },
  fr: {
    save: "Enregistrer",
    saved: "Enregistré",
    detail: "Voir les détails",
    close: "Fermer",
    loading: "Traduction…",
    retry: "Réessayer",
    del: "Supprimer",
  },
};

function bubbleStrings(lang: Lang): BubbleStrings {
  return BUBBLE_STRINGS[lang];
}

// Copy for the undo toast + its error state (v2.1 / D58).
// Kept co-located with bubbleStrings for the same reason the bubble dict is
// inline: the content bundle only needs 3 more keys per locale, and lifting
// them to the side panel's DR_STRINGS would drag a 70-key dict into every
// page.
interface ToastStrings {
  deletedBody: string;
  undoAction: string;
  errorBody: string;
  errorClose: string;
}

// JA toast body in past polite (削除しました / 保存しました convention),
// JA undo action in 命令形 (元に戻す), FR in impératif + vouvoiement.
const TOAST_STRINGS: Record<Lang, ToastStrings> = {
  "zh-CN": {
    deletedBody: "已删除",
    undoAction: "撤销",
    errorBody: "删除失败，请稍后再试。",
    errorClose: "关闭",
  },
  en: {
    deletedBody: "Word deleted",
    undoAction: "Undo",
    errorBody: "Delete failed. Try again.",
    errorClose: "Close",
  },
  ja: {
    deletedBody: "削除しました",
    undoAction: "元に戻す",
    errorBody: "削除に失敗しました。少し待ってから再試行してください。",
    errorClose: "閉じる",
  },
  fr: {
    deletedBody: "Mot supprimé",
    undoAction: "Annuler",
    errorBody: "Échec de la suppression. Réessayez bientôt.",
    errorClose: "Fermer",
  },
};

function toastStrings(lang: Lang): ToastStrings {
  return TOAST_STRINGS[lang];
}

// In-bubble error message dispatch. Ditto register conventions: JA polite
// ですます sentences, FR vouvoiement. Generic fallback handles any code
// the caller throws that isn't rate_limit / network.
const ERROR_MESSAGES: Record<Lang, { rate_limit: string; network: string; generic: string }> = {
  "zh-CN": {
    rate_limit: "翻译服务暂时被限流，稍后重试。",
    network: "网络好像断了。",
    generic: "翻译失败。",
  },
  en: {
    rate_limit: "Rate-limited, try again soon.",
    network: "Network issue.",
    generic: "Translation failed.",
  },
  ja: {
    rate_limit: "翻訳サービスが一時的に制限されています。少し待ってから再試行してください。",
    network: "ネットワークに問題があります。",
    generic: "翻訳に失敗しました。",
  },
  fr: {
    rate_limit: "Service de traduction momentanément limité. Réessayez bientôt.",
    network: "Problème réseau.",
    generic: "Échec de la traduction.",
  },
};

function translateErrorMessage(code: string, lang: Lang): string {
  const m = ERROR_MESSAGES[lang];
  if (code === "rate_limit") return m.rate_limit;
  if (code === "network") return m.network;
  return m.generic;
}

// ───── Context extraction ────────────────────────────────────
//
// Walk up from the clicked text node to the nearest block-level element
// and take its innerText. Mirrors the selection-relay helper in
// content/index.ts but takes a Node so it can be called from a caret
// resolution result. Capped at 400 chars — long enough for a paragraph,
// short enough to stay under the Chrome sendMessage 64 MB limit by a
// comfortable margin.
function extractContextForNode(node: Node | null): string {
  try {
    const parent =
      node?.nodeType === Node.TEXT_NODE
        ? (node.parentElement?.closest(
            "p, li, h1, h2, h3, h4, h5, h6, blockquote, td, figcaption, div"
          ) as HTMLElement | null)
        : null;
    const text = (parent?.innerText || "").replace(/\s+/g, " ").trim();
    if (!text) return "";
    return text.length > 400 ? text.slice(0, 400) + "…" : text;
  } catch {
    return "";
  }
}

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

  // Bug-2026-04-24 guard: `caretRangeFromPoint` is a *nearest caret*
  // API, not a hit-test. Clicks in a block's left padding / margin / a
  // line-leading gap snap to `textNode[0]` — and `wordAtOffset(_, 0)`
  // happily returns the first word on the line. That produced the
  // "clicking blank space shows the first word" bug reported against
  // v2.1.1. Verify the click actually landed inside the word's rendered
  // glyph rect(s) before committing. Multi-rect handling covers the
  // wrapped-word case where a single word spans a line break.
  const wordRange = document.createRange();
  wordRange.setStart(textNode, hit.start);
  wordRange.setEnd(textNode, hit.end);
  const rects = Array.from(wordRange.getClientRects());
  // Empty rects → the range has no layout (display:none ancestor, etc.)
  // — definitely not a legitimate click on rendered text, reject.
  if (rects.length === 0) return null;
  if (!isPointInAnyRect(rects, x, y)) return null;

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
  // v2.1: the undo toast lives one layer up (orchestrator owns it so the
  // hover machine and click flow share the same instance). We receive it
  // through deps rather than constructing our own — keeps teardown simple.
  toast: UndoToastHandle;
  // Pulled via callback (not value) so the toggle reflects live settings
  // changes — the content script listens to storage.onChanged and the
  // click handler re-reads on every click.
  getSettings(): Settings;
  // v2.1 / D61 row 10: when a bubble the click path opened is dismissed
  // (ESC, click-outside, scroll, close button), notify the hover machine
  // so it can exit CLICK_OWNED back to IDLE. Optional so tests can skip it.
  onClickBubbleClose?: () => void;
  // v2.1.1 / DL-5: opening the side panel must happen on a real user
  // gesture (the `click` handler stack). content/index.ts owns the tabId
  // cache, so it provides the concrete implementation here; we only
  // invoke it from the detail-icon handler. Must return quickly — a
  // non-awaited side effect; the gesture chain breaks if the call is
  // resolved across a promise tick before `sidePanel.open` is invoked.
  openSidePanelFromGesture?: () => void;
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
  // v2.1 / D59: hover entry point. Paints the same saved-word bubble as
  // `showSaved` but without setting `active` — click paths can still take
  // over and repaint with full click semantics (mirror to side panel,
  // etc). The hover state machine in content/index.ts drives this based
  // on §6.3's transition table; it's not a standalone surface.
  showHover(args: { anchor: BubbleAnchor; saved: VocabWord }): void;
}

export function createClickTranslator(deps: ClickTranslatorDeps): ClickTranslatorHandle {
  const { bubble, toast, getSettings, onClickBubbleClose, openSidePanelFromGesture } = deps;

  // ───── Delete + undo (v2.1 / D58) ────────────────────────────
  //
  // Shared by both `showSaved` (click on a highlighted word) and
  // `showHover` (hover auto-preview over a highlighted word). Snapshot
  // lives at this scope so deleting word A, then B, then undoing only
  // restores B — matches §6.2's "replace, don't queue" semantics.
  function deleteFromBubble(saved: VocabWord): void {
    const lang = getSettings().ui_language;
    const ts = toastStrings(lang);
    // Snapshot BEFORE we dispatch DELETE_WORD so a nack still has the
    // original record to surface in the error state (we don't re-read
    // sync because the value may have been evicted mid-flight).
    const snapshot: VocabWord = { ...saved };

    // Close the bubble immediately — §6.2's handling model says "silent
    // delete + undo toast", not "delete-in-place confirmation".
    bubble.hide();

    void (async () => {
      try {
        if (!chrome.runtime?.id) return;
        const resp = await sendMessage({
          type: "DELETE_WORD",
          word_key: snapshot.word_key,
        });
        if (!resp.ok) {
          // Nack: show a sticky error toast with a close button. We
          // deliberately do not offer retry here — the user can re-open
          // the bubble (if the highlight survives) and try again.
          toast.showError(ts.errorBody, ts.errorClose);
          return;
        }
        toast.show({
          body: ts.deletedBody,
          action: {
            label: ts.undoAction,
            onClick: () => {
              // Undo = re-save with the original created_at / note.
              // The write-buffer in background/vocab.ts cancels pending
              // deletes when a save lands first, so this round-trip is
              // idempotent even if the delete hasn't flushed yet.
              void sendMessage({ type: "SAVE_WORD", word: snapshot }).catch(() => {
                /* best-effort — if the re-save fails the word stays gone.
                   Surfacing an error here would require stacking toasts
                   which §6.2 rules out for this release. */
              });
            },
          },
          durationMs: 5000,
        });
      } catch {
        /* Extension context likely invalidated between the liveness
           check and the send — the orphan shutdown path in content/
           index.ts will tear us down momentarily; no UI to update. */
      }
    })();
  }

  // Drag tracking. Every mousedown resets the origin; the click handler
  // compares against it to decide drag-vs-click.
  let mouseDownX = 0;
  let mouseDownY = 0;
  const onMouseDown = (e: MouseEvent): void => {
    mouseDownX = e.clientX;
    mouseDownY = e.clientY;
  };

  // Monotonic token for race-guard against stale network responses.
  let currentToken = 0;

  // The click that produced the currently-open bubble. Used by Save and
  // Retry handlers to re-issue work against the same anchor and word.
  interface CurrentClick {
    token: number;
    word: string;
    anchor: BubbleAnchor;
    context: string;
    lang: Lang;
  }
  let active: CurrentClick | null = null;

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
        // Click path: always notify hover machine so CLICK_OWNED exits
        // when the user dismisses mid-loading.
        onClickBubbleClose?.();
      },
    });

    // Translate and saved-check in parallel — both involve I/O, neither
    // depends on the other, and the bubble reveals the combined result.
    const [saved, resp] = await Promise.all([
      readSavedWord(word_key),
      sendMessage({
        type: "TRANSLATE_REQUEST",
        text: click.word,
        // v2.3: target tracks current ui_language (D1 binding).
        // `click.lang` is captured at click time from `getSettings()`,
        // so a settings change between click and translate doesn't
        // race the in-flight request.
        target: click.lang,
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
          onClickBubbleClose?.();
        },
      });
      return;
    }

    const data = resp.data as TranslateResult | undefined;
    const translation = data?.translated || "—";
    // v2.3: Google MT returns the auto-detected source language as a
    // BCP-47-ish tag (e.g. "en", "fr", "zh-CN", "auto" for ambiguous
    // input). Map it through detectInitialLang to fold region variants
    // and unknowns into one of our 4 supported langs — same prefix
    // logic the install-time detect uses, so storage stays consistent.
    const sourceLang = detectInitialLang(data?.detectedLang ?? "");
    renderTranslated(click, translation, saved, sourceLang);
  }

  function renderTranslated(
    click: CurrentClick,
    translation: string,
    saved: VocabWord | null,
    sourceLang: Lang,
  ): void {
    const strings = bubbleStrings(click.lang);
    bubble.show({
      anchor: click.anchor,
      state: {
        kind: "translated",
        word: click.word,
        translation,
        saved: saved !== null,
        note: saved?.note,
      },
      strings,
      onSave: saved
        ? undefined
        : () => void handleSave(click, translation, sourceLang),
      onClose: () => {
        if (active?.token === click.token) active = null;
        onClickBubbleClose?.();
      },
    });
  }

  async function handleSave(
    click: CurrentClick,
    translation: string,
    sourceLang: Lang,
  ): Promise<void> {
    const now = Date.now();
    const word_key = click.word.trim().toLowerCase();
    // v2.3 schema: write canonical fields (source_lang / target_lang /
    // translation) + keep `zh` as legacy mirror so a v2.x rollback
    // continues to render the saved row. v3 will eventually drop `zh`.
    const vw: VocabWord = {
      word: click.word,
      word_key,
      source_lang: sourceLang,
      target_lang: click.lang,
      translation,
      zh: translation,
      ctx: click.context || undefined,
      source_url: location.href,
      created_at: now,
      updated_at: now,
    };
    try {
      if (!chrome.runtime?.id) return;
      const resp = await sendMessage({ type: "SAVE_WORD", word: vw });
      // Only flip the bubble to "saved" if we're still the active flow.
      // The user may have clicked another word while the save was
      // in-flight; don't paint onto someone else's bubble.
      if (active?.token !== click.token) return;
      if (resp.ok) renderTranslated(click, translation, vw, sourceLang);
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

    // v2.1.1 / DL-1: strip outer punctuation before anything downstream
    // sees the word. The caret word-boundary resolver is already good at
    // Latin word edges, but this second pass catches clicks near
    // apostrophe / period boundaries where the browser's range sits on
    // punctuation. If stripping yields an empty string the click was
    // entirely on punctuation — treat it like a miss.
    const cleanWord = stripOuterPunctuation(resolved.word);
    if (!cleanWord) return;

    // Commit: prevent the host page from reacting to the click. This is
    // the first side effect in the pipeline — everything above is a
    // read-only inspection.
    e.preventDefault();
    e.stopPropagation();

    const context = extractContextForNode(resolved.textNode);
    const click: CurrentClick = {
      token: ++currentToken,
      word: cleanWord,
      anchor: rectForWord(resolved.textNode, resolved.start, resolved.end),
      context,
      lang: getSettings().ui_language,
    };
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
            text: cleanWord,
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
  //
  // v2.1 / D58: also wires the delete icon via `onDelete` → snapshot,
  // fire DELETE_WORD, open undo toast. `owned=true` means this bubble
  // counts as "click-owned" for the hover state machine; `showHover`
  // below reuses the same rendering via `owned=false` so click can still
  // take over. Keeping one function makes it impossible for the two
  // variants to drift on delete/detail copy.
  function paintSavedBubble(
    anchor: BubbleAnchor,
    saved: VocabWord,
    owned: boolean
  ): void {
    const lang = getSettings().ui_language;
    const strings = bubbleStrings(lang);
    const token = ++currentToken;
    const click: CurrentClick = {
      token,
      word: saved.word || saved.word_key,
      anchor,
      context: saved.ctx ?? "",
      lang,
    };
    if (owned) active = click;

    bubble.show({
      anchor,
      state: {
        kind: "translated",
        word: click.word,
        translation: saved.translation ?? saved.zh ?? "—",
        saved: true,
        note: saved.note,
        showDetailLink: true,
      },
      strings,
      onDetail: () => {
        // v2.1.1 / DL-5: open the side panel *before* any async hop so
        // Chrome still sees this call inside the click handler's
        // user-gesture window. Order matters — awaiting sendMessage
        // first (as v2.0 / v2.1.0 did) would drop the gesture and the
        // open would silently no-op when the panel is closed.
        openSidePanelFromGesture?.();
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
        if (owned && active?.token === token) active = null;
        if (owned) onClickBubbleClose?.();
      },
      onDelete: () => deleteFromBubble(saved),
      onClose: () => {
        if (owned && active?.token === token) active = null;
        // Notify the hover state machine that a click-owned bubble went
        // away so it can exit CLICK_OWNED. For hover-owned bubbles the
        // hover machine handles its own dismiss tracking, so we skip.
        if (owned) onClickBubbleClose?.();
      },
    });
  }

  function showSaved(args: { anchor: BubbleAnchor; saved: VocabWord }): void {
    paintSavedBubble(args.anchor, args.saved, /* owned */ true);
  }

  function showHover(args: { anchor: BubbleAnchor; saved: VocabWord }): void {
    paintSavedBubble(args.anchor, args.saved, /* owned */ false);
  }

  // Drag-selection bubble (post-Phase-H). Same translate + save-check
  // flow as `startFlow` but driven by a precomputed anchor/text/context
  // instead of a click-derived word resolution. Allocates a new token so
  // it races against any in-flight click or prior selection on equal
  // footing — whichever fires last wins the bubble.
  //
  // v2.1.1 / DL-1: drag path strips outer punctuation here too —
  // `content/index.ts` already does one snap-then-send, but we second-
  // strip defensively so the bubble surface never sees a stray leading
  // or trailing `,` / `.` / `"`.
  function showSelection(args: { text: string; anchor: BubbleAnchor; context: string }): void {
    const lang = getSettings().ui_language;
    const cleanText = stripOuterPunctuation(args.text);
    if (!cleanText) return;
    const click: CurrentClick = {
      token: ++currentToken,
      word: cleanText,
      anchor: args.anchor,
      context: args.context,
      lang,
    };
    void startFlow(click);
  }

  return {
    dispose(): void {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("click", onClick, { capture: true });
      active = null;
    },
    showSaved,
    showSelection,
    showHover,
  };
}
