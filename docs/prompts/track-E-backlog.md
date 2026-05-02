# 轨道 E 派发 prompt — 长期 backlog 三项

> **使用方法**：在 worktree `../DualRead-track-E`（分支 `track/backlog`）打开 Claude，把以下整段粘贴为首条消息。
>
> 三项可独立交付。建议 E1+E2 同一次会话（共改 `content/fab.ts`），E3 单独。也可以拆 3 个分支并行，看你偏好。

---

你是 DualRead 项目轨道 E 的执行 agent。当前工作目录是 git worktree `../DualRead-track-E`，已切到分支 `track/backlog`。完整背景见 `docs/parallel-tracks.md`，本 prompt 是该文档轨道 E 部分的可执行摘要。

## 项目最小背景

DualRead 是 Chrome MV3 扩展（TypeScript + React + Vite + crxjs）。FAB（floating action button）是页面右下角的学习模式开关，由 `src/content/fab.ts` 渲染。完整架构见 `ARCHITECTURE.md`。

## 你的任务范围

§8 长期 backlog 三项，**不阻塞任何发版**：

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

### E2 — 可拖动 FAB 位置

允许用户拖动 FAB 到屏幕任意角落，位置持久化。

- `src/content/fab.ts` 加 pointer 事件（`pointerdown`/`pointermove`/`pointerup`）
- 拖动时实时更新 FAB 位置（`top`/`left` CSS）
- 拖动结束（pointerup）时把位置写到 `chrome.storage.local["fab_position"] = { x, y }`
- 下次 init 读 `local["fab_position"]` 还原（无值则用默认右下角）
- 边界保护：position 超出视口时 clamp 到可见范围
- 区分点击 vs 拖动：pointerdown 到 pointerup 距离 < 4px 视为点击（触发 toggle），> 4px 视为拖动

### E3 — Welcome 视口 < 600px 不滚动

在小视口（高度 < 600px）下，Welcome 屏内容不应出现滚动条。

- `src/sidepanel/screens/Welcome.tsx` 与 `src/sidepanel/styles.css`
- 加媒体查询 `@media (max-height: 600px)`：
  - 缩小 logo / heading / 间距
  - 把 hero copy 字号从 16px → 14px
  - 减少各 section 上下 padding
- 目标：在 800×500 视口下 Welcome 完整可见，无垂直滚动条

## owner 文件（你只能改这些）

E1+E2 共享：
- `src/content/fab.ts`
- `src/shared/types.ts`（Settings 加字段；**仅 E1**）
- `src/sidepanel/screens/Settings.tsx`（**仅 E1** 管理面板）

E3 独享：
- `src/sidepanel/screens/Welcome.tsx`
- `src/sidepanel/styles.css`

## 边界（不要碰）

- `VocabWord` schema、migration — 轨道 B
- `Lang` union、i18n 字典 — 轨道 C（如果你的 E1 管理面板需要新字符串，复用现有 key 或加最少必要 key 到 `src/sidepanel/i18n.ts`，但要 4 语都补齐保持原子性）
- `manifest.json` — 轨道 C
- bubble、highlight、toast — 轨道 A

## 实施关键点

1. **合并位次**：E1 修改 `Settings` 与 `i18n.ts`，**必须等轨道 C 合并到 main 后**再 rebase（避免与 C 的 Settings 重构冲突）；E2、E3 任意时机
2. **i18n 同步**：如果 E1 加新 i18n key（如 `fabDisabledOriginsLabel`、`addOrigin`、`removeOrigin`），4 语都要补齐
3. **E2 拖动手感**：`pointer-events` 模式比 `mousedown` + `mousemove` 更稳；用 `setPointerCapture` 防止快速拖动丢失事件
4. **E2 位置存储用 `local` 不是 `sync`**：FAB 位置是设备相关，不应跨设备同步

## 对外契约

- 三项彼此独立，可分别开 PR
- 不影响任何其他轨道发版

## 验证方式（每次提交前自检）

E1：
- 在 example.com 加 origin 到列表 → 刷新页面 → FAB 不显示；选词翻译与 `.dr-hl` 高亮仍正常工作
- 移除 origin → 刷新 → FAB 重新出现
- 跨设备 chrome sync 验证（如果你方便测）：列表同步到另一设备

E2：
- 拖动 FAB 到左上角 → 位置实时跟随鼠标 → 松开后位置保持
- 刷新页面 → FAB 出现在上次拖到的位置
- 拖到屏幕外 → 自动 clamp 回可见范围
- 短距离点击（< 4px 移动）→ 仍触发学习模式 toggle，不被误判为拖动

E3：
- DevTools 调整视口为 800×500 → Welcome 屏完整可见，无垂直滚动条
- 视口 ≥ 600px 高度时显示恢复正常（媒体查询不影响大视口）

## 完成定义

每项独立开 PR：
- E1：`[Track E1] Per-domain FAB hiding (§8)`
- E2：`[Track E2] Draggable FAB position (§8)`
- E3：`[Track E3] Welcome no-scroll on small viewport (§8)`

完成后向我汇报：实际触碰的文件清单、需要 reviewer 重点关注的设计取舍、是否有遗留 TODO。
