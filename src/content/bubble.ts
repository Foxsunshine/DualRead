// In-page translation bubble (v1.1 F3).
//
// Shadow-DOM-encapsulated widget that floats near the user's selection or
// click target, shows the translation, and offers a Save button for unsaved
// words. Replaces the "hunt for the Save button in the side panel" trip
// the user complained about in v1.
//
// Design rationale — see docs/v1-1-feedback.md §6:
//   - Vanilla DOM, not React (D47). A transient 200-line widget doesn't
//     justify ~140 KB of React injected into every host page.
//   - Closed shadow root (D47). Host-page scripts cannot traverse into
//     the bubble — this matters on user-hostile pages that enumerate
//     all DOM elements or run `document.body.innerHTML` mutations.
//   - Single global instance (see §8 "Concurrency"). Rapid clicks replace
//     content in-place rather than stacking bubbles; a monotonic token
//     prevents a late TRANSLATE_RESULT from painting onto a newer word.
//
// This module only exposes `createBubble()`. Wiring (click pipeline,
// mouseup pipeline, highlight-click re-route) happens in later phases.

import { bubbleCSS } from "./bubbleStyles";

// ───── Public types ──────────────────────────────────────────

export type BubbleState =
  | { kind: "loading"; word: string }
  | { kind: "translated"; word: string; translation: string; saved: boolean; note?: string; showDetailLink?: boolean }
  | { kind: "error"; word: string; message: string };

// Anchor rect — caller provides the bounding box we should position next
// to. Usually the selection's `getBoundingClientRect()` or the clicked
// word's range rect. All values are in viewport coordinates.
export interface BubbleAnchor {
  top: number;
  left: number;
  bottom: number;
  right: number;
  width: number;
  height: number;
}

export interface BubbleStrings {
  save: string;
  saved: string;
  detail: string;
  close: string;
  loading: string;
  retry: string;
  // v2.1 / D58: delete icon in the saved-word variant. Title + aria-label use
  // this same string (icon-only button — screen readers need the name from
  // somewhere). English "Delete" / 中文 "删除".
  del: string;
}

export interface BubbleShowOptions {
  anchor: BubbleAnchor;
  state: BubbleState;
  strings: BubbleStrings;
  onSave?: () => void;
  onClose?: () => void;
  onDetail?: () => void;
  onRetry?: () => void;
  // v2.1 / D58: invoked when the user clicks the trash-can icon in the
  // saved-word variant. Caller is responsible for firing DELETE_WORD,
  // closing the bubble, and showing the undo toast. When the callback is
  // omitted, the delete button is not rendered (keeps the click-translate
  // "not yet saved" bubble free of the icon).
  onDelete?: () => void;
}

export interface BubbleHandle {
  show(opts: BubbleShowOptions): void;
  hide(): void;
  isOpen(): boolean;
  dispose(): void;
}

// ───── Positioning ───────────────────────────────────────────
//
// Default layout is "below center" of the anchor. If the bubble would
// overflow the viewport bottom, flip above. Horizontally clamp the
// bubble so its left edge stays within [8px, viewportWidth - 8px - width].
// 8 px matches the side panel's edge breathing room.

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 6;

function positionFor(
  anchor: BubbleAnchor,
  bubbleWidth: number,
  bubbleHeight: number
): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Horizontal: center on the anchor, then clamp to viewport margins.
  const anchorCenter = anchor.left + anchor.width / 2;
  let left = anchorCenter - bubbleWidth / 2;
  left = Math.max(VIEWPORT_MARGIN, Math.min(left, vw - bubbleWidth - VIEWPORT_MARGIN));

  // Vertical: prefer below; flip above if below would overflow and above fits.
  const spaceBelow = vh - anchor.bottom;
  const spaceAbove = anchor.top;
  const needed = bubbleHeight + ANCHOR_GAP;
  let top: number;
  if (spaceBelow >= needed || spaceBelow >= spaceAbove) {
    top = anchor.bottom + ANCHOR_GAP;
  } else {
    top = anchor.top - bubbleHeight - ANCHOR_GAP;
  }
  // Clamp vertical as a last resort (anchor near viewport edges).
  top = Math.max(VIEWPORT_MARGIN, Math.min(top, vh - bubbleHeight - VIEWPORT_MARGIN));

  return { top, left };
}

