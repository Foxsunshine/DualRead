import type { Lang } from "../shared/types";
import { LANG_OPTIONS } from "../shared/types";

// Native-form label lookup, used by the translation-direction caption
// strings below. Centralizing here means a 5th language addition only
// touches LANG_OPTIONS.
function nativeLabel(lang: Lang): string {
  return LANG_OPTIONS.find((l) => l.id === lang)?.nativeLabel ?? lang;
}

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
  // v2.4: prompt above the 4-language picker on the Welcome screen.
  // Tells the user the picker has already been auto-filled from their
  // browser's UI locale, but they can override. Wording mentions
  // "auto-detected" so the dashed-outline visual cue (.dr-lang-card--
  // auto-detected) has a textual counterpart for screen-reader users.
  welcomeLangPrompt: string;
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
  // v2.3 D5: small caption below the ui_language dropdown clarifying
  // the second-order effect — picking a UI language also picks the
  // translation target. Function-typed because the rendered text
  // includes the chosen language's native-form name (中文 / English /
  // 日本語 / Français).
  translateDirectionCaption: (lang: Lang) => string;
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
  // v3 W4 — Account section in Settings. Signed-out state shows the
  // pitch + CTA; signed-in state shows the user's email and a sign-out
  // button. Strings stay short because the Account block is rendered
  // above the existing sync indicator and the visual budget is tight.
  accountTitle: string;
  accountSignedOutHint: string;
  accountSignInBtn: string;
  accountSignOutBtn: string;
  accountSigningIn: string;
  accountSignInError: string;
  // Function-typed because the email is interpolated. Localizes the
  // surrounding phrasing (e.g. "Signed in as {email}" / "已登录：{email}")
  // without the panel having to concatenate strings on its own.
  accountSignedInAs: (email: string) => string;
  clearData: string;
  clearDataHint: string;
  // Contact block rendered near the bottom of Settings (above the danger zone).
  // Two rows: email (mailto:) + GitHub Issues (target=_blank). Title is the
  // only localized string — the address and URL are rendered verbatim.
  feedbackTitle: string;
  savedToast: string;
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
    welcomeLangPrompt: "你的母语（已自动检测，可修改）",
    // P1-S4 (multi-agent review): clarify the CEFR scale is for English
    // specifically, since v2.3 will let users pick non-EN target_lang where
    // CEFR doesn't apply. Full fix (hide / rename for non-EN learners)
    // deferred to v2.5.
    levelPrompt: "你的英文水平（CEFR）",
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
    translateDirectionCaption: (lang) =>
      `翻译方向：自动检测 → ${nativeLabel(lang)}`,
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
    accountTitle: "账户",
    accountSignedOutHint: "登录后即可在多个设备间同步你的生词本。",
    accountSignInBtn: "使用 Google 登录",
    accountSignOutBtn: "退出登录",
    accountSigningIn: "登录中…",
    accountSignInError: "登录失败，请稍后再试。",
    accountSignedInAs: (email) => `已登录：${email}`,
    clearData: "清除所有数据",
    clearDataHint: "删除所有保存的词和设置。此操作不可撤销。",
    feedbackTitle: "反馈 / Bug 报告",
    savedToast: "已保存",
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
    welcomeLangPrompt: "Your native language (auto-detected, change if needed)",
    // P1-S4: CEFR scale is EN-specific; v2.3+ allows non-EN target_lang.
    // Full fix deferred to v2.5.
    levelPrompt: "Your English level (CEFR)",
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
    translateDirectionCaption: (lang) =>
      `Direction: auto-detect → ${nativeLabel(lang)}`,
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
    accountTitle: "Account",
    accountSignedOutHint: "Sign in to sync your vocab across devices.",
    accountSignInBtn: "Sign in with Google",
    accountSignOutBtn: "Sign out",
    accountSigningIn: "Signing in…",
    accountSignInError: "Sign-in failed. Please try again.",
    accountSignedInAs: (email) => `Signed in as ${email}`,
    clearData: "Clear all data",
    clearDataHint: "Delete all saved words and settings. This cannot be undone.",
    feedbackTitle: "Feedback / Bug report",
    savedToast: "Saved",
    learningModePausedTitle: "Learning mode paused",
    learningModePausedBody: "Click-to-translate, drag-to-translate, and page highlights are off. Click the floating button at the bottom-right of any page to turn them back on.",
  },
  // v2.2 commit 2: real JA translations.
  // Register conventions (per §9.2 P1-S2 register matrix):
  //   - Buttons / commands: 命令形 (e.g., 保存 / 削除 / 再試行) — never
  //     ます-form on a button label.
  //   - Sentences / errors / hints / toasts: ですます調 polite form.
  //   - Toast confirmation uses past polite (保存しました) — convention
  //     for system feedback in JA UI.
  ja: {
    appName: "DualRead",
    tagline: "気になった単語を、その場で。",
    translate: "翻訳",
    vocab: "単語帳",
    settings: "設定",
    welcomeHello: "こんにちは 👋",
    welcomeHeading: "英語を読みながら、単語を集めよう",
    welcomeBody:
      "ウェブページで知らない単語を選択すると、DualRead が翻訳して単語帳に保存します。次に同じ単語が現れたとき、そっとマークするので、もう一度出会えます。",
    welcomeCta: "始める",
    welcomeSkip: "設定を見る",
    welcomeLangPrompt: "母国語（自動検出済み、変更可）",
    levelPrompt: "あなたの英語レベル（CEFR）",
    levelA2: "初級 · A2",
    levelB1: "初中級 · B1",
    levelB2: "中級 · B2",
    levelC1: "上級 · C1",
    selectPrompt: "ウェブページで英語を選択すると、ここに翻訳が表示されます。",
    selectHint: "ページに戻って、知らない単語を選択してみてください。",
    selectionLabel: "選択範囲",
    translationLabel: "翻訳",
    contextLabel: "前後の文脈",
    sourceLabel: "出典",
    saveBtn: "単語帳に保存",
    savedBtn: "保存済み",
    goToPage: "ページへ移動",
    addNote: "メモを追加",
    translatingLabel: "翻訳中…",
    poweredBy: "Google 翻訳",
    translateErrorRateLimit: "翻訳サービスが一時的に制限されています。少し待ってから再試行してください。",
    translateErrorNetwork: "ネットワークの問題が発生しました。接続を確認して再試行してください。",
    translateErrorGeneric: "翻訳に失敗しました。少し待ってから再試行してください。",
    vocabEmpty: "保存した単語はまだありません",
    vocabEmptyBody: "ウェブページで知らない単語を選択して「保存」を押すと、ここに表示されます。",
    searchPlaceholder: "単語を検索…",
    sortRecent: "最近",
    sortAlpha: "A → Z",
    export: "CSV を書き出す",
    exportHint: "Anki やスプレッドシートに取り込めます",
    delete: "削除",
    edit: "編集",
    noteField: "メモ",
    noteAdd: "メモを追加…",
    wordsCount: (n) => `${n} 単語`,
    quotaNear: "500 単語の上限に近づいています",
    quotaBody: "CSV をバックアップして、覚えた単語をアーカイブしてください。",
    highlightAuto: "自動ハイライト",
    highlightAutoHint: "保存した単語をすべてのページでハイライト表示します",
    highlightStyle: "ハイライトスタイル",
    highlightUnderline: "下線",
    highlightBackground: "背景",
    uiLanguage: "表示言語",
    translateDirectionCaption: (lang) =>
      `翻訳方向：自動検出 → ${nativeLabel(lang)}`,
    syncStatus: "同期ステータス",
    synced: "同期済み",
    syncing: "同期中…",
    syncingItems: (n) => `${n} 件を同期中…`,
    syncOffline: "オフライン",
    syncOfflineHint: "オフラインです。再接続後に同期されます。",
    syncError: "同期エラー",
    syncErrorDetail: (code) => `エラー: ${code}（再試行中）`,
    syncedAt: (t) => `最終同期 ${t}`,
    syncRetry: "再試行",
    accountTitle: "アカウント",
    accountSignedOutHint: "ログインすると、複数のデバイスで単語帳を同期できます。",
    accountSignInBtn: "Google でログイン",
    accountSignOutBtn: "ログアウト",
    accountSigningIn: "ログイン中…",
    accountSignInError: "ログインに失敗しました。後でもう一度お試しください。",
    accountSignedInAs: (email) => `ログイン中：${email}`,
    clearData: "すべてのデータを削除",
    clearDataHint: "保存したすべての単語と設定を削除します。元に戻せません。",
    feedbackTitle: "フィードバック / バグ報告",
    savedToast: "保存しました",
    learningModePausedTitle: "学習モードは一時停止中です",
    learningModePausedBody:
      "クリック翻訳・ドラッグ翻訳・ページ内ハイライトはオフです。ページ右下のフローティングボタンで再開できます。",
  },
  // v2.2 commit 2: real FR translations.
  // Register conventions (per §9.2 P1-S2 register matrix):
  //   - Buttons / commands: impératif sans pronom (Enregistrer /
  //     Supprimer / Réessayer) — never indicatif présent.
  //   - Sentences / errors / hints / toasts: vouvoiement présent
  //     (Vous êtes hors ligne / Sélectionnez du texte) — never tutoiement.
  fr: {
    appName: "DualRead",
    tagline: "Capturez les mots au fil de la lecture.",
    translate: "Traduire",
    vocab: "Vocabulaire",
    settings: "Paramètres",
    welcomeHello: "Bonjour 👋",
    welcomeHeading: "Lisez en anglais, gardez les mots.",
    welcomeBody:
      "Sélectionnez n'importe quel mot inconnu sur n'importe quelle page web. DualRead le traduit et l'ajoute à votre liste de vocabulaire. La prochaine fois qu'il apparaîtra, il sera discrètement marqué pour vous le faire reconnaître.",
    welcomeCta: "Commencer",
    welcomeSkip: "Voir les paramètres",
    welcomeLangPrompt: "Votre langue maternelle (détectée auto, modifiable)",
    levelPrompt: "Votre niveau d'anglais (CEFR)",
    levelA2: "Débutant · A2",
    levelB1: "Pré-intermédiaire · B1",
    levelB2: "Intermédiaire · B2",
    levelC1: "Avancé · C1",
    selectPrompt: "Sélectionnez du texte anglais sur une page — la traduction s'affichera ici.",
    selectHint: "Retournez sur la page et sélectionnez un mot inconnu.",
    selectionLabel: "Sélection",
    translationLabel: "Traduction",
    contextLabel: "Contexte",
    sourceLabel: "Source",
    saveBtn: "Ajouter au vocabulaire",
    savedBtn: "Enregistré",
    goToPage: "Aller à la page",
    addNote: "Ajouter une note",
    translatingLabel: "Traduction…",
    poweredBy: "Google Traduction",
    translateErrorRateLimit:
      "Le service de traduction est momentanément limité. Réessayez dans un instant.",
    translateErrorNetwork: "Problème réseau — vérifiez votre connexion et réessayez.",
    translateErrorGeneric: "Échec de la traduction. Réessayez bientôt.",
    vocabEmpty: "Aucun mot enregistré",
    vocabEmptyBody:
      "Sélectionnez des mots inconnus sur une page web et cliquez sur Enregistrer — ils apparaîtront ici.",
    searchPlaceholder: "Rechercher dans le vocabulaire…",
    sortRecent: "Récent",
    sortAlpha: "A → Z",
    export: "Exporter en CSV",
    exportHint: "À importer dans Anki ou un tableur",
    delete: "Supprimer",
    edit: "Modifier",
    noteField: "Note",
    noteAdd: "Ajouter une note…",
    wordsCount: (n) => `${n} mot${n === 1 ? "" : "s"}`,
    quotaNear: "Vous approchez de la limite de 500 mots",
    quotaBody: "Exportez une sauvegarde CSV et archivez les mots déjà appris.",
    highlightAuto: "Surlignage automatique",
    highlightAutoHint: "Surligne les mots enregistrés sur toutes les pages web",
    highlightStyle: "Style de surlignage",
    highlightUnderline: "Souligné",
    highlightBackground: "Arrière-plan",
    uiLanguage: "Langue de l'interface",
    translateDirectionCaption: (lang) =>
      `Direction : détection auto → ${nativeLabel(lang)}`,
    syncStatus: "État de synchronisation",
    synced: "Synchronisé",
    syncing: "Synchronisation…",
    syncingItems: (n) => `Synchronisation de ${n} modification${n === 1 ? "" : "s"}…`,
    syncOffline: "Hors ligne",
    syncOfflineHint:
      "Vous êtes hors ligne. Les modifications seront synchronisées à la reconnexion.",
    syncError: "Erreur de synchronisation",
    syncErrorDetail: (code) => `Erreur : ${code} (nouvelle tentative)`,
    syncedAt: (t) => `Dernière synchronisation : ${t}`,
    syncRetry: "Réessayer",
    accountTitle: "Compte",
    accountSignedOutHint: "Connectez-vous pour synchroniser votre vocabulaire entre plusieurs appareils.",
    accountSignInBtn: "Se connecter avec Google",
    accountSignOutBtn: "Se déconnecter",
    accountSigningIn: "Connexion…",
    accountSignInError: "Échec de la connexion. Veuillez réessayer.",
    accountSignedInAs: (email) => `Connecté en tant que ${email}`,
    clearData: "Effacer toutes les données",
    clearDataHint: "Supprime tous les mots enregistrés et les paramètres. Cette action est irréversible.",
    feedbackTitle: "Commentaires / Rapport de bug",
    savedToast: "Enregistré",
    learningModePausedTitle: "Mode apprentissage en pause",
    learningModePausedBody:
      "Le clic-traduire, le glisser-traduire et le surlignage de page sont désactivés. Cliquez sur le bouton flottant en bas à droite de la page pour les réactiver.",
  },
};

export type { Strings };
