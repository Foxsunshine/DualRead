# 轨道 C 派发 prompt — i18n 4 语原子包 + Level 字段删除

> **使用方法**：在 worktree `../DualRead-track-C`（分支 `track/i18n-4lang`）打开 Claude，把以下整段粘贴为首条消息。

---

你是 DualRead 项目轨道 C 的执行 agent。当前工作目录是 git worktree `../DualRead-track-C`，已切到分支 `track/i18n-4lang`。完整背景见 `docs/parallel-tracks.md`，本 prompt 是该文档轨道 C 部分的可执行摘要。

## 项目最小背景

DualRead 是 Chrome MV3 扩展（TypeScript + React + Vite + crxjs）。侧栏 React UI 用 `src/sidepanel/i18n.ts` 的 `DR_STRINGS<Lang>` 字典做运行时 i18n。当前 `Lang = "zh-CN" | "en"`，需要扩到 `"zh-CN" | "en" | "ja" | "fr"` 并落实 §4 i18n 原子包。完整架构见 `ARCHITECTURE.md`，特别 §8（side-panel state model）与 §11（manifest surface）。

## 你的任务范围

§4 i18n 原子包（D3：必须同次落地，否则 storage 读出 `"ja"`/`"fr"` 会绕过类型系统） + ARCHITECTURE D18 Level 字段彻底删除 + manifest CSP 收紧。

### 工作项

1. **`Lang` union 扩 + 类型守卫**（`src/shared/types.ts`）
   ```ts
   export type Lang = "zh-CN" | "en" | "ja" | "fr";
   export function isValidLang(x: unknown): x is Lang {
     return x === "zh-CN" || x === "en" || x === "ja" || x === "fr";
   }
   ```

2. **删除 `Settings.level` 与 `DEFAULT_SETTINGS.level`**（D18）
   - 删 `Level` 类型导出
   - 删 `Settings.level` 字段
   - 删 `DEFAULT_SETTINGS.level`
   - `useSettings` 写出时 lazy-strip 历史 `level` 字段（防旧 storage 污染）

3. **侧栏 ~70 个 UI 字符串补 ja/fr**（`src/sidepanel/i18n.ts`）
   - 现有字典是 `zh-CN` 与 `en` 两键，每个含 ~70 个 key
   - 复制结构添加 `ja` 与 `fr` 两个新键，全部翻译
   - **同时移除** `levelA2`/`levelB1`/`levelB2`/`levelC1` 等 level 相关 key

4. **Settings 4 语下拉框 + 移除 level UI**（`src/sidepanel/screens/Settings.tsx`）
   - 当前 `LangBtn` 只渲染 zh-CN/en；扩为 4 项
   - 删除 level 选择器整块 UI
   - 用 `isValidLang` 守卫从 storage 读出的值

5. **Settings `onChange` 写 storage 去重**（`src/sidepanel/state.ts` 或 Settings 组件层）
   - 当前每次 toggle 触发 `chrome.storage.local.set`，连点会重复写
   - 加浅比较：新值与旧值 deep-equal 时跳过 set

6. **自托管 Noto Sans JP `@font-face`**
   - 新建 `public/fonts/NotoSansJP-Regular.woff2`（从 Google Fonts 下载 woff2 子集，建议只含 hiragana + katakana + 常用 kanji）
   - `src/sidepanel/styles.css` 加 `@font-face { font-family: "Noto Sans JP"; src: url("/fonts/NotoSansJP-Regular.woff2") format("woff2"); font-display: swap; }`
   - `body` 或语言选择器加 `font-family: "Noto Sans JP", system-ui, sans-serif;` 在 `[lang="ja"]` 下生效

7. **`manifest.json` CSP 收紧**
   - 当前：`style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com;`
   - 改为：`style-src 'self' 'unsafe-inline'; font-src 'self';`
   - 删除 `src/sidepanel/index.html` 中所有指向 Google Fonts 的 `<link>` 标签（如有）

8. **首次安装 navigator.language 探测**（`src/background/index.ts`）
   - 在 `chrome.runtime.onInstalled.addListener(({ reason }) => ...)` 的 `"install"` 分支内
   - 加：读 `navigator.language`（如 `"ja-JP"`）→ 截短匹配 `Lang` → 写入 `Settings.ui_language`
   - 匹配规则：`ja-*` → `"ja"`，`fr-*` → `"fr"`，`zh-*` → `"zh-CN"`，其他 → `"en"`
   - **不要改** init/onMessage 注册时序（轨道 B 拥有那段）

