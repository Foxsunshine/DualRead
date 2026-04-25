// Unit tests for stripOuterPunctuation (v2.1.1 / DL-1).
//
// Pure-function tests; run in vitest's default node env. Cases pulled
// directly from the v2.1.1 brainstorm §7.1 checklist so this file is the
// executable spec for "which punctuation gets stripped" — if the list
// here diverges from the brainstorm, the brainstorm is wrong.

import { describe, expect, it } from "vitest";
import { stripOuterPunctuation } from "./punctuation";

describe("stripOuterPunctuation — ASCII outer", () => {
  it("strips trailing comma (the canonical 'dragged to end of clause' case)", () => {
    expect(stripOuterPunctuation("reliability,")).toBe("reliability");
  });

  it("strips trailing period", () => {
    expect(stripOuterPunctuation("sentence.")).toBe("sentence");
  });

  it("strips leading and trailing quotes", () => {
    expect(stripOuterPunctuation('"hello"')).toBe("hello");
    expect(stripOuterPunctuation("'hello'")).toBe("hello");
  });

  it("strips paired parentheses / brackets / braces", () => {
    expect(stripOuterPunctuation("(word)")).toBe("word");
    expect(stripOuterPunctuation("[word]")).toBe("word");
    expect(stripOuterPunctuation("{word}")).toBe("word");
    expect(stripOuterPunctuation("<word>")).toBe("word");
  });

  it("strips exclamation, question, colon, semicolon", () => {
    expect(stripOuterPunctuation("word!")).toBe("word");
    expect(stripOuterPunctuation("word?")).toBe("word");
    expect(stripOuterPunctuation("word:")).toBe("word");
    expect(stripOuterPunctuation("word;")).toBe("word");
  });

  it("strips mixed runs of outer punctuation until clean", () => {
    expect(stripOuterPunctuation('"Hello!"')).toBe("Hello");
    expect(stripOuterPunctuation("...word...")).toBe("word");
    expect(stripOuterPunctuation("(('word'))")).toBe("word");
  });
});

describe("stripOuterPunctuation — interior preserved", () => {
  it("preserves apostrophe in contractions", () => {
    expect(stripOuterPunctuation("don't")).toBe("don't");
    expect(stripOuterPunctuation("'don't'")).toBe("don't");
  });

  it("preserves hyphens in compounds", () => {
    expect(stripOuterPunctuation("state-of-the-art")).toBe("state-of-the-art");
    expect(stripOuterPunctuation('"state-of-the-art"')).toBe("state-of-the-art");
  });

  it("keeps interior commas (middle of 'Hello, world' stays)", () => {
    expect(stripOuterPunctuation("Hello, world")).toBe("Hello, world");
    expect(stripOuterPunctuation('"Hello, world!"')).toBe("Hello, world");
  });
});

describe("stripOuterPunctuation — CJK full-width", () => {
  it("strips trailing 。", () => {
    expect(stripOuterPunctuation("可靠。")).toBe("可靠");
  });

  it("strips matching full-width quotes", () => {
    expect(stripOuterPunctuation("“可靠”")).toBe("可靠");
    expect(stripOuterPunctuation("‘可靠’")).toBe("可靠");
  });

  it("strips full-width parentheses / brackets", () => {
    expect(stripOuterPunctuation("（可靠）")).toBe("可靠");
    expect(stripOuterPunctuation("【可靠】")).toBe("可靠");
    expect(stripOuterPunctuation("「可靠」")).toBe("可靠");
  });

  it("strips full-width ellipsis and em-dash pair", () => {
    expect(stripOuterPunctuation("可靠…")).toBe("可靠");
    expect(stripOuterPunctuation("——可靠——")).toBe("可靠");
  });

  it("handles CJK punctuation wrapping a Latin word", () => {
    expect(stripOuterPunctuation("“well-being。”")).toBe("well-being");
  });
});

describe("stripOuterPunctuation — edge cases", () => {
  it("returns empty string for empty input", () => {
    expect(stripOuterPunctuation("")).toBe("");
  });

  it("returns empty string when entire input is punctuation", () => {
    expect(stripOuterPunctuation("..."))
      .toBe("");
    expect(stripOuterPunctuation("“”")).toBe("");
  });

  it("is idempotent (second pass yields the same result)", () => {
    const input = '"Hello, world!"';
    const once = stripOuterPunctuation(input);
    const twice = stripOuterPunctuation(once);
    expect(twice).toBe(once);
    expect(twice).toBe("Hello, world");
  });

  it("documents R8: Mr. → Mr (acceptable degradation)", () => {
    expect(stripOuterPunctuation("Mr.")).toBe("Mr");
  });

  it("documents R8: U.S. → U.S (interior dot stays)", () => {
    expect(stripOuterPunctuation("U.S.")).toBe("U.S");
  });

  it("leaves internal whitespace alone", () => {
    expect(stripOuterPunctuation(" hello ")).toBe(" hello ");
  });

  it("strips leading dash when present at edge", () => {
    expect(stripOuterPunctuation("-ish")).toBe("ish");
    expect(stripOuterPunctuation("—word—")).toBe("word");
  });

  it("preserves interior em-dash run", () => {
    expect(stripOuterPunctuation("word——other")).toBe("word——other");
  });
});
