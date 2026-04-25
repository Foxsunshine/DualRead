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

/* v2.1.1 / DL-3: long-phrase variant — the word div is gone, so the
   close × needs to sit flush right. Align to the end so we don't get
   a stretched row with a lonely button floating at the center. */
.dr-bubble__row--no-word {
  justify-content: flex-end;
}

/* v2.1.1 / DL-2: the original word demotes from "title" to "caption".
   Smaller, lighter weight, muted color — makes it clear the *translation*
   is the scannable payload. Interior case intentionally preserved
   (no text-transform) because acronyms like 'U.S' look wrong lowercased. */
.dr-bubble__word {
  font-size: 12px;
  font-weight: 500;
  color: ${DR_TOKENS.inkMuted};
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

/* v2.1.1 / DL-2: translation is now the primary surface — 16 px / 600 /
   ink (the same recipe as the "Saved toast" body to read as one voice
   across content-layer surfaces). The previous inkSoft tone is retired
   here; note / error lines still use it below so they stay secondary. */
.dr-bubble__translation {
  margin-top: 4px;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
  color: ${DR_TOKENS.ink};
  word-break: break-word;
}

.dr-bubble__note {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed ${DR_TOKENS.borderSoft};
  color: ${DR_TOKENS.inkSoft};
  font-size: 12px;
  word-break: break-word;
}

.dr-bubble__actions {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* v2.1.1 / DL-4: Save / Saved shrunk to an icon + 11 px label. Same
   height as detail/delete's 28 px hit-area so the actions row keeps a
   stable baseline; width hugs the label since icon-only would sacrifice
   the "Save" CTA discoverability for first-time users.
   Main (Save) variant: accent fill, white glyph + text — keeps the "main
   action" signal readable. Saved variant below flips to sage soft. */
.dr-bubble__btn {
  all: unset;
  cursor: pointer;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  height: 22px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 600;
  background: ${DR_TOKENS.accent};
  color: #FFFFFF;
  transition: background 120ms ease, color 120ms ease;
  /* The label can carry 2 Chinese chars or ~6 English chars. A hard cap
     keeps the row from stretching on accidental locale swaps or very
     long future labels — overflow is trimmed with an ellipsis rather
     than wrapping, because the button is single-row by design. */
  max-width: 120px;
}
.dr-bubble__btn-icon {
  flex: 0 0 auto;
  display: inline-block;
}
.dr-bubble__btn-label {
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dr-bubble__btn:hover {
  background: ${DR_TOKENS.accentInk};
}
.dr-bubble__btn:focus-visible {
  outline: 2px solid ${DR_TOKENS.accentInk};
  outline-offset: 1px;
}
/* Saved variant (disabled). The [disabled] selector on its own used to
   catch the v2.0 "Saved" button; now that Saved is a distinct class, we
   bind the sage-soft palette directly to the new modifier and keep
   [disabled] as a belt-and-braces fallback for future read-only states. */
.dr-bubble__btn--saved,
.dr-bubble__btn[disabled] {
  cursor: default;
  background: ${DR_TOKENS.sageSoft};
  color: ${DR_TOKENS.sage};
}
.dr-bubble__btn--saved:hover {
  background: ${DR_TOKENS.sageSoft};
  color: ${DR_TOKENS.sage};
}

/* Detail button in the saved-word variant: icon-only, replaces the old
   text link. Sized ~28×28 (16px glyph + 6px padding each side) so it sits
   a hair taller than the Save/Saved button but with align-items: center
   on the actions row the mismatch is visually absorbed. Hover gives a
   soft background chip so it reads as "clickable" without needing a border. */
.dr-bubble__detail {
  all: unset;
  cursor: pointer;
  flex: 0 0 auto;
  box-sizing: border-box;
  padding: 6px;
  border-radius: 6px;
  color: ${DR_TOKENS.accentInk};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 120ms ease, color 120ms ease;
}
.dr-bubble__detail:hover {
  background: ${DR_TOKENS.borderSoft};
  color: ${DR_TOKENS.accent};
}
.dr-bubble__detail:focus-visible {
  outline: 2px solid ${DR_TOKENS.accent};
  outline-offset: 1px;
}

/* Trash-can button in the saved-word variant (v2.1 / D58).
   Same chassis as .dr-bubble__detail so the two icon buttons sit visually
   matched in the actions row. Intentionally uses the accent color (not the
   red danger token) — the affordance is "remove this word", the safety net
   is the 5s undo toast, not a scary red hue. The SVG ships at 14 px inside
   a 6 px pad = 26 px clickable; close to the 28 px target the brainstorm
   quotes, with 2 px absorbed by baseline alignment in the flex row. */
.dr-bubble__del {
  all: unset;
  cursor: pointer;
  flex: 0 0 auto;
  box-sizing: border-box;
  padding: 6px;
  border-radius: 6px;
  color: ${DR_TOKENS.accentInk};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 120ms ease, color 120ms ease;
}
.dr-bubble__del:hover {
  background: ${DR_TOKENS.borderSoft};
  color: ${DR_TOKENS.accent};
}
.dr-bubble__del:focus-visible {
  outline: 2px solid ${DR_TOKENS.accent};
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
`;
}
