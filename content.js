// ===== 双语对照翻译器 - Content Script =====

(function () {
  'use strict';

  let tooltip = null;
  let targetLang = 'zh-CN';
  let mode = 'tooltip'; // 'tooltip' | 'inline'
  let engine = 'google'; // 'google' | 'gemini'
  let geminiApiKey = '';
  let enabled = false;
  let hideTimer = null;

  // 加载用户设置
  chrome.storage.sync.get(['targetLang', 'mode', 'engine', 'geminiApiKey', 'enabled'], (res) => {
    if (res.targetLang) targetLang = res.targetLang;
    if (res.mode) mode = res.mode;
    if (res.engine) engine = res.engine;
    if (res.geminiApiKey) geminiApiKey = res.geminiApiKey;
    enabled = res.enabled === true;
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.targetLang) targetLang = changes.targetLang.newValue;
    if (changes.mode) mode = changes.mode.newValue;
    if (changes.engine) engine = changes.engine.newValue;
    if (changes.geminiApiKey) geminiApiKey = changes.geminiApiKey.newValue;
    if (changes.enabled) enabled = changes.enabled.newValue === true;
  });

  // ---- 翻译引擎分发 ----
  async function translateText(text, target) {
    if (engine === 'gemini' && geminiApiKey) return translateWithGemini(text, target);
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

  // ---- Gemini 语言映射 ----
  const geminiLangMap = {
    'zh-CN': '简体中文', 'zh-TW': '繁体中文', 'en': 'English',
    'ja': '日本語', 'ko': '한국어', 'fr': 'Français',
    'de': 'Deutsch', 'es': 'Español', 'pt': 'Português',
    'ru': 'Русский', 'ar': 'العربية'
  };

  // ---- Gemini API 翻译（单条，429 时自动回退 Google）----
  async function translateWithGemini(text, target) {
    try {
      const targetLangName = geminiLangMap[target] || target;
      const data = await callGemini(`请将以下文本翻译成${targetLangName}。只输出译文，不要任何解释、前缀或额外内容：\n\n${text}`);
      const translated = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      return { translated, detectedLang: 'auto' };
    } catch (e) {
      if (e.gemini429) return translateWithGoogle(text, target);
      throw e;
    }
  }

  // ---- Gemini API 批量翻译（多条合并为 1 次请求）----
  async function translateBatchWithGemini(texts, target) {
    const targetLangName = geminiLangMap[target] || target;
    const numbered = texts.map((t, i) => `[${i + 1}] ${t}`).join('\n\n');
    const prompt = `请将以下${texts.length}段文本分别翻译成${targetLangName}。
每段翻译前用 [序号] 标记（如 [1]、[2]），只输出译文，不要解释。

${numbered}`;

    const data = await callGemini(prompt);
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    // 按 [1] [2] ... 拆分结果
    const results = [];
    for (let i = 0; i < texts.length; i++) {
      const tag = `[${i + 1}]`;
      const nextTag = `[${i + 2}]`;
      const start = raw.indexOf(tag);
      if (start === -1) { results.push(''); continue; }
      const contentStart = start + tag.length;
      const end = i < texts.length - 1 ? raw.indexOf(nextTag, contentStart) : -1;
      results.push((end === -1 ? raw.slice(contentStart) : raw.slice(contentStart, end)).trim());
    }
    return results;
  }

  // ---- Gemini API 底层调用 ----
  async function callGemini(prompt) {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      if (resp.status === 403) throw new Error('Gemini API Key 无效，请在插件设置中重新填写');
      if (resp.status === 429) {
        const err429 = new Error('Gemini API 请求过于频繁，回退到 Google 翻译');
        err429.gemini429 = true;
        throw err429;
      }
      throw new Error(err?.error?.message || `Gemini API 错误 (${resp.status})`);
    }

    return resp.json();
  }

  // ---- 显示浮动气泡 ----
  function showTooltip(x, y, originalText) {
    removeTooltip();

    tooltip = document.createElement('div');
    tooltip.id = 'bilingual-tooltip';
    const engineBadge = engine === 'gemini' && geminiApiKey ? '✦ Gemini' : 'G Google';
    const engineClass = engine === 'gemini' && geminiApiKey ? 'gemini' : 'google';
    tooltip.innerHTML = `
      <div class="bt-header">
        <span class="bt-logo">🌐 双语翻译</span>
        <span class="bt-engine-badge ${engineClass}">${engineBadge}</span>
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
    tooltip.getBoundingClientRect(); // 触发布局，确保尺寸计算正确
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
    }).catch((err) => {
      const transEl = tooltip?.querySelector('.bt-translated');
      if (transEl) transEl.innerHTML = `<span style="color:#e53935">${escapeHtml(err?.message || '翻译失败，请检查网络')}</span>`;
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
    if (!enabled) return;
    if (tooltip && tooltip.contains(e.target)) return;

    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();
      if (text && text.length > 1) {
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
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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
    if (!enabled || pageTranslated) return;
    pageTranslated = true;

    // 收集所有文字段落节点
    const blocks = Array.from(document.querySelectorAll('p, h1, h2, h3, h4, h5, li, td, th, blockquote, figcaption'))
      .filter(el => {
        const text = el.innerText?.trim();
        return text && text.length > 10 && !el.dataset.btTranslated;
      });

    // Gemini: 每 20 段合并为 1 次 API 请求；Google: 逐条翻译
    const batchSize = (engine === 'gemini' && geminiApiKey) ? 20 : 5;

    for (let i = 0; i < blocks.length; i += batchSize) {
      const batch = blocks.slice(i, i + batchSize);
      const texts = batch.map(el => el.innerText.trim()).filter(Boolean);

      try {
        let translations;
        if (engine === 'gemini' && geminiApiKey) {
          try {
            // 1 次 API 调用翻译整批
            translations = await translateBatchWithGemini(texts, lang);
          } catch (e) {
            if (e.gemini429) {
              // 429 限流 → 回退 Google 翻译
              translations = await Promise.all(texts.map(async t => {
                const { translated } = await translateWithGoogle(t, lang);
                return translated;
              }));
            } else {
              throw e;
            }
          }
        } else {
          // Google: 逐条调用
          translations = await Promise.all(texts.map(async t => {
            const { translated } = await translateWithGoogle(t, lang);
            return translated;
          }));
        }

        batch.forEach((el, idx) => {
          if (el.dataset.btTranslated || !translations[idx]) return;
          originalNodes.set(el, el.innerHTML);
          el.dataset.btTranslated = '1';

          const transDiv = document.createElement('div');
          transDiv.className = 'bt-paragraph-translation';
          transDiv.textContent = translations[idx];
          el.appendChild(transDiv);
        });
      } catch (e) {
        // 跳过失败的批次
      }

      // Gemini free tier: 15 RPM → 4s 间隔确保不超限；Google 无需等待
      await sleep(engine === 'gemini' && geminiApiKey ? 4000 : 100);
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
