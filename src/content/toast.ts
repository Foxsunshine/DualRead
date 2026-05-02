// Undo toast — bottom-center transient notification used by the
// saved-bubble Delete flow. Shows for `TOAST_TTL_MS`; an Undo button
// inside the toast pops the stashed VocabWord and forwards it to the
// caller-supplied onUndo (the orchestrator re-fires SAVE_WORD).
//
// Hygiene mirrors bubble.ts / fab.ts: closed Shadow DOM, `:host {
// all: initial }`, z-index just below the bubble so an overlapping
// new bubble draws on top. One global instance per content script;
// rapid successive deletions replace the visible toast in place.
//
// Lifetimes the orchestrator does NOT need to manage:
//   - stash put/pop/expiry — internal
//   - toast auto-dismiss timer — internal
//   - re-show race when user deletes B while A's toast is still up —
//     internal (the older A toast is replaced)

import { DR_TOKENS } from "../sidepanel/tokens";
import type { VocabWord } from "../shared/types";
import { createUndoStash } from "./undoStash";

export const TOAST_TTL_MS = 5000;

export interface ToastStrings {
  // Body copy. {word} placeholder is replaced with the deleted word's
  // surface form. Keeping the format string in i18n avoids hardcoding
  // word concatenation order.
  deletedToast: (word: string) => string;
  undoLabel: string;
  closeLabel: string;
}

export interface ShowDeletedArgs {
  word: VocabWord;
  strings: ToastStrings;
  // Fired when the user clicks Undo within the TTL. Receives the same
  // VocabWord that was originally stashed so the caller can re-emit
  // SAVE_WORD with the exact pre-deletion record (note, created_at,
  // ctx, …) intact.
  onUndo(word: VocabWord): void;
}

export interface ToastHandle {
  showDeleted(args: ShowDeletedArgs): void;
  hide(): void;
  // True while the toast is mounted and visible. Tests + orchestrator
  // race guards both want to read this.
  isOpen(): boolean;
  // Whether a deletion of `word_key` is currently undoable. Used by
  // the orchestrator to short-circuit a stale highlighter re-render.
  isStashed(word_key: string): boolean;
  dispose(): void;
}

function toastCSS(): string {
  return `
:host {
  all: initial;
  position: fixed;
  z-index: 2147483645;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  pointer-events: auto;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 13px;
  line-height: 1.45;
  color: ${DR_TOKENS.ink};
}

.dr-toast {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  background: ${DR_TOKENS.bgRaised};
  color: ${DR_TOKENS.ink};
  border: 1px solid ${DR_TOKENS.border};
  border-radius: 999px;
  padding: 8px 8px 8px 14px;
  box-shadow: 0 6px 24px rgba(42, 35, 28, 0.18), 0 1px 2px rgba(42, 35, 28, 0.06);
  animation: dr-toast-in 120ms ease-out;
  max-width: min(90vw, 480px);
}

@keyframes dr-toast-in {
  from { opacity: 0; transform: translate(-50%, 6px); }
  to   { opacity: 1; transform: translate(-50%, 0); }
}

/* The host element itself owns the translate(-50%) for centering, so
   the inner keyframe above is shipped on the .dr-toast node — but we
   need the host to animate too. CSS-only fade on the host: */
:host {
  animation: dr-toast-host-in 120ms ease-out;
}
@keyframes dr-toast-host-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.dr-toast__msg {
  flex: 1 1 auto;
  min-width: 0;
  word-break: break-word;
  color: ${DR_TOKENS.inkSoft};
}

.dr-toast__msg strong {
  color: ${DR_TOKENS.ink};
  font-weight: 600;
}

.dr-toast__undo {
  all: unset;
  cursor: pointer;
  flex: 0 0 auto;
  padding: 5px 12px;
  border-radius: 999px;
  background: ${DR_TOKENS.accent};
  color: #FFFFFF;
  font-size: 12px;
  font-weight: 600;
  transition: background 120ms ease;
}
.dr-toast__undo:hover { background: ${DR_TOKENS.accentInk}; }
.dr-toast__undo:focus-visible {
  outline: 2px solid ${DR_TOKENS.accentInk};
  outline-offset: 2px;
}

.dr-toast__close {
  all: unset;
  cursor: pointer;
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: ${DR_TOKENS.inkMuted};
  font-size: 14px;
  line-height: 1;
}
.dr-toast__close:hover {
  background: ${DR_TOKENS.borderSoft};
  color: ${DR_TOKENS.ink};
}
.dr-toast__close:focus-visible {
  outline: 2px solid ${DR_TOKENS.accent};
  outline-offset: 1px;
}
`;
}

