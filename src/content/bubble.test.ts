// @vitest-environment happy-dom
//
// Bubble + undo-stash + click-translator state-machine tests. Lives in
// the content folder because the surfaces it exercises (hoverPreview,
// saved-with-delete, monotonic token, undo stash timing) are coupled
// across bubble.ts, undoStash.ts, toast.ts, and clickTranslate.ts —
// covering them as one suite avoids duplicate setup of the chrome.*
// stubs and DR Shadow DOM scaffolding.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// happy-dom hides closed shadow roots from `host.shadowRoot` (matching
// browser behavior). Production code uses `mode: "closed"` for security
// hygiene against host-page scripts; tests need to introspect what was
// rendered. Patching attachShadow to force "open" at the prototype level
// keeps the bubble/toast modules unchanged in source while letting the
// test runtime walk the shadow trees.
beforeAll(() => {
  const original = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function patched(
    this: Element,
    init: ShadowRootInit
  ): ShadowRoot {
    return original.call(this, { ...init, mode: "open" });
  };
});

import { createBubble, type BubbleStrings, type BubbleAnchor } from "./bubble";
import { createUndoStash } from "./undoStash";
import { createToast, TOAST_TTL_MS } from "./toast";
import { createClickTranslator } from "./clickTranslate";
import { toastStrings } from "./i18n";
import type { VocabWord, Settings } from "../shared/types";
import { DEFAULT_SETTINGS } from "../shared/types";

// ───── Test fixtures ─────────────────────────────────────────

const STRINGS: BubbleStrings = {
  save: "Save",
  saved: "Saved",
  detail: "Detail",
  delete: "Delete",
  close: "Close",
  loading: "Loading…",
  retry: "Retry",
};

const ANCHOR: BubbleAnchor = {
  top: 100,
  left: 100,
  bottom: 120,
  right: 160,
  width: 60,
  height: 20,
};

function makeWord(overrides: Partial<VocabWord> = {}): VocabWord {
  const now = Date.now();
  return {
    word: "serendipity",
    word_key: "serendipity",
    translation: "意外发现",
    note: "from a friend",
    ctx: "a moment of pure serendipity",
    source_url: "https://example.com",
    created_at: now,
    updated_at: now,
    schema_version: 2,
    ...overrides,
  };
}

// chrome.* mock — minimal stub used by clickTranslate.ts. We only
// exercise paths that read storage and send DELETE_WORD / SAVE_WORD;
// the more elaborate translate path is covered by other tests.
function installChromeStub(savedRecord: VocabWord | null) {
  const sentMessages: unknown[] = [];
  const stub = {
    runtime: {
      id: "test-extension-id",
      sendMessage: vi.fn((msg: unknown, cb?: (resp: unknown) => void) => {
        sentMessages.push(msg);
        const resp = { ok: true };
        if (typeof cb === "function") cb(resp);
        return Promise.resolve(resp);
      }),
      lastError: undefined,
    },
    storage: {
      sync: {
        get: vi.fn(async (_key: string) => {
          if (!savedRecord) return {};
          return { [`v:${savedRecord.word_key}`]: savedRecord };
        }),
      },
    },
  };
  // @ts-expect-error — happy-dom doesn't provide chrome
  globalThis.chrome = stub;
  return { stub, sentMessages };
}

// Counts hover-preview vs saved-translated nodes inside the bubble's
// Shadow DOM. Bubble uses a closed shadow root, so we have to walk the
// host element's children via the unique attribute we set on the
// host. happy-dom exposes the closed root via `shadowRoot` like jsdom,
// so we cheat through that.
function findBubbleHost(): Element | null {
  return document.querySelector("[data-dualread-bubble]");
}

function bubbleShadow(): ShadowRoot | null {
  const host = findBubbleHost();
  return host?.shadowRoot ?? null;
}