// ───── Factory ───────────────────────────────────────────────
//
// One-per-frame bubble. Callers pass content via `show()`; the factory
// manages the shadow host node, the stylesheet, the event listeners, and
// teardown. `dispose()` is idempotent — the orphan-shutdown path in
// content/index.ts will call it on extension-context invalidation.

export function createBubble(): BubbleHandle {
  // Shadow host — a single `<div>` attached to <html> (not <body>) so our
  // z-index stays unaffected by body transforms or stacking contexts. A
  // closed shadow root (D47) prevents host-page scripts from reading the
  // bubble DOM; we keep our own reference in the closure.
  const host = document.createElement("div");
  host.setAttribute("data-dualread-bubble", "");
  // Host element itself is unstyled; :host rules in the shadow handle it.
  const shadow = host.attachShadow({ mode: "closed" });

  const styleEl = document.createElement("style");
  styleEl.textContent = bubbleCSS();
  shadow.appendChild(styleEl);

  const root = document.createElement("div");
  root.className = "dr-bubble";
  shadow.appendChild(root);

  let open = false;
  let disposed = false;

  // Event handlers for the currently-rendered state. We reassign on each
  // show() so old closures don't leak into the next bubble content — the
  // DOM nodes themselves are recreated per-show so listeners die with them.
  let currentOnClose: (() => void) | undefined;

  // ───── Dismissal plumbing ───────────────────────────────────
  //
  // Four dismissal paths (D44):
  //   - click outside (mousedown on document, target not inside host)
  //   - ESC key
  //   - page scroll
  //   - new selection / programmatic hide
  //
  // Mousedown-inside-bubble intentionally does NOT count as "outside",
  // so the user can drag-select inside the translation to copy.

  const onDocMouseDown = (e: MouseEvent): void => {
    if (!open) return;
    // composedPath() correctly reports the shadow host as an ancestor
    // even though the event originates inside the closed shadow tree.
    const path = e.composedPath();
    if (path.includes(host)) return;
    dismiss();
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (!open) return;
    if (e.key === "Escape") {
      e.stopPropagation();
      dismiss();
    }
  };

  const onScroll = (): void => {
    if (!open) return;
    dismiss();
  };

  const onResize = (): void => {
    if (!open) return;
    // On resize we just close — repositioning against a stale anchor is
    // worse than a short user-visible dismissal. Caller can re-trigger.
    dismiss();
  };

  function addGlobalListeners(): void {
    document.addEventListener("mousedown", onDocMouseDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    // `capture: true` on scroll so we catch scroll events from inner
    // overflow containers, not just window scroll.
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
  }

  function removeGlobalListeners(): void {
    document.removeEventListener("mousedown", onDocMouseDown, true);
    document.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", onResize);
  }

  function dismiss(): void {
    const cb = currentOnClose;
    hide();
    cb?.();
  }

  // ───── Rendering ─────────────────────────────────────────────
  //
  // Each show() wipes the previous bubble content and rebuilds from
  // scratch. Simpler than diffing for a widget this small; also
  // guarantees any listeners attached to removed nodes are GC'd cleanly.

  function clearRoot(): void {
    while (root.firstChild) root.removeChild(root.firstChild);
  }

  // v2.1.1: tiny HTML-entity encoder. Used when we compose a button's
  // `innerHTML` from a mix of static SVG markup and dynamic label text.
  // The labels today are static i18n strings from bubbleStrings(), but
  // future copy pulls could let `<` / `>` / `&` slip in; encoding here
  // is defense in depth so those never break out of the label <span>.
  function escapeForText(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function makeCloseButton(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dr-bubble__close";
    btn.setAttribute("aria-label", label);
    btn.textContent = "×";
    btn.addEventListener("click", onClick);
    return btn;
  }

  // v2.1.1 / DL-3: "show the original word" is now a conditional. For
  // long phrases the bubble becomes a translation-only surface with just
  // a close `×` pinned top-right. `showWord` controls which branch we
  // render; the row's class toggles so bubbleStyles.ts can right-align
  // the close button when the word div isn't there.
  function renderHeader(
    word: string,
    closeLabel: string,
    onClose: () => void,
    showWord: boolean
  ): void {
    const row = document.createElement("div");
    row.className = showWord ? "dr-bubble__row" : "dr-bubble__row dr-bubble__row--no-word";
    if (showWord) {
      const w = document.createElement("div");
      w.className = "dr-bubble__word";
      w.textContent = word;
      row.appendChild(w);
    }
    row.appendChild(makeCloseButton(closeLabel, onClose));
    root.appendChild(row);
  }

  // v2.1.1 / DL-3 threshold. `text.trim().split(/\s+/).length > 3` per
  // brainstorm; `state-of-the-art` counts as 1 because the hyphen is
  // interior. Loading / error states always show the word (they're short
  // anyway — no translation to compete with for space).
  function shouldShowWord(word: string, stateKind: BubbleState["kind"]): boolean {
    if (stateKind !== "translated") return true;
    const tokens = word.trim().split(/\s+/).filter(Boolean);
    return tokens.length <= 3;
  }

  function render(opts: BubbleShowOptions): void {
    clearRoot();
    const { state, strings, onSave, onDetail, onRetry, onDelete } = opts;

    // v2.1.1 / DL-3: long-phrase path collapses the header into just a
    // close button; short phrases keep the familiar "word + ×" layout.
    const showWord = shouldShowWord(state.word, state.kind);
    renderHeader(state.word, strings.close, () => dismiss(), showWord);

    if (state.kind === "loading") {
      const loading = document.createElement("div");
      loading.className = "dr-bubble__loading";
      const spinner = document.createElement("span");
      spinner.className = "dr-bubble__spinner";
      loading.appendChild(spinner);
      const label = document.createElement("span");
      label.textContent = strings.loading;
      loading.appendChild(label);
      root.appendChild(loading);
      return;
    }

    if (state.kind === "error") {
      const err = document.createElement("div");
      err.className = "dr-bubble__error";
      err.textContent = state.message;
      root.appendChild(err);
      if (onRetry) {
        const actions = document.createElement("div");
        actions.className = "dr-bubble__actions";
        const retry = document.createElement("button");
        retry.type = "button";
        retry.className = "dr-bubble__btn";
        retry.textContent = strings.retry;
        retry.addEventListener("click", onRetry);
        actions.appendChild(retry);
        root.appendChild(actions);
      }
      return;
    }

    // state.kind === "translated"
    const tr = document.createElement("div");
    tr.className = "dr-bubble__translation";
    tr.textContent = state.translation;
    root.appendChild(tr);

    if (state.note) {
      const note = document.createElement("div");
      note.className = "dr-bubble__note";
      note.textContent = state.note;
      root.appendChild(note);
    }

    // Actions row: Save (or ✓ Saved) + optional "detail" link for
    // already-saved words (D42 uses this to jump the side panel to the
    // vocab tab without leaving the page).
    const actions = document.createElement("div");
    actions.className = "dr-bubble__actions";

    // v2.1.1 / DL-4: Save / Saved rendered as icon + 11 px label. Both
    // variants share the same wrapper dimensions so the transition
    // between states doesn't re-flow the actions row. Icons are inline
    // SVG (matching detail/delete) — the wrapping class differs so
    // bubbleStyles.ts can flip the background (accent → sageSoft) and
    // text color without touching the DOM.
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    if (state.saved) {
      saveBtn.className = "dr-bubble__btn dr-bubble__btn--saved";
      saveBtn.disabled = true;
      // ✓ check glyph — 12 px stroke to match the + glyph below.
      saveBtn.innerHTML =
        '<svg class="dr-bubble__btn-icon" width="12" height="12" viewBox="0 0 16 16" ' +
        'fill="none" stroke="currentColor" stroke-width="1.8" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M3 8.5l3 3 7-7"/>' +
        "</svg>" +
        `<span class="dr-bubble__btn-label">${escapeForText(strings.saved)}</span>`;
    } else {
      saveBtn.className = "dr-bubble__btn";
      // + plus glyph — drives the "add to vocab" signal visually.
      saveBtn.innerHTML =
        '<svg class="dr-bubble__btn-icon" width="12" height="12" viewBox="0 0 16 16" ' +
        'fill="none" stroke="currentColor" stroke-width="1.8" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M8 3v10"/>' +
        '<path d="M3 8h10"/>' +
        "</svg>" +
        `<span class="dr-bubble__btn-label">${escapeForText(strings.save)}</span>`;
      if (onSave) saveBtn.addEventListener("click", onSave);
    }
    actions.appendChild(saveBtn);

    if (state.showDetailLink && onDetail) {
      // Icon-only button (Bucket 1 / v2.0.1): a line-art open book standing in
      // for the old "打开详情 / View details" text link. Accessible name comes
      // from `title` + `aria-label` — both set so hover tooltips work on desktop
      // and assistive tech still gets a label.
      const detail = document.createElement("button");
      detail.type = "button";
      detail.className = "dr-bubble__detail";
      detail.title = strings.detail;
      detail.setAttribute("aria-label", strings.detail);
      detail.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" ' +
        'stroke="currentColor" stroke-width="1.4" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M2 3.5h4.5a1.5 1.5 0 0 1 1.5 1.5v7.5"/>' +
        '<path d="M14 3.5H9.5A1.5 1.5 0 0 0 8 5"/>' +
        '<path d="M2 3.5v9h5a1 1 0 0 1 1 1"/>' +
        '<path d="M14 3.5v9H9a1 1 0 0 0-1 1"/>' +
        "</svg>";
      detail.addEventListener("click", onDetail);
      actions.appendChild(detail);
    }

    if (onDelete) {
      // v2.1 / D58: trash-can icon, same sizing + hit-area as the detail
      // icon so the two sit visually matched on the saved-word variant. We
      // keep the accent color (silent-delete model) rather than the red
      // danger token — the safety net is the undo toast, not a dire color.
      const del = document.createElement("button");
      del.type = "button";
      del.className = "dr-bubble__del";
      del.title = strings.del;
      del.setAttribute("aria-label", strings.del);
      del.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" ' +
        'stroke="currentColor" stroke-width="1.4" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        // Lid + handle
        '<path d="M2.5 4.5h11"/>' +
        '<path d="M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5"/>' +
        // Body
        '<path d="M4 4.5l.7 8.2A1.5 1.5 0 0 0 6.2 14h3.6a1.5 1.5 0 0 0 1.5-1.3l.7-8.2"/>' +
        // Ribs
        '<path d="M7 7v4"/>' +
        '<path d="M9 7v4"/>' +
        "</svg>";
      del.addEventListener("click", onDelete);
      actions.appendChild(del);
    }

    root.appendChild(actions);
  }

  // ───── Lifecycle ─────────────────────────────────────────────

  function show(opts: BubbleShowOptions): void {
    if (disposed) return;

    currentOnClose = opts.onClose;
    render(opts);

    if (!host.isConnected) {
      // Attach to <html> rather than <body>: some pages toggle body
      // transforms which create a new stacking context, making our
      // fixed-position z-index locally-scoped. <html> avoids that.
      document.documentElement.appendChild(host);
    }

    if (!open) {
      open = true;
      addGlobalListeners();
    }

    // Measure after insertion so we get the real rendered size before
    // positioning. Using rAF ensures the browser has laid out the new
    // nodes; without it we'd see the bubble flash at {0,0} for one frame
    // on first open.
    // Initial off-screen placement to avoid a flash at origin during measure.
    host.style.top = "-9999px";
    host.style.left = "-9999px";
    requestAnimationFrame(() => {
      if (!open) return;
      const rect = root.getBoundingClientRect();
      const { top, left } = positionFor(opts.anchor, rect.width, rect.height);
      host.style.top = `${top}px`;
      host.style.left = `${left}px`;
    });
  }

  function hide(): void {
    if (!open) return;
    open = false;
    removeGlobalListeners();
    currentOnClose = undefined;
    if (host.isConnected) host.remove();
    clearRoot();
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    hide();
  }

  return {
    show,
    hide,
    isOpen: () => open,
    dispose,
  };
}
