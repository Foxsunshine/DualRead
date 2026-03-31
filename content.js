// ===== 双语对照翻译器 - Content Script =====

(function () {
  'use strict';

  let tooltip = null;
  let currentSelection = null;
  let targetLang = 'zh-CN';
  let mode = 'tooltip'; // 'tooltip' | 'inline'
  let engine = 'google'; // 'google' | 'claude'
  let claudeApiKey = '';
  let hideTimer = null;

  // 加载用户设置
  chrome.storage.sync.get(['targetLang', 'mode', 'engine', 'claudeApiKey'], (res) => {
    if (res.targetLang) targetLang = res.targetLang;
    if (res.mode) mode = res.mode;
    if (res.engine) engine = res.engine;
    if (res.claudeApiKey) claudeApiKey = res.claudeApiKey;
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.targetLang) targetLang = changes.targetLang.newValue;
    if (changes.mode) mode = changes.mode.newValue;
    if (changes.engine) engine = changes.engine.newValue;
    if (changes.claudeApiKey) claudeApiKey = changes.claudeApiKey.newValue;
  });

  // ---- 翻译引擎分发 ----
  async function translateText(text, target) {
    if (engine === 'claude' && claudeApiKey) {
      return translateWithClaude(text, target);
    }
    return translateWithGoogle(text, target);
  }

  // ---- Google Translate（免费，无需 Key）----
  async function translateWithGoogle(text, target) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Google 翻译请求失败');
    const data = await resp.json();
    const translated = data[0].map(item => item[0]).join('');
    const detectedLang = data[2] || 'auto';
    return { translated, detectedLang };
  }

  // ---- Claude API 翻译 ----
  async function translateWithClaude(text, target) {
    const langMap = {
      'zh-CN': '简体中文', 'zh-TW': '繁体中文', 'en': 'English',
      'ja': '日本語', 'ko': '한국어', 'fr': 'Français',
      'de': 'Deutsch', 'es': 'Español', 'pt': 'Português',
      'ru': 'Русский', 'ar': 'العربية'
    };
    const targetLangName = langMap[target] || target;

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `请将以下文本翻译成${targetLangName}。只输出译文，不要任何解释、前缀或额外内容：\n\n${text}`
        }]
      })
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      if (resp.status === 401) throw new Error('Claude API Key 无效，请在插件设置中重新填写');
      if (resp.status === 429) throw new Error('Claude API 请求过于频繁，请稍后再试');
      throw new Error(err?.error?.message || `Claude API 错误 (${resp.status})`);
    }

    const data = await resp.json();
    const translated = data.content?.[0]?.text?.trim() || '';
    return { translated, detectedLang: 'auto' };
  }

  // ---- 显示浮动气泡 ----
  function showTooltip(x, y, originalText) {
    removeTooltip();

    tooltip = document.createElement('div');
    tooltip.id = 'bilingual-tooltip';
    const engineBadge = (engine === 'claude' && claudeApiKey) ? '✦ Claude' : 'G Google';
    tooltip.innerHTML = `
      <div class="bt-header">
        <span class="bt-logo">🌐 双语翻译</span>
        <span class="bt-engine-badge ${engine === 'claude' && claudeApiKey ? 'claude' : 'google'}">${engineBadge}</span>
        <span class="bt-lang-badge" id="bt-lang">检测中...</span>
        <span class="bt-close" id="bt-close">✕</span>
      </div>
      <div class="bt-body">
        <div class="bt-original-label">原文</div>
        <div class="bt-original">${escapeHtml(truncate(originalText, 200))}</div>
        <div class="bt-translated-label">译文</div>
        <div class="bt-translated">
          <div class="bt-loading"><div class="bt-spinner"></div>翻译中...</div>
        </div>
      </div>
      <div class="bt-footer">
        <button class="bt-btn" id="bt-copy-btn">复制译文</button>
        <button class="bt-btn" id="bt-google-btn">在 Google 翻译中打开 ↗</button>
      </div>
    `;

    document.body.appendChild(tooltip);

    // 位置计算，确保不超出视窗
    const rect = tooltip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x + 12;
    let top = y + 16;
    if (left + 400 > vw) left = vw - 410;
    if (top + 220 > vh) top = y - 220;
    tooltip.style.left = Math.max(8, left) + 'px';
    tooltip.style.top = Math.max(8, top) + 'px';

    // 事件
    document.getElementById('bt-close').addEventListener('click', removeTooltip);
    document.getElementById('bt-google-btn').addEventListener('click', () => {
      window.open(`https://translate.google.com/?sl=auto&tl=${targetLang}&text=${encodeURIComponent(originalText)}&op=translate`, '_blank');
    });

    // 悬停在气泡上时不消失
    tooltip.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    tooltip.addEventListener('mouseleave', () => {
      hideTimer = setTimeout(removeTooltip, 1500);
    });

    // 翻译
    translateText(originalText, targetLang).then(({ translated, detectedLang }) => {
      const langEl = document.getElementById('bt-lang');
      if (langEl) langEl.textContent = `${detectedLang} → ${targetLang}`;

      const transEl = tooltip?.querySelector('.bt-translated');
      if (transEl) transEl.innerHTML = escapeHtml(translated);

      const copyBtn = document.getElementById('bt-copy-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(translated).then(() => {
            copyBtn.textContent = '已复制 ✓';
            setTimeout(() => { if(copyBtn) copyBtn.textContent = '复制译文'; }, 1500);
          });
        });
      }
    }).catch(err => {
      const transEl = tooltip?.querySelector('.bt-translated');
      if (transEl) transEl.innerHTML = `<span style="color:#e53935">翻译失败，请检查网络</span>`;
    });
  }

  function removeTooltip() {
    if (tooltip) {
      tooltip.remove();
      tooltip = null;
    }
  }

  // ---- 鼠标松开：检测选中文字 ----
  document.addEventListener('mouseup', (e) => {
    if (tooltip && tooltip.contains(e.target)) return;

    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();
      if (text && text.length > 1) {
        currentSelection = text;
        if (mode === 'tooltip') {
          showTooltip(e.clientX, e.clientY, text);
        }
      } else {
        // 点击空白处时延迟关闭
        hideTimer = setTimeout(removeTooltip, 300);
      }
    }, 10);
  });

  // 按 Escape 关闭
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') removeTooltip();
  });

  // ---- 接收来自 background / popup 的消息 ----
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'translatePage') {
      translatePageBilingual(msg.targetLang || targetLang);
      sendResponse({ ok: true });
    }
    if (msg.action === 'restorePage') {
      restorePage();
      sendResponse({ ok: true });
    }
    if (msg.action === 'getSelection') {
      sendResponse({ text: window.getSelection()?.toString().trim() || '' });
    }
  });

  // ---- 全页双语翻译 ----
  const originalNodes = new Map(); // 存储原始内容
  let pageTranslated = false;

  async function translatePageBilingual(lang) {
    if (pageTranslated) return;
    pageTranslated = true;

    // 收集所有文字段落节点
    const blocks = Array.from(document.querySelectorAll('p, h1, h2, h3, h4, h5, li, td, th, blockquote, figcaption'))
      .filter(el => {
        const text = el.innerText?.trim();
        return text && text.length > 10 && !el.dataset.btTranslated;
      });

    // 批量翻译（每批 5 个，避免请求过猛）
    for (let i = 0; i < blocks.length; i += 5) {
      const batch = blocks.slice(i, i + 5);
      await Promise.all(batch.map(async (el) => {
        const text = el.innerText.trim();
        if (!text || el.dataset.btTranslated) return;
        try {
          const { translated } = await translateText(text, lang);
          originalNodes.set(el, el.innerHTML);
          el.dataset.btTranslated = '1';

          const transDiv = document.createElement('div');
          transDiv.className = 'bt-paragraph-translation';
          transDiv.textContent = translated;
          el.appendChild(transDiv);
        } catch (e) {
          // 跳过失败的节点
        }
      }));
      // 小暂停，不阻塞浏览器
      await sleep(80);
    }
  }

  function restorePage() {
    originalNodes.forEach((html, el) => {
      el.innerHTML = html;
      delete el.dataset.btTranslated;
    });
    originalNodes.clear();
    pageTranslated = false;
  }

  // ---- 工具函数 ----
  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function truncate(str, max) {
    return str.length > max ? str.slice(0, max) + '...' : str;
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

})();
