// In-page undo toast (v2.1 / D58 §6.2).
//
// A single content-layer toast surface, used today for "word deleted from
// bubble" undo. Lives in its own Shadow DOM host (not the bubble's) so its
// viewport-bottom-centered positioning is independent of the bubble's
// anchor-relative positioning; the two surfaces can coexist on screen
// (though in practice the bubble is closed *before* the toast appears).
//
// Design rationale:
//   - Why content layer, not side panel? The undo must work even with the
//     side panel closed — the delete originates from a page-level gesture
//     (clicking trash in the in-page bubble) and a stray "open the side
//     panel to undo" trip would defeat the point. §6.2 relocates the toast
//     from the side panel to here.
//   - Why Shadow DOM, not `document.body` + class? Host pages frequently
//     style `body > div` aggressively (fixed-position chat widgets, tour
//     overlays) and would bleed their z-index / layout into our toast.
//     Encapsulation is cheap here — one `<style>` + two `<div>`s.
//   - Replace-in-place on repeat show? Yes. §6.2 edge case: deleting word
//     B while A's toast is still up replaces A's toast with B's. A's delete
//     is treated as "accepted". Queueing multiple undo toasts would mean
//     undo order becomes a UX puzzle for the user; one at a time is fine.
//
// Public API is minimal: `createUndoToast()` → `{ show, showError, hide,
// dispose }`. `show` optionally takes an action (label + onClick) which
// turns on the "undo" button variant; without it the toast renders as a
// timed status banner (not currently used, but keeps the door open).

import { DR_TOKENS } from "../sidepanel/tokens";

// ───── Public types ──────────────────────────────────────────

export interface UndoToastAction {
  label: string;
  onClick: () => void;
}

export interface UndoToastShowOptions {
  body: string;
  action?: UndoToastAction;
  /** ms before the toast self-dismisses. Default 5000 (D58 / OQ4). */
  durationMs?: number;
  /** Called when the auto-dismiss timer fires (not called on manual hide). */
  onExpire?: () => void;
}

export interface UndoToastHandle {
  show(opts: UndoToastShowOptions): void;
  /** Sticky error variant — no auto-dismiss, close button only (§6.2 nack path). */
  showError(message: string, closeLabel: string): void;
  hide(): void;
  dispose(): void;
}

// ───── Styling ───────────────────────────────────────────────
//
// Sized tight: the narrowest reasonable piece of content is "Word deleted"
// + "Undo", which shouldn't wrap. We cap max-width to avoid full-bleed
// bars that look like page chrome on wide viewports. Bottom offset 24 px
// matches v1-era FAB clearance (48 px FAB + room for finger / pointer).
const DEFAULT_DURATION_MS = 5000;

function toastCSS(): string {
  return `
:host {
  all: initial;
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  /* Sit just below the bubble's ceiling so a rare both-on-screen case
     renders the bubble above the toast — bubble is the active surface. */
  z-index: 2147483645;
  pointer-events: auto;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 13px;
  line-height: 1.45;
  color: ${DR_TOKENS.ink};
}

.dr-toast {
  box-sizing: border-box;
  min-width: 220px;
  max-width: 360px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: ${DR_TOKENS.bgRaised};
  color: ${DR_TOKENS.ink};
  border: 1px solid ${DR_TOKENS.border};
  border-radius: 10px;
  box-shadow: 0 6px 24px rgba(42, 35, 28, 0.16), 0 1px 2px rgba(42, 35, 28, 0.08);
  user-select: none;
  animation: dr-toast-in 140ms ease-out;
}

@keyframes dr-toast-in {
  from { opacity: 0; transform: translate(-50%, 6px); }
  to   { opacity: 1; transform: translate(-50%, 0); }
}

.dr-toast--leaving {
  animation: dr-toast-out 140ms ease-in forwards;
}
@keyframes dr-toast-out {
  from { opacity: 1; transform: translate(-50%, 0); }
  to   { opacity: 0; transform: translate(-50%, 6px); }
}

.dr-toast__body {
  flex: 1;
  min-width: 0;
  color: ${DR_TOKENS.inkSoft};
  word-break: break-word;
}

.dr-toast__action {
  all: unset;
  cursor: pointer;
  flex: 0 0 auto;
  padding: 4px 8px;
  border-radius: 6px;
  color: ${DR_TOKENS.accent};
  font-weight: 600;
  font-size: 12px;
  transition: background 120ms ease, color 120ms ease;
}
.dr-toast__action:hover {
  background: ${DR_TOKENS.borderSoft};
  color: ${DR_TOKENS.accentInk};
}
.dr-toast__action:focus-visible {
  outline: 2px solid ${DR_TOKENS.accent};
  outline-offset: 1px;
}

.dr-toast__close {
  all: unset;
  cursor: pointer;
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  color: ${DR_TOKENS.inkMuted};
  font-size: 14px;
}
.dr-toast__close:hover {
  background: ${DR_TOKENS.borderSoft};
  color: ${DR_TOKENS.ink};
}

.dr-toast--error {
  border-color: rgba(181, 72, 58, 0.35);
  background: #FFF6F4;
}
.dr-toast--error .dr-toast__body {
  color: ${DR_TOKENS.red};
}
`;
}

