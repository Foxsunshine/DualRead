// Coverage for the bulk-import parser. Locks in:
//   - 2- and 3-column header-less paste (CSV + TSV separator detection)
//   - Round-trip with the export-CSV header (column-by-name mapping,
//     ISO timestamps, lang columns)
//   - RFC-4180 quoting / `""` escapes / quoted CRLFs inside ctx
//   - Per-row validation (missing word, missing translation, oversize)
//   - Within-batch dedup by word_key (last paste wins)

import { describe, expect, test } from "vitest";
import { parseImportText } from "./importVocab";
import { toCsv } from "./exportCsv";
import type { VocabWord } from "../shared/types";

const OPTS = { uiLanguage: "zh-CN" } as const;

function row(overrides: Partial<VocabWord> = {}): VocabWord {
  return {
    word: "apple",
    word_key: "apple",
    translation: "苹果",
    created_at: 1_700_000_000_000,
    updated_at: 1_700_000_000_000,
    schema_version: 2,
    ...overrides,
  };
}

describe("parseImportText — header-less", () => {
  test("comma-separated 2 columns", () => {
    const result = parseImportText("apple,苹果\nbanana,香蕉", OPTS);
    expect(result.invalid).toEqual([]);
    expect(result.rows.map((r) => [r.word, r.translation])).toEqual([
      ["apple", "苹果"],
      ["banana", "香蕉"],
    ]);
  });

  test("tab-separated wins over comma when both appear", () => {
    const result = parseImportText("apple, fruit\t苹果\nbanana\t香蕉", OPTS);
    expect(result.rows.map((r) => r.word)).toEqual(["apple, fruit", "banana"]);
    expect(result.rows.map((r) => r.translation)).toEqual(["苹果", "香蕉"]);
  });

  test("optional 3rd column lands in ctx", () => {
    const result = parseImportText("apple,苹果,from the orchard", OPTS);
    expect(result.rows[0].ctx).toBe("from the orchard");
  });

  test("strips BOM", () => {
    const result = parseImportText("﻿apple,苹果", OPTS);
    expect(result.rows[0].word).toBe("apple");
  });

  test("ignores blank lines", () => {
    const result = parseImportText("\napple,苹果\n\nbanana,香蕉\n", OPTS);
    expect(result.rows).toHaveLength(2);
  });

  test("target_lang defaults to ui language", () => {
    const result = parseImportText("apple,苹果", { uiLanguage: "ja" });
    expect(result.rows[0].target_lang).toBe("ja");
  });

  test("word_key is lower-cased / trimmed", () => {
    const result = parseImportText("  Apple  ,苹果", OPTS);
    expect(result.rows[0].word).toBe("Apple");
    expect(result.rows[0].word_key).toBe("apple");
  });
});

describe("parseImportText — RFC-4180 quoting", () => {
  test("escaped double-quote inside a quoted field", () => {
    const result = parseImportText('he said "hi",问候', OPTS);
    expect(result.rows).toHaveLength(1);
    // Without surrounding quotes the inner `"` is literal.
    expect(result.rows[0].word).toBe('he said "hi"');
  });

  test("doubled-quote escape resolves to single quote", () => {
    const result = parseImportText('"a ""quoted"" word",译', OPTS);
    expect(result.rows[0].word).toBe('a "quoted" word');
  });

  test("CRLF inside quoted ctx survives line splitting", () => {
    const text = 'apple,苹果,"line one\r\nline two"';
    const result = parseImportText(text, OPTS);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].ctx).toBe("line one\r\nline two");
  });
});

describe("parseImportText — export header round-trip", () => {
  test("accepts the canonical export header and maps by name", () => {
    const exported = toCsv([
      row({ word: "apple", word_key: "apple", translation: "苹果", ctx: "ripe", target_lang: "zh-CN" }),
      row({
        word: "banana",
        word_key: "banana",
        translation: "香蕉",
        created_at: 1_700_000_500_000,
        updated_at: 1_700_000_500_000,
      }),
    ]);
    const result = parseImportText(exported, OPTS);
    expect(result.invalid).toEqual([]);
    expect(result.rows.map((r) => r.word)).toEqual(["apple", "banana"]);
    expect(result.rows[0].ctx).toBe("ripe");
    expect(result.rows[0].target_lang).toBe("zh-CN");
    // ISO created_at survives the round-trip.
    expect(result.rows[1].created_at).toBe(1_700_000_500_000);
  });

  test("ignores unknown columns gracefully", () => {
    const text = "word,translation,extra\napple,苹果,whatever";
    const result = parseImportText(text, OPTS);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].word).toBe("apple");
  });
});

describe("parseImportText — validation", () => {
  test("missing word is reported with line number", () => {
    const result = parseImportText("apple,苹果\n,无", OPTS);
    expect(result.rows).toHaveLength(1);
    expect(result.invalid).toEqual([{ line: 2, reason: "missing_word" }]);
  });

  test("missing translation is reported", () => {
    const result = parseImportText("apple,", OPTS);
    expect(result.rows).toEqual([]);
    expect(result.invalid).toEqual([{ line: 1, reason: "missing_translation" }]);
  });

  test("oversize record rejected (8 KB ctx)", () => {
    const huge = "x".repeat(8_500);
    const result = parseImportText(`apple,苹果,${huge}`, OPTS);
    expect(result.rows).toEqual([]);
    expect(result.invalid).toEqual([{ line: 1, reason: "too_large" }]);
  });
});

describe("parseImportText — within-batch dedup", () => {
  test("duplicate word_key collapses; last occurrence wins", () => {
    const result = parseImportText("apple,苹果\nApple,苹果(更新)", OPTS);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].translation).toBe("苹果(更新)");
  });
});
