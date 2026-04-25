// Tests for v2.2 i18n detect helper + Lang runtime guard.
// These are pure-function checks; no chrome API mocking needed because
// detectInitialLang takes the locale string directly and isValidLang only
// inspects a JS value.

import { describe, it, expect } from "vitest";
import { detectInitialLang } from "./i18nDetect";
import { isValidLang } from "./types";

describe("detectInitialLang", () => {
  // Primary subtag matches — exact-match path.
  it.each<[string, ReturnType<typeof detectInitialLang>]>([
    ["fr", "fr"],
    ["fr-FR", "fr"],
    ["fr-CA", "fr"],
    ["FR", "fr"], // case-insensitive
    ["ja", "ja"],
    ["ja-JP", "ja"],
    ["zh", "zh-CN"],
    ["zh-CN", "zh-CN"],
    ["zh-TW", "zh-CN"], // simplified fallback in v2.x; zh-TW deferred to v2.5+
    ["zh-HK", "zh-CN"],
    ["en", "en"],
    ["en-US", "en"],
    ["en-GB", "en"],
  ])("maps %s → %s", (input, expected) => {
    expect(detectInitialLang(input)).toBe(expected);
  });

  // Unsupported locales fall back to "en", not "zh-CN" — picking a Latin
  // baseline avoids confronting non-CJK users with Chinese UI on first run.
  it.each<[string, ReturnType<typeof detectInitialLang>]>([
    ["de", "en"],
    ["de-DE", "en"],
    ["es-ES", "en"],
    ["ko-KR", "en"],
    ["ru", "en"],
    ["", "en"], // empty input shouldn't crash
  ])("falls back %s → %s", (input, expected) => {
    expect(detectInitialLang(input)).toBe(expected);
  });
});

describe("isValidLang", () => {
  it("accepts the four supported langs", () => {
    expect(isValidLang("zh-CN")).toBe(true);
    expect(isValidLang("en")).toBe(true);
    expect(isValidLang("ja")).toBe(true);
    expect(isValidLang("fr")).toBe(true);
  });

  it("rejects bare zh without -CN suffix", () => {
    // Storage compatibility means "zh-CN" specifically is the canonical
    // form; a stray "zh" in storage is not valid and must be rejected so
    // hydrate code falls back to "en" instead of probing dictionaries
    // with an undefined key.
    expect(isValidLang("zh")).toBe(false);
  });

  it("rejects unsupported language codes", () => {
    expect(isValidLang("de")).toBe(false);
    expect(isValidLang("ko")).toBe(false);
    expect(isValidLang("en-US")).toBe(false);
  });

  it("rejects non-string types", () => {
    expect(isValidLang(undefined)).toBe(false);
    expect(isValidLang(null)).toBe(false);
    expect(isValidLang(42)).toBe(false);
    expect(isValidLang({})).toBe(false);
    expect(isValidLang([])).toBe(false);
    expect(isValidLang(true)).toBe(false);
  });
});
