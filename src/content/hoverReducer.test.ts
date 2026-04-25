// Unit tests for the hover state machine reducer (v2.1 / §6.3).
//
// Covers every row of the transition table plus timer-cleanup invariants.
// The reducer is a pure function, so these tests run in the default
// vitest node environment with no DOM — marks are represented as unique
// `{}` objects to exercise identity comparisons.

import { describe, expect, it } from "vitest";
import {
  hoverReducer,
  initialHoverState,
  type HoverCmd,
  type HoverContext,
  type HoverState,
} from "./hoverReducer";

// Test helpers -------------------------------------------------

const markA: object = { id: "A" };
const markB: object = { id: "B" };

const ctxA: HoverContext = { mark: markA, word_key: "alpha" };
const ctxB: HoverContext = { mark: markB, word_key: "beta" };

// Shortcuts for the matchers we check repeatedly. `cmdTypes` just projects
// the type discriminator so assertions read as a sequence of verbs, not a
// literal structural match.
const cmdTypes = (cmds: HoverCmd[]): string[] => cmds.map((c) => c.type);

// Convenience: drive a sequence of events, returning the final state + the
// accumulated command list. Good for multi-step scenarios where only the
// end state matters.
function drive(initial: HoverState, events: Parameters<typeof hoverReducer>[1][]): {
  state: HoverState;
  cmds: HoverCmd[];
} {
  let state = initial;
  const cmds: HoverCmd[] = [];
  for (const e of events) {
    const step = hoverReducer(state, e);
    state = step.state;
    cmds.push(...step.cmds);
  }
  return { state, cmds };
}

// ─────────────────────────────────────────────────────────────

describe("hoverReducer — idle", () => {
  it("enters PENDING_SHOW and starts enter timer on mouseover (row 1)", () => {
    const step = hoverReducer(initialHoverState(), {
      type: "mouseover_mark",
      ctx: ctxA,
    });
    expect(step.state.kind).toBe("pending_show");
    expect(cmdTypes(step.cmds)).toEqual(["start_enter_timer"]);
  });

  it("ignores mouseout / timer / drag while idle (no spurious commands)", () => {
    const noops: Parameters<typeof hoverReducer>[1][] = [
      { type: "mouseout_mark", mark: markA },
      { type: "enter_timer_fired" },
      { type: "exit_timer_fired" },
      { type: "dragstart" },
      { type: "detach", mark: markA },
      { type: "mouseover_bubble" },
      { type: "mouseout_bubble" },
    ];
    for (const e of noops) {
      const step = hoverReducer(initialHoverState(), e);
      expect(step.state.kind).toBe("idle");
      expect(step.cmds).toEqual([]);
    }
  });
});

describe("hoverReducer — pending_show", () => {
  const pendingA: HoverState = { kind: "pending_show", ctx: ctxA };

  it("restarts the enter timer when target switches (row 2)", () => {
    const step = hoverReducer(pendingA, { type: "mouseover_mark", ctx: ctxB });
    expect(step.state).toEqual({ kind: "pending_show", ctx: ctxB });
    // Clear must precede start so the runtime never leaks a dead timer.
    expect(cmdTypes(step.cmds)).toEqual(["clear_enter_timer", "start_enter_timer"]);
  });

  it("leaves the timer alone when hovering the same mark again", () => {
    const step = hoverReducer(pendingA, { type: "mouseover_mark", ctx: ctxA });
    expect(step.state).toEqual(pendingA);
    expect(step.cmds).toEqual([]);
  });

  it("cancels the enter timer on mouseout of the pending mark (row 5)", () => {
    const step = hoverReducer(pendingA, { type: "mouseout_mark", mark: markA });
    expect(step.state.kind).toBe("idle");
    expect(cmdTypes(step.cmds)).toEqual(["clear_enter_timer"]);
  });

  it("ignores mouseout of an unrelated mark while pending", () => {
    const step = hoverReducer(pendingA, { type: "mouseout_mark", mark: markB });
    expect(step.state).toEqual(pendingA);
    expect(step.cmds).toEqual([]);
  });

  it("promotes to SHOWN and emits show_bubble on enter_timer_fired", () => {
    const step = hoverReducer(pendingA, { type: "enter_timer_fired" });
    expect(step.state).toEqual({ kind: "shown", ctx: ctxA });
    expect(step.cmds).toEqual([{ type: "show_bubble", ctx: ctxA }]);
  });

  it("gives the bubble up to click on click_mark (row 9)", () => {
    const step = hoverReducer(pendingA, { type: "click_mark" });
    expect(step.state.kind).toBe("click_owned");
    expect(cmdTypes(step.cmds)).toEqual(["clear_enter_timer"]);
  });

  it("cancels pending on dragstart (row 11)", () => {
    const step = hoverReducer(pendingA, { type: "dragstart" });
    expect(step.state.kind).toBe("idle");
    // Bubble was never shown — only the timer needs cleaning.
    expect(cmdTypes(step.cmds)).toEqual(["clear_enter_timer"]);
  });

  it("cancels pending when the referenced mark is detached (row 12)", () => {
    const step = hoverReducer(pendingA, { type: "detach", mark: markA });
    expect(step.state.kind).toBe("idle");
    expect(cmdTypes(step.cmds)).toEqual(["clear_enter_timer"]);
  });
});