## owner 文件（你只能改这些）

- `src/shared/types.ts`（Lang 扩 + Level 删 + Settings.level 删 + DEFAULT_SETTINGS.level 删 + isValidLang 加）
- `src/sidepanel/i18n.ts`（4 语字典 + 移除 level keys）
- `src/sidepanel/screens/Settings.tsx`（4 语下拉 + 移除 level UI + onChange 去重）
- `src/sidepanel/state.ts`（useSettings 写出 lazy-strip level）
- `src/sidepanel/screens/Welcome.tsx`（**仅移除 level 绑定**，避免引用已删的 `Level` 导致 TS 编译失败；CEFR 网格的彻底拆除属 §6 不在你范围）
- `src/sidepanel/styles.css`（`@font-face`）
- `src/sidepanel/index.html`（如有 Google Fonts link 则删除）
- `manifest.json`（CSP 收紧）
- `public/fonts/NotoSansJP-Regular.woff2`（**新建**资产，需要 `mkdir -p public/fonts`）
- `src/background/index.ts`（**仅** onInstalled 内 navigator.language 探测段）

## 边界（不要碰）

- `VocabWord` 字段、`shared/migration.ts` — 轨道 B
- `background/index.ts` 的 init/onMessage 时序 — 轨道 B
- `src/content/` 全部 — 轨道 A
- `_locales/` — 轨道 D（不同发版）

## 实施关键点

1. **合并位次**：你必须**等轨道 B 合并到 main 后**再 rebase 你的分支（B 加性、C 破坏性）。在等待期可以先在你的 worktree 完成所有改动，但开 PR 时确保 base 是 B 已合并的 main
2. **原子性**：8 个工作项必须在**同一个 PR** 内完成；不接受拆分。否则 Lang 扩了但字符串没扩，storage 读出 `"ja"` 时 UI 渲染会 fallback 到默认导致界面残缺
3. **轨道 A 依赖你**：A 阶段 2 的 4 语字典扩张要等你合并；如果 A 已开了 draft PR，你合并后请告知 A 可以 rebase
4. **字体子集**：完整 Noto Sans JP 是 ~5MB，请用 [pyftsubset](https://fonttools.readthedocs.io/) 或 [google-webfonts-helper](https://gwfh.mranftl.com/fonts/noto-sans-jp) 生成只含 hiragana/katakana/JIS 常用 kanji 的子集，目标 < 500KB

## 对外契约

- 你的 PR 是 §4 原子包的核心；与轨道 A 同发版
- 不要触发 `VocabWord` schema 变化（B 拥有）
- `isValidLang` 是新公开 API，A/B 都可以读但不应改

## 验证方式（每次提交前自检）

- `npx tsc --noEmit` 无错误（重点验 `Level` 残留引用）
- `npm run dev` 起 dev build：
  - Settings 切换 4 种语言，sidepanel 全部界面字符串无残留
  - 卸载重装：模拟 `navigator.language = "ja-JP"`（DevTools 改 navigator）→ 初装默认 `ui_language = "ja"`；同理 `fr-FR` → `"fr"`，其他 → `"en"`
  - DevTools Network 面板：字体仅自托管 woff2，无外联 fonts.gstatic.com / fonts.googleapis.com 请求
  - DevTools Application → Manifest → CSP 不再包含 Google 域
  - 连续切换同一 toggle 5 次：DevTools storage.onChanged 监控只触发一次 set
  - 旧 storage 含 `level: "B1"`：刷新 Settings 后再读 storage，`level` 字段被 strip 掉

## 完成定义

8 个工作项全部 acceptance 通过、TS 编译通过、手工冒烟无回归 → 等 B 合并 → rebase → 开 PR `[Track C] i18n 4-lang + Level cleanup (§4 + D18)`，标 ready for review。完成后向我汇报实际触碰的文件清单、字体子集大小、ja/fr 翻译来源（人工 / 工具）、需要 reviewer 重点关注的设计取舍。
