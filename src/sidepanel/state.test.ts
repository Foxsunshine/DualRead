// Coverage matrix for the translation-direction auto-follow rule. The pure
// applySettingsPatch reducer encodes two coupled behaviors that interact
// across UI sessions, so the test set targets each transition explicitly:
//   - default state: ui_language change drags direction.target along
//   - latch on: any explicit direction edit pins the override
//   - latch effect: ui_language changes after the latch leave direction alone

import { describe, expect, test } from "vitest";
import { DEFAULT_SETTINGS } from "../shared/types";
import type { Settings } from "../shared/types";
import { applySettingsPatch, pickAlternateLang } from "./state";

function baseSettings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

describe("applySettingsPatch — translation direction follows ui_language", () => {
  test("ui_language change with no prior override → target follows", () => {
    const prev = baseSettings({
      ui_language: "zh-CN",
      translation_direction: { source: "en", target: "zh-CN" },
      direction_user_overridden: false,
    });
    const next = applySettingsPatch(prev, { ui_language: "ja" });
    expect(next.ui_language).toBe("ja");
    expect(next.translation_direction.target).toBe("ja");
    expect(next.translation_direction.source).toBe("en");
    expect(next.direction_user_overridden).toBe(false);
  });

  test("ui_language change to fr also drags target", () => {
    const prev = baseSettings({
      ui_language: "en",
      translation_direction: { source: "en", target: "en" },
      direction_user_overridden: false,
    });
    const next = applySettingsPatch(prev, { ui_language: "fr" });
    expect(next.translation_direction.target).toBe("fr");
  });

  test("explicit translation_direction edit pins direction_user_overridden=true", () => {
    const prev = baseSettings({
      ui_language: "zh-CN",
      translation_direction: { source: "en", target: "zh-CN" },
      direction_user_overridden: false,
    });
    const next = applySettingsPatch(prev, {
      translation_direction: { source: "fr", target: "ja" },
    });
    expect(next.translation_direction).toEqual({ source: "fr", target: "ja" });
    expect(next.direction_user_overridden).toBe(true);
  });

  test("ui_language change AFTER override is set → direction stays put", () => {
    const prev = baseSettings({
      ui_language: "zh-CN",
      translation_direction: { source: "fr", target: "ja" },
      direction_user_overridden: true,
    });
    const next = applySettingsPatch(prev, { ui_language: "en" });
    expect(next.ui_language).toBe("en");
    expect(next.translation_direction).toEqual({ source: "fr", target: "ja" });
    expect(next.direction_user_overridden).toBe(true);
  });

  test("simultaneous ui_language + translation_direction patch → explicit direction wins", () => {
    const prev = baseSettings({
      ui_language: "zh-CN",
      translation_direction: { source: "en", target: "zh-CN" },
      direction_user_overridden: false,
    });
    const next = applySettingsPatch(prev, {
      ui_language: "ja",
      translation_direction: { source: "fr", target: "en" },
    });
    expect(next.translation_direction).toEqual({ source: "fr", target: "en" });
    expect(next.direction_user_overridden).toBe(true);
  });

  test("auto-follow that would collide with source swaps source to keep them distinct", () => {
    const prev = baseSettings({
      ui_language: "zh-CN",
      translation_direction: { source: "en", target: "zh-CN" },
      direction_user_overridden: false,
    });
    const next = applySettingsPatch(prev, { ui_language: "en" });
    expect(next.translation_direction.target).toBe("en");
    expect(next.translation_direction.source).not.toBe("en");
  });

  test("non-direction patch leaves translation_direction untouched", () => {
    const prev = baseSettings({
      translation_direction: { source: "en", target: "zh-CN" },
      direction_user_overridden: false,
    });
    const next = applySettingsPatch(prev, { auto_highlight_enabled: false });
    expect(next.translation_direction).toBe(prev.translation_direction);
    expect(next.direction_user_overridden).toBe(false);
  });
});

describe("pickAlternateLang", () => {
  test("returns a different supported lang for every input", () => {
    expect(pickAlternateLang("en")).not.toBe("en");
    expect(pickAlternateLang("zh-CN")).not.toBe("zh-CN");
    expect(pickAlternateLang("ja")).not.toBe("ja");
    expect(pickAlternateLang("fr")).not.toBe("fr");
  });
});
