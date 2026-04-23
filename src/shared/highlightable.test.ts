// Unit tests for highlightable.ts. The predicate decides which saved
// vocab keys feed into the content-script regex matcher. We deliberately
// test the edges: single letters, contractions, hyphens, accented Latin,
// CJK / Cyrillic, digits, sentences, empty strings.

import { describe, expect, it } from "vitest";
import { isHighlightable } from "./highlightable";

describe("isHighlightable", () => {
  it("accepts a single Latin word", () => {
    expect(isHighlightable("serendipity")).toBe(true);
  });

  it("accepts a two-word phrase", () => {
    expect(isHighlightable("give up")).toBe(true);
  });

  it("accepts a three-word phrase", () => {
    expect(isHighlightable("give up on")).toBe(true);
  });

  it("rejects four or more words (sentence territory)", () => {
    expect(isHighlightable("once in a while")).toBe(false);
  });

  it("rejects a full sentence", () => {
    expect(isHighlightable("the quick brown fox jumps over the lazy dog")).toBe(false);
  });

  it("accepts contractions", () => {
    expect(isHighlightable("don't")).toBe(true);
  });

  it("accepts hyphenated compounds", () => {
    expect(isHighlightable("well-read")).toBe(true);
  });

  it("accepts accented Latin (café)", () => {
    expect(isHighlightable("café")).toBe(true);
  });

  it("rejects CJK text", () => {
    expect(isHighlightable("你好")).toBe(false);
    expect(isHighlightable("勉強")).toBe(false);
    expect(isHighlightable("안녕")).toBe(false);
  });

  it("rejects Cyrillic", () => {
    expect(isHighlightable("спасибо")).toBe(false);
  });

  it("rejects mixed Latin + CJK", () => {
    expect(isHighlightable("hello 世界")).toBe(false);
  });

  it("rejects digits (version numbers, years)", () => {
    expect(isHighlightable("2024")).toBe(false);
    expect(isHighlightable("version 2")).toBe(false);
  });

  it("rejects empty and whitespace-only", () => {
    expect(isHighlightable("")).toBe(false);
    expect(isHighlightable("   ")).toBe(false);
  });

  it("tolerates leading/trailing whitespace", () => {
    expect(isHighlightable("  cat  ")).toBe(true);
  });
});
