# Chrome Web Store Listing — DualRead v2.0.1

## Short description (132 chars max)

### 中文
中文母语者的英文阅读助手:点词即译、一键收藏生词、全网自动高亮、导出到 Anki。

### English
Save unknown English words as you read. DualRead auto-highlights them on every page and exports to Anki-ready CSV.

## Single-purpose statement (required by store review)

Help Chinese-speaking English learners look up, save, and review unknown words from any webpage.

## Detailed description — 中文 (primary, paste into zh-CN locale)

DualRead 是专为中文母语者设计的英文阅读助手 —— 把任何网页都变成你的生词本。

━━━ 核心功能 ━━━

🖱️ 点一下，立刻翻译
在任意英文网页上点击一个单词，单词旁边立即弹出中文翻译气泡。无需打开侧边栏，不打断阅读节奏。划选多个单词同样有效。

📘 一键保存到生词本
翻译气泡上点"保存"，或在侧边栏保存当前单词。生词连同原句和出处链接一起存入你的 Chrome 账号，自动同步到所有登录设备。

✨ 全网自动高亮
保存过的生词，在你之后浏览的每一个网页上都会被温柔地下划线标出。点击下划线即可跳回侧边栏查看笔记、原句和最初看到它的页面。

🎛️ 悬浮开关，随时切换学习模式
每个页面右下角都有一枚悬浮按钮。打开 = 学习模式（点词翻译、划词翻译、自动高亮全部生效）；关闭 = 普通浏览模式，页面恢复原样。

📤 导出到 Anki / Excel
随时一键导出 CSV（UTF-8 BOM，Windows Excel 直接读取中文）。导入 Anki 做闪卡复习，或用表格工具进一步整理。

━━━ 隐私友好 ━━━

• 不需要注册账号
• 不需要任何后端服务
• 唯一离开你浏览器的文本，是你主动选中的单词（仅发送给 Google 翻译用于翻译）
• 所有生词、笔记、设置都存在你本地的 Chrome 账号里，通过 Chrome Sync 在你自己的设备间同步

━━━ v2.0 新功能 ━━━

• 网页内点词 / 划词翻译气泡（无需打开侧边栏）
• 悬浮全局开关（学习模式 ON/OFF）
• 批量翻译优化，自动高亮扫描更快
• 品牌图标更新

━━━ 界面语言 ━━━

默认简体中文，可在设置中切换到英文界面。

━━━ 未来计划 ━━━

• AI 辅导 Tab（Gemini，需自备 API key）
• 原生 Anki .apkg 格式导出
• 可选云同步（突破 Chrome Sync 约 500 词的上限）
• 生词本一键跳回最初保存时的页面

有问题或建议？欢迎在 GitHub 提 Issue:
https://github.com/Foxsunshine/DualRead

## Detailed description — English (paste into en locale)

DualRead turns any webpage into your personal English vocabulary builder — built for Chinese native speakers reading English content.

━━━ CORE FEATURES ━━━

🖱️ Click a word, see the translation instantly
Click any English word on any webpage. A Chinese translation bubble appears right next to the word. Drag-selecting multiple words works the same way. No need to open the side panel.

📘 Save to vocabulary with one tap
Hit "Save" on the bubble (or in the side panel). The word is stored with the sentence it came from and the page URL, synced across your Chrome devices automatically. No account required.

✨ Saved words highlighted everywhere
Every word you save is gently underlined on every page you browse afterwards. Click a highlight to jump back to it in the side panel — edit your note, see where you first saw it, or delete it.

🎛️ Floating on/off switch
A small floating button in the bottom-right of every page lets you toggle "learning mode" on or off in one click. Off = regular browsing, nothing highlighted or intercepted.

📤 Export to Anki or Excel
One-click CSV export with UTF-8 BOM (so Chinese reads correctly in Windows Excel). Import into Anki for spaced-repetition review.

━━━ PRIVACY FIRST ━━━

• No account needed
• No backend servers
• The only text that ever leaves your browser is the word you actively select (sent only to Google Translate)
• All vocabulary, notes, and settings stay in your own Chrome profile and sync via Chrome Sync across your own devices

━━━ NEW IN v2.0 ━━━

