// Floating action button — global DualRead on/off switch (post-Phase-H D52).
//
// Why this exists:
//   Users learning English on ad-hoc pages need a one-gesture way to pause
//   DualRead without navigating to the side panel's Settings tab. A fixed
//   corner FAB is the standard web idiom for "primary global action on
//   every page" and costs 44×44 px of screen real estate. When off, the
//   FAB stays visible (dimmed) so the user can turn learning mode back on
//   without reopening the extension.
//
// Shadow-DOM hygiene:
//   - Closed Shadow DOM on an element attached to <html> (not <body>) so
//     host scripts using `document.body.innerHTML =` reflows can't wipe it.
//   - `:host { all: initial }` resets every inherited property. Host pages
//     occasionally ship aggressive `* { box-sizing: content-box !important }`
//     or font overrides; we want predictability, not cascade.
//   - `z-index: 2147483645` is one less than the bubble (…46) so if the
//     user opens a bubble that overlaps the FAB, the bubble wins. Both
//     sit below Chrome's own overlay ceiling (`MAX`).
//
// State:
//   - The caller owns the `learning_mode_enabled` flag in storage. The FAB
//     only knows its visual state and fires `onToggle()` on click. The
//     caller writes to storage and then calls `setEnabled` on this handle
//     to flip the visual. Keeps this module testable without chrome.* mocks.
//
// Accessibility:
//   - `role="switch"`, `aria-checked`, live-updated `aria-label` reflect
//     the current state so screen readers announce the right action.

import { DR_TOKENS } from "../sidepanel/tokens";

export interface FabHandle {
  // Flip the visual (dimmed vs. active). Does NOT persist — caller owns
  // storage. Idempotent.
  setEnabled(enabled: boolean): void;
  // Update the localized aria/tooltip strings (called on UI-language change).
  setStrings(strings: FabStrings): void;
  // Tear down: removes DOM + listeners. Safe to call more than once.
  dispose(): void;
}

export interface FabStrings {
  // Tooltip + aria-label when the FAB is currently ON.
  onLabel: string;
  // …when currently OFF.
  offLabel: string;
}

export interface FabOptions {
  enabled: boolean;
  strings: FabStrings;
  onToggle(): void;
}

// Single SVG for both states — color + opacity handle the visual diff.
// Path is a stylized "D" (DualRead mark) in a 24×24 box. Using a path
// instead of the side panel's SVG logo keeps the FAB bundle light and
// avoids coupling the two.
const LOGO_SVG = `
<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
  <path
    d="M6 4h6a8 8 0 0 1 0 16H6V4Zm4 3v10h2a5 5 0 0 0 0-10h-2Z"
    fill="currentColor"
  />
</svg>`;

function fabCSS(): string {
  // `!important` on the critical layout rules because the host page's own
  // stylesheet can still reach our host element (CSS rules don't stop at
  // the Shadow DOM boundary for selectors that match the host itself).
  // Reset stylesheets that ship `* { display: none !important }` or
  // `[class] { position: static !important }` would otherwise yank the
  // FAB out of view. The `!important` here wins by CSS origin + flag.
  return `
:host {
  all: initial !important;
  display: block !important;
  position: fixed !important;
  right: 20px !important;
  bottom: 20px !important;
  width: auto !important;
  height: auto !important;
  z-index: 2147483645 !important;
  pointer-events: auto !important;
  visibility: visible !important;
  opacity: 1 !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.dr-fab {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: ${DR_TOKENS.accent};
  color: #fff;
  border: none;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(42, 35, 28, 0.18), 0 1px 3px rgba(42, 35, 28, 0.08);
  transition: transform 100ms ease-out, opacity 150ms ease-out, background-color 150ms ease-out;
  padding: 0;
}
.dr-fab:hover { transform: scale(1.06); }
.dr-fab:active { transform: scale(0.96); }
.dr-fab:focus-visible {
  outline: 2px solid ${DR_TOKENS.accent};
  outline-offset: 3px;
}
/* Off state: grayscale + dim so the contrast with on is unmistakable at
 * a glance. Keep the mark readable so the user still recognises what it
 * toggles — fully transparent would look like a bug, not a control. */
.dr-fab--off {
  background: ${DR_TOKENS.inkMuted};
  opacity: 0.72;
}
`;
}

// Factory. Mounts once per frame. Caller owns lifecycle via `dispose`.
export function createFab(options: FabOptions): FabHandle {
  // Namespaced custom tag (`dualread-fab` not `dr-fab`) to avoid any
  // collision with host pages that reserve short `dr-*` prefixes. Some
  // design systems (and Reddit's Shreddit components) define custom
  // elements of their own, and a clash makes our element either fail to
  // upgrade or inherit the wrong base class.
  const host = document.createElement("dualread-fab");
  // Closed shadow so host scripts can't query into our tree and mutate
  // state. Matches the bubble's convention (defense in depth against
  // hostile pages).
  const shadow = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = fabCSS();
  shadow.appendChild(style);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "dr-fab";
  button.setAttribute("role", "switch");
  button.innerHTML = LOGO_SVG;
  shadow.appendChild(button);

  let currentEnabled = options.enabled;
  let currentStrings = options.strings;

  // Re-paint the button's class + aria state from in-memory state. Called
  // from setEnabled and setStrings so both paths stay in sync.
  function paint(): void {
    button.classList.toggle("dr-fab--off", !currentEnabled);
    button.setAttribute("aria-checked", currentEnabled ? "true" : "false");
    const label = currentEnabled ? currentStrings.onLabel : currentStrings.offLabel;
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
  }
  paint();

  // Mount on <body>. Reddit (Shreddit), and a handful of other heavy SPAs
  // don't cleanly render custom elements appended as direct children of
  // <html> — the element ends up in the DOM but outside the layout tree.
  // Body-mount is the universal convention for floating UI and works on
  // every host we've tested. If a host page nukes body.innerHTML later,
  // the content script's next init() (on navigation) will re-add us.
  (document.body ?? document.documentElement).appendChild(host);

  const onClick = (e: MouseEvent): void => {
    // Defensive: stop host page handlers from reacting to the click.
    e.preventDefault();
    e.stopPropagation();
    options.onToggle();
  };
  button.addEventListener("click", onClick);

  return {
    setEnabled(enabled: boolean): void {
      if (enabled === currentEnabled) return;
      currentEnabled = enabled;
      paint();
    },
    setStrings(strings: FabStrings): void {
      currentStrings = strings;
      paint();
    },
    dispose(): void {
      button.removeEventListener("click", onClick);
      host.remove();
    },
  };
}
