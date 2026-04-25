# DualRead 功能现状

> 最后更新：2026-04-25（Phase 1 W4 实装完毕，端到端登录可本地测）。
> 当前 main HEAD 的功能盘点 + 未来版本路线。下一次大改后 patch 这个
> 文件，让它一直反映"现在是什么样"。

---

## ✅ 已实装（main 已 commit）

### v1 / v2.0 / v2.1 — 划词翻译 + 生词本（已上 CWS Review，等审核）

- **划词翻译** — 任意网页选词 / 拖选短语，弹气泡显示译文
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

### v2.3.0 — 翻译方向 4 语任意对（main 已 commit，未 push）

> Brainstorm doc: `docs/v2-3-target-lang-brainstorm.md`

- **翻译方向跟 UI 语言走** — 选 fr UI → 划词 → 法语翻译；4×4 = 12 语对全开
- **同语对显示提示** — 读自己母语时气泡显"已经是中文了 / Already in your language / すでに日本語です / Déjà dans votre langue"，不重复翻
- **Settings 翻译方向 caption** — dropdown 下加小字"翻译方向：自动检测 → 中文"
- **VocabWord schema 扩展** — 新 `source_lang` / `target_lang` / `translation` 字段；`zh` / `en` 旧字段保留向前兼容
- **老数据自动 migrate** — onInstalled `reason === "update"` 跑一次双写
- **5 个 P0 安全护栏** — version flag 在 storage.sync（多设备）/ 单条 8KB cap / SW eviction `await` / fields optional / empty-zh skip
- **CSV 导出加 source_lang / target_lang 列** — 旧 `zh` 列保留兼容
- **Welcome 拿掉 CEFR level 选择** — 4 语用户不限于英语学习
- **bubble alreadyInLang 状态** — 新 React state kind + `.dr-bubble__already` 样式
- **8 个 vitest 用例 for migration** — 覆盖 idempotent / multi-device / 8KB / empty-zh / version flag advance

---

## ⏳ 待实装

### v2.5.0 — 收尾 backlog（**deferred to post-v3**）

> 2026-04-25 决策：v2.x polish 已到边际报酬递减区。Phase 1 (FastAPI
> backend) 对简历叙事 / career pivot 价值远高于这 4 项 polish。等 v3
> 主体上线后、有真实用户反馈信号时再回头收尾。
>
> 例外：如果 v2.3 上线后出现明显 JA / FR install 转化问题，单独提前
> 做 #3（商店元数据 4 语化），其余三项继续 defer。

- **同语对加"翻译 anyway"按钮** — 古文 / 文白对译需求；i18n key + UI hook 已在 v2.3 brainstorm §8.2 reserve
- **zh-TW 单独支持** — 目前 zh-TW 回退到 zh-CN（简体）
- **商店元数据 4 语化** — `_locales/ja/` + `_locales/fr/`，让 CWS 商店页母语显示扩展名 / 简介。⚠️ 改 `_locales/` 触发 CWS full re-review（7-21 天）
- **Welcome 视口 < 600px 不许滚动** — manual smoke 检查项

### v1.x 一直 deferred 的小事（2026-04-25 v3 启动前清理）

仍想做（低优先级，post-v3）：

- **Per-domain FAB 隐藏** — 用户在某些站点想关 FAB
- **可拖动 FAB 位置**

整合到 v3 一起做：

- **生词列表点击跳到来源 URL** — v3 vocab 后端同步会影响跳转逻辑，
  跟 backend 整合一起做更清晰

---

## 🚀 v3.x.x — 后端 + AI 工程层（10 周大工程）

> Brainstorm: `docs/v3-1-architecture.md` + `docs/v3-1-ai-engineering-brainstorm.md`
>
> 简历叙事核心。从 0 建：

### v3.0 产品骨架（Phase 1）

**W1-W4 已完成（2026-04-25）：**

- ✅ FastAPI 骨架 + Postgres + alembic + 4 base tables（W1）
- ✅ Google OAuth（access_token + userinfo verify）+ 自验 HS256 JWT（W2/W4#1）
- ✅ Anonymous /translate（Google MT 兜底 + shared_cache 写穿）（W3#1）
- ✅ Authenticated /vocab CRUD + bulk-upsert（与 v2.3 schema 镜像）（W3#2）
- ✅ Hourly Postgres-backed rate limiter（per-IP + per-user）（W3#3）
- ✅ Chrome extension `chrome.identity.getAuthToken` 流程 + Settings Account UI（W4#2）
- ✅ 端到端本地登录 runbook（W4#3，`DualRead-backend/docs/runbooks/dev-login.md`）

**W5（待办）：**

- Railway 部署 + 把 manifest host_permissions 切到 prod URL
- 把翻译路径切到 backend（user 已登录走 backend，未登录走原本地 Google MT）
- 生词云端同步（双写 storage.sync + 后端 /vocab/bulk-upsert）

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
| v2.0.0 还在 CWS Review（since 2026-04-22） | v2.2 / v2.3 不能上架，等 v2.0 过审 | 7-21 天正常窗口 |
| v2.3 schema migration storage 用量未实测 | v2.3 push 上 CWS 之前最好让用户跑一次 sync 用量检查（`chrome.storage.sync.getBytesInUse(null)`），确认离 100KB 还远 | 实测 1 分钟 |
| Anthropic / OpenAI hard cap 未设 | Phase 1 W1 之前必须设 | Phase 1 启动那天 |

---

## 当前应该做什么

按优先级：

1. **重新 load 扩展跑 manual smoke**（`v2-2-i18n-brainstorm.md` §6.8 + 12 语对扩展抽查）—— 验证 v2.2 / v2.3 真没翻车
2. **push 18 个 commit 到 GitHub** —— 备份 + ext-ci.yml 第一次跑
3. **决定 release 节奏**：
   - **方案 A**：等 v2.0 过审 → 直接发 v2.3.0（含 v2.2 + v2.3 全部内容），跳过 v2.2.0 中间发布
   - **方案 B**：等 v2.0 过审 → 发 v2.2.0 → 等 v2.2 过审 → 发 v2.3.0（两次队列）
   - 方案 A 排队成本最小，但一次性发 ~720 LOC 给 CWS 审，风险叠在一起
4. **v3 启动**：进入 Phase 1 W1（FastAPI 骨架），career narrative 推进
