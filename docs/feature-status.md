# DualRead 功能现状

> 最后更新：2026-04-25。当前 main HEAD 的功能盘点 + 未来版本路线。
> 下一次大改后 patch 这个文件，让它一直反映"现在是什么样"。

---

## ✅ 已实装（main 已 commit）

### v1 / v2.0 / v2.1 — 划词翻译 + 生词本（已上 CWS Review，等审核）

- **划词翻译** — 任意网页选词 / 拖选短语，弹气泡显示中文翻译
- **生词本** — 保存遇到的生词，按时间或字母排序、搜索、添加笔记
- **自动高亮** — 已保存的词在所有网页里自动加下划线 / 背景色
- **CSV 导出** — 导出所有生词为 CSV，可导入 Anki
- **左下浮动 FAB** — 在网页上一键开关学习模式（off = 全部静默）
- **侧栏 3 个 tab** — Translate / Vocab / Settings
- **同步状态指示** — 显示 chrome.storage.sync 状态（synced / syncing / error / offline）
- **悬停预览**（v2.1）— hover 已保存的高亮词显示气泡
- **气泡删除 + 撤销 toast**（v2.1）— 气泡里直接删除，5 秒撤销窗口
- **caret hit-test 修复**（v2.1）— 点击空白处不再误识别为第一个词
- **隐私政策页** — `privacy-policy.html`

### v2.2.0 — 4 语 UI（main 已 commit，未 push）

- **侧栏 UI 4 语** — 中文 / English / 日本語 / Français 全部 ~70 个 UI 字符串
- **气泡 / Toast / FAB 4 语** — content script 端 ~17 个字符串也覆盖
- **首次安装自动检测语言** — 读浏览器 locale 映射到 4 语之一，没匹配就回退到 en
- **Settings 下拉框换 UI 语言** — 4 个 native-form option（中文 / English / 日本語 / Français）
- **Welcome 4 语母语选择** — 2x2 grid 按钮 + 键盘箭头导航 + ARIA radiogroup + dashed 边框区分"自动检测"vs"已确认"
- **Noto Sans JP 字体** — 自托管（不走 Google Fonts CDN，避 CWS full re-review）
- **写 storage 时去重** — 点已选中的语言不再重复写 storage
- **isValidLang 类型守卫** — 防 storage 数据脏

---

## ⚠️ 已知体验问题（用户反馈，未修）

- **翻译方向写死成中文** — UI 选 ja / fr 后划词翻译出来仍是中文（应该跟着 UI 走）
- **Welcome 仍有 level (CEFR) 选择** — 用户认为不需要 / 跟非英语学习者无关

➡️ **以上两个一起属于 v2.3.0 范围**

---

## ⏳ 待实装

### v2.3.0 — 翻译方向 4 语任意对（brainstorm 已 lock，未实装）

> Brainstorm doc: `docs/v2-3-target-lang-brainstorm.md`

- **翻译方向跟 UI 语言走** — `target_lang = ui_language`，4×4 = 12 个语对
- **同语对自动跳过翻译** — 用户读自己母语时显示"已是您的语言"提示而不重复翻
- **Settings 加翻译方向 caption** — 小字说明"翻译方向：自动 → 中文"
- **VocabWord schema 加字段** — `source_lang` / `target_lang` / `translation`
- **老数据自动 migrate** — onInstalled `reason === "update"` 一次性双写新字段，旧 `zh` / `en` 字段保留兼容
- **CSV export 加列** — 导出生词时包含 source_lang / target_lang
- **Welcome 拿掉 level 选择**（用户反馈）—— 跟 v2.3 product 改造一起做最合理
- **气泡 i18n 错误信息** — 已经在 v2.2 做了

⚠️ **5 个 P0 修复必须做**（multi-agent review 锁定）：
1. `vocab_schema_version` 放 chrome.storage.sync（多设备并发安全）
2. 单条写入前检查 8KB 上限
3. onInstalled handler `await` 整个 migration（防 service worker 中途死掉）
4. schema 字段在 commit 1 设为 optional（避免中间 checkout 工作树崩）
5. 老 vocab 中 `zh` 为空的不迁移（防 empty-string 污染）

### v2.5.0 — 收尾 backlog

> 没规划成正式 brainstorm，零碎修补

- **Welcome level 改"目标语水平"** —— 如果保留 level 字段，标签语义化（仅 EN 学习者才有 CEFR）；如已在 v2.3 拿掉就跳过
- **同语对加"翻译 anyway"按钮** — 古文 / 文白对译需求
- **zh-TW 单独支持** — 目前 zh-TW 回退到 zh-CN（简体）
- **商店元数据 4 语化** — `_locales/ja/` + `_locales/fr/`，让 CWS 商店页母语显示扩展名 / 简介
- **Welcome 视口 < 600px 不许滚动** — manual smoke 检查项

### v1.x 一直 deferred 的小事

- **Per-domain FAB 隐藏** — 用户在某些站点想关 FAB
- **可拖动 FAB 位置**
- **生词列表点击跳到来源 URL**
- **Playwright 端到端测试设施**
- **Gemini fallback** — Google MT 429 时降级
- **R3 SPA 高亮性能基准** — Twitter/X、YouTube comments 没测过

---

## 🚀 v3.x.x — 后端 + AI 工程层（10 周大工程）

> Brainstorm: `docs/v3-1-architecture.md` + `docs/v3-1-ai-engineering-brainstorm.md`
>
> 简历叙事核心。从 0 建：

### v3.0 产品骨架（Phase 1，W1-W3）

- FastAPI 后端 + Postgres + Railway 部署
- Google OAuth + 自验 JWT
- 用户登录后翻译走后端而非 Google MT
- 生词云端同步（双写 storage.sync + 后端）
- shared_cache（共享翻译缓存）
- Rate limit + 健康检查

### v3.1 AI 工程层（Phase 2-5，W4-W12）

- LangGraph 3 节点 agent（translate → terminology RAG → style polish）
- pgvector RAG（Wikidata 术语 seed + 共享缓存语义检索）
- BLEU + Sonnet judge 双层 eval（zh / ja 数据集 ~500 条）
- Langfuse 观测（trace + PII scrub）
- Next.js Landing + Admin（Cloudflare Access 保护）
- 手写 GitHub Actions CI/CD

---

## 📋 当前阻塞

| 项 | 阻塞了什么 | 何时解 |
|---|---|---|
| v2.0.0 还在 CWS Review（since 2026-04-22） | v2.2 / v2.3 / v2.5 都不能上架，等 v2.0 过审 | 7-21 天正常窗口 |
| v2.3 schema migration 风险 | v2.3 实装前要先跑 storage 用量检查脚本 | 实装第一步做 |
| Anthropic / OpenAI hard cap 未设 | Phase 1 W1 之前必须设 | Phase 1 启动那天 |

---

## 当前应该做什么

按优先级：

1. **手动跑 v2.2.0 manual smoke**（`v2-2-i18n-brainstorm.md` §6.8 + §G register）—— 验证翻车没有
2. **push 10 个 commit 到 GitHub** —— 备份 + ext-ci.yml 第一次跑
3. 决定 **v2.3 现在做还是等 CWS**：
   - 现在做：用户看着 4 种 UI 但翻译方向死写中文，体验割裂
   - 等 CWS：先稳；v2.0 / v2.1 / v2.2 至少分别走完队列
4. v2.3 实装时连带 Welcome 拿掉 level
