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
  selectPrompt: string;
  selectHint: string;
  selectionLabel: string;
  translationLabel: string;
  contextLabel: string;
  sourceLabel: string;
  saveBtn: string;
  savedBtn: string;
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
  ja: string;
  fr: string;
  syncStatus: string;
  synced: string;
  syncing: string;
  syncingItems: (n: number) => string;
  syncOffline: string;
  syncOfflineHint: string;
  syncError: string;
  syncErrorDetail: (code: string) => string;
  syncedAt: (t: string) => string;
  clearData: string;
  clearDataHint: string;
  // Contact block rendered near the bottom of Settings (above the danger zone).
  // Two rows: email (mailto:) + GitHub Issues (target=_blank). Title is the
  // only localized string — the address and URL are rendered verbatim.
  feedbackTitle: string;
  // Pause-state banner shown on the empty Translate screen when the FAB's
  // learning-mode switch is off. Side-panel flows still work — the banner
  // nudges the user toward the page-level toggle so they can resume.
  learningModePausedTitle: string;
  learningModePausedBody: string;
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
    selectPrompt: "在任意网页选中一段英文，这里会显示翻译。",
    selectHint: "试试回到网页，划一下你不认识的词。",
    selectionLabel: "选中的内容",
    translationLabel: "翻译",
    contextLabel: "上下文",
    sourceLabel: "来源",
    saveBtn: "保存到生词本",
    savedBtn: "已保存",
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
    ja: "日本語",
    fr: "Français",
    syncStatus: "同步状态",
    synced: "已同步",
    syncing: "正在同步…",
    syncingItems: (n) => `正在同步 ${n} 项更改…`,
    syncOffline: "离线",
    syncOfflineHint: "暂时离线，更改会在恢复网络后自动同步。",
    syncError: "同步出错",
    syncErrorDetail: (code) => `错误：${code}（正在重试）`,
    syncedAt: (t) => `最后同步 ${t}`,
    clearData: "清除所有数据",
    clearDataHint: "删除所有保存的词和设置。此操作不可撤销。",
    feedbackTitle: "反馈 / Bug 报告",
    learningModePausedTitle: "学习模式已暂停",
    learningModePausedBody: "网页上的点词翻译、划词翻译和高亮都已关闭。点击页面右下角的悬浮按钮即可重新开启。",
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
    selectPrompt: "Select some English on any page — the translation will appear here.",
    selectHint: "Go back to the page and try selecting a word.",
    selectionLabel: "Selection",
    translationLabel: "Translation",
    contextLabel: "In context",
    sourceLabel: "Source",
    saveBtn: "Save to vocab",
    savedBtn: "Saved",
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
    ja: "日本語",
    fr: "Français",
    syncStatus: "Sync status",
    synced: "Synced",
    syncing: "Syncing…",
    syncingItems: (n) => `Syncing ${n} change${n === 1 ? "" : "s"}…`,
    syncOffline: "Offline",
    syncOfflineHint: "You're offline. Changes will sync when you reconnect.",
    syncError: "Sync error",
    syncErrorDetail: (code) => `Error: ${code} (retrying)`,
    syncedAt: (t) => `Last synced ${t}`,
    clearData: "Clear all data",
    clearDataHint: "Delete all saved words and settings. This cannot be undone.",
    feedbackTitle: "Feedback / Bug report",
    learningModePausedTitle: "Learning mode paused",
    learningModePausedBody: "Click-to-translate, drag-to-translate, and page highlights are off. Click the floating button at the bottom-right of any page to turn them back on.",
  },
  ja: {
    appName: "DualRead",
    tagline: "出会った単語を、読みながら保存。",
    translate: "翻訳",
    vocab: "単語帳",
    settings: "設定",
    welcomeHello: "こんにちは 👋",
    welcomeHeading: "英語を読みながら、単語を集めよう。",
    welcomeBody:
      "どんなウェブページでも、知らない単語を選択するだけで DualRead が翻訳し、単語帳に保存します。次にその単語がどこかに現れたら、そっとマークしてあなたに知らせます。",
    welcomeCta: "はじめる",
    welcomeSkip: "先に設定を見る",
    selectPrompt: "任意のページで英文を選択すると、ここに翻訳が表示されます。",
    selectHint: "ページに戻って、知らない単語を選択してみてください。",
    selectionLabel: "選択範囲",
    translationLabel: "翻訳",
    contextLabel: "文脈",
    sourceLabel: "出典",
    saveBtn: "単語帳に保存",
    savedBtn: "保存済み",
    addNote: "メモを追加",
    translatingLabel: "翻訳中…",
    poweredBy: "Google 翻訳",
    translateErrorRateLimit: "翻訳サービスが一時的に制限されています。少し時間をおいて再試行してください。",
    translateErrorNetwork: "ネットワークに問題があります。接続を確認してから再試行してください。",
    translateErrorGeneric: "翻訳に失敗しました。しばらくしてから再試行してください。",
    vocabEmpty: "まだ保存した単語はありません",
    vocabEmptyBody: "ウェブページで知らない単語を選択して「保存」をクリックすると、ここに表示されます。",
    searchPlaceholder: "単語を検索…",
    sortRecent: "最近追加",
    sortAlpha: "A → Z",
    export: "CSV をエクスポート",
    delete: "削除",
    edit: "編集",
    noteField: "メモ",
    noteAdd: "メモを追加…",
    wordsCount: (n) => `${n} 語`,
    quotaNear: "500 語の上限に近づいています",
    quotaBody: "CSV バックアップを書き出し、覚えた単語を整理しましょう。",
    highlightAuto: "自動ハイライト",
    highlightAutoHint: "保存済みの単語をすべてのページでハイライト",
    highlightStyle: "ハイライトのスタイル",
    highlightUnderline: "下線",
    highlightBackground: "背景色",
    uiLanguage: "表示言語",
    zh: "简体中文",
    en: "English",
    ja: "日本語",
    fr: "Français",
    syncStatus: "同期ステータス",
    synced: "同期済み",
    syncing: "同期中…",
    syncingItems: (n) => `${n} 件の変更を同期中…`,
    syncOffline: "オフライン",
    syncOfflineHint: "現在オフラインです。再接続すると変更が自動的に同期されます。",
    syncError: "同期エラー",
    syncErrorDetail: (code) => `エラー: ${code}（再試行中）`,
    syncedAt: (t) => `最終同期 ${t}`,
    clearData: "すべてのデータを削除",
    clearDataHint: "保存されたすべての単語と設定を削除します。この操作は取り消せません。",
    feedbackTitle: "フィードバック / バグ報告",
    learningModePausedTitle: "学習モードは一時停止中",
    learningModePausedBody: "クリック翻訳、選択翻訳、ページ上のハイライトはすべてオフです。ページ右下のフローティングボタンをクリックすると再開できます。",
  },
  fr: {
    appName: "DualRead",
    tagline: "Enregistrez les mots au fil de votre lecture.",
    translate: "Traduire",
    vocab: "Vocabulaire",
    settings: "Paramètres",
    welcomeHello: "Bonjour 👋",
    welcomeHeading: "Lisez en anglais, collectez des mots.",
    welcomeBody:
      "Sélectionnez n'importe quel mot inconnu sur n'importe quelle page web. DualRead le traduit et l'enregistre pour vous. La prochaine fois qu'il apparaîtra en ligne, il sera discrètement signalé pour vous aider à le reconnaître.",
    welcomeCta: "Commencer",
    welcomeSkip: "Voir d'abord les paramètres",
    selectPrompt: "Sélectionnez un texte anglais sur n'importe quelle page — la traduction apparaîtra ici.",
    selectHint: "Retournez sur la page et essayez de sélectionner un mot.",
    selectionLabel: "Sélection",
    translationLabel: "Traduction",
    contextLabel: "En contexte",
    sourceLabel: "Source",
    saveBtn: "Enregistrer au vocabulaire",
    savedBtn: "Enregistré",
    addNote: "Ajouter une note",
    translatingLabel: "Traduction en cours…",
    poweredBy: "Google Traduction",
    translateErrorRateLimit: "Le service de traduction est temporairement limité. Réessayez dans un instant.",
    translateErrorNetwork: "Problème réseau — vérifiez votre connexion et réessayez.",
    translateErrorGeneric: "Échec de la traduction. Réessayez sous peu.",
    vocabEmpty: "Aucun mot enregistré",
    vocabEmptyBody: "Sélectionnez des mots inconnus sur une page web et cliquez sur Enregistrer — ils apparaîtront ici.",
    searchPlaceholder: "Rechercher dans le vocabulaire…",
    sortRecent: "Récents",
    sortAlpha: "A → Z",
    export: "Exporter en CSV",
    delete: "Supprimer",
    edit: "Modifier",
    noteField: "Note",
    noteAdd: "Ajouter une note…",
    wordsCount: (n) => `${n} mot${n === 1 ? "" : "s"}`,
    quotaNear: "Vous approchez de la limite de 500 mots",
    quotaBody: "Exportez une sauvegarde CSV et archivez les mots que vous maîtrisez.",
    highlightAuto: "Surlignage automatique",
    highlightAutoHint: "Surligner les mots enregistrés sur chaque page web",
    highlightStyle: "Style de surlignage",
    highlightUnderline: "Souligné",
    highlightBackground: "Arrière-plan",
    uiLanguage: "Langue de l'interface",
    zh: "简体中文",
    en: "English",
    ja: "日本語",
    fr: "Français",
    syncStatus: "État de la synchronisation",
    synced: "Synchronisé",
    syncing: "Synchronisation…",
    syncingItems: (n) => `Synchronisation de ${n} modification${n === 1 ? "" : "s"}…`,
    syncOffline: "Hors ligne",
    syncOfflineHint: "Vous êtes hors ligne. Les modifications seront synchronisées dès la reconnexion.",
    syncError: "Erreur de synchronisation",
    syncErrorDetail: (code) => `Erreur : ${code} (nouvelle tentative)`,
    syncedAt: (t) => `Dernière synchro ${t}`,
    clearData: "Effacer toutes les données",
    clearDataHint: "Supprimer tous les mots enregistrés et les paramètres. Cette action est irréversible.",
    feedbackTitle: "Retour / Signaler un bug",
    learningModePausedTitle: "Mode apprentissage en pause",
    learningModePausedBody: "La traduction au clic, la traduction par sélection et les surlignages sur la page sont désactivés. Cliquez sur le bouton flottant en bas à droite de n'importe quelle page pour les réactiver.",
  },
};

export type { Strings };