describe("hoverReducer — shown", () => {
  const shownA: HoverState = { kind: "shown", ctx: ctxA };

  it("enters PENDING_HIDE with exit timer on mouseout of mark (row 6)", () => {
    const step = hoverReducer(shownA, { type: "mouseout_mark", mark: markA });
    expect(step.state).toEqual({ kind: "pending_hide", ctx: ctxA });
    expect(cmdTypes(step.cmds)).toEqual(["start_exit_timer"]);
  });

  it("enters PENDING_HIDE with exit timer on mouseout of bubble (row 8)", () => {
    const step = hoverReducer(shownA, { type: "mouseout_bubble" });
    expect(step.state).toEqual({ kind: "pending_hide", ctx: ctxA });
    expect(cmdTypes(step.cmds)).toEqual(["start_exit_timer"]);
  });

  it("swaps bubble content without delay on neighbor hop (row 3)", () => {
    const step = hoverReducer(shownA, { type: "mouseover_mark", ctx: ctxB });
    expect(step.state).toEqual({ kind: "shown", ctx: ctxB });
    expect(step.cmds).toEqual([{ type: "show_bubble", ctx: ctxB }]);
  });

  it("ignores mouseover of the same mark (no repaint)", () => {
    const step = hoverReducer(shownA, { type: "mouseover_mark", ctx: ctxA });
    expect(step.state).toEqual(shownA);
    expect(step.cmds).toEqual([]);
  });

  it("transitions to CLICK_OWNED on click without hiding (row 9)", () => {
    const step = hoverReducer(shownA, { type: "click_mark" });
    expect(step.state.kind).toBe("click_owned");
    // No hide — click path repaints in place.
    expect(step.cmds).toEqual([]);
  });

  it("hides the bubble on dragstart (row 11)", () => {
    const step = hoverReducer(shownA, { type: "dragstart" });
    expect(step.state.kind).toBe("idle");
    expect(cmdTypes(step.cmds)).toEqual(["hide_bubble"]);
  });

  it("hides the bubble when the shown mark detaches (row 12)", () => {
    const step = hoverReducer(shownA, { type: "detach", mark: markA });
    expect(step.state.kind).toBe("idle");
    expect(cmdTypes(step.cmds)).toEqual(["hide_bubble"]);
  });

  it("ignores detach of an unrelated mark", () => {
    const step = hoverReducer(shownA, { type: "detach", mark: markB });
    expect(step.state).toEqual(shownA);
    expect(step.cmds).toEqual([]);
  });
});

describe("hoverReducer — pending_hide", () => {
  const pendingHideA: HoverState = { kind: "pending_hide", ctx: ctxA };

  it("returns to SHOWN when the user re-enters the same mark", () => {
    const step = hoverReducer(pendingHideA, { type: "mouseover_mark", ctx: ctxA });
    expect(step.state).toEqual({ kind: "shown", ctx: ctxA });
    expect(cmdTypes(step.cmds)).toEqual(["clear_exit_timer"]);
  });

  it("returns to SHOWN on bubble entry (safe zone, row 7)", () => {
    const step = hoverReducer(pendingHideA, { type: "mouseover_bubble" });
    expect(step.state).toEqual({ kind: "shown", ctx: ctxA });
    expect(cmdTypes(step.cmds)).toEqual(["clear_exit_timer"]);
  });

  it("swaps bubble content when neighbor is hovered during exit (row 4)", () => {
    const step = hoverReducer(pendingHideA, { type: "mouseover_mark", ctx: ctxB });
    expect(step.state).toEqual({ kind: "shown", ctx: ctxB });
    // Clear the exit timer first, then repaint — order matters so the
    // runtime doesn't briefly have both a live exit timer and a new show.
    expect(cmdTypes(step.cmds)).toEqual(["clear_exit_timer", "show_bubble"]);
  });

  it("hides the bubble on exit_timer_fired", () => {
    const step = hoverReducer(pendingHideA, { type: "exit_timer_fired" });
    expect(step.state.kind).toBe("idle");
    expect(cmdTypes(step.cmds)).toEqual(["hide_bubble"]);
  });

  it("transitions to CLICK_OWNED on click, cancelling the exit timer", () => {
    const step = hoverReducer(pendingHideA, { type: "click_mark" });
    expect(step.state.kind).toBe("click_owned");
    expect(cmdTypes(step.cmds)).toEqual(["clear_exit_timer"]);
  });

  it("cleans up both timer and bubble on dragstart", () => {
    const step = hoverReducer(pendingHideA, { type: "dragstart" });
    expect(step.state.kind).toBe("idle");
    expect(cmdTypes(step.cmds)).toEqual(["clear_exit_timer", "hide_bubble"]);
  });
});