export function createToast(): ToastHandle {
  const host = document.createElement("dualread-toast");
  const shadow = host.attachShadow({ mode: "closed" });

  const styleEl = document.createElement("style");
  styleEl.textContent = toastCSS();
  shadow.appendChild(styleEl);

  const root = document.createElement("div");
  root.className = "dr-toast";
  shadow.appendChild(root);

  const stash = createUndoStash();

  let open = false;
  let disposed = false;
  // Currently-displayed word_key. Set when the toast mounts; cleared
  // on hide. We use it to scope auto-hide to the same toast that put
  // the stashed entry — a second deletion replaces the toast and we
  // don't want the older expiry to dismiss the newer surface.
  let activeKey: string | null = null;

  function clearRoot(): void {
    while (root.firstChild) root.removeChild(root.firstChild);
  }

  function hide(): void {
    if (!open) return;
    open = false;
    activeKey = null;
    if (host.isConnected) host.remove();
    clearRoot();
  }

  function render(args: ShowDeletedArgs): void {
    clearRoot();
    const { word, strings, onUndo } = args;

    const msg = document.createElement("span");
    msg.className = "dr-toast__msg";
    // Construct the message via a format function so the i18n layer
    // can place the word at language-appropriate positions. The word
    // node itself is a <strong> so screen readers emphasise it.
    const formatted = strings.deletedToast(word.word);
    const idx = formatted.indexOf(word.word);
    if (idx >= 0) {
      if (idx > 0) msg.appendChild(document.createTextNode(formatted.slice(0, idx)));
      const strong = document.createElement("strong");
      strong.textContent = word.word;
      msg.appendChild(strong);
      const tail = formatted.slice(idx + word.word.length);
      if (tail) msg.appendChild(document.createTextNode(tail));
    } else {
      msg.textContent = formatted;
    }
    root.appendChild(msg);

    const undo = document.createElement("button");
    undo.type = "button";
    undo.className = "dr-toast__undo";
    undo.textContent = strings.undoLabel;
    undo.addEventListener("click", () => {
      const stashed = stash.pop(word.word_key);
      if (!stashed) {
        // TTL beat the click by a hair — bail silently. The user's
        // delete already committed.
        hide();
        return;
      }
      hide();
      onUndo(stashed);
    });
    root.appendChild(undo);

    const close = document.createElement("button");
    close.type = "button";
    close.className = "dr-toast__close";
    close.setAttribute("aria-label", strings.closeLabel);
    close.textContent = "×";
    close.addEventListener("click", () => {
      // Closing the toast is a confirmation, not an undo: drop the
      // stashed entry so the deletion is final.
      stash.pop(word.word_key);
      hide();
    });
    root.appendChild(close);
  }

  return {
    showDeleted(args): void {
      if (disposed) return;
      // Hide the older toast (if any). The previous stash entry, if it
      // exists for a different key, is left to expire naturally — only
      // the visible surface is replaced.
      if (open) hide();

      stash.put(args.word, TOAST_TTL_MS, () => {
        // Expiry path: only auto-hide the visible toast if it still
        // belongs to this word_key. A user could have triggered a
        // second deletion that replaced the visible toast; in that
        // case the visible toast has its own timer and we leave it.
        if (activeKey === args.word.word_key) hide();
      });

      activeKey = args.word.word_key;
      render(args);
      if (!host.isConnected) {
        document.documentElement.appendChild(host);
      }
      open = true;
    },

    hide,

    isOpen: () => open,

    isStashed: (word_key) => stash.has(word_key),

    dispose(): void {
      if (disposed) return;
      disposed = true;
      stash.clearAll();
      hide();
    },
  };
}
