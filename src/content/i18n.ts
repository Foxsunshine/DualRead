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
import type { ToastStrings } from "./toast";

// Localized display names for our four supported languages, indexed first
// by the *target* (the language being talked about) and second by the *UI*
// (the language the user is reading). Most of the matrix collapses to the
// target's endonym (e.g. "日本語" works in any UI), but UI-specific entries
// give Chinese readers "简体中文" / "英语" / "日语" / "法语" rather than the
// foreign-script endonym they may not parse at a glance.
const LANG_DISPLAY: Record<Lang, Record<Lang, string>> = {
  "zh-CN": {
    "zh-CN": "简体中文",
    en: "Simplified Chinese",
    ja: "簡体字中国語",
    fr: "chinois simplifié",
  },
  en: {
    "zh-CN": "英语",
    en: "English",
    ja: "英語",
    fr: "anglais",
  },
  ja: {
    "zh-CN": "日语",
    en: "Japanese",
    ja: "日本語",
    fr: "japonais",
  },
  fr: {
    "zh-CN": "法语",
    en: "French",
    ja: "フランス語",
    fr: "français",
  },
};

export function langDisplayName(target: Lang, ui: Lang): string {
  return LANG_DISPLAY[target][ui];
}

// "这段已经是 {target} 了" template for each UI language. The bubble
// invokes this with a localized language name supplied by the orchestrator
// (typically `langDisplayName(target, ui)`); a Japanese-UI user reading a
// French page sees "これはすでに フランス語 です".
function alreadyInLangBody(ui: Lang): (targetName: string) => string {
  switch (ui) {
    case "zh-CN":
      return (name) => `这段已经是${name}了。`;
    case "ja":
      return (name) => `これはすでに${name}です。`;
    case "fr":
      return (name) => `Ce texte est déjà en ${name}.`;
    case "en":
    default:
      return (name) => `This is already in ${name}.`;
  }
}

export function bubbleStrings(lang: Lang): BubbleStrings {
  switch (lang) {
    case "zh-CN":
      return {
        save: "保存",
        delete: "删除",
        close: "关闭",
        loading: "翻译中…",
        retry: "重试",
        translateAnyway: "仍然翻译",
        alreadyInLangBody: alreadyInLangBody("zh-CN"),
      };
    case "ja":
      return {
        save: "保存",
        delete: "削除",
        close: "閉じる",
        loading: "翻訳中…",
        retry: "再試行",
        translateAnyway: "それでも翻訳",
        alreadyInLangBody: alreadyInLangBody("ja"),
      };
    case "fr":
      return {
        save: "Enregistrer",
        delete: "Supprimer",
        close: "Fermer",
        loading: "Traduction…",
        retry: "Réessayer",
        translateAnyway: "Traduire quand même",
        alreadyInLangBody: alreadyInLangBody("fr"),
      };
    case "en":
    default:
      return {
        save: "Save",
        delete: "Delete",
        close: "Close",
        loading: "Translating…",
        retry: "Retry",
        translateAnyway: "Translate anyway",
        alreadyInLangBody: alreadyInLangBody("en"),
      };
  }
}

// Toast strings live alongside bubble/fab so the content bundle keeps
// one i18n surface. {word} is interpolated by the toast widget at
// render time — we keep the surface form here as a function so any
// future locale that requires post-fix word position can express it
// without splitting the message.
export function toastStrings(lang: Lang): ToastStrings {
  switch (lang) {
    case "zh-CN":
      return {
        deletedToast: (word: string) => `已删除 ${word}`,
        undoLabel: "撤销",
        closeLabel: "关闭",
      };
    case "ja":
      return {
        deletedToast: (word: string) => `${word} を削除しました`,
        undoLabel: "元に戻す",
        closeLabel: "閉じる",
      };
    case "fr":
      return {
        deletedToast: (word: string) => `${word} supprimé`,
        undoLabel: "Annuler",
        closeLabel: "Fermer",
      };
    case "en":
    default:
      return {
        deletedToast: (word: string) => `Removed ${word}`,
        undoLabel: "Undo",
        closeLabel: "Close",
      };
  }
}

export function fabStrings(lang: Lang): FabStrings {
  switch (lang) {
    case "zh-CN":
      return {
        onLabel: "学习模式：已开启（点击关闭）",
        offLabel: "学习模式：已关闭（点击开启）",
      };
    case "ja":
      return {
        onLabel: "学習モード：オン（クリックで停止）",
        offLabel: "学習モード：オフ（クリックで開始）",
      };
    case "fr":
      return {
        onLabel: "Mode apprentissage : activé (cliquez pour désactiver)",
        offLabel: "Mode apprentissage : désactivé (cliquez pour activer)",
      };
    case "en":
    default:
      return {
        onLabel: "Learning mode: on (click to turn off)",
        offLabel: "Learning mode: off (click to turn on)",
      };
  }
}

export function translateErrorMessage(code: string, lang: Lang): string {
  if (code === "rate_limit") {
    switch (lang) {
      case "zh-CN":
        return "翻译服务暂时被限流，稍后重试。";
      case "ja":
        return "翻訳サービスが一時的に制限されています。少し時間をおいて再試行してください。";
      case "fr":
        return "Le service de traduction est limité. Réessayez sous peu.";
      case "en":
      default:
        return "Rate-limited, try again soon.";
    }
  }
  if (code === "network") {
    switch (lang) {
      case "zh-CN":
        return "网络好像断了。";
      case "ja":
        return "ネットワークに問題があります。";
      case "fr":
        return "Problème réseau.";
      case "en":
      default:
        return "Network issue.";
    }
  }
  switch (lang) {
    case "zh-CN":
      return "翻译失败。";
    case "ja":
      return "翻訳に失敗しました。";
    case "fr":
      return "Échec de la traduction.";
    case "en":
    default:
      return "Translation failed.";
  }
}