function bubbleSnapshot(): {
  hasTranslated: boolean;
  hasDeleteBtn: boolean;
  hasDetailBtn: boolean;
  hasSaveBtn: boolean;
  hasNote: boolean;
  translation: string | null;
} {
  const root = bubbleShadow();
  if (!root) {
    return {
      hasTranslated: false,
      hasDeleteBtn: false,
      hasDetailBtn: false,
      hasSaveBtn: false,
      hasNote: false,
      translation: null,
    };
  }
  return {
    hasTranslated: !!root.querySelector(".dr-bubble__translation"),
    hasDeleteBtn: !!root.querySelector(".dr-bubble__delete"),
    hasDetailBtn: !!root.querySelector(".dr-bubble__detail"),
    hasSaveBtn: !!root.querySelector(".dr-bubble__btn"),
    hasNote: !!root.querySelector(".dr-bubble__note"),
    translation: root.querySelector(".dr-bubble__translation")?.textContent ?? null,
  };
}

// ───── Bubble state machine ──────────────────────────────────

describe("bubble state machine", () => {
  afterEach(() => {
    document.querySelectorAll("[data-dualread-bubble]").forEach((n) => n.remove());
    document.querySelectorAll("dualread-toast").forEach((n) => n.remove());
  });

  it("renders hoverPreview without action buttons", () => {
    const b = createBubble();
    b.show({
      anchor: ANCHOR,
      strings: STRINGS,
      state: { kind: "hoverPreview", word: "serendipity", translation: "意外发现" },
    });
    const snap = bubbleSnapshot();
    expect(snap.hasTranslated).toBe(true);
    expect(snap.translation).toBe("意外发现");
    expect(snap.hasDeleteBtn).toBe(false);
    expect(snap.hasDetailBtn).toBe(false);
    b.dispose();
  });

  it("renders translated+saved with delete button when showDeleteButton is on", () => {
    const b = createBubble();
    b.show({
      anchor: ANCHOR,
      strings: STRINGS,
      state: {
        kind: "translated",
        word: "serendipity",
        translation: "意外发现",
        saved: true,
        showDetailLink: true,
        showDeleteButton: true,
      },
      onDetail: () => {},
      onDelete: () => {},
    });
    const snap = bubbleSnapshot();
    expect(snap.hasDeleteBtn).toBe(true);
    expect(snap.hasDetailBtn).toBe(true);
    b.dispose();
  });

  it("forwards mouseenter/mouseleave from host to caller callbacks", () => {
    const b = createBubble();
    const onEnter = vi.fn();
    const onLeave = vi.fn();
    b.show({
      anchor: ANCHOR,
      strings: STRINGS,
      state: { kind: "hoverPreview", word: "serendipity", translation: "意外发现" },
      onMouseEnter: onEnter,
      onMouseLeave: onLeave,
    });
    const host = findBubbleHost();
    expect(host).toBeTruthy();
    host!.dispatchEvent(new Event("mouseenter"));
    host!.dispatchEvent(new Event("mouseleave"));
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onLeave).toHaveBeenCalledTimes(1);
    b.dispose();
  });

  it("replaces hoverPreview content with saved-translated on subsequent show()", () => {
    const b = createBubble();
    b.show({
      anchor: ANCHOR,
      strings: STRINGS,
      state: { kind: "hoverPreview", word: "serendipity", translation: "意外发现" },
    });
    expect(bubbleSnapshot().hasDeleteBtn).toBe(false);

    b.show({
      anchor: ANCHOR,
      strings: STRINGS,
      state: {
        kind: "translated",
        word: "serendipity",
        translation: "意外发现",
        saved: true,
        showDetailLink: true,
        showDeleteButton: true,
      },
      onDetail: () => {},
      onDelete: () => {},
    });
    expect(bubbleSnapshot().hasDeleteBtn).toBe(true);
    b.dispose();
  });
});

// ───── Undo stash (pure logic) ───────────────────────────────

