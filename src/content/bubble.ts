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
  | { kind: "translated"; word: string; translation: string; saved: boolean; note?: string; showDetailLink?: boolean; showDeleteButton?: boolean }
  // Read-only hover preview. Triggered by mouseenter on a saved-vocab
  // highlight; carries the cached zh and optional note. Has no action
  // buttons — clicking the highlight promotes the bubble to the
  // full `translated` saved variant via the click pipeline.
  | { kind: "hoverPreview"; word: string; translation: string; note?: string }
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
  delete: string;
  close: string;
  loading: string;
  retry: string;
}

export interface BubbleShowOptions {
  anchor: BubbleAnchor;
  state: BubbleState;
  strings: BubbleStrings;
  onSave?: () => void;
  onClose?: () => void;
  onDetail?: () => void;
  onDelete?: () => void;
  onRetry?: () => void;
  // Hover-preview plumbing. Caller passes these so the orchestrator
  // can cancel a pending mouseleave-hide when the cursor moves from
  // the highlight word into the bubble itself, or schedule one when
  // the cursor leaves the bubble. Bubble fires them on its own host
  // element; orchestrator owns the actual hide timer.
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
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
  let currentOnMouseEnter: (() => void) | undefined;
  let currentOnMouseLeave: (() => void) | undefined;

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

  // Hover transitions on the shadow host. We attach once in the
  // factory and forward to the per-show callback (if any). Mouseleave
  // and mouseenter (not mouseover/mouseout) suit our purpose: we only
  // care about the bubble as a whole, and these events do not fire
  // when moving between the host's internal nodes.
  const onHostMouseEnter = (): void => {
    currentOnMouseEnter?.();
  };
  const onHostMouseLeave = (): void => {
    currentOnMouseLeave?.();
  };
  host.addEventListener("mouseenter", onHostMouseEnter);
  host.addEventListener("mouseleave", onHostMouseLeave);

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

  function makeCloseButton(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dr-bubble__close";
    btn.setAttribute("aria-label", label);
    btn.textContent = "×";
    btn.addEventListener("click", onClick);
    return btn;
  }

  function renderHeader(word: string, closeLabel: string, onClose: () => void): void {
    const row = document.createElement("div");
    row.className = "dr-bubble__row";
    const w = document.createElement("div");
    w.className = "dr-bubble__word";
    w.textContent = word;
    row.appendChild(w);
    row.appendChild(makeCloseButton(closeLabel, onClose));
    root.appendChild(row);
  }

  function render(opts: BubbleShowOptions): void {
    clearRoot();
    const { state, strings, onSave, onDetail, onDelete, onRetry } = opts;

    // Header row is shared across all states — word + close button.
    renderHeader(state.word, strings.close, () => dismiss());

    if (state.kind === "hoverPreview") {
      // Lightweight read-only preview — translation + optional note,
      // no action row. Click on the highlight is what the user uses
      // to enter the full saved bubble (Save/Delete/Detail surface).
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
      return;
    }

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

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "dr-bubble__btn";
    if (state.saved) {
      saveBtn.textContent = strings.saved;
      saveBtn.disabled = true;
    } else {
      saveBtn.textContent = strings.save;
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

    if (state.showDeleteButton && onDelete) {
      // Icon-only trash button. Sits next to the detail icon. Click
      // is "soft delete" from the user's POV — orchestrator stashes
      // the record and shows a 5s undo toast before the deletion is
      // truly visible at storage scope.
      const del = document.createElement("button");
      del.type = "button";
      del.className = "dr-bubble__delete";
      del.title = strings.delete;
      del.setAttribute("aria-label", strings.delete);
      del.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" ' +
        'stroke="currentColor" stroke-width="1.4" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M3 4.5h10"/>' +
        '<path d="M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5"/>' +
        '<path d="M4.5 4.5v8a1.5 1.5 0 0 0 1.5 1.5h4a1.5 1.5 0 0 0 1.5-1.5v-8"/>' +
        '<path d="M7 7v5"/>' +
        '<path d="M9 7v5"/>' +
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
    currentOnMouseEnter = opts.onMouseEnter;
    currentOnMouseLeave = opts.onMouseLeave;
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
    currentOnMouseEnter = undefined;
    currentOnMouseLeave = undefined;
    if (host.isConnected) host.remove();
    clearRoot();
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    hide();
    host.removeEventListener("mouseenter", onHostMouseEnter);
    host.removeEventListener("mouseleave", onHostMouseLeave);
  }

  return {
    show,
    hide,
    isOpen: () => open,
    dispose,
  };
}
