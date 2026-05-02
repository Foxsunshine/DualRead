# DualRead 功能现状

> 最后更新：2026-05-02（重新基于 main HEAD 源码盘点，修正之前文档与代码不一致的问题）。
> 此文档反映"现在仓库里实际跑得起来的功能"，不依赖 commit 历史。

---

## ✅ 已实装（main 源码可见）

### v1 / v2.0 — 划词翻译 + 生词本核心

- **划词翻译气泡** — 任意网页选词 / 拖选短语，弹气泡显示译文（`src/content/bubble.ts` + `src/content/index.ts`，shadow DOM + loading/translated/error 三态）
- **生词本** — 保存遇到的生词，按时间或字母排序、搜索、添加笔记（`src/sidepanel/screens/Vocab.tsx` + `src/sidepanel/useVocab.ts`）
- **自动高亮** — 已保存的词在所有网页里自动加下划线 / 背景色（`src/content/highlight.ts`，正则匹配 + DOM 包裹 + MutationObserver）
- **CSV 导出** — 导出所有生词为 CSV，可导入 Anki（`src/sidepanel/exportCsv.ts`，header：`word, translation, context, note, source_url, created_at`，RFC 4180 转义）
- **右下浮动 FAB** — 一键开关学习模式（`src/content/fab.ts`，44×44 按钮，`role="switch"`；off = 全部静默）
- **侧栏 3 个 tab** — Translate / Vocab / Settings（`src/sidepanel/App.tsx`）
- **同步状态指示** — chrome.storage.sync 状态徽标（`src/sidepanel/useSyncStatus.ts` + Settings 屏 `<SyncIndicator>`）
- **学习模式总开关** — `learning_mode_enabled`（`src/shared/types.ts`），关掉后 content script 全静默，FAB 仍可重新开
- **隐私政策页** — 仓库根目录 `privacy-policy.html`（v2.0.1 版本，CWS 审核需要）

### v2.1 — 高亮交互（仅部分实装）

- **悬停高亮变色** — `src/content/content.css` 里 `.dr-hl:hover` 加柔色背景

---

## ⏳ 待实装

### v2.1 收尾（之前 doc 声称已做、实际未做）

- **悬停预览气泡** — 目前 hover 只是变色，没有触发 bubble 浮窗
- **气泡内删除按钮 + 撤销 toast** — bubble 只有 Save / Saved，没删除按钮；后台 `deleteWord()` 已存在但 bubble 没接入；也没有 toast 组件

### v2.2.0 — 4 语 UI（未实装）

> `src/sidepanel/i18n.ts` 当前只有 `zh-CN` 和 `en` 两套字符串。下面 8 项全部依赖先扩这张表。

- **侧栏 UI 4 语** — 补 `ja` / `fr` 的 ~70 个 UI 字符串
- **气泡 / Toast / FAB 4 语** — `src/content/index.ts` FAB 字符串目前硬编码 zh-CN/en
- **首次安装自动检测语言** — `src/background/index.ts` `onInstalled` 当前没读 `navigator.language`
- **Settings 4 语下拉框** — 当前只有 zh-CN / en 两个 LangBtn
- **Welcome 4 语母语选择 grid** — Welcome 屏现仍是 CEFR level (A2/B1/B2/C1) 选择，不是语言选择
- **Noto Sans JP 自托管字体** — `src/sidepanel/styles.css` 没有 `@font-face`
- **写 storage 时去重** — Settings onChange 当前会重复写
- **`isValidLang` 类型守卫** — `src/shared/types.ts` 里 `Lang` 还是简单 union `"zh-CN" | "en"`

### v2.3.0 — 翻译方向 4 语任意对（未实装）

> 全部依赖 v2.2 先扩 i18n 和 `Lang` 类型。

- **翻译方向跟 UI 语言走** — `Settings` 里没翻译方向 dropdown，`Settings` 接口里也没相关字段
- **同语对显示提示** — `src/content/bubble.ts` `BubbleState` union 没有 `alreadyInLang` 变体
- **Settings 翻译方向 caption**
- **VocabWord schema 扩展** — 当前 `src/shared/types.ts` `VocabWord` 仍只有 `zh` / `en` 字段，没有 `source_lang` / `target_lang` / `translation`
- **老数据自动 migrate** — `src/background/index.ts` `onInstalled` 没读 `reason` 参数
- **5 个 P0 安全护栏** — version flag / 单条 8KB cap / SW eviction `await` / fields optional / empty-zh skip 全无
- **CSV 导出加 source_lang / target_lang 列** — `src/sidepanel/exportCsv.ts` header 仍是老 6 列
- **Welcome 拿掉 CEFR level 选择**
- **bubble alreadyInLang 状态 + `.dr-bubble__already` 样式**
- **migration vitest 用例** — 当前测试只有 `src/content/wordBoundary.test.ts` 和 `src/shared/highlightable.test.ts`，无 migration 覆盖

### v2.5.0 — Polish backlog（仍 deferred）

- **同语对加"翻译 anyway"按钮** — 古文 / 文白对译需求；依赖 v2.3 落地
- **商店元数据 4 语化** — `_locales/ja/` + `_locales/fr/` 均不存在；改 `_locales/` 触发 CWS full re-review（7-21 天）
- **Welcome 视口 < 600px 不许滚动** — manual smoke 检查项

### v1.x 一直 deferred 的小事

- **Per-domain FAB 隐藏** — 用户在某些站点想关 FAB
- **可拖动 FAB 位置** — 当前 FAB 固定在 `right: 20px; bottom: 20px`
