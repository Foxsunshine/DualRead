// Content-script-local i18n.
//
// The side panel's `DR_STRINGS` carries ~70 keys per locale; the in-page
// surfaces (bubble + FAB) only need a small subset. Importing the panel
// dict into the content bundle would inflate every host page's footprint
// and couple bubble copy to panel-screen churn. This module keeps the
// content-side strings together so future locales / wording changes have
// one obvious file to touch.

import type { Lang } from "../shared/types";
import type { BubbleStrings } from "./bubble";
import type { FabStrings } from "./fab";

export function bubbleStrings(lang: Lang): BubbleStrings {
  return lang === "zh-CN"
    ? { save: "保存", saved: "已保存", detail: "打开详情", close: "关闭", loading: "翻译中…", retry: "重试" }
    : { save: "Save", saved: "Saved", detail: "View details", close: "Close", loading: "Translating…", retry: "Retry" };
}

export function fabStrings(lang: Lang): FabStrings {
  return lang === "zh-CN"
    ? {
        onLabel: "学习模式：已开启（点击关闭）",
        offLabel: "学习模式：已关闭（点击开启）",
      }
    : {
        onLabel: "Learning mode: on (click to turn off)",
        offLabel: "Learning mode: off (click to turn on)",
      };
}

export function translateErrorMessage(code: string, lang: Lang): string {
  if (code === "rate_limit") {
    return lang === "zh-CN" ? "翻译服务暂时被限流，稍后重试。" : "Rate-limited, try again soon.";
  }
  if (code === "network") {
    return lang === "zh-CN" ? "网络好像断了。" : "Network issue.";
  }
  return lang === "zh-CN" ? "翻译失败。" : "Translation failed.";
}
