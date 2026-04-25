// Hover state machine for the in-page bubble (v2.1 / D61 §6.3).
//
// Isolated from content/index.ts as a pure reducer so the transition table
// (§6.3) can be exercised directly under vitest without a DOM. The runtime
// wiring in content/index.ts translates DOM events into `HoverEvent`s,
// pipes them through `hoverReducer`, and executes the returned `HoverCmd`s
// (start/clear timers, show/hide bubble). That split is what makes the
// 300/150 ms timer hygiene testable: the reducer returns declarative
// commands rather than setting real timers.
//
// State names mirror §6.3 exactly:
//   IDLE → PENDING_SHOW → SHOWN → PENDING_HIDE (→ SHOWN or IDLE)
//   + CLICK_OWNED (click paths take the bubble; hover goes quiet)
//
// Invariants the runtime relies on:
//   - A timer cmd (`start_enter_timer` / `start_exit_timer`) is always
//     preceded by the matching `clear_*_timer` when a prior timer could
//     still be live. The runtime clears defensively anyway; the reducer
//     keeps the contract explicit for tests.
//   - `show_bubble` always carries the *current* context so the runtime
//     never has to peek into state to paint — this makes it safe to drop
//     intermediate states (e.g. SHOWN(A) → SHOWN(B) with skipped delay).
//   - Any terminal hop to `idle` that might have a bubble up issues
//     `hide_bubble`; hops from states that never had a bubble (pending_show
//     only) do not.

export const HOVER_ENTER_DELAY_MS = 300;
export const HOVER_EXIT_DELAY_MS = 150;

// Opaque ref type. Runtime passes the actual `HTMLElement` for a
// `.dr-hl` span; tests pass unique `{}` objects. The reducer uses only
// identity comparisons (`===`), never properties, so both work.
export type MarkRef = object;

// What the runtime needs to paint a bubble. `word_key` is the canonical
// lowercased key (same value written to `dataset.word` by highlight.ts);
// runtime resolves it to a full `VocabWord` from its in-memory map before
// calling `clickTranslator.showHover`.
export interface HoverContext {
  mark: MarkRef;
  word_key: string;
}

export type HoverState =
  | { kind: "idle" }
  | { kind: "pending_show"; ctx: HoverContext }
  | { kind: "shown"; ctx: HoverContext }
  | { kind: "pending_hide"; ctx: HoverContext }
  | { kind: "click_owned" };

export type HoverEvent =
  | { type: "mouseover_mark"; ctx: HoverContext }
  | { type: "mouseout_mark"; mark: MarkRef }
  | { type: "mouseover_bubble" }
  | { type: "mouseout_bubble" }
  | { type: "click_mark" }
  | { type: "bubble_dismiss" }
  | { type: "dragstart" }
  | { type: "detach"; mark: MarkRef }
  | { type: "enter_timer_fired" }
  | { type: "exit_timer_fired" };

export type HoverCmd =
  | { type: "clear_enter_timer" }
  | { type: "clear_exit_timer" }
  | { type: "start_enter_timer" }
  | { type: "start_exit_timer" }
  | { type: "show_bubble"; ctx: HoverContext }
  | { type: "hide_bubble" };

export interface HoverStep {
  state: HoverState;
  cmds: HoverCmd[];
}

export function initialHoverState(): HoverState {
  return { kind: "idle" };
}