describe("undo stash", () => {
  it("returns the stashed word on pop", () => {
    const stash = createUndoStash();
    const w = makeWord();
    stash.put(w, 5000, () => {});
    expect(stash.has(w.word_key)).toBe(true);
    expect(stash.pop(w.word_key)).toEqual(w);
    expect(stash.has(w.word_key)).toBe(false);
  });

  it("fires onExpire after TTL and drops the entry", () => {
    vi.useFakeTimers();
    try {
      const stash = createUndoStash();
      const w = makeWord();
      const onExpire = vi.fn();
      stash.put(w, 5000, onExpire);
      vi.advanceTimersByTime(4999);
      expect(onExpire).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(onExpire).toHaveBeenCalledWith(w);
      expect(stash.has(w.word_key)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not fire onExpire after a successful pop within TTL", () => {
    vi.useFakeTimers();
    try {
      const stash = createUndoStash();
      const w = makeWord();
      const onExpire = vi.fn();
      stash.put(w, 5000, onExpire);
      vi.advanceTimersByTime(2000);
      expect(stash.pop(w.word_key)).toEqual(w);
      vi.advanceTimersByTime(10000);
      expect(onExpire).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("replaces an existing entry without firing the older expiry", () => {
    vi.useFakeTimers();
    try {
      const stash = createUndoStash();
      const oldExpire = vi.fn();
      const newExpire = vi.fn();
      const w1 = makeWord({ word: "v1", note: "old" });
      const w2 = makeWord({ word: "v2", note: "new" }); // same word_key
      stash.put(w1, 5000, oldExpire);
      vi.advanceTimersByTime(2000);
      stash.put(w2, 5000, newExpire);
      vi.advanceTimersByTime(5000);
      expect(oldExpire).not.toHaveBeenCalled();
      expect(newExpire).toHaveBeenCalledWith(w2);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ───── Click translator: token monotonicity + delete flow ────

describe("click translator", () => {
  let restoreChrome: () => void = () => {};

  beforeEach(() => {
    document.querySelectorAll("[data-dualread-bubble]").forEach((n) => n.remove());
    document.querySelectorAll("dualread-toast").forEach((n) => n.remove());
  });

  afterEach(() => {
    restoreChrome();
    // @ts-expect-error reset between tests
    delete globalThis.chrome;
  });

  function setup(saved: VocabWord | null = null) {
    const { stub, sentMessages } = installChromeStub(saved);
    const settings: Settings = { ...DEFAULT_SETTINGS, ui_language: "en" };
    const bubble = createBubble();
    const toast = createToast();
    const ct = createClickTranslator({
      bubble,
      toast,
      getSettings: () => settings,
    });
    restoreChrome = () => {
      ct.dispose();
      bubble.dispose();
      toast.dispose();
    };
    return { ct, bubble, toast, sentMessages, stub };
  }

  it("hover then click promotes the bubble (kind transitions to saved, delete renders)", () => {
    const word = makeWord();
    const { ct } = setup(word);

    ct.showHover({ anchor: ANCHOR, saved: word });
    expect(bubbleSnapshot().hasDeleteBtn).toBe(false);

    ct.showSaved({ anchor: ANCHOR, saved: word });
    expect(bubbleSnapshot().hasDeleteBtn).toBe(true);
    expect(bubbleSnapshot().hasDetailBtn).toBe(true);
  });

  it("hover hide is debounced and cancelled by cursor re-entering bubble", () => {
    vi.useFakeTimers();
    try {
      const word = makeWord();
      const { ct, bubble } = setup(word);

      ct.showHover({ anchor: ANCHOR, saved: word });
      expect(bubble.isOpen()).toBe(true);

      ct.hideHover();
      // Within the grace period, cursor moves into the bubble.
      vi.advanceTimersByTime(100);
      ct.cancelHoverHide();
      vi.advanceTimersByTime(1000);
      expect(bubble.isOpen()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("hover hide does fire after the full grace period", () => {
    vi.useFakeTimers();
    try {
      const word = makeWord();
      const { ct, bubble } = setup(word);

      ct.showHover({ anchor: ANCHOR, saved: word });
      ct.hideHover();
      vi.advanceTimersByTime(200);
      expect(bubble.isOpen()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("hideHover is a no-op once the bubble has been promoted via showSaved", () => {
    vi.useFakeTimers();
    try {
      const word = makeWord();
      const { ct, bubble } = setup(word);

      ct.showHover({ anchor: ANCHOR, saved: word });
      ct.showSaved({ anchor: ANCHOR, saved: word }); // promote
      ct.hideHover();
      vi.advanceTimersByTime(1000);
      expect(bubble.isOpen()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("delete button stashes the word, sends DELETE_WORD, and shows toast with undo", async () => {
    vi.useFakeTimers();
    try {
      const word = makeWord();
      const { ct, bubble, toast, sentMessages } = setup(word);
      ct.showSaved({ anchor: ANCHOR, saved: word });

      // Click delete via the rendered button. The bubble lives in a closed
      // shadow root — we reach it via the host's shadowRoot accessor (which
      // happy-dom exposes for testability).
      const delBtn = bubbleShadow()?.querySelector<HTMLButtonElement>(".dr-bubble__delete");
      expect(delBtn).toBeTruthy();
      delBtn!.click();

      // Bubble dismisses, toast appears, stash is populated, and a
      // DELETE_WORD has been put on the wire.
      expect(bubble.isOpen()).toBe(false);
      expect(toast.isOpen()).toBe(true);
      expect(toast.isStashed(word.word_key)).toBe(true);
      // DELETE_WORD is sent fire-and-forget; the mock resolves it immediately
      // but the call site uses .catch on a Promise so we flush microtasks.
      await Promise.resolve();
      const deleteMsg = sentMessages.find(
        (m): m is { type: "DELETE_WORD"; word_key: string } =>
          (m as { type?: string }).type === "DELETE_WORD"
      );
      expect(deleteMsg?.word_key).toBe(word.word_key);

      // TTL flushes the stash and dismisses the toast.
      vi.advanceTimersByTime(TOAST_TTL_MS);
      expect(toast.isOpen()).toBe(false);
      expect(toast.isStashed(word.word_key)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("undo button re-emits SAVE_WORD with the original snapshot", async () => {
    vi.useFakeTimers();
    try {
      const word = makeWord({ note: "preserved" });
      const { ct, toast, sentMessages } = setup(word);
      ct.showSaved({ anchor: ANCHOR, saved: word });

      bubbleShadow()?.querySelector<HTMLButtonElement>(".dr-bubble__delete")?.click();
      await Promise.resolve();
      expect(toast.isOpen()).toBe(true);

      // Click undo within the TTL.
      vi.advanceTimersByTime(2000);
      const toastHost = document.querySelector("dualread-toast");
      const undoBtn = toastHost?.shadowRoot?.querySelector<HTMLButtonElement>(".dr-toast__undo");
      expect(undoBtn).toBeTruthy();
      undoBtn!.click();
      await Promise.resolve();

      const saveMsg = sentMessages.find(
        (m): m is { type: "SAVE_WORD"; word: VocabWord } =>
          (m as { type?: string }).type === "SAVE_WORD"
      );
      expect(saveMsg).toBeTruthy();
      expect(saveMsg!.word.word_key).toBe(word.word_key);
      expect(saveMsg!.word.note).toBe("preserved");
      expect(saveMsg!.word.created_at).toBe(word.created_at);
      // Stash cleared; no further SAVE_WORD on TTL expiry.
      const before = sentMessages.length;
      vi.advanceTimersByTime(TOAST_TTL_MS);
      expect(sentMessages.length).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it("token monotonicity: rapid hover→saved keeps only the latest active flow", () => {
    const word = makeWord();
    const { ct } = setup(word);

    // Two hovers in a row both call showHover; the bubble should reflect
    // the *latest* call. We can't read the internal token directly, but
    // we can observe that the bubble is in saved-state after a click.
    ct.showHover({ anchor: ANCHOR, saved: word });
    ct.showHover({ anchor: ANCHOR, saved: word });
    ct.showSaved({ anchor: ANCHOR, saved: word });
    expect(bubbleSnapshot().hasDeleteBtn).toBe(true);
  });
});

// ───── i18n contract ─────────────────────────────────────────

describe("i18n", () => {
  it("toastStrings interpolates the deleted word", () => {
    const en = toastStrings("en");
    expect(en.deletedToast("apple")).toContain("apple");
    expect(en.undoLabel).toBe("Undo");
    const zh = toastStrings("zh-CN");
    expect(zh.deletedToast("苹果")).toContain("苹果");
    expect(zh.undoLabel).toBe("撤销");
  });
});
