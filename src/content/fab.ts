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

// Persisted FAB top-left in viewport pixels. Lives in chrome.storage.local
// (not sync) because position is a per-device ergonomic choice — a 4K
// monitor's preferred spot is wrong on a laptop.
export interface FabPosition {
  x: number;
  y: number;
}

export interface FabOptions {
  enabled: boolean;
  strings: FabStrings;
  onToggle(): void;
  // Restored position from storage. Undefined → default to bottom-right
  // corner of the current viewport.
  initialPosition?: FabPosition;
  // Fired once per drag, on pointerup, after the position has been clamped
  // to the visible viewport. Caller persists.
  onPositionChange?: (pos: FabPosition) => void;
}

// FAB is a fixed 44×44 button. Hardcoding here (instead of measuring) keeps
// the drag math correct even before the host element has laid out.
const FAB_SIZE = 44;
// Smallest distance from the viewport edge we'll allow the FAB to sit, so
// it remains fully visible and clickable even after a clamp.
const VIEWPORT_MARGIN = 4;
// Default offset for the un-dragged position — matches the original
// `right/bottom: 20px` layout.
const DEFAULT_OFFSET = 20;
// Pointer travel below this counts as a click; above, a drag. Tuned so a
// shaky tap (trackpad, touch) still toggles the switch but a deliberate
// move starts repositioning.
const DRAG_THRESHOLD_PX = 4;

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
  //
  // `top` / `left` are written inline by `applyPosition` (also `!important`)
  // so the FAB can be repositioned by drag without rewriting this rule.
  return `
:host {
  all: initial !important;
  display: block !important;
  position: fixed !important;
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

// Constrain (x, y) so the full 44×44 button stays inside the viewport with
// at least VIEWPORT_MARGIN of breathing room on every side. Pure function so
// callers (init + each pointermove + pointerup) can share the same math.
function clampToViewport(x: number, y: number): FabPosition {
  const maxX = Math.max(VIEWPORT_MARGIN, window.innerWidth - FAB_SIZE - VIEWPORT_MARGIN);
  const maxY = Math.max(VIEWPORT_MARGIN, window.innerHeight - FAB_SIZE - VIEWPORT_MARGIN);
  return {
    x: Math.max(VIEWPORT_MARGIN, Math.min(maxX, x)),
    y: Math.max(VIEWPORT_MARGIN, Math.min(maxY, y)),
  };
}

// Where the FAB lands when the user has never dragged it. Mirrors the
// pre-drag layout (right/bottom: 20px) and clamps for tiny viewports.
function defaultPosition(): FabPosition {
  return clampToViewport(
    window.innerWidth - FAB_SIZE - DEFAULT_OFFSET,
    window.innerHeight - FAB_SIZE - DEFAULT_OFFSET
  );
}

// Inline-style writes use !important so a hostile host page's
// `[style] { position: static !important }` can't dislodge the FAB. The
// shadow-host element only carries the rules we set here — no class
// names — so this is the only writer that touches its inline style.
function applyPosition(host: HTMLElement, pos: FabPosition): void {
  host.style.setProperty("left", `${pos.x}px`, "important");
  host.style.setProperty("top", `${pos.y}px`, "important");
  host.style.setProperty("right", "auto", "important");
  host.style.setProperty("bottom", "auto", "important");
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
  let position = clampToViewport(
    options.initialPosition?.x ?? defaultPosition().x,
    options.initialPosition?.y ?? defaultPosition().y
  );
  applyPosition(host, position);

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

  // Drag state. `dragStart` snapshots both the pointer's viewport position
  // and the FAB's top-left at pointerdown so pointermove can translate by
  // the delta without depending on getBoundingClientRect (which would
  // re-measure mid-drag and amplify any pixel rounding).
  let dragStart: { pointerX: number; pointerY: number; fabX: number; fabY: number } | null = null;
  let didDrag = false;

  const onPointerDown = (e: PointerEvent): void => {
    // Only react to primary-button presses. Right-click / middle-click
    // shouldn't start a drag.
    if (e.button !== 0) return;
    dragStart = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      fabX: position.x,
      fabY: position.y,
    };
    didDrag = false;
    // Capture so a fast drag that leaves the 44×44 button still sends
    // pointermove / pointerup back to us.
    button.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent): void => {
    if (!dragStart) return;
    const dx = e.clientX - dragStart.pointerX;
    const dy = e.clientY - dragStart.pointerY;
    if (!didDrag && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    didDrag = true;
    position = clampToViewport(dragStart.fabX + dx, dragStart.fabY + dy);
    applyPosition(host, position);
  };

  const onPointerUp = (e: PointerEvent): void => {
    if (!dragStart) return;
    const wasDrag = didDrag;
    dragStart = null;
    try {
      button.releasePointerCapture(e.pointerId);
    } catch {
      /* capture may already be released by the browser */
    }
    if (wasDrag) {
      // Suppress the synthetic click that would otherwise fire after a
      // pointerup on the same target.
      e.preventDefault();
      options.onPositionChange?.(position);
    }
  };

  const onClick = (e: MouseEvent): void => {
    // Defensive: stop host page handlers from reacting to the click.
    e.preventDefault();
    e.stopPropagation();
    if (didDrag) {
      // The pointer travelled past the threshold; treat as a drag and
      // skip the toggle. Reset so the next gesture starts fresh.
      didDrag = false;
      return;
    }
    options.onToggle();
  };

  button.addEventListener("pointerdown", onPointerDown);
  button.addEventListener("pointermove", onPointerMove);
  button.addEventListener("pointerup", onPointerUp);
  button.addEventListener("click", onClick);

  // Window resize can shrink the viewport below the saved position. Re-clamp
  // on resize so the FAB doesn't strand off-screen until the next drag.
  const onResize = (): void => {
    const next = clampToViewport(position.x, position.y);
    if (next.x === position.x && next.y === position.y) return;
    position = next;
    applyPosition(host, position);
  };
  window.addEventListener("resize", onResize);

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
      button.removeEventListener("pointerdown", onPointerDown);
      button.removeEventListener("pointermove", onPointerMove);
      button.removeEventListener("pointerup", onPointerUp);
      button.removeEventListener("click", onClick);
      window.removeEventListener("resize", onResize);
      host.remove();
    },
  };
}