describe("hoverReducer — click_owned", () => {
  const clickOwned: HoverState = { kind: "click_owned" };

  it("returns to IDLE on bubble_dismiss (row 10)", () => {
    const step = hoverReducer(clickOwned, { type: "bubble_dismiss" });
    expect(step.state.kind).toBe("idle");
    expect(step.cmds).toEqual([]);
  });

  it("ignores mouseover, mouseout, drag, and detach while click-owned", () => {
    const noops: Parameters<typeof hoverReducer>[1][] = [
      { type: "mouseover_mark", ctx: ctxA },
      { type: "mouseout_mark", mark: markA },
      { type: "mouseover_bubble" },
      { type: "mouseout_bubble" },
      { type: "dragstart" },
      { type: "detach", mark: markA },
      { type: "enter_timer_fired" },
      { type: "exit_timer_fired" },
    ];
    for (const e of noops) {
      const step = hoverReducer(clickOwned, e);
      expect(step.state).toEqual(clickOwned);
      expect(step.cmds).toEqual([]);
    }
  });
});

describe("hoverReducer — integration scenarios", () => {
  it("full happy path: enter → dwell → leave", () => {
    const result = drive(initialHoverState(), [
      { type: "mouseover_mark", ctx: ctxA },
      { type: "enter_timer_fired" },
      { type: "mouseout_mark", mark: markA },
      { type: "exit_timer_fired" },
    ]);
    expect(result.state.kind).toBe("idle");
    expect(cmdTypes(result.cmds)).toEqual([
      "start_enter_timer",
      "show_bubble",
      "start_exit_timer",
      "hide_bubble",
    ]);
  });

  it("fast scan across two adjacent marks shows both bubbles without delay for the second", () => {
    const result = drive(initialHoverState(), [
      { type: "mouseover_mark", ctx: ctxA },
      { type: "enter_timer_fired" },
      { type: "mouseover_mark", ctx: ctxB },
    ]);
    expect(result.state).toEqual({ kind: "shown", ctx: ctxB });
    // Second show_bubble is for markB, not A — confirms skip-delay (row 3).
    const lastCmd = result.cmds[result.cmds.length - 1];
    expect(lastCmd.type).toBe("show_bubble");
    if (lastCmd.type === "show_bubble") {
      expect(lastCmd.ctx.mark).toBe(markB);
    }
  });

  it("cursor out → back onto same mark recovers SHOWN without re-showing", () => {
    const result = drive(initialHoverState(), [
      { type: "mouseover_mark", ctx: ctxA },
      { type: "enter_timer_fired" },
      { type: "mouseout_mark", mark: markA },
      { type: "mouseover_mark", ctx: ctxA },
    ]);
    expect(result.state).toEqual({ kind: "shown", ctx: ctxA });
    // No redundant second show_bubble — bubble was already up.
    const shows = result.cmds.filter((c) => c.type === "show_bubble");
    expect(shows.length).toBe(1);
  });

  it("click during PENDING_SHOW clears the enter timer (timer hygiene)", () => {
    const result = drive(initialHoverState(), [
      { type: "mouseover_mark", ctx: ctxA },
      { type: "click_mark" },
    ]);
    expect(result.state.kind).toBe("click_owned");
    expect(cmdTypes(result.cmds)).toEqual([
      "start_enter_timer",
      "clear_enter_timer",
    ]);
  });

  it("bubble_dismiss from CLICK_OWNED + new hover restarts cleanly", () => {
    const result = drive(initialHoverState(), [
      { type: "mouseover_mark", ctx: ctxA },
      { type: "click_mark" },
      { type: "bubble_dismiss" },
      { type: "mouseover_mark", ctx: ctxB },
    ]);
    expect(result.state).toEqual({ kind: "pending_show", ctx: ctxB });
    // Final cmd is the fresh enter timer — we're not carrying state from
    // the previous click-owned cycle.
    expect(result.cmds[result.cmds.length - 1]).toEqual({ type: "start_enter_timer" });
  });
});
