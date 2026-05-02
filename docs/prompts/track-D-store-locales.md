# 轨道 D 派发 prompt — 商店元数据 4 语补齐

> **使用方法**：在 worktree `../DualRead-track-D`（分支 `track/store-locales`）打开 Claude，把以下整段粘贴为首条消息。

---

你是 DualRead 项目轨道 D 的执行 agent。当前工作目录是 git worktree `../DualRead-track-D`，已切到分支 `track/store-locales`。完整背景见 `docs/parallel-tracks.md`，本 prompt 是该文档轨道 D 部分的可执行摘要。

## 项目最小背景

DualRead 是 Chrome MV3 扩展。`manifest.json` 已经写了 `"name": "__MSG_extName__"` 与 `"description": "__MSG_extDescription__"`、`"default_locale": "en"`，但**仓库根没有 `_locales/` 目录** —— 这是个**现存构建隐患**：当前构建在 CWS 加载会失败或显示 raw `__MSG_*__` 占位符。你的任务是补齐这个目录并提供 4 语翻译。

## 关键约束（必读）

1. **不是只补 ja/fr，是从零建 4 个 locale**：en、zh_CN、ja、fr 全部新建（之前以为只缺 ja/fr 是错的）
2. **修改 `_locales/` 触发 CWS full re-review**，预期 7–21 天
3. **不得与 §4（轨道 A+C）合包发版**：必须排在 §4 上线**稳定后**单独走 CWS 上传，避免拖累功能更新
4. **D 的 zip 包不含 `src/` 改动**，纯元数据补齐

## 你的任务范围

新建 4 个 messages.json：

### `_locales/en/messages.json`
```json
{
  "extName": {
    "message": "DualRead — Translate & Vocabulary Highlighter",
    "description": "Extension name shown in Chrome Web Store and Chrome menus."
  },
  "extDescription": {
    "message": "Select to translate, save vocabulary, and auto-highlight saved words on every page. Export to CSV. No accounts, no servers.",
    "description": "Extension short description (≤132 chars) shown on Web Store listing."
  }
}
```

### `_locales/zh_CN/messages.json`
```json
{
  "extName": {
    "message": "DualRead — 双语阅读划词翻译与生词高亮",
    "description": "扩展名称"
  },
  "extDescription": {
    "message": "划词即译，一键收藏生词，所有网页自动高亮已学单词。支持导出 CSV。无账号、无服务器。",
    "description": "扩展简介（≤132 字符）"
  }
}
```

### `_locales/ja/messages.json`
（请你按上面的语义自行翻译为日语，保持 description 字段为日语开发者注释）

### `_locales/fr/messages.json`
（请你按上面的语义自行翻译为法语，保持 description 字段为法语开发者注释）

## owner 文件（你只能改这些）

- `_locales/en/messages.json`（**新建**，需要 `mkdir -p _locales/en`）
- `_locales/zh_CN/messages.json`（**新建**，需要 `mkdir -p _locales/zh_CN`）
- `_locales/ja/messages.json`（**新建**）
- `_locales/fr/messages.json`（**新建**）
- 视情况校准 `manifest.json` 的 `default_locale`（**仅在确实需要改时**才动；建议保持 `"en"` 作为最终 fallback）

## 边界（不要碰）

- `src/` 全部 — 不在你范围
- `manifest.json` 的其他字段（permissions、host_permissions、CSP 等）— 不在你范围
- 任何 `*.ts`/`*.tsx`/`*.css`/`*.html`

## 实施关键点

1. **JSON 严格语法**：CWS 上传时 messages.json 解析失败会直接拒绝。提交前 `cat _locales/*/messages.json | jq .` 全部能 parse
2. **字符长度**：`extDescription.message` 必须 ≤ 132 字符（CWS 硬限制）；4 语都验
3. **placeholder**：本任务不需要 placeholder，但 message key 命名必须与 manifest 中 `__MSG_*__` 引用完全一致（区分大小写）
4. **目录命名**：CWS 强制下划线分隔，必须 `zh_CN` 不是 `zh-CN`；`ja` `fr` `en` 是单段
5. **翻译质量**：日语用敬体（です/ます调）；法语用陈述句；保持产品定位（"无账号、无服务器"是关键卖点）

## 对外契约

- 不修改任何代码，纯文本资产
- 发版时机由人工把关（等 §4 上线稳定 1-2 周）

## 验证方式

- `jq . _locales/en/messages.json` 等 4 个文件解析通过
- `wc -m` 检查每个 `extDescription.message` 字符数 ≤ 132
- 本地 build：`npm run build` → 加载 `dist/` 到 Chrome → 浏览器 UI 语言切换到 ja/fr/zh-CN/en，扩展名称与描述均显示对应语言（不再是 raw `__MSG_*__`）
- DevTools Application → Manifest 显示正确的 name/description

## 完成定义

4 个 messages.json 写完、jq 通过、本地 build 4 语切换显示正确 → 开 PR `[Track D] Add _locales/ 4-lang manifest messages (§7)`，**PR 描述明确标注"等待 §4 上线稳定后人工触发 CWS 上传"**，不要 auto-merge。完成后向我汇报：4 语翻译终稿、字符数、本地切换截图（描述清楚截图内容即可）、需要 reviewer 关注的翻译措辞。
