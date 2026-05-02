// Unit tests for wordBoundary.ts. Covers the cases called out in
// docs/v1-1-feedback.md §9: left/right partial drags, contractions,
// hyphenated compounds, whitespace-only selections, CJK, single-letter
// words. Pure-function tests; no DOM required (vitest default env).

import { describe, expect, it } from "vitest";
import { snapOffsetsToWord, wordAtOffset } from "./wordBoundary";

describe("snapOffsetsToWord", () => {
  it("snaps left-partial 'w Phase' to 'new Phase'", () => {
    const text = "It was new Phase yet";
    const start = text.indexOf("w Phase");
    const end = start + "w Phase".length;
    const r = snapOffsetsToWord(text, start, end);
    expect(r?.text).toBe("new Phase");
  });

  it("snaps right-partial 'new Phas' to 'new Phase'", () => {
    const text = "It was new Phase yet";
    const start = text.indexOf("new Phas");
    const end = start + "new Phas".length;
    const r = snapOffsetsToWord(text, start, end);
    expect(r?.text).toBe("new Phase");
  });

  it("preserves a cleanly-selected full word", () => {
    const text = "It was new Phase yet";
    const start = text.indexOf("Phase");
    const end = start + "Phase".length;
    const r = snapOffsetsToWord(text, start, end);
    expect(r?.text).toBe("Phase");
    expect(r?.start).toBe(start);
    expect(r?.end).toBe(end);
  });

  it("preserves the apostrophe in 'don't worry'", () => {
    const text = "please don't worry about it";
    const start = text.indexOf("don't");
    const end = text.indexOf("worry") + "worry".length;
    const r = snapOffsetsToWord(text, start, end);
    expect(r?.text).toBe("don't worry");
  });

  it("preserves a fully-selected hyphenated compound", () => {
    const text = "truly state-of-the-art stuff";
    const start = text.indexOf("state-of-the-art");
    const end = start + "state-of-the-art".length;
    const r = snapOffsetsToWord(text, start, end);
    expect(r?.text).toBe("state-of-the-art");
  });

  it("returns null for a whitespace-only selection between words", () => {
    const text = "hello world";
    // Offsets 5..6 cover exactly the single space.
    expect(snapOffsetsToWord(text, 5, 6)).toBeNull();
  });

  it("returns null when selection is purely CJK", () => {
    const text = "中文 English mix";
    // "中文" occupies code-unit offsets 0..2.
    expect(snapOffsetsToWord(text, 0, 2)).toBeNull();
  });

  it("accepts single-letter 'I'", () => {
    const text = "I am here";
    const r = snapOffsetsToWord(text, 0, 1);
    expect(r?.text).toBe("I");
  });

  it("accepts single-letter 'a'", () => {
    const text = "a dog";
    const r = snapOffsetsToWord(text, 0, 1);
    expect(r?.text).toBe("a");
  });

  it("returns null for reversed or empty ranges", () => {
    expect(snapOffsetsToWord("hello", 3, 3)).toBeNull();
    expect(snapOffsetsToWord("hello", 4, 2)).toBeNull();
  });

  it("returns null for out-of-range offsets", () => {
    expect(snapOffsetsToWord("hello", -1, 3)).toBeNull();
    expect(snapOffsetsToWord("hello", 0, 99)).toBeNull();
  });
});

describe("wordAtOffset", () => {
  it("returns the word at a caret inside it", () => {
    const text = "It was new Phase yet";
    const offset = text.indexOf("Phase") + 2;
    expect(wordAtOffset(text, offset)?.text).toBe("Phase");
  });

  it("returns the word when caret is at its first character", () => {
    const text = "hello world";
    expect(wordAtOffset(text, 0)?.text).toBe("hello");
  });

  it("returns null when caret is on whitespace", () => {
    const text = "hello world";
    expect(wordAtOffset(text, 5)).toBeNull();
  });

  it("returns null when caret is on a CJK character", () => {
    const text = "中文 hello";
    expect(wordAtOffset(text, 0)).toBeNull();
  });
});
