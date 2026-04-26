# Chrome Web Store Listing — DualRead v2.0

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

━━━ 路线图 ━━━

计划中的 v1.2:
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

## Privacy policy URL

https://foxsunshine.github.io/DualRead/privacy-policy.html

## Permissions justification (for store review)

- `storage` — save vocabulary + settings locally, and sync vocab via Chrome Sync across the user's own devices.
- `sidePanel` — render the extension UI in the Chrome side panel.
- `downloads` — save vocabulary list as a CSV file when the user clicks Export.
- `host_permissions: https://translate.googleapis.com/*` — contact Google Translate to translate the text the user actively selects.
- `content_scripts: <all_urls>` — required so the extension can (a) detect click/drag selection on any page, (b) underline saved words on any page the user visits, and (c) render the floating learning-mode toggle. The content script only transmits text the user explicitly selects; highlight wrapping and the floating button are rendered entirely in the local DOM via closed Shadow DOM.

---

## Privacy practices tab — field-by-field guide

Developer Dashboard → item → **Privacy practices** tab. Fill in order:

### 1. Single purpose description

```
Help Chinese-speaking English learners look up, save, and review unknown English words encountered on any webpage. The extension shows in-page translations, saves words to a personal vocabulary list, and gently highlights saved words on pages visited afterwards.
```

### 2. Permission justifications (one per declared permission)

| Permission | Justification |
|---|---|
| `storage` | Store the user's saved vocabulary, UI settings, and a small pending-write buffer. Vocabulary is stored in `chrome.storage.sync` so it follows the user across their own Chrome devices via Chrome Sync. |
| `sidePanel` | Render the DualRead vocabulary UI in Chrome's native side panel (translation results, vocab list, settings). |
| `downloads` | Save the user's vocabulary list to a CSV file on their disk when they click the Export button in the side panel. |
| Host permission `https://translate.googleapis.com/*` | Send the text the user actively clicks or selects to Google Translate in order to obtain the Chinese translation shown in the in-page bubble and side panel. This is the only external service the extension contacts. |
| `<all_urls>` host access (content scripts) | The extension works on any webpage the user is reading. The content script detects the word the user clicks or drag-selects, renders the translation bubble and the floating on/off button in an isolated closed Shadow DOM, and underlines words the user has previously saved. It does not read or transmit page content other than the text the user explicitly selects and its immediate surrounding sentence. |

### 3. Data usage disclosures

For the "Does your extension collect or use…" checkboxes:

- Personally identifiable information — No
- Health information — No
- Financial and payment information — No
- Authentication information — No
- Personal communications — No
- Location — No
- Web history — No
- User activity — No
- **Website content — Yes** (the only category to check)

> Why "Website content" is checked: the user-selected text the extension transmits to Google Translate falls under Google's CWS definition of "website content" (text visible on a webpage that the extension handles or transmits). Even though DualRead has no developer-operated backend, Google's reviewer convention treats third-party API transmission as in-scope disclosure. Leaving this unchecked while declaring `<all_urls>` content scripts and a translate.googleapis.com host permission has triggered rejections in 2024–2026 reviews. Check the box; the three certifications below (no sale, no unrelated use, no creditworthiness) accurately describe the rest.

### 4. Certifications — check all three

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases.
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes.

### 5. Privacy policy URL

```
https://foxsunshine.github.io/DualRead/privacy-policy.html
```

**Prerequisite**: `privacy-policy.html` at the repo root must be publicly reachable at that URL before submission. Enable GitHub Pages via the repo's Settings → Pages → Deploy from branch → `main` → root, wait 1–2 minutes, and verify the URL loads in a browser. The review bot fetches this URL — if it 404s, the submission is rejected immediately.