• In-page click-to-translate and drag-to-translate bubble (no side panel needed)
• Floating master on/off switch
• Faster batch translation for auto-highlight
• Refreshed brand icon

━━━ INTERFACE LANGUAGES ━━━

Simplified Chinese (default) and English — switch in Settings.

Questions or feedback? Open an issue on GitHub:
https://github.com/Foxsunshine/DualRead

## Category

Productivity

## Languages

- UI: Simplified Chinese (default), English
- Target: English-to-Chinese reading support

## Screenshots (1280×800, 16:10, stored in `store_screenshot/`)

1. `01-hero.png` — Hero frame showing DualRead's overall value prop.
2. `02-select.png` — In-page click-to-translate bubble on a real article.
3. `03-highlight.png` — A webpage with several saved words underlined.
4. `04-export.png` — Settings / Vocab export flow.
5. `05-private.png` — Privacy-first messaging.

---

## CWS submission paste-sheet (v2.0.1)

This is the canonical record of how the v2.0.1 submission was filled in the Privacy practices tab. Future submissions can re-use the same blocks unchanged unless the manifest's permission set changes.

Open Developer Dashboard → DualRead → **Privacy practices** tab. Walk these steps in order. Each block below maps to **one** CWS form field. Copy the text inside the gray code block, paste into the named field, save.

---

### Chinese ↔ English field-name cheatsheet

The CWS dashboard switches language with the browser locale, so a Chinese-locale browser shows Chinese labels. The numbered sections below use English labels because that's what Google's official policy docs use; this table maps each step to what you'll actually see in 中文 mode.

| Step | English label (in this doc) | 中文标签 (CWS 实际显示) | Always shown? |
|---|---|---|---|
| ① | Single purpose description | 唯一用途说明 / 单一用途 | ✅ Yes |
| ② — `storage` | Permission justification: storage | 权限的使用情况 → 存储 | 🟡 Usually hidden — basic permission, skip if no box appears |
| ② — `sidePanel` | Permission justification: sidePanel | 权限的使用情况 → 侧边栏 | 🟡 Usually hidden, skip if no box |
| ② — `downloads` | Permission justification: downloads | 权限的使用情况 → 下载 | 🟡 Sometimes shown |
| ② — host (combined) | Host permission justification (covers both `host_permissions[]` and `<all_urls>` content script) | 主机权限的使用情况 / "请说明您的扩展程序为何需要请求广泛的主机权限" | ✅ Yes — this is the field linked to the "deeper review" warning. 2024+ accounts see ONE combined box. |
| (n/a) | Remote code | 远程代码使用情况 | ✅ Yes — choose **"否，我不使用远程代码"** (No, I do not use remote code) |
| ③ | Data usage — collection checkboxes | 数据使用情况 / 数据收集与使用 | ✅ Yes |
| ④ | Certifications | 认证 / 我已认证 | ✅ Yes |
| ⑤ | Privacy policy URL | 隐私权政策网址 / 隐私政策链接 | ✅ Yes |

**Why fewer text boxes than declared permissions?** Google's CWS form has progressively narrowed which permissions require a per-permission justification. As of 2024–2026, baseline permissions like `storage` and `sidePanel` are typically not asked. Don't be alarmed if you only see 2–3 permission justification boxes — fill what's shown, skip what isn't.

**If you can't match a field you see to anything below**, copy its Chinese label + helper text and paste it into a chat with Claude — I'll tell you which paste-sheet block it maps to.

---

### ① Single purpose

**CWS field:** "Single purpose description" / 唯一用途说明

```
Help Chinese-speaking English learners look up, save, and review unknown English words encountered on any webpage. The extension shows in-page translations, saves words to a personal vocabulary list, and gently highlights saved words on pages visited afterwards.
```

---

### ② Permission justifications

Fill each text box CWS shows you with the matching block below. If a permission's box does not appear (typical for `storage` / `sidePanel`), skip it.

**CWS field:** `storage`

```
Store the user's saved vocabulary, UI settings, and a small pending-write buffer. Vocabulary is stored in chrome.storage.sync so it follows the user across their own Chrome devices via Chrome Sync. Nothing is uploaded to any developer-operated server.
```

