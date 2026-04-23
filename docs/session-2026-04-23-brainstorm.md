# 2026-04-23 头脑风暴会话记录

> 目的：盘点 2026-04-22 已改 / 未改内容，作为后续设计讨论的起点。
> 规则：本文件只做记录与设计沉淀，不直接驱动实装（处于 brainstorming 模式）。

---

## 1. 昨天已改（工作区未提交）

截至 2026-04-23 开始时，`git status` 显示以下未 commit 变更：

### 1.1 Bubble「打开详情」按钮图标化
- **文件**：`src/content/bubble.ts`、`src/content/bubbleStyles.ts`
- **变更**：已保存态气泡里原来的文字链「打开详情 / View details」换成纯图标按钮（线稿打开书 SVG）。
  - 新 class：`.dr-bubble__detail`（取代旧的 `.dr-bubble__link`）
  - 尺寸约 28×28（16px 图形 + 6px padding），hover 出软色块
  - 无障碍：`title` + `aria-label` 都带上原字符串 `strings.detail`
- **状态**：代码已落地，未测试未 commit。

### 1.2 高亮候选过滤：`isHighlightable` 谓词
- **新文件**：`src/shared/highlightable.ts`（30 行）、`src/shared/highlightable.test.ts`（70 行，14 个 vitest 用例）
- **改动**：`src/content/index.ts` 的 `readVocabKeys()` 在拉 vocab key 时调用该谓词过滤。
- **规则**：
  1. 仅允许 `\p{Script=Latin}`、组合符、撇号、连字符、空格。
  2. 空白分词后 ≤ 3 个 token（覆盖 give up / give up on / in spite of 等短语动词）。
  3. 排除：CJK、西里尔字母、纯数字、包含数字的条目、句子（≥ 4 词）、空字符串。
- **动机**：Vocab 列表 / CSV 导出仍展示完整条目；但进正则匹配器的只剩真正能被 `\b(...)\b` 命中的短 Latin token，避免长句拼成的无用 alternation 开销，也避免 CJK 在 V8 正则里没有 `\b` 语义导致的永不命中。
- **状态**：代码 + 单测到位，未接 CI，未验证面板侧是否需要对"未参与高亮"的行做视觉标注。

### 1.3 Settings 反馈入口
- **文件**：`src/sidepanel/screens/Settings.tsx`、`src/sidepanel/i18n.ts`、`src/sidepanel/styles.css`
- **变更**：在 Settings 危险区之上加一个「反馈 / Bug 报告」分组，两行链接：
  - `mailto:jiang.ch2022@gmail.com?subject=DualRead`
  - `https://github.com/Foxsunshine/DualRead/issues`（`target=_blank` + `rel="noopener noreferrer"`）
- **i18n**：新增 `feedbackTitle` ZH/EN。
- **样式**：`.dr-contact` / `.dr-contact__row` / `.dr-contact__link`，hover 出软色块，14px 行内 SVG 图标。
- **状态**：仅 UI 改动，未在侧栏里实际点过。

### 1.4 小修：`.dr-vocab__sort` 按钮 UA reset
- **文件**：`src/sidepanel/styles.css`
- **变更**：显式 `background: none; border: 0; padding: 0; font: inherit;`，清掉 Chrome 原生按钮样式泄漏。
- **动机**：邻居 `.dr-vocab__export` 是通过自身的 border/background 覆盖；`.dr-vocab__sort` 之前没覆盖到，会看到浅灰边框。

---

## 2. 昨天没改（已知但被推迟）

来自记忆文件 + DESIGN.md §11 Phase 3 + §10 R3：

### 2.1 v2.0.0 已知技术债（不是阻塞发布项）
- **R3 SPA 高亮性能基准**：`scanAll` 从未在 Twitter/X feed 或 YouTube 评论实测过。预算 <120 ms 典型 / <300 ms 峰值；回退方案为 IntersectionObserver 视口内扫描或 per-domain deny-list。
- **v1.1 全量冒烟**：`docs/v1-1-smoke-results.md` 只 spot-check 了 Reddit FAB。尚未跑完 click-on-unsaved、drag-snap、ESC 关闭、saved-word 气泡、"打开详情" scroll-into-view、`<a>`/`<input>`/`<code>` 拒绝、Cmd+click、离线重试、429 错误展示等。

### 2.2 v1.2 Backlog（未开工）
- 单域名 FAB 隐藏开关
- FAB 可拖动定位
- Vocab 列表跳回原文 URL（原计划 F4）
- Playwright 扩展 e2e 脚手架
- Google MT 429 时 Gemini 回退（`src/background/translate.ts` 仅留了注释占位）

### 2.3 昨天新改动附带但未做的事
- 1.1 的图标按钮：没跑过 vitest / typecheck / build，也没在浏览器里点过。
- 1.2 的 `isHighlightable`：侧栏 Vocab 列表还没用它去给"非高亮条目"加标识；用户现在看不出某条是否会在网页上真的高亮。
- 1.3 的反馈块：没考虑 Issues 链接里是否应该预填 issue template（`/issues/new?template=...`）。

---

## 3. Decision Log（随着头脑风暴增补）

| 时间 | 决议 | 备选 | 理由 |
|------|------|------|------|
| — | — | — | — |

---

## 4. 本次头脑风暴范围（待对齐）

下一步需要和用户先锁定：今天要聚焦哪一块？见会话中提出的问题。
