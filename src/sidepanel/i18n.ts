import type { Lang } from "../shared/types";

interface Strings {
  appName: string;
  tagline: string;
  translate: string;
  vocab: string;
  settings: string;
  welcomeHello: string;
  welcomeHeading: string;
  welcomeBody: string;
  welcomeCta: string;
  welcomeSkip: string;
  levelPrompt: string;
  levelA2: string;
  levelB1: string;
  levelB2: string;
  levelC1: string;
  selectPrompt: string;
  selectHint: string;
  selectionLabel: string;
  translationLabel: string;
  contextLabel: string;
  sourceLabel: string;
  saveBtn: string;
  savedBtn: string;
  goToPage: string;
  addNote: string;
  translatingLabel: string;
  poweredBy: string;
  translateErrorRateLimit: string;
  translateErrorNetwork: string;
  translateErrorGeneric: string;
  vocabEmpty: string;
  vocabEmptyBody: string;
  searchPlaceholder: string;
  sortRecent: string;
  sortAlpha: string;
  export: string;
  exportHint: string;
  delete: string;
  edit: string;
  noteField: string;
  noteAdd: string;
  wordsCount: (n: number) => string;
  quotaNear: string;
  quotaBody: string;
  highlightAuto: string;
  highlightAutoHint: string;
  highlightStyle: string;
  highlightUnderline: string;
  highlightBackground: string;
  uiLanguage: string;
  zh: string;
  en: string;
  syncStatus: string;
  synced: string;
  syncing: string;
  syncingItems: (n: number) => string;
  syncOffline: string;
  syncOfflineHint: string;
  syncError: string;
  syncErrorDetail: (code: string) => string;
  syncedAt: (t: string) => string;
  syncRetry: string;
  clearData: string;
  clearDataHint: string;
  savedToast: string;
  clickTranslateTooltipOn: string;
  clickTranslateTooltipOff: string;
}

