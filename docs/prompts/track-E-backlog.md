# 轨道 E 派发 prompt — 长期 backlog 两项

> **使用方法**：在 worktree `../DualRead-track-E`（分支 `track/backlog`）打开 Claude，把以下整段粘贴为首条消息。
>
> 两项可独立交付，可拆分支并行。

---

你是 DualRead 项目轨道 E 的执行 agent。当前工作目录是 git worktree `../DualRead-track-E`，已切到分支 `track/backlog`。完整背景见 `docs/parallel-tracks.md`，本 prompt 是该文档轨道 E 部分的可执行摘要。

## 项目最小背景

DualRead 是 Chrome MV3 扩展（TypeScript + React + Vite + crxjs）。FAB（floating action button）是页面右下角的学习模式开关，由 `src/content/fab.ts` 渲染。完整架构见 `ARCHITECTURE.md`。

## 你的任务范围

§8 长期 backlog 两项，**不阻塞任何发版**：

### E1 — Per-domain FAB 隐藏

允许用户在指定网站隐藏 FAB（不影响划词翻译与高亮，只是 FAB 不显示）。

- `src/shared/types.ts` 的 `Settings` 加字段：
  ```ts
  fab_disabled_origins: string[]; // ["https://example.com", ...]
  ```
- `DEFAULT_SETTINGS.fab_disabled_origins = []`
- `src/content/fab.ts` 在 init 时检查 `location.origin` 是否在列表中，命中则不挂载
- `chrome.storage.onChanged` 监听到 `fab_disabled_origins` 变化时实时挂载/卸载
- `src/sidepanel/screens/Settings.tsx` 加管理面板：
  - 显示当前列表（可逐项删除）
  - 一个输入框 + "添加" 按钮（输入 origin，前端校验 `URL` 合法性）

### E3 — Welcome 视口 < 600px 不滚动

在小视口（高度 < 600px）下，Welcome 屏内容不应出现滚动条。

- `src/sidepanel/screens/Welcome.tsx` 与 `src/sidepanel/styles.css`
- 加媒体查询 `@media (max-height: 600px)`：
  - 缩小 logo / heading / 间距
  - 把 hero copy 字号从 16px → 14px
  - 减少各 section 上下 padding
- 目标：在 800×500 视口下 Welcome 完整可见，无垂直滚动条

## owner 文件（你只能改这些）

E1：
- `src/content/fab.ts`
- `src/shared/types.ts`（Settings 加字段）
- `src/sidepanel/screens/Settings.tsx`（管理面板）

E3：
- `src/sidepanel/screens/Welcome.tsx`
- `src/sidepanel/styles.css`

## 边界（不要碰）

- `VocabWord` schema、migration — 轨道 B
- `Lang` union、i18n 字典 — 轨道 C（如果你的 E1 管理面板需要新字符串，复用现有 key 或加最少必要 key 到 `src/sidepanel/i18n.ts`，但要 4 语都补齐保持原子性）
- `manifest.json` — 轨道 C
- bubble、highlight、toast — 轨道 A

## 实施关键点

1. **合并位次**：E1 修改 `Settings` 与 `i18n.ts`，**必须等轨道 C 合并到 main 后**再 rebase（避免与 C 的 Settings 重构冲突）；E3 任意时机
2. **i18n 同步**：如果 E1 加新 i18n key（如 `fabDisabledOriginsLabel`、`addOrigin`、`removeOrigin`），4 语都要补齐

## 对外契约

- 两项彼此独立，可分别开 PR
- 不影响任何其他轨道发版

## 验证方式（每次提交前自检）

E1：
- 在 example.com 加 origin 到列表 → 刷新页面 → FAB 不显示；选词翻译与 `.dr-hl` 高亮仍正常工作
- 移除 origin → 刷新 → FAB 重新出现
- 跨设备 chrome sync 验证（如果你方便测）：列表同步到另一设备

E3：
- DevTools 调整视口为 800×500 → Welcome 屏完整可见，无垂直滚动条
- 视口 ≥ 600px 高度时显示恢复正常（媒体查询不影响大视口）

## 完成定义

每项独立开 PR：
- E1：`[Track E1] Per-domain FAB hiding (§8)`
- E3：`[Track E3] Welcome no-scroll on small viewport (§8)`

完成后向我汇报：实际触碰的文件清单、需要 reviewer 重点关注的设计取舍、是否有遗留 TODO。
