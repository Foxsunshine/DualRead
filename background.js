// ===== DualRead Background Service Worker (MV3) =====
// Phase 0: install bootstrap, Google Translate proxy, message router stubs.
// Tooltip / full-page bilingual / Gemini removed.

const DEFAULT_SETTINGS = {
  auto_highlight_enabled: true,
  highlight_style: "underline",
  ui_language: "zh-CN",
  first_run_completed: false
};

// ---- Install / update bootstrap (idempotent) ----
chrome.runtime.onInstalled.addListener(async () => {
  // Toolbar icon click opens the side panel directly.
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // Seed default settings in local storage if absent.
  const { settings } = await chrome.storage.local.get("settings");
  if (!settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
});

// ---- Google Translate proxy ----
async function translateWithGoogle(text, target = "zh-CN") {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Google Translate request failed (${resp.status})`);
  const data = await resp.json();
  const translated = data[0].map(item => item[0]).join("");
  const detectedLang = data[2] || "auto";
  return { translated, detectedLang };
}

// ---- Message router (stubs; filled out in Phase 1+) ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg?.type) {
    case "TRANSLATE":
      translateWithGoogle(msg.text, msg.target || "zh-CN")
        .then(result => sendResponse({ ok: true, ...result }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true; // async response

    case "SELECTION_CHANGED":
      // Phase 1: forward to side panel + open if needed.
      // TODO: chrome.sidePanel.open({ tabId: sender.tab.id }) from gesture chain.
      return false;

    case "OPEN_WORD":
      // Phase 3: route highlight click → open side panel on word.
      return false;

    case "SAVE_WORD":
    case "DELETE_WORD":
      // Phase 2: write-buffer + chrome.storage.sync.
      return false;

    default:
      return false;
  }
});