// ───── Factory ───────────────────────────────────────────────

export function createUndoToast(): UndoToastHandle {
  const host = document.createElement("div");
  host.setAttribute("data-dualread-toast", "");
  const shadow = host.attachShadow({ mode: "closed" });

  const styleEl = document.createElement("style");
  styleEl.textContent = toastCSS();
  shadow.appendChild(styleEl);

  const root = document.createElement("div");
  root.className = "dr-toast";
  shadow.appendChild(root);

  let open = false;
  let disposed = false;
  let autoTimer: number | null = null;

  function clearTimer(): void {
    if (autoTimer !== null) {
      window.clearTimeout(autoTimer);
      autoTimer = null;
    }
  }

  function clearRoot(): void {
    while (root.firstChild) root.removeChild(root.firstChild);
    root.classList.remove("dr-toast--error", "dr-toast--leaving");
  }

  function attach(): void {
    if (!host.isConnected) {
      // Attach to <html> (not <body>) for the same reason bubble.ts does:
      // some pages transform body, which pins our fixed-positioned toast
      // inside a new stacking context and silently eats our z-index.
      document.documentElement.appendChild(host);
    }
  }

  function detach(): void {
    if (host.isConnected) host.remove();
  }

  function show(opts: UndoToastShowOptions): void {
    if (disposed) return;
    // Replace-in-place (§6.2): a previous toast is dismissed without firing
    // its onExpire — the user has moved on; treating the stale undo as
    // "expired now" would be surprising (the action was to delete B, not
    // commit A). Caller owns the semantics of A's snapshot.
    clearTimer();
    clearRoot();

    const bodyEl = document.createElement("div");
    bodyEl.className = "dr-toast__body";
    bodyEl.textContent = opts.body;
    root.appendChild(bodyEl);

    if (opts.action) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dr-toast__action";
      btn.textContent = opts.action.label;
      btn.addEventListener("click", () => {
        // Manual action dismisses without firing onExpire — the user made
        // the choice, the auto-expire contract doesn't apply.
        opts.action?.onClick();
        hide();
      });
      root.appendChild(btn);
    }

    attach();
    open = true;

    const duration = opts.durationMs ?? DEFAULT_DURATION_MS;
    autoTimer = window.setTimeout(() => {
      autoTimer = null;
      // onExpire fires *before* hide() so callers can release their
      // snapshot before the toast DOM disappears — keeps teardown ordering
      // predictable for tests.
      try {
        opts.onExpire?.();
      } finally {
        hide();
      }
    }, duration);
  }

  function showError(message: string, closeLabel: string): void {
    if (disposed) return;
    clearTimer();
    clearRoot();
    root.classList.add("dr-toast--error");

    const bodyEl = document.createElement("div");
    bodyEl.className = "dr-toast__body";
    bodyEl.textContent = message;
    root.appendChild(bodyEl);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "dr-toast__close";
    closeBtn.setAttribute("aria-label", closeLabel);
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", () => hide());
    root.appendChild(closeBtn);

    attach();
    open = true;
    // Error variant has no auto-dismiss — the user needs to see it.
  }

  function hide(): void {
    if (!open) return;
    open = false;
    clearTimer();
    detach();
    clearRoot();
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    hide();
  }

  return { show, showError, hide, dispose };
}
