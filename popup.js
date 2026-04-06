// ===== Popup Script =====

const langSelect        = document.getElementById('targetLang');
const modeBtns          = document.querySelectorAll('.mode-btn');
const engineBtns        = document.querySelectorAll('.engine-btn');
const geminiApikeySection = document.getElementById('gemini-apikey-section');
const geminiKeyInput      = document.getElementById('geminiKeyInput');
const saveGeminiKeyBtn    = document.getElementById('saveGeminiKeyBtn');
const geminiKeyStatus     = document.getElementById('geminiKeyStatus');
const statusEl            = document.getElementById('status');
const toggleBtn           = document.getElementById('toggleBtn');
const toggleLabel         = document.getElementById('toggleLabel');

let currentEngine = 'google';
let enabled = false;

function updateToggleUI(on) {
  enabled = on;
  toggleBtn.classList.toggle('on', on);
  toggleLabel.textContent = on ? 'ON' : 'OFF';
  document.body.classList.toggle('ext-off', !on);
}

// ---- 加载已保存设置 ----
chrome.storage.sync.get(['targetLang', 'mode', 'engine', 'geminiApiKey', 'enabled'], (res) => {
  updateToggleUI(res.enabled === true);

  if (res.targetLang) langSelect.value = res.targetLang;

  const mode = res.mode || 'tooltip';
  modeBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));

  currentEngine = res.engine || 'google';
  updateEngineUI(currentEngine);

  if (res.geminiApiKey) {
    geminiKeyInput.value = res.geminiApiKey;
    geminiKeyStatus.textContent = '✓ API Key 已保存';
    geminiKeyStatus.className = 'apikey-status ok';
  }
});

// ---- 开关切换 ----
toggleBtn.addEventListener('click', () => {
  const newState = !enabled;
  chrome.storage.sync.set({ enabled: newState });
  updateToggleUI(newState);
  showStatus(newState ? '已启用 ✓' : '已关闭');
});

// ---- 引擎切换 ----
engineBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    currentEngine = btn.dataset.engine;
    chrome.storage.sync.set({ engine: currentEngine });
    updateEngineUI(currentEngine);
  });
});

function updateEngineUI(engine) {
  engineBtns.forEach(btn => {
    btn.classList.remove('active-google', 'active-gemini');
    if (btn.dataset.engine === engine) {
      if (engine === 'gemini') btn.classList.add('active-gemini');
      else btn.classList.add('active-google');
    }
  });
  geminiApikeySection.classList.toggle('hidden', engine !== 'gemini');
}

// ---- 保存并验证 Gemini API Key ----
saveGeminiKeyBtn.addEventListener('click', async () => {
  const key = geminiKeyInput.value.trim();
  if (!key) {
    geminiKeyStatus.textContent = '请输入 API Key';
    geminiKeyStatus.className = 'apikey-status err';
    return;
  }

  geminiKeyStatus.textContent = '验证中...';
  geminiKeyStatus.className = 'apikey-status';

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Hi' }] }] })
      }
    );

    if (resp.ok) {
      chrome.storage.sync.set({ geminiApiKey: key });
      geminiKeyStatus.textContent = '✓ API Key 有效，已保存！';
      geminiKeyStatus.className = 'apikey-status ok';
    } else if (resp.status === 400 || resp.status === 403) {
      geminiKeyStatus.textContent = '✗ API Key 无效，请检查后重试';
      geminiKeyStatus.className = 'apikey-status err';
    } else {
      chrome.storage.sync.set({ geminiApiKey: key });
      geminiKeyStatus.textContent = '已保存（无法验证，请确认 Key 正确）';
      geminiKeyStatus.className = 'apikey-status';
    }
  } catch (e) {
    chrome.storage.sync.set({ geminiApiKey: key });
    geminiKeyStatus.textContent = '已保存（网络异常，无法在线验证）';
    geminiKeyStatus.className = 'apikey-status';
  }
});

geminiKeyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveGeminiKeyBtn.click();
});

// ---- 语言切换 ----
langSelect.addEventListener('change', () => {
  chrome.storage.sync.set({ targetLang: langSelect.value });
  showStatus('设置已保存 ✓');
});

// ---- 模式切换 ----
modeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    modeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    chrome.storage.sync.set({ mode: btn.dataset.mode });
    showStatus('设置已保存 ✓');
  });
});

// ---- 翻译整页 ----
document.getElementById('translatePageBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  showStatus('翻译中...');
  chrome.tabs.sendMessage(tab.id, {
    action: 'translatePage',
    targetLang: langSelect.value
  }, () => {
    if (chrome.runtime.lastError) {
      showStatus('⚠️ 无法在此页面使用', true);
    } else {
      showStatus('翻译完成 ✓');
    }
  });
});

// ---- 还原页面 ----
document.getElementById('restoreBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { action: 'restorePage' }, () => {
    showStatus('已还原 ↩');
  });
});

function showStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? '#e53935' : '#34A853';
  setTimeout(() => { statusEl.textContent = ''; }, 2800);
}
