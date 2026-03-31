// ===== Popup Script =====

const langSelect    = document.getElementById('targetLang');
const modeBtns      = document.querySelectorAll('.mode-btn');
const engineBtns    = document.querySelectorAll('.engine-btn');
const apikeySection = document.getElementById('apikey-section');
const apiKeyInput   = document.getElementById('apiKeyInput');
const saveKeyBtn    = document.getElementById('saveKeyBtn');
const keyStatus     = document.getElementById('keyStatus');
const statusEl      = document.getElementById('status');

let currentEngine = 'google';

// ---- 加载已保存设置 ----
chrome.storage.sync.get(['targetLang', 'mode', 'engine', 'claudeApiKey'], (res) => {
  if (res.targetLang) langSelect.value = res.targetLang;

  const mode = res.mode || 'tooltip';
  modeBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));

  currentEngine = res.engine || 'google';
  updateEngineUI(currentEngine);

  if (res.claudeApiKey) {
    apiKeyInput.value = res.claudeApiKey;
    keyStatus.textContent = '✓ API Key 已保存';
    keyStatus.className = 'apikey-status ok';
  }
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
    btn.classList.remove('active-google', 'active-claude');
    if (btn.dataset.engine === engine) {
      btn.classList.add(engine === 'claude' ? 'active-claude' : 'active-google');
    }
  });
  apikeySection.classList.toggle('hidden', engine !== 'claude');
}

// ---- 保存并验证 API Key ----
saveKeyBtn.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    keyStatus.textContent = '请输入 API Key';
    keyStatus.className = 'apikey-status err';
    return;
  }
  if (!key.startsWith('sk-ant-')) {
    keyStatus.textContent = '格式不对，Key 应以 sk-ant- 开头';
    keyStatus.className = 'apikey-status err';
    return;
  }

  keyStatus.textContent = '验证中...';
  keyStatus.className = 'apikey-status';

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }]
      })
    });

    if (resp.ok || resp.status === 529) {
      chrome.storage.sync.set({ claudeApiKey: key });
      keyStatus.textContent = '✓ API Key 有效，已保存！';
      keyStatus.className = 'apikey-status ok';
    } else if (resp.status === 401) {
      keyStatus.textContent = '✗ API Key 无效，请检查后重试';
      keyStatus.className = 'apikey-status err';
    } else {
      chrome.storage.sync.set({ claudeApiKey: key });
      keyStatus.textContent = '已保存（无法验证，请确认 Key 正确）';
      keyStatus.className = 'apikey-status';
    }
  } catch (e) {
    chrome.storage.sync.set({ claudeApiKey: key });
    keyStatus.textContent = '已保存（网络异常，无法在线验证）';
    keyStatus.className = 'apikey-status';
  }
});

apiKeyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveKeyBtn.click();
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
  if (currentEngine === 'claude') {
    const res = await chrome.storage.sync.get(['claudeApiKey']);
    if (!res.claudeApiKey) {
      showStatus('⚠️ 请先填写并保存 Claude API Key', true);
      apikeySection.classList.remove('hidden');
      apiKeyInput.focus();
      return;
    }
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  showStatus('翻译中...');
  chrome.tabs.sendMessage(tab.id, {
    action: 'translatePage',
    targetLang: langSelect.value
  }, (res) => {
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
