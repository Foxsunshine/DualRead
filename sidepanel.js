// DualRead — side panel controller.
// Phase 0: renders the design shell (welcome / translate-empty / vocab-empty / settings)
// with i18n + tab switching + settings toggles. Real data wires up in Phase 1/2.

// ───── i18n table (ported from design prototype) ─────────────────
const DR_STRINGS = {
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
    syncedAt: (t) => `最后同步 ${t}`,
    clearData: "清除所有数据",
    clearDataHint: "删除所有保存的词和设置。此操作不可撤销。",
    savedToast: "已保存",
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
    syncedAt: (t) => `Last synced ${t}`,
    clearData: "Clear all data",
    clearDataHint: "Delete all saved words and settings. This cannot be undone.",
    savedToast: "Saved",
  },
};

// ───── State ─────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  auto_highlight_enabled: true,
  highlight_style: "underline",
  ui_language: "zh-CN",
  first_run_completed: false,
  level: "B1",
};

const root = document.querySelector(".dr-root");
const state = {
  settings: { ...DEFAULT_SETTINGS },
  activeTab: "translate",
};

// ───── i18n rendering ────────────────────────────────────────────
function renderStrings(lang) {
  const S = DR_STRINGS[lang] || DR_STRINGS["zh-CN"];
  root.lang = lang === "en" ? "en" : "zh-CN";
  root.dataset.lang = lang;

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    const v = S[key];
    if (typeof v === "string") el.textContent = v;
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    if (S[key]) el.setAttribute("placeholder", S[key]);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.dataset.i18nTitle;
    if (S[key]) el.setAttribute("title", S[key]);
  });

  // Functional strings (formatters)
  const countEl = document.querySelector('[data-slot="count"]');
  if (countEl) countEl.textContent = S.wordsCount(0);
  const sortEl = document.querySelector('[data-slot="sort-label"]');
  if (sortEl) sortEl.textContent = S.sortRecent;
  const syncDetailEl = document.querySelector('[data-slot="sync-detail"]');
  if (syncDetailEl) syncDetailEl.textContent = S.syncedAt("—");
}

// ───── Screen / tab switching ────────────────────────────────────
function showScreen(screen) {
  root.dataset.screen = screen;
  const tabFor = screen.startsWith("translate")
    ? "translate"
    : screen.startsWith("vocab")
    ? "vocab"
    : screen === "settings"
    ? "settings"
    : null;
  if (tabFor) {
    state.activeTab = tabFor;
    document.querySelectorAll(".dr-tab").forEach((t) => {
      t.classList.toggle("dr-tab--active", t.dataset.tab === tabFor);
    });
  }
}

function pickScreenForTab(tab) {
  // Phase 0: translate starts empty, vocab starts empty until data lands.
  if (tab === "translate") return "translate-empty";
  if (tab === "vocab") return "vocab-empty";
  return "settings";
}

// ───── Wire events ───────────────────────────────────────────────
function wireTabs() {
  document.querySelectorAll(".dr-tab").forEach((tab) => {
    tab.addEventListener("click", () => showScreen(pickScreenForTab(tab.dataset.tab)));
  });
}

function wireWelcome() {
  document.querySelectorAll(".dr-level").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".dr-level")
        .forEach((b) => b.classList.toggle("dr-level--active", b === btn));
      state.settings.level = btn.dataset.level;
      persistSettings();
    });
  });

  document.querySelector('[data-action="welcome-start"]').addEventListener("click", () => {
    state.settings.first_run_completed = true;
    persistSettings();
    showScreen("translate-empty");
  });

  document.querySelector('[data-action="welcome-settings"]').addEventListener("click", () => {
    state.settings.first_run_completed = true;
    persistSettings();
    showScreen("settings");
  });
}

function wireSettings() {
  const toggle = document.querySelector('[data-action="toggle-highlight"]');
  toggle.addEventListener("click", () => {
    const next = !state.settings.auto_highlight_enabled;
    state.settings.auto_highlight_enabled = next;
    toggle.classList.toggle("dr-toggle--on", next);
    toggle.setAttribute("aria-checked", next ? "true" : "false");
    persistSettings();
  });

  document.querySelectorAll(".dr-style-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      const style = btn.dataset.style;
      state.settings.highlight_style = style;
      document
        .querySelectorAll(".dr-style-option")
        .forEach((b) => b.classList.toggle("dr-style-option--active", b === btn));
      persistSettings();
    });
  });

  document.querySelectorAll("[data-lang-choice]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lang = btn.dataset.langChoice;
      state.settings.ui_language = lang;
      document
        .querySelectorAll("[data-lang-choice]")
        .forEach((b) =>
          b.classList.toggle("dr-lang-toggle__btn--active", b === btn)
        );
      renderStrings(lang);
      persistSettings();
    });
  });

  document.querySelector('[data-action="clear-data"]').addEventListener("click", () => {
    const S = DR_STRINGS[state.settings.ui_language];
    if (!confirm(S.clearDataHint)) return;
    chrome.storage.local.clear(() => {
      state.settings = { ...DEFAULT_SETTINGS };
      applySettingsToUI();
      renderStrings(state.settings.ui_language);
    });
  });
}

function applySettingsToUI() {
  // Toggle
  const toggle = document.querySelector('[data-action="toggle-highlight"]');
  toggle.classList.toggle("dr-toggle--on", state.settings.auto_highlight_enabled);
  toggle.setAttribute(
    "aria-checked",
    state.settings.auto_highlight_enabled ? "true" : "false"
  );

  // Style option
  document.querySelectorAll(".dr-style-option").forEach((b) => {
    b.classList.toggle(
      "dr-style-option--active",
      b.dataset.style === state.settings.highlight_style
    );
  });

  // Language toggle
  document.querySelectorAll("[data-lang-choice]").forEach((b) => {
    b.classList.toggle(
      "dr-lang-toggle__btn--active",
      b.dataset.langChoice === state.settings.ui_language
    );
  });

  // Welcome level
  document.querySelectorAll(".dr-level").forEach((b) => {
    b.classList.toggle("dr-level--active", b.dataset.level === state.settings.level);
  });
}

// ───── Persistence ───────────────────────────────────────────────
function persistSettings() {
  if (chrome?.storage?.local) {
    chrome.storage.local.set({ settings: state.settings });
  }
}

function loadSettings() {
  return new Promise((resolve) => {
    if (!chrome?.storage?.local) return resolve();
    chrome.storage.local.get("settings", (res) => {
      if (res?.settings) state.settings = { ...DEFAULT_SETTINGS, ...res.settings };
      resolve();
    });
  });
}

// ───── Boot ──────────────────────────────────────────────────────
async function boot() {
  await loadSettings();
  renderStrings(state.settings.ui_language);
  applySettingsToUI();
  wireTabs();
  wireWelcome();
  wireSettings();
  showScreen(state.settings.first_run_completed ? "translate-empty" : "welcome");
}

boot();
