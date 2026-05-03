// CSS for the in-page translation bubble (v1.1 F3).
//
// Kept as a template literal so we can inject it once into the Shadow DOM
// via a single `<style>` node — no Vite CSS module, no fetch. The colors
// mirror `src/sidepanel/tokens.ts` so the bubble reads as the same product
// as the side panel without sharing runtime.
//
// Shadow-DOM hygiene:
//   - `:host { all: initial }` — host pages sometimes ship `* { all: unset }`
//     or overzealous `font: inherit`; this line guarantees we start from a
//     clean slate regardless. Everything downstream sets properties
//     explicitly because there is no cascade from the host document.
//   - `pointer-events` / `user-select` re-enabled inside the shell because
//     `all: initial` disables them.
//   - `z-index` is one below Chrome's fullscreen-API ceiling — above any
//     well-behaved page, below the browser chrome.
//
// Sizes and spacing echo the side panel's visual rhythm (`tokens.ts` in
// the panel file tree). We avoid `rem` because host page root font-size
// is unknown; everything is in `px` for predictability.

import { DR_TOKENS } from "../sidepanel/tokens";

export function bubbleCSS(): string {
  return `
:host {
  all: initial;
  position: fixed;
  z-index: 2147483646;
  pointer-events: auto;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 13px;
  line-height: 1.45;
  color: ${DR_TOKENS.ink};
}

.dr-bubble {
  box-sizing: border-box;
  min-width: 180px;
  max-width: 280px;
  background: ${DR_TOKENS.bgRaised};
  color: ${DR_TOKENS.ink};
  border: 1px solid ${DR_TOKENS.border};
  border-radius: 10px;
  box-shadow: 0 6px 24px rgba(42, 35, 28, 0.14), 0 1px 2px rgba(42, 35, 28, 0.06);
  padding: 10px 12px;
  user-select: text;
  -webkit-user-select: text;
  animation: dr-fade-in 90ms ease-out;
}

@keyframes dr-fade-in {
  from { opacity: 0; transform: translateY(-2px); }
  to   { opacity: 1; transform: translateY(0); }
}

.dr-bubble__row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.dr-bubble__word {
  font-weight: 400;
  font-size: 12px;
  color: ${DR_TOKENS.inkSoft};
  word-break: break-word;
  flex: 1;
  min-width: 0;
}

.dr-bubble__close {
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
  line-height: 1;
}
.dr-bubble__close:hover {
  background: ${DR_TOKENS.borderSoft};
  color: ${DR_TOKENS.ink};
}
.dr-bubble__close:focus-visible {
  outline: 2px solid ${DR_TOKENS.accent};
  outline-offset: 1px;
}

.dr-bubble__translation {
  margin-top: 4px;
  font-size: 16px;
  font-weight: 600;
  color: ${DR_TOKENS.ink};
  word-break: break-word;
}

.dr-bubble__actions {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.dr-bubble__btn {
  all: unset;
  cursor: pointer;
  box-sizing: border-box;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  background: ${DR_TOKENS.accent};
  color: #FFFFFF;
  transition: background 120ms ease;
}
.dr-bubble__btn:hover {
  background: ${DR_TOKENS.accentInk};
}
.dr-bubble__btn:focus-visible {
  outline: 2px solid ${DR_TOKENS.accentInk};
  outline-offset: 1px;
}
.dr-bubble__btn[disabled] {
  cursor: default;
  background: ${DR_TOKENS.sageSoft};
  color: ${DR_TOKENS.sage};
}

/* Delete button: icon-only trash glyph for the saved-word bubble. Hover
   uses the destructive red token, matching the side-panel delete
   affordance pattern. */
.dr-bubble__delete {
  all: unset;
  cursor: pointer;
  flex: 0 0 auto;
  box-sizing: border-box;
  padding: 6px;
  border-radius: 6px;
  color: ${DR_TOKENS.inkMuted};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 120ms ease, color 120ms ease;
}
.dr-bubble__delete:hover {
  background: ${DR_TOKENS.borderSoft};
  color: ${DR_TOKENS.red};
}
.dr-bubble__delete:focus-visible {
  outline: 2px solid ${DR_TOKENS.red};
  outline-offset: 1px;
}

.dr-bubble__loading {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: ${DR_TOKENS.inkMuted};
  font-size: 12px;
}
.dr-bubble__spinner {
  width: 10px;
  height: 10px;
  border: 2px solid ${DR_TOKENS.border};
  border-top-color: ${DR_TOKENS.accent};
  border-radius: 50%;
  animation: dr-spin 700ms linear infinite;
}
@keyframes dr-spin {
  to { transform: rotate(360deg); }
}

.dr-bubble__error {
  margin-top: 4px;
  color: ${DR_TOKENS.red};
  font-size: 12px;
}

/* alreadyInLang state. Same vertical rhythm as the translation row but
   muted (the user is being told nothing happened) and prefixed with a
   small info glyph drawn as a CSS pseudo-element so we don't need to
   ship another inline SVG. The "translate anyway" button below it is
   the ghost variant of dr-bubble__btn — a transparent fill with the
   accent ink so it sits as a secondary action under the notice. */
.dr-bubble__notice {
  margin-top: 4px;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  color: ${DR_TOKENS.inkSoft};
  font-size: 12px;
  line-height: 1.5;
}
.dr-bubble__notice::before {
  content: "ⓘ";
  flex: 0 0 auto;
  color: ${DR_TOKENS.inkMuted};
  font-size: 13px;
  line-height: 1.4;
}

.dr-bubble__btn--ghost {
  background: transparent;
  color: ${DR_TOKENS.accentInk};
  padding: 4px 8px;
  border: 1px solid ${DR_TOKENS.borderSoft};
}
.dr-bubble__btn--ghost:hover {
  background: ${DR_TOKENS.borderSoft};
  color: ${DR_TOKENS.accent};
}
.dr-bubble__btn--ghost:focus-visible {
  outline: 2px solid ${DR_TOKENS.accent};
  outline-offset: 1px;
}
`;
}
