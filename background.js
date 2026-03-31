// ===== Background Service Worker =====

chrome.runtime.onInstalled.addListener(() => {
  // 右键菜单
  chrome.contextMenus.create({
    id: 'bilingual-translate-selection',
    title: '🌐 双语翻译选中文字',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'bilingual-translate-page',
    title: '📄 双语翻译整个页面',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'bilingual-restore-page',
    title: '↩ 还原页面',
    contexts: ['page']
  });

  // 默认设置
  chrome.storage.sync.get(['targetLang', 'mode'], (res) => {
    if (!res.targetLang) chrome.storage.sync.set({ targetLang: 'zh-CN' });
    if (!res.mode) chrome.storage.sync.set({ mode: 'tooltip' });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === 'bilingual-translate-page') {
    chrome.storage.sync.get(['targetLang'], (res) => {
      chrome.tabs.sendMessage(tab.id, {
        action: 'translatePage',
        targetLang: res.targetLang || 'zh-CN'
      });
    });
  }

  if (info.menuItemId === 'bilingual-restore-page') {
    chrome.tabs.sendMessage(tab.id, { action: 'restorePage' });
  }
});