export const DR_STRINGS: Record<Lang, Strings> = {
  "zh-CN": {
    appName: "DualRead",
    tagline: "把遇到的生词，记在路上",
    translate: "翻译",
    vocab: "生词本",
    settings: "设置",
    welcomeHello: "你好 👋",
    welcomeHeading: "边看英文，边收生词",
    welcomeBody:
      "在任何网页上选中一个不认识的词，DualRead 会把它翻译给你，再帮你把它保存到生词本。之后这个词每次出现，都会被轻轻标出来，让你重新认识它。",
    welcomeCta: "开始使用",
    welcomeSkip: "先看看设置",
    levelPrompt: "你的英文水平",
    levelA2: "入门 · A2",
    levelB1: "进阶 · B1",
    levelB2: "中级 · B2",
    levelC1: "高级 · C1",
    selectPrompt: "在任意网页选中一段英文，这里会显示翻译。",
    selectHint: "试试回到网页，划一下你不认识的词。",
    selectionLabel: "选中的内容",
    translationLabel: "翻译",
    contextLabel: "上下文",
    sourceLabel: "来源",
    saveBtn: "保存到生词本",
    savedBtn: "已保存",
    goToPage: "回到页面",
    addNote: "添加笔记",
    translatingLabel: "翻译中…",
    poweredBy: "Google 翻译",
    translateErrorRateLimit: "翻译服务暂时被限流了，过一小会儿再试试。",
    translateErrorNetwork: "网络好像断了，检查下连接再试。",
    translateErrorGeneric: "翻译失败，稍后再试。",
    vocabEmpty: "还没有保存任何词",
    vocabEmptyBody: "在网页上选中不认识的词并点击「保存」，它们会出现在这里。",
    searchPlaceholder: "搜索生词…",
    sortRecent: "最近添加",
    sortAlpha: "A → Z",
    export: "导出 CSV",
    exportHint: "CSV 可导入 Anki 或任何表格工具",
    delete: "删除",
    edit: "编辑",
    noteField: "笔记",
    noteAdd: "添加笔记…",
    wordsCount: (n) => `${n} 个词`,
    quotaNear: "快到 500 词上限了",
    quotaBody: "导出一份 CSV 备份，并归档已熟悉的词。",
    highlightAuto: "自动高亮",
    highlightAutoHint: "在所有网页上高亮已保存的词",
    highlightStyle: "高亮样式",
    highlightUnderline: "下划线",
    highlightBackground: "背景色",
    uiLanguage: "界面语言",
    zh: "简体中文",
    en: "English",
    syncStatus: "同步状态",
    synced: "已同步",
    syncing: "正在同步…",
    syncingItems: (n) => `正在同步 ${n} 项更改…`,
    syncOffline: "离线",
    syncOfflineHint: "暂时离线，更改会在恢复网络后自动同步。",
    syncError: "同步出错",
    syncErrorDetail: (code) => `错误：${code}（正在重试）`,
    syncedAt: (t) => `最后同步 ${t}`,
    syncRetry: "重试",
    clearData: "清除所有数据",
    clearDataHint: "删除所有保存的词和设置。此操作不可撤销。",
    savedToast: "已保存",
    clickTranslateTooltipOn: "点词翻译：已开启（点击关闭）",
    clickTranslateTooltipOff: "点词翻译：已关闭（点击开启）",
  },
  en: {
    appName: "DualRead",
    tagline: "Save words as you read.",
    translate: "Translate",
    vocab: "Vocab",
    settings: "Settings",
    welcomeHello: "Hello 👋",
    welcomeHeading: "Read English, collect words.",
    welcomeBody:
      "Select any word you don't know on any webpage. DualRead translates it and saves it for you. Next time it appears anywhere online, it'll be gently marked so you can recognize it again.",
    welcomeCta: "Get started",
    welcomeSkip: "See settings first",
    levelPrompt: "Your English level",
    levelA2: "Beginner · A2",
    levelB1: "Elementary · B1",
    levelB2: "Intermediate · B2",
    levelC1: "Advanced · C1",
    selectPrompt: "Select some English on any page — the translation will appear here.",
    selectHint: "Go back to the page and try selecting a word.",
    selectionLabel: "Selection",
    translationLabel: "Translation",
    contextLabel: "In context",
    sourceLabel: "Source",
    saveBtn: "Save to vocab",
    savedBtn: "Saved",
    goToPage: "Go to page",
    addNote: "Add note",
    translatingLabel: "Translating…",
    poweredBy: "Google Translate",
    translateErrorRateLimit: "Translation service is rate-limited. Try again in a moment.",
    translateErrorNetwork: "Network issue — check your connection and retry.",
    translateErrorGeneric: "Translation failed. Try again shortly.",
    vocabEmpty: "No saved words yet",
    vocabEmptyBody: "Select unknown words on any webpage and click Save — they'll show up here.",
    searchPlaceholder: "Search vocab…",
    sortRecent: "Recent",
    sortAlpha: "A → Z",
    export: "Export CSV",
    exportHint: "Import into Anki or any spreadsheet tool",
    delete: "Delete",
    edit: "Edit",
    noteField: "Note",
    noteAdd: "Add a note…",
    wordsCount: (n) => `${n} word${n === 1 ? "" : "s"}`,
    quotaNear: "Approaching the 500-word limit",
    quotaBody: "Export a CSV backup and archive the words you've learned.",
    highlightAuto: "Auto-highlight",
    highlightAutoHint: "Highlight saved words on every webpage",
    highlightStyle: "Highlight style",
    highlightUnderline: "Underline",
    highlightBackground: "Background",
    uiLanguage: "Interface language",
    zh: "简体中文",
    en: "English",
    syncStatus: "Sync status",
    synced: "Synced",
    syncing: "Syncing…",
    syncingItems: (n) => `Syncing ${n} change${n === 1 ? "" : "s"}…`,
    syncOffline: "Offline",
    syncOfflineHint: "You're offline. Changes will sync when you reconnect.",
    syncError: "Sync error",
    syncErrorDetail: (code) => `Error: ${code} (retrying)`,
    syncedAt: (t) => `Last synced ${t}`,
    syncRetry: "Retry",
    clearData: "Clear all data",
    clearDataHint: "Delete all saved words and settings. This cannot be undone.",
    savedToast: "Saved",
    clickTranslateTooltipOn: "Click-to-translate: on (click to turn off)",
    clickTranslateTooltipOff: "Click-to-translate: off (click to turn on)",
  },
};

export type { Strings };