**CWS field:** `sidePanel`

```
Render the DualRead vocabulary UI in Chrome's native side panel (translation results, saved-word list, settings).
```

**CWS field:** `downloads`

```
Save the user's vocabulary list to a CSV file on their own disk when they click the Export button in the side panel.
```

**CWS field:** Host permission justification (combined) / 主机权限的使用情况

This single textbox covers BOTH the entries in `host_permissions[]` AND the broad-host scope of `content_scripts.matches: <all_urls>`.

```
Two host scopes are needed:

(1) https://translate.googleapis.com/*  — Send the text the user actively clicks or drag-selects to Google Translate to obtain the Chinese translation shown in the in-page bubble and side panel. This is the only external service the extension contacts. The endpoint is called anonymously (client=gtx, no API key, no user identifier, no cookies).

(2) Content scripts on <all_urls>  — The extension works on any webpage the user reads English on, so target hosts cannot be enumerated in advance. On each page the content script (a) detects the word the user clicks or drag-selects, (b) underlines words the user has previously saved, and (c) renders a floating learning-mode toggle in the bottom-right corner. The bubble and toggle render inside a closed Shadow DOM so they cannot be read or styled by the host page. The content script does not read or transmit any page content other than the text the user explicitly clicks or selects, plus its immediate surrounding sentence used as in-app context. activeTab is insufficient because the script must run automatically at document_idle on every page to re-apply highlights, not in response to a toolbar click.

No data leaves the user's browser other than the user-selected text described in (1). There is no developer-operated backend, no analytics, and no telemetry.
```

---

### ③ Data usage — checkboxes

**CWS field:** "Does your extension collect or use…" / 数据使用情况 — answer for each row:

| Category | Answer |
|---|---|
| Personally identifiable information | ❌ No |
| Health information | ❌ No |
| Financial and payment information | ❌ No |
| Authentication information | ❌ No |
| Personal communications | ❌ No |
| Location | ❌ No |
| Web history | ❌ No |
| User activity | ❌ No |
| **Website content** | ✅ **Yes** ← the only box to check |

> Why "Website content" is Yes: the user-selected text the extension transmits to Google Translate falls under Google's CWS definition of "website content" (text visible on a webpage that the extension handles or transmits). Even though DualRead has no developer-operated backend, the reviewer convention since 2024 has been that third-party API transmission still counts as disclosed handling. Leaving this unchecked while declaring `<all_urls>` content scripts and a `translate.googleapis.com` host permission has triggered rejections.

---

### ④ Certifications — check all three

**CWS field:** "I certify that the following disclosures are true" / 认证

- ✅ I do not sell or transfer user data to third parties, outside of the approved use cases.
- ✅ I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- ✅ I do not use or transfer user data to determine creditworthiness or for lending purposes.

---

### ⑤ Privacy policy URL

**CWS field:** "Privacy policy" / 隐私权政策网址

```
https://foxsunshine.github.io/DualRead/privacy-policy.html
```

The URL must be publicly reachable before submission — the review bot fetches it. Before submitting, open the URL in a browser and confirm:

- Header shows `Last updated: April 26, 2026 (v2.0.1)`
- The permissions list does **not** mention `contextMenus`

If GitHub Pages is showing a stale version, wait 1–2 minutes after the last `main` push and hard-refresh (⌘+Shift+R).

---

### ⑥ Pre-submit walk-through

1. **Package tab** — confirm `dualread-v2.0.1-cws.zip` is the active package (version 2.0.1, manifest has `permissions: ["storage", "sidePanel", "downloads"]`, no `contextMenus`).
2. **Privacy practices tab** — every box above filled exactly as shown, "Save draft" button at the page top has turned green / grayed out.
3. **Store listing tab** — homepage URL still `https://github.com/Foxsunshine/DualRead`; screenshots unchanged from v2.0.0.
4. Click **Submit for review**.
5. The "broad host permissions may need in-depth review" warning **will reappear** on submit — this is informational, not a block. Confirm and continue.

Expected timeline: 3–10 days due to the broad-host deeper review queue. If approved, the listing goes live automatically. If rejected, the email will name the specific field; come back to this paste-sheet to fix.
