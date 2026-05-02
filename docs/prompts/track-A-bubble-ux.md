# 轨道 A 派发 prompt — Bubble/Content UX

> **使用方法**：在 worktree `../DualRead-track-A`（分支 `track/bubble-ux`）打开 Claude，把以下整段粘贴为首条消息。

---

你是 DualRead 项目轨道 A 的执行 agent。当前工作目录是 git worktree `../DualRead-track-A`，已切到分支 `track/bubble-ux`。完整背景见 `docs/parallel-tracks.md`，本 prompt 是该文档轨道 A 部分的可执行摘要。

## 项目最小背景

DualRead 是 Chrome MV3 扩展（TypeScript + React + Vite + crxjs），无后端。三个运行时：content script、background service worker、sidepanel React UI。`shared/` 模块跨运行时共享类型与消息契约（不允许 import `chrome.*` 或 React）。完整架构见 `ARCHITECTURE.md`。

## 你的任务范围

实现 §2（Vocab UX）全部 + §4 中 content 端字典 4 语扩张：

1. **hover 预览气泡**（§2 D2）：鼠标悬停在 `.dr-hl` 高亮词上时，触发 bubble 状态机的 `hoverPreview` 变体（与现有 `translated` 状态并列），松开 hover 后气泡消失
2. **气泡内删除按钮 + 撤销 toast**（§2 D2）：bubble 在 `saved` 时显示删除按钮；点击后立即删除并显示一个 5 秒 toast，含 undo；undo 触发后重新 `SAVE_WORD` 恢复原记录
3. **bubble/FAB/toast 字典扩到 4 语**（§4 D3 一部分）：把 `src/content/i18n.ts` 的 `bubbleStrings()`/`fabStrings()`/`translateErrorMessage()` 从二元三目改为 4 分支 switch；新增 toast 用 key（`undoLabel`、`deletedToast` 等）

## owner 文件（你只能改这些）

- `src/content/bubble.ts` — 状态机加 `hoverPreview` 变体；`saved` 加 delete 按钮 wiring
- `src/content/bubbleStyles.ts` — 新状态/按钮的样式
- `src/content/index.ts` — 装载 hover 监听 + toast
- `src/content/i18n.ts` — 4 语扩张 + 新增 toast key
- `src/content/highlight.ts` — **仅扩接口**，加 `onHighlightHover?: (key, rect) => void` 钩子，不动 TreeWalker/MutationObserver 核心
- `src/content/toast.ts` — **新建**，参考 `bubble.ts` 的 Shadow DOM 风格
- `src/content/bubble.test.ts` — **新建**，覆盖 hover 状态切换、token 单调性、undo stash 时序

## 边界（不要碰）

- `shared/messages.ts` — undo 用内存 stash + 重新 `SAVE_WORD`，**不新增 message 类型**
- `shared/types.ts` — 由轨道 B/C 拥有
- `src/sidepanel/` 全部 — 由轨道 C 拥有
- `manifest.json`、`background/` — 不在你的范围

## 实施关键点

1. **分两阶段开发**：
   - 阶段 1（**现在就做**）：hover/delete/toast 状态机 + 内存 stash + undo 流程，**字典先维持现有 2 语**
   - 阶段 2（**等轨道 C 合并后追加**）：把字典扩到 4 语 switch
   - 阶段 1 不依赖任何其他轨道，可立即开工
2. **undo 实现**：
   - 删除时先 stash 完整 `VocabWord` 到 bubble/toast 模块作用域 Map（key 是 `word_key`）
   - 立即发 `DELETE_WORD`
   - undo 点击时发 `SAVE_WORD` 把 stash 的对象复原
   - 5 秒到期 / toast 关闭 / 同 word_key 二次操作 → 清 stash
3. **hover 触发器**：
   - `highlight.ts` 内部本来就给 `.dr-hl` 加了 click 监听，请加一个 `mouseenter`/`mouseleave` 监听走 `onHighlightHover` 回调
   - bubble 在 `hoverPreview` 状态下，鼠标移开高亮词或离开 bubble 范围时关闭
   - 已有的 click→`saved` 状态优先级高于 hover 预览
4. **token 单调性**：bubble 当前已有 `token: number` 防止异步覆盖。新增 `hoverPreview` 必须复用同一 token 序列
5. **不要新增 message 类型** — undo 走内存 stash + 现有 `SAVE_WORD`

## 对外契约

- 你产出的 PR 与轨道 C 的 PR **同发版**（属 §4 原子包）
- 你阶段 1 完成后可以先开 draft PR；阶段 2 在 C 合并到 main 后 rebase 你的分支并补提交
- 不要触发 `chrome.storage.session` 或 `chrome.storage.local` 的 schema 变更

## 验证方式（每次提交前自检）

- `npm run dev` 起 dev build，Chrome 加载 `dist/`：
  - 选词触发气泡正常
  - 悬停 `.dr-hl` 触发预览气泡，移开消失
  - 已保存词的气泡显示删除按钮，点击立即删 + 显示 toast
  - 5 秒内点 undo 恢复词条；5 秒后 toast 自动消失，storage 中确实删了
  - 4 语切换下（依赖 C 合并）bubble/FAB/toast 字符串无残留
- `npm test` 或 `npx vitest run` 通过 `bubble.test.ts`
- `npx tsc --noEmit` 无类型错误

## 完成定义

- 阶段 1 全部 acceptance 通过、单测齐全、TS 编译通过 → 开 draft PR `[Track A] Bubble UX (§2)` 等待 C
- C 合并到 main 后，你 rebase + 追加阶段 2 字典扩张 → PR 标题改 `[Track A+§4] Bubble UX + 4-lang strings`，标记 ready for review

完成所有项后向我汇报：实际触碰的文件清单、单测覆盖情况、需要 reviewer 重点关注的设计取舍。
