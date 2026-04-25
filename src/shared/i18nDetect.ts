// First-run UI-language detection (v2.2 D7 / D9).
//
// On extension install, the background service worker reads
// `chrome.i18n.getUILanguage()` once and writes the mapped Lang into
// settings.ui_language. After that the user owns the value: every
// subsequent launch reads from storage, and Settings → dropdown is the
// only path that overwrites. We do NOT re-detect on update because
// users may have deliberately picked a non-browser-default and we'd
// undo their choice.
//
// `chrome.i18n.getUILanguage()` returns BCP-47 tags like "fr-FR",
// "zh-TW", "ja", "en-GB". The four supported product languages are
// "zh-CN" / "en" / "ja" / "fr" — region variants fold into the closest
// supported lang via primary subtag matching, and anything else falls
// back to "en" (the universal extension default per ADR-A21 norms).
// Edge cases (empty string, all-uppercase, mixed case) are normalized
// by lowercasing before comparison.

import type { Lang } from "./types";

export function detectInitialLang(uiLang: string): Lang {
  const lower = uiLang.toLowerCase();
  if (lower.startsWith("fr")) return "fr";
  if (lower.startsWith("ja")) return "ja";
  // zh-CN / zh-TW / zh-HK / zh-SG / zh all collapse to zh-CN for v2.x —
  // we do not split simplified vs traditional here. zh-TW users get a
  // simplified-CN UI and can change it via Settings; a future v2.5+
  // could add zh-TW as a distinct Lang if demand surfaces.
  if (lower.startsWith("zh")) return "zh-CN";
  return "en";
}
