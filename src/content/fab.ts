// Floating action button — global DualRead on/off switch.
//
// Why this exists:
//   Users learning English on ad-hoc pages need a one-gesture way to pause
//   DualRead without navigating to the side panel's Settings tab. A fixed
//   bottom-right FAB is the standard web idiom for "primary global action
//   on every page" and costs 44×44 px of screen real estate. When off, the
//   FAB stays visible (dimmed) so the user can turn learning mode back on
//   without reopening the extension.
//
// Position:
//   Pinned bottom-right via the shadow `:host { bottom; right }` rule,
//   mirrored by inline `!important` on the host element. Same pattern as
//   `toast.ts`. Avoid the Popover API and JS-computed `top`/`left` here —
//   both interact badly with host page CSS and the popover UA defaults.
//
// Shadow-DOM hygiene:
//   - Closed Shadow DOM so host scripts can't reach our internals.
//   - `:host { all: initial !important }` resets every inherited property.
//     Host pages occasionally ship aggressive `* { box-sizing: content-box
//     !important }` or font overrides; we want predictability, not cascade.
//   - `z-index: 2147483645` is one less than the bubble (…46) so if the
//     user opens a bubble that overlaps the FAB, the bubble wins.
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

// Layout constants — kept in one place so the CSS string and the inline
// host-style writes can't drift. Drift between those two sources was the
// root cause of a positioning bug, so any future change must update both.
const FAB_SIZE_PX = 44;
const FAB_OFFSET_PX = 20;
// One below the bubble's z-index so an overlapping bubble draws on top.
const FAB_Z_INDEX = 2147483645;

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
  // FAB out of view.
  //
  // Anchors (`bottom`/`right`) are written AFTER `all: initial` so the
  // shorthand reset doesn't clobber them — declaration order within a
  // single rule is the tiebreaker for equal-priority writes.
  return `
:host {
  all: initial !important;
  display: block !important;
  position: fixed !important;
  bottom: ${FAB_OFFSET_PX}px !important;
  right: ${FAB_OFFSET_PX}px !important;
  top: auto !important;
  left: auto !important;
  width: ${FAB_SIZE_PX}px !important;
  height: ${FAB_SIZE_PX}px !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  background: transparent !important;
  z-index: ${FAB_Z_INDEX} !important;
  pointer-events: auto !important;
  visibility: visible !important;
  opacity: 1 !important;
  transform: none !important;
  float: none !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.dr-fab {
  display: flex;
  align-items: center;
  justify-content: center;
  width: ${FAB_SIZE_PX}px;
  height: ${FAB_SIZE_PX}px;
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
  // collision with host pages that reserve short `dr-*` prefixes.
  const host = document.createElement("dualread-fab");
  // Mirror the :host CSS inline so we win against author stylesheets
  // targeting our tag, and survive sanitisers that strip <style> from
  // shadow trees.
  host.style.setProperty("position", "fixed", "important");
  host.style.setProperty("bottom", `${FAB_OFFSET_PX}px`, "important");
  host.style.setProperty("right", `${FAB_OFFSET_PX}px`, "important");
  host.style.setProperty("top", "auto", "important");
  host.style.setProperty("left", "auto", "important");
  host.style.setProperty("width", `${FAB_SIZE_PX}px`, "important");
  host.style.setProperty("height", `${FAB_SIZE_PX}px`, "important");
  host.style.setProperty("margin", "0", "important");
  host.style.setProperty("padding", "0", "important");
  host.style.setProperty("border", "0", "important");
  host.style.setProperty("background", "transparent", "important");
  host.style.setProperty("z-index", String(FAB_Z_INDEX), "important");
  host.style.setProperty("display", "block", "important");
  host.style.setProperty("visibility", "visible", "important");
  host.style.setProperty("opacity", "1", "important");
  host.style.setProperty("pointer-events", "auto", "important");
  host.style.setProperty("transform", "none", "important");
  host.style.setProperty("float", "none", "important");

  // Closed shadow so host scripts can't query into our tree and mutate
  // state.
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
      if (
        strings.onLabel === currentStrings.onLabel &&
        strings.offLabel === currentStrings.offLabel
      ) {
        return;
      }
      currentStrings = strings;
      paint();
    },
    dispose(): void {
      button.removeEventListener("click", onClick);
      host.remove();
    },
  };
}