// Single-event reducer. Callers fold a stream of events into a state +
// a flat command list per step; the runtime drains the commands before
// accepting the next event so timers and visibility stay in lockstep.
export function hoverReducer(state: HoverState, event: HoverEvent): HoverStep {
  switch (state.kind) {
    // ───── IDLE ─────
    case "idle": {
      if (event.type === "mouseover_mark") {
        return {
          state: { kind: "pending_show", ctx: event.ctx },
          cmds: [{ type: "start_enter_timer" }],
        };
      }
      // Everything else in IDLE is a no-op: stray mouseouts, timer events
      // fired after a reset, drags outside any mark, detach of a mark we
      // never tracked. Defensive: don't re-fire clear_* timer cmds here
      // because we guarantee they were cleared on the transition *into*
      // idle.
      return { state, cmds: [] };
    }

    // ───── PENDING_SHOW ─────
    case "pending_show": {
      switch (event.type) {
        case "mouseover_mark": {
          // Same mark → already waiting; leave timer alone so the 300 ms
          // is measured from the *first* entry (row 2 semantics only
          // apply to a different mark).
          if (event.ctx.mark === state.ctx.mark) return { state, cmds: [] };
          // Row 2: switch targets; restart the 300 ms window.
          return {
            state: { kind: "pending_show", ctx: event.ctx },
            cmds: [{ type: "clear_enter_timer" }, { type: "start_enter_timer" }],
          };
        }
        case "mouseout_mark": {
          if (event.mark !== state.ctx.mark) return { state, cmds: [] };
          // Row 5: abandon the pending show.
          return { state: { kind: "idle" }, cmds: [{ type: "clear_enter_timer" }] };
        }
        case "enter_timer_fired": {
          // Promotion: the 300 ms elapsed with the cursor still on mark.
          return {
            state: { kind: "shown", ctx: state.ctx },
            cmds: [{ type: "show_bubble", ctx: state.ctx }],
          };
        }
        case "click_mark": {
          // Row 9: click wins; give up the pending show without painting.
          return {
            state: { kind: "click_owned" },
            cmds: [{ type: "clear_enter_timer" }],
          };
        }
        case "dragstart": {
          // Row 11: drag takes over the page's attention. No bubble to
          // hide (we never promoted), but cancel the pending show so
          // a later release doesn't suddenly pop a bubble.
          return { state: { kind: "idle" }, cmds: [{ type: "clear_enter_timer" }] };
        }
        case "detach": {
          if (event.mark !== state.ctx.mark) return { state, cmds: [] };
          // Row 12: the mark we were about to show for is gone.
          return { state: { kind: "idle" }, cmds: [{ type: "clear_enter_timer" }] };
        }
        case "bubble_dismiss": {
          // Unusual — bubble was dismissed while we were merely pending.
          // The runtime may emit this when an unrelated hover's bubble
          // closed; safest is to drop out of pending without painting.
          return { state: { kind: "idle" }, cmds: [{ type: "clear_enter_timer" }] };
        }
        default:
          return { state, cmds: [] };
      }
    }

    // ───── SHOWN ─────
    case "shown": {
      switch (event.type) {
        case "mouseout_mark": {
          if (event.mark !== state.ctx.mark) return { state, cmds: [] };
          // Row 6: start the 150 ms exit window so the user can sweep into
          // the bubble (safe zone) without losing it.
          return {
            state: { kind: "pending_hide", ctx: state.ctx },
            cmds: [{ type: "start_exit_timer" }],
          };
        }
        case "mouseover_mark": {
          if (event.ctx.mark === state.ctx.mark) return { state, cmds: [] };
          // Row 3: neighbor hop. No delay — repaint the bubble against
          // the new anchor. Runtime will reposition in `show_bubble`.
          return {
            state: { kind: "shown", ctx: event.ctx },
            cmds: [{ type: "show_bubble", ctx: event.ctx }],
          };
        }
        case "mouseout_bubble": {
          // Row 8: bubble was the user's current zone; now they've left
          // it. Start the exit timer, re-tied to the original mark so a
          // quick return to that mark re-arms SHOWN.
          return {
            state: { kind: "pending_hide", ctx: state.ctx },
            cmds: [{ type: "start_exit_timer" }],
          };
        }
        case "click_mark": {
          // Row 9 (from SHOWN): bubble already up, click takes over the
          // same visual surface. We don't hide — click path will repaint
          // with the click-owned variant (adds delete/detail callbacks).
          return { state: { kind: "click_owned" }, cmds: [] };
        }
        case "dragstart": {
          return { state: { kind: "idle" }, cmds: [{ type: "hide_bubble" }] };
        }
        case "detach": {
          if (event.mark !== state.ctx.mark) return { state, cmds: [] };
          return { state: { kind: "idle" }, cmds: [{ type: "hide_bubble" }] };
        }
        case "bubble_dismiss": {
          // User ESC'd / scrolled / clicked outside. Bubble is already
          // down; sync our state so the next hover starts from scratch.
          return { state: { kind: "idle" }, cmds: [] };
        }
        default:
          return { state, cmds: [] };
      }
    }

    // ───── PENDING_HIDE ─────
    case "pending_hide": {
      switch (event.type) {
        case "mouseover_mark": {
          if (event.ctx.mark === state.ctx.mark) {
            // User came back to the same mark; cancel the hide.
            return {
              state: { kind: "shown", ctx: state.ctx },
              cmds: [{ type: "clear_exit_timer" }],
            };
          }
          // Row 4: neighbor hop — swap bubble content, keep visibility.
          return {
            state: { kind: "shown", ctx: event.ctx },
            cmds: [{ type: "clear_exit_timer" }, { type: "show_bubble", ctx: event.ctx }],
          };
        }
        case "mouseover_bubble": {
          // Row 7: bubble is the safe zone; re-arm SHOWN.
          return {
            state: { kind: "shown", ctx: state.ctx },
            cmds: [{ type: "clear_exit_timer" }],
          };
        }
        case "exit_timer_fired": {
          // 150 ms elapsed without a recover — take the bubble down.
          return { state: { kind: "idle" }, cmds: [{ type: "hide_bubble" }] };
        }
        case "click_mark": {
          return {
            state: { kind: "click_owned" },
            cmds: [{ type: "clear_exit_timer" }],
          };
        }
        case "dragstart": {
          return {
            state: { kind: "idle" },
            cmds: [{ type: "clear_exit_timer" }, { type: "hide_bubble" }],
          };
        }
        case "detach": {
          if (event.mark !== state.ctx.mark) return { state, cmds: [] };
          return {
            state: { kind: "idle" },
            cmds: [{ type: "clear_exit_timer" }, { type: "hide_bubble" }],
          };
        }
        case "bubble_dismiss": {
          return {
            state: { kind: "idle" },
            cmds: [{ type: "clear_exit_timer" }],
          };
        }
        case "mouseout_mark":
        case "mouseout_bubble": {
          // Already scheduled to hide — second mouseout is redundant.
          return { state, cmds: [] };
        }
        default:
          return { state, cmds: [] };
      }
    }

    // ───── CLICK_OWNED ─────
    case "click_owned": {
      if (event.type === "bubble_dismiss") {
        // Row 10: click bubble went away → back to IDLE. Next hover starts
        // fresh; until then we continue to ignore mouseover events so a
        // user who clicks, then grazes their cursor back over the mark,
        // doesn't get a flicker of hover-then-nothing.
        return { state: { kind: "idle" }, cmds: [] };
      }
      // Everything else (mouseover, mouseout, dragstart, detach, timer
      // stragglers) is ignored while click owns the bubble. Row 9+ intent.
      return { state, cmds: [] };
    }
  }
}
