# v3.0 Brainstorm (Python 路线) — Multi-Language + LLM Translation + Accounts

> 2026-04-24。v2.1.1 已上线（气泡层减噪 + detail 开面板）。本轮是 v2 以来
> 最大的一次 pivot：引入后端、账号、LLM 翻译、多母语支持。遵循
> `brainstorming` skill 全程；本文档只到 Understanding Lock + Decision Log，
> **不进入实现细节**，架构与代码交给后续 `architect` 和实现 skill。
>
> **路线**：后端用 Python，托管 Railway，DB 用 Railway Postgres，自己验
> Google access token + 自发 JWT。此路线在 brainstorm 阶段曾与一条并列的
> TypeScript on Supabase 路线对比评估，最终 2026-04-24 敲定走 Python，
> TS 那份文档已删除。本文档是 v3.0 的唯一设计真相源。

---

## 0. Raw input（用户原话，未加工）

1. 开始让用户选"水平"的那一步没有意义（该步骤实际上从未实装 —— `DESIGN.md`
   §1 里提过但 Welcome screen 没有这个选择器）。
2. 让用户选**母语**，只提供三个选项：**中文 / 日文 / 英文**。
3. 用户可以在设置里修改自己的母语。
4. 现有存储已经不局限于英文，用户能存任何语言 —— 系统要为这件事做准备。
5. 加入 **AI agent** 模块，希望比谷歌翻译 API 更省钱。
6. "我完全不懂。是否需要后端服务器？怎样最省 token？"
7. 引入 **login**；登录后提供云存储；保留不登录的现状方案。
8. 登录 = AI 服务；不登录 = Google Translate 托底。
9. "推荐一个免费 / 费用低但安全、主流的数据库服务。"
10. （补充）"我想用 Python 做后端积累 Python 经验，换 Python 的话
    database 改成什么好，前端有什么问题吗？"

---

## 1. Triage — 为什么是 v3.0 而不是 v2.2

v2 到现在全部在**"零后端、零账号、零成本"**前提下（DESIGN.md D11 / D12
明确拒绝了 Supabase 和 auth）。这次引入：

- 后端服务（FastAPI on Railway）
- 账号（Google OAuth → 自发 JWT）
- LLM 接入（Claude Haiku 付费 API）
- 从"CN→EN 学习者"泛化为"任意 → 任意（母语 CN / JA / EN / FR）"

任一单项都不是增量补丁，叠加后和 v2.x 的"零基础设施"心智模型彻底不同。
**定版 v3.0**。

### 本轮不做的（挂 backlog 或 v3.x）

- 付费订阅 / Stripe 实装（本轮只留 schema 口子）
- 语音 / 音标（v2.1 backlog item 5）
- 自定义词库上传（v2.1 backlog item 6）
- 邮箱 / magic link 登录
- UI 语言和翻译目标语解耦
- 共享库的用户贡献审核 UI / 👍👎 / 多译文 vote
- 实时多设备同步推送
- 翻译质量反馈机制
- Redis / 外部缓存层（本轮用 Postgres 计数）
- keep-warm（Railway 常驻容器，无冷启动问题）

---

## 2. Understanding Summary

### 2.1 做什么

v3.0 在 v2.1.1 之上做三件内在相关的事：

1. **母语选择器**：Welcome 屏唯一问题 —— "你的母语是？"，**四选**
   🇨🇳 中文 / 🇯🇵 日本語 / 🇺🇸 English / 🇫🇷 Français。该值同时驱动 UI
   语言**和**翻译目标语（一体化）。设置里可改。
   _（2026-04-25 修订：原 3 语扩为 4 语，加入 FR；详见 D-PY7）_
2. **AI 翻译 + 登录**：登录用户（Google OAuth）获得 LLM 翻译（Claude Haiku
   主选），不登录用户继续用 Google Translate 免费端点（现状不变）。
3. **共享译文库 + Python 后端**：LLM 翻译结果写入共享库（Postgres），所有
   登录用户共享读 —— 核心省钱杠杆，稳态命中率 85%+ 时单位成本逼近 0。

### 2.2 为什么

**母语选择器**：原"CN→EN only"假设过窄，用户需求更泛。一步到位比后续
再改省总工作量。

**AI 翻译**：Google Translate 对 `state-of-the-art` / phrasal verbs /
文学句译文死板；LLM 的译文质量对语言学习者价值极高。用户原话："want more
idiomatic translation."

**共享译文库是省 token 的关键杠杆**：纯直调 LLM ~$18/mo at 300 登录 DAU；
共享库稳态 85% 命中时降到 ~$3/mo，且 DAU 越大单位成本越低（规模经济）。

**登录是门槛也是反滥用机制**：γ 模式下只有登录用户能触发 LLM 调用与写库。
Google 账号 ≈ 真实身份锚，滥用成本高。

**为什么 Python**：用户明确想积累 Python 经验（FastAPI / async / SQLAlchemy
/ JWT / pytest 等可迁移技能）。产品侧决策与语言无关，Python 是实现路径
选择。

### 2.3 给谁

- **匿名用户**（预期 85%）：现有学习者；体验与现状**完全一致**，无功能
  损失、无性能退化。
- **登录用户**（预期 15%）：追求更高翻译质量的进阶学习者；也是未来付费
  的种子。
- **四种母语用户**（CN / JA / EN / FR）：扩大总 TAM；日文母语者学中文、
  法语母语者学英语 / 中国人学法语等场景首次被支持。

### 2.4 关键约束

- **扩展端不改语言栈**：TypeScript 5.7 strict 继续。
- **后端语言 = Python 3.12+**（见 D-PY1 理由）。
- **Web 框架 = FastAPI**（async、自动 OpenAPI、typed 工业标准）。
- **托管 = Railway Hobby + $20/mo 硬上限**（常驻容器，无冷启动，有预算
  硬保险）。
- **DB = Railway Postgres**（与后端同 vendor，一个 dashboard）。
- **Auth = 自己用 `google-auth` 验 Google access token + 自签 JWT**（7 天
  有效期）。
- **不引入付费订阅**，仅 schema 保留 `user.tier` 字段。
- **匿名用户零依赖后端**：后端挂了不影响匿名路径。
- **LLM API key 永不进扩展包**：只存后端环境变量。
- **共享库粒度 = `(source_text, source_lang, target_lang)` 三元组**。
- **支持母语 = CN / JA / EN / FR 四种**（D-PY7，2026-04-25 修订）；
  `source_lang` 与 `target_lang` 字段为 ISO 639-1 字符串、无枚举约束，
  schema 已天然兼容；`user.native_language` CHECK 约束扩到四值。
- **登录用户的 vocab 迁到 `chrome.storage.local`**，后端 DB 成为跨设备唯一
  source of truth；匿名用户继续 `chrome.storage.sync`。

### 2.5 显式非目标

- ❌ 匿名用户用 AI（γ 模式明确拒绝）
- ❌ 付费订阅 UI / Stripe 实装（schema 留口子不用）
- ❌ 邮箱 / magic link 登录
- ❌ UI 语言和翻译目标语解耦为两个独立设置
- ❌ 语音 / 音标（backlog）
- ❌ 自定义词库上传（backlog）
- ❌ 共享库用户贡献审核 / vote
- ❌ Realtime 多设备推送（timestamp LWW 足够）
- ❌ 共享库按母语对分表 / sharding
- ❌ Redis / 独立缓存层（本轮 Postgres 做计数）
- ❌ Refresh token 双 token 机制（本轮单 JWT + 7 天过期 + 重登）
- ❌ 翻译质量 👍👎 反馈（本轮首写即终）
- ❌ Railway Pro Plan（只在 DAU 5k+ 触顶后再考虑）

---

## 3. Assumptions

- **A1** Chrome 扩展的 `chrome.identity.getAuthToken` 在 Chrome ≥ 139 稳定
  （v2.1.1 已锁定最低 Chrome 139，A1 白送）。
- **A2** 目标用户 100% 有 Google 账号（Chrome 用户交集假设）。
- **A3** 共享库的 Zipf 分布成立：稳态命中率 ≥ 85%。英语头部 10k 高频词 +
  2k phrasal verbs 覆盖 90%+ 日常划词（见 §8）。
- **A4** Railway Hobby Plan 常驻容器（单实例 512 MB RAM）在 DAU ≤ 2k 时
  CPU / RAM 不成瓶颈。
- **A5** 登录用户每日划词 ≤ 25 次（学习者的"注意力配额"硬上限，与是否用 AI
  无关）。
- **A6** LLM token 价目表（Haiku $1/M in, $5/M out）未来 12 个月不会大幅
  上涨；即使 2x 绝对值仍 < $10/mo。
- **A7** Railway 免费 credit 模型（Hobby Plan $5/mo credit）12 个月内不
  收紧。
- **A8** `chrome.storage.local` 容纳登录用户 vocab + matcher cache（10 MB
  quota，远超预期 200 词 × 500 B = 100 KB）。
- **A9** Seed 数据通过独立 Python 脚本一次性灌库（不走后端 API），
  ~12k 条目 ≈ $1 一次性 LLM 成本。
- **A10** Railway Postgres 单数据库实例（免费层 1 GB）足够撑到 DAU 5k；
  届时升 Pro Plan 容量翻倍。
- **A11** 自签 JWT HS256 + 7 天过期对此阶段足够；未来需要更强隔离时升 RS256
  - refresh token 是纯增量改动。

---

## 4. Open Questions（非阻塞）

- **OQ1** 翻译质量反馈机制（👍👎 / 用户改译）—— 推迟到 v3.x。
- **OQ2** Seed 脚本用哪个模型打底（Haiku 质量 vs Flash 便宜 4 倍）—— 架构
  阶段定。
- **OQ3** 登出是否提示"保留本地数据"二次确认 —— 默认不提示，UX 阶段看
  反馈。
- **OQ4** 匿名 → 登录用户合并时，本地已翻译词（Google 译）是否自动触发一次
  LLM 重翻以升级质量？默认**不重翻**（保持成本可控），v3.x 可加 "Refresh
  translation" 手动按钮。
- **OQ5** JWT secret 轮换策略 —— 架构阶段定（一次性定 + 紧急时换 secret
  强制所有用户重登，还是双 secret 过渡期）。
- **OQ6** Postgres migration 工具选 Alembic 还是 SQLModel 内建 —— 架构阶段
  定；倾向 Alembic（工业标准）。

---

## 5. Risks

继承 `DESIGN.md` 的 R1–R5 + v2.1 的 R6–R9，新增：

- **R10 — 共享库冷启期体验差**。头 2–3 个月命中率仅 30%，延迟高 + 成本峰值。
  **Mitigation**：Seed 脚本（COCA 前 10k + 2k phrasal verbs）把第 1 月
  命中率预拉到 60%+。一次性成本 ≈ $1。
- **R11 — 后端滥用 / 冷词轰炸**。恶意用户刷随机字符串制造 cache miss 烧
  token。**Mitigation**：per-user rate limit 每分钟 ≤ 10 次 LLM 调用
  （硬编码在 FastAPI middleware）；LLM provider dashboard 设 $20/mo 硬
  上限作为最后防线。
- **R12 — Google OAuth token revocation 风暴**。用户在 Google 账号吊销
  授权后，扩展缓存的 token 和自签 JWT 都失效。**Mitigation**：JWT 过期
  后端返 401 → 扩展清 JWT → 重跑 `chrome.identity` → 若 Google token 也
  失效则提示重登。
- **R13 — Railway 免费 credit 不够**。DAU ~3–5k 时可能超 $5/月 credit，
  开始真实扣费。**Mitigation**：Railway dashboard $20/mo 硬上限强制停服，
  收到邮件手动升 Pro。
- **R14 — 本地 → 云端合并冲突数据损坏**。首次登录合并逻辑若有 bug，可能
  弄丢 note。**Mitigation**：合并前在 `chrome.storage.local.pre_merge_backup`
  存快照；后端 `INSERT ... ON CONFLICT DO UPDATE` 比较 `updated_at` 保新的。
- **R15 — 匿名用户依赖 `DESIGN.md` R1 的非官方 Google Translate 端点**。
  v3.0 不修这个风险。端点挂了 → 匿名用户全面降级（降级 UX 由 v3.x 补）。
- **R-PY1 — Railway 单实例 SPOF**。Hobby Plan 单实例部署，容器挂了服务
  中断直到 Railway 自动重启（~30s）。**Mitigation**：(a) Railway 自带
  健康检查 + 自动重启；(b) 登录用户降级到 Google Translate 的 fallback
  链路（NFR-4）让短暂中断不至于 "AI 完全不可用"；(c) 真需要高可用时升
  Pro Plan 多实例。
- **R-PY2 — JWT secret 泄露**。环境变量意外提交到 git / 日志打印 JWT /
  secret 被 dump。**Mitigation**：(a) `.env` 全加 gitignore；(b) 日志
  中间件打日志时剥 Authorization header；(c) secret 轮换流程文档化（在
  Railway dashboard 改 env → 所有用户重登）。
- **R-PY3 — SQL injection / ORM 误用**。自写后端容易在手拼 SQL 时出事。
  **Mitigation**：全程用 SQLAlchemy ORM 或 asyncpg 参数化查询，禁止字符串
  拼接 SQL；code review 规则写进 `CLAUDE.md`。
- **R-PY4 — Python 依赖 + 安全更新负担**。solo dev 容易忘记升级 FastAPI /
  SQLAlchemy / google-auth 的安全 patch。**Mitigation**：GitHub Dependabot
  自动开 PR；Railway 自动 rebuild 无需手动部署。

---

## 6. Decision Log

按 `DESIGN.md` D1–D37 + v2.1.x D38–D67 的编号延续，v3.0 从 D68 起。

### D68 — 定版 v3.0，非增量 pivot（2026-04-24）

**决定**：版本号定 3.0，不是 2.2。文档命名
`docs/v3-0-brainstorm-python.md`，与 kebab-case 规范连贯。

**理由**：引入后端 + auth + LLM + 多语言，任一单项都不是增量补丁；叠加后
和 v2.x 的"零基础设施"心智模型彻底不同。

---

### D69 — AI 定位：完全替代翻译，不做 tutor / 长段解释 / 每日例句

**决定**：LLM agent 唯一职责 = **划词时出译文**，替代 Google Translate
（对登录用户）。**不做**：

- 译文之上的解释层（词源 / 用法 / 例句）—— v3.x candidates
- 长段 / 整句分层路由 —— 划词 / 短语 / 句子同走一条 LLM 路径
- 闪卡 / 复习 / 每日推送等外围 AI 用途

**备选考虑**：

- B 解释层：与"更地道翻译"正交，先做本体
- C 长段分层：路由复杂度增加，收益小
- D 外围 AI：全部 backlog

**选这个的理由**：用户原话锁死"want more idiomatic translation"；单一
LLM 调用点 = 单一 prompt 模板 = 最低架构复杂度；翻译质量好是用户能立即
感知的一级价值。

---

### D70 — γ 模式：登录才能用 AI，匿名走 Google Translate

**决定**：扩展上所有用户都能用；匿名用户继续 Google Translate（现状），
登录用户走 LLM + 共享库。AI 服务的使用**门槛即登录**。

**备选考虑**：

- α 完全公共库（读写全开）：匿名也能触发 LLM 写库 → 防刷难度剧增
- β 读公共 / 写需登录：匿名用户命中时免费享受 AI → 体验不一致难解释
- γ 登录才能用 AI：最干净的产品分层 + 最省心的反滥用机制
- δ 免费额度 + 付费无限：MVP 不收费，排除

**选这个的理由**：产品边界清晰；匿名用户体验 100% 不退化；Google 账号 ≈
真实身份锚，滥用成本高；未来付费分层天然从这里延伸。

---

### D71 — MVP 无额度上限 + per-user rate limit；schema 为付费预留

**决定**：

- MVP 期登录用户**无日额度**
- FastAPI middleware 硬编码 per-user rate limit 每分钟 ≤ 10 次 LLM 调用
- DB schema 加 `user.tier: "free" | "pro"`，默认 `"free"`，MVP 不读
- DB schema 加 `user.daily_usage` + `user.daily_usage_reset_at`，MVP 仅
  记录
- **不**实装付费 UI / Stripe

**备选考虑**：a 无限免费（必须 rate limit 兜底，已补上）；b 每日配额
（用户基本碰不到，复杂度 > 收益）；c 免费 + 付费层（提前做付费逻辑 10x
开发负担）。

**选这个的理由**：MVP 预期规模下（DAU 500–2,000）成本 ~$3/mo，配额不是
省钱杠杆（共享库才是）；per-user rate limit 防恶意场景足够；schema 预留
代价 ≈ 0。

---

### D72 — `chrome.identity` + Google OAuth 单一登录通道

**决定**：唯一登录方式 = Chrome 原生 `chrome.identity.getAuthToken` +
Google OAuth。

- `manifest.json` 加 `"oauth2"` 字段 + `"identity"` 权限
- 扩展 ID 用 `manifest.json#key` 字段固定本地 = 线上 ID
- GCP console 一次性建 OAuth 2.0 Client ID (type: Chrome Extension)
- 后端用 Python `google-auth` 库验 Google access token

**备选考虑**：b 邮箱 magic link（多步骤，Chrome 用户不需要）；c a+b 双
通道（YAGNI）；d 第三方托管（Clerk 10k MAU 免费较窄）。

**选这个的理由**：Chrome 扩展 = Chrome 用户 = 100% Google 账号持有者；
体验最原生；与 Python `google-auth` 库集成简单（10 行代码验 token）。

---

### D-PY1 — 后端语言 = Python 3.12+，Web 框架 = FastAPI

**决定**：

- 后端语言 **Python 3.12+**（async / type hints 成熟）
- Web 框架 **FastAPI**（async / 自动 OpenAPI / Pydantic 集成 / 工业标准）
- ORM **SQLAlchemy 2.0 async**（或 asyncpg 直驱 —— 留给架构阶段定）
- Migration **Alembic**（工业标准，留给架构阶段定）
- 测试 **pytest + pytest-asyncio + httpx**
- 依赖管理 **Poetry 或 uv**（留给架构阶段）

**备选考虑**：

- Django / Django REST Framework：同步为主、重，不适合"薄翻译 proxy"场景
- Flask：老派，async 支持弱于 FastAPI
- Starlette：FastAPI 的底层，比 FastAPI 少自动文档，无收益
- aiohttp：async 好但生态比 FastAPI 窄

**选这个的理由**：

- FastAPI 是 2024 Python Web 事实标准
- async 天然适合 I/O 密集（等 LLM / Google tokeninfo）
- Pydantic 对 JSON 请求/响应的类型校验近乎免费
- 自动 OpenAPI 文档 = 扩展端 fetch 调用有参考
- 用户目标"积累 Python 经验" = 学可迁移的主流技能

---

### D-PY2 — 托管 = Railway Hobby + $20/mo 硬上限

**决定**：后端部署到 **Railway Hobby Plan**，在 Railway dashboard 设
**$20/mo monthly spending cap**（硬停服）。

**备选考虑**：

- **AWS Lambda + API Gateway**：Python 冷启动 800ms–2s 炸产品体验；
  解决需 Provisioned Concurrency = ~$12/mo 实例费，比 Railway 贵且复杂
- **AWS App Runner + Neon**：Railway 的 AWS 等价物，月 $5–10，对"积累
  Python 经验"意义不大（学的是 AWS 而非 Python）
- **Google Cloud Run + Neon**：冷启动 ~300ms，月 ~$0，免费层内；对
  "学 Python 本体"不加分
- **Fly.io shared-1x + Neon**：月 $2–3，接近 Railway 但 DX 弱一些
- **自己 VPS + Docker**：$4/mo 最便宜，但 solo dev 自管 nginx / systemd /
  SSL / 备份是"学 Linux 运维"不是"学 Python"

**选这个的理由**：

- Railway 部署体验最接近 "git push 就好了"，对 solo dev 摩擦最低
- 常驻容器 = 无冷启动，对交互延迟敏感场景至关重要
- Hobby Plan $5 免费 credit / 月，前期真实开销可能 $0
- `$20/mo 硬上限` = 预算硬保险，AWS 的"通知后继续烧"在 solo dev 场景下
  风险太大
- **不是 AWS**（用户明确已会 AWS，但 AWS 对持续低频 Python Web API
  的经济模型不匹配，见 R-PY1 备注和 OQ 相关讨论）

**关键参数**（可在 Railway dashboard 调）：

- Monthly spending cap: **$20**
- 单实例容器 (Hobby 单实例是规则)
- 自动 HTTPS / 域名 / 日志

---

### D-PY3 — DB = Railway Postgres（同 vendor 策略）

**决定**：数据库使用 **Railway Postgres**（与 FastAPI 同 vendor、同
dashboard、同 credit pool）。

**备选考虑**：

- **Neon Postgres**（免费 0.5 GB + 自动休眠）：DB 成本永远 $0 但多一个
  vendor / dashboard
- **Supabase Postgres**（免费 500 MB）：DB 独立 + Auth 服务可用，但你
  刚明确不用 Supabase 路线，再引入它制造不一致
- **MongoDB Atlas**：NoSQL 对 `UNIQUE(source_text, source_lang, target_lang)`
  约束要手工做；对本项目是劣选
- **SQLite on Railway volume**：免费但不跨实例并发，DAU 1k 就要迁

**选这个的理由**：

- 一个 vendor = 一个 dashboard / 一个 billing / 一个 metrics 页面
- Railway Postgres 免费 1 GB（Hobby Plan），够撑到 DAU ~5k
- Python 生态对 Postgres 支持最完善（SQLAlchemy / asyncpg / Alembic）
- Postgres `ON CONFLICT DO NOTHING` / `DO UPDATE` 一行解决共享库并发写入
- vendor lock-in 可控：Postgres → Postgres 迁移成本低

**关键 schema 决定**（见 D81）：`shared_cache.UNIQUE(source_text,
source_lang, target_lang)`。

---

### D-PY4 — Auth = 自验 Google token + 自签 JWT（7 天）

**决定**：

- 扩展用 `chrome.identity.getAuthToken` 拿 Google access token
- POST 到后端 `/auth/exchange` 携 Google access token
- 后端 Python `google-auth` 库调 Google `tokeninfo` endpoint 验证 +
  拿 `sub` / `email`
- 后端 `upsert` 到 `user` 表（`sub` 为主键）
- 后端用 `pyjwt` 签 JWT（HS256，7 天过期，claims = `{user_id, tier, exp}`）
- 返回 JWT 给扩展
- 扩展存 JWT 到 `chrome.storage.local`
- 后续请求带 `Authorization: Bearer <jwt>`
- 后端 FastAPI dependency 用 secret 验 JWT（微秒级 HMAC）
- JWT 过期 → 后端 401 → 扩展重跑步骤 1–6

**备选考虑**：

- **α 每次请求都验 Google access token**：每次请求一次外部 HTTP（~100ms），
  或后端缓存 token→user 5–10 分钟
- **β 自签 JWT**（本决定）
- **γ β + refresh token 双 token**：过度设计，YAGNI

**选这个的理由**：

- 学到核心 OAuth/JWT 流程（pyjwt 签 / 验 / 过期 / 中间件）= 可迁移技能
- 后续请求成本低（无外部调用）
- 7 天过期合理：用户每周重登一次可接受，且即便 JWT 泄露影响窗口有限
- 要做 refresh token 是纯增量改动

**JWT secret 管理**：存 Railway 环境变量；轮换流程 —— dashboard 改 env →
所有用户重登（登出到重登时间窗内 401）。写进 `CLAUDE.md` 的运维部分。

---

### D-PY5 — Rate limit 存储 = Postgres 计数器（不引入 Redis）

**决定**：rate limit 实现在 Postgres 里做。

- `user` 表加 `llm_calls_this_window: INT`, `window_start_at: TIMESTAMPTZ`
- FastAPI middleware 每次 LLM 调用前 `UPDATE ... WHERE window_start_at
  - interval '1 minute' > now() AND llm_calls_this_window < 10`
- 超限 → 返回 429

**备选考虑**：

- β 进程内内存 dict：单实例 OK 但重启丢失，恶意用户可以通过重启刷接口
- γ Redis (Upstash 免费 10k/天)：业界标准，学到 Redis INCR/EXPIRE，但多
  一个 vendor

**选这个的理由**：

- 本项目流量级别（DAU 2k → 月 33k 调用 ≈ 每秒不到 1 次），Postgres
  UPDATE 不成瓶颈
- 不引入第三个 vendor，solo dev 最友好
- "用 Postgres 实现 rate limit" 本身是 Python 后端经验一部分
- 未来要升 Redis 是纯重构，schema 不用改

---

### D-PY6 — 共享库：细粒度三元组 unique key

**决定**：`shared_cache` 表（近似 schema，精确 DDL 留给架构）：

```sql
CREATE TABLE shared_cache (
  id BIGSERIAL PRIMARY KEY,
  source_text TEXT NOT NULL,
  source_lang TEXT NOT NULL,   -- ISO 639-1 "en" / "zh-CN" / "ja"
  target_lang TEXT NOT NULL,
  translation TEXT NOT NULL,
  model TEXT NOT NULL,         -- 哪个模型出的；便于未来升级重翻
  hit_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (source_text, source_lang, target_lang)
);
CREATE INDEX idx_shared_cache_lookup
  ON shared_cache (source_text, source_lang, target_lang);
```

**备选考虑**：

- **粗粒度** `UNIQUE(source_text, target_lang)`：隐含"所有语言同形词
  合并为一条"；"chat" 在 en 和 fr 不同义
- **JSON blob** `translations = {zh, ja, en}`：UPDATE 并发竞态难处理
- **按母语对分表** `shared_cache_en_zh`...：维护噩梦

**选这个的理由**：三元组 unique 让 Postgres `ON CONFLICT DO NOTHING` 一行
解决并发；命中率对每种 (src, tgt) 独立最优；存储成本 ~10 MB / 50k 条目
极低；新增语种 schema 不动。

---

### D-PY7 — 支持语言 = CN / JA / EN / FR 四语（2026-04-25 修订）

**决定**：将 native_language 支持范围从 3 语（CN/JA/EN）扩到 **4 语
（CN/JA/EN/FR）**。

**Why now**：用户 2026-04-25 反馈"目前我有一个失误，我想做中日英法这四
个语言"，原 3 语决定是早期遗漏，FR 是同等重要的目标语言。

**改动范围**：

- `user.native_language` CHECK 约束加 `'fr'`（一行 migration）
- `DR_STRINGS<Lang>` 扩到 4 套；FR 翻译用 LLM 初稿 + 抽检（~1.5-2 天）
- Welcome 屏 4 旗帜布局（🇨🇳 / 🇯🇵 / 🇺🇸 / 🇫🇷，1×4 或 2×2）
- v3.1 RAG seed (Wikidata) 过滤条件加 `has_label('fr')`（一行）
- v3.1 Prompt few-shot 加 4 条 FR 相关语言对（en→fr / zh→fr / ja→fr / fr→zh）

**未受影响**：`shared_cache` / `terminology` / `user_vocab` / `llm_request_log`
的 `source_lang` / `target_lang` 字段本就是 ISO 639-1 字符串，无枚举约束；
共享库三元组 unique 自动隔离 FR 数据。

**备选考虑**：

- 维持 3 语，FR 列入 v3.x backlog：MVP 简单但产品广度信号弱
- 5+ 语（加 ES / DE）：YAGNI，FR 是用户明确诉求

**Eval 范围**：MVP 的 BLEU + judge eval **仍然只覆盖 zh/ja**，FR 作为
"产品已支持的扩展性"证据，不进 eval 数据集（D-AI16）。

**工作量**：~3.5-4.5 天，落在 v3.1 时间预算的 1 周 buffer 内。

---

### D73 — 母语一体化：UI 语言 = 翻译目标语

**决定**：`settings.native_language: "zh-CN" | "ja" | "en" | "fr"` 这一
个字段同时驱动（D-PY7 后扩到 4 值）：

1. 侧边栏 UI 显示语言（`DR_STRINGS<Lang>` 扩到 4 语）
2. 划词翻译的目标语言（替代现在硬编码的 `"zh-CN"`）

**备选考虑**：

- b 拆两字段（`native_language` + `ui_language`）：灵活性换心智负担；
  边缘场景不值得在首版做
- c 显式选源语言：Google Translate 自动检测够准

**选这个的理由**：CN / JA / EN / FR 四选下 a 覆盖 95%+ 真实场景；设置少 =
新用户摩擦低；未来加 `ui_language` 独立开关是纯加法。

**迁移**：v2.x 老用户的 `settings.ui_language` 在 `onInstalled`
reason === "update" 时映射为 `settings.native_language`（同值），删老
字段，幂等。

---

### D74 — Welcome 屏强制英文，单问"你的母语是？"

**决定**：

- Welcome 屏保留（不零点击 onboarding）
- **Welcome 屏本身强制英文**（用户还没选母语，中立语言兜底）
- 三个大按钮 🇨🇳 中文 / 🇯🇵 日本語 / 🇺🇸 English
- 点击 → 写 `settings.native_language` → 整个侧边栏 UI 立即切该语言 →
  `first_run_completed = true`

**备选考虑**：

- 零点击（读 `chrome.i18n.getUILanguage()` 自动猜）：猜错了用户不知道
  能改
- Welcome 屏也多语言：用户还没选就读母语，循环论证

**选这个的理由**：三个旗帜最直观；单问题 + 即时反馈 = 新用户信心；欢迎
屏只写一份英文文案。

---

### D75 — 首次登录：询问是否合并本地 vocab

**决定**：匿名用户首次点登录后，若本地 `chrome.storage.sync` 有 ≥ 1 个
vocab 条目，弹一次 modal：

```
检测到本地有 N 个词，要合并到你的账号吗？
[合并] [放弃本地] [以后再说]
```

- **合并**：遍历本地 `v:*` → 单次后端批量 upsert（POST
  `/vocab/bulk_upsert`）→ Postgres `INSERT ... ON CONFLICT DO UPDATE`
  比较 `updated_at` 保新的 → 成功后本地从 `sync` 迁到 `local`
- **放弃本地**：后端拉下云端数据覆盖本地 matcher；本地 `sync` 的 `v:*`
  **不主动删**，登出后自动恢复使用
- **以后再说**：登录但不同步，状态栏黄色横条提示"本地数据未同步"；
  Settings 加"立即合并"按钮

**备选考虑**：

- α 自动合并：用户可能不想把本地试水的词带进账号
- γ 强制云端为准：早期用户本地攒了一堆词，登录即丢会激怒用户
- δ 手动从 Vocab 页点上传：大多数用户发现不了这个按钮

**选这个的理由**：知情同意；三选给足退路；只问一次（以后再说也记录"曾
问过"，不反复打扰）。

---

### D76 — 登出保留本地副本

**决定**：登录用户登出时，云端同步下来的 vocab 继续留在
`chrome.storage.local`，高亮继续工作，新加的词只写本地；下次登录再走
合并流程。

**备选考虑**：

- ii 登出清空本地：隐私干净但"登出 = 词没了"反常识
- iii 询问：多一次弹窗

**选这个的理由**：符合 Gmail / Slack 主流行为（本地草稿不动）；登出 ≠ 删号；
离线也能继续用高亮。

---

### D77 — Timestamp-based Last-Write-Wins

**决定**：每个 `user_vocab` 行带 `updated_at`（Postgres `TIMESTAMPTZ`）。
跨设备写冲突时，后端 `INSERT ... ON CONFLICT (user_id, word_key) DO
UPDATE ... WHERE EXCLUDED.updated_at > user_vocab.updated_at` 保留较新。

**备选考虑**：

- x 朴素 LWW：两设备几乎同时写 note，顺序取决于到达顺序
- z 冲突检测 + 合并 UI：过度设计

**选这个的理由**：y 是 x 的精确化，实现成本几乎相同；Chrome Sync 本身
就是 per-key LWW（与历史决策 D13 一致）；用户对"最近修改生效"有自然
直觉。

---

### D78 — 存储分层：登录用户 `storage.local`，匿名 `storage.sync`

**决定**：

- **匿名用户**：vocab 继续存 `chrome.storage.sync` 的 `v:*` 键（现状，
  依靠 Chrome Sync 跨设备）
- **登录用户**：vocab 迁到 `chrome.storage.local` 的 `v:*` 键；后端
  `user_vocab` 表是**跨设备同步唯一 source of truth**
- **登录状态切换的 migration**：
  - 匿名 → 登录：D75 合并 / 覆盖 / 推迟三选一，成功后从 `sync` 迁到
    `local`（同 key，不同 area）
  - 登录 → 登出：`local` 数据保留，不回迁 `sync`（避免再次冲突），新增
    词继续写 `local`
  - 登出状态新词不跨设备（与匿名用户行为一致，用户知情）

**备选考虑**：

- 所有用户留 `sync`：后端 + Chrome Sync 双向同步 = 冲突翻倍；`sync` 512
  item / 100 KB 硬顶迟早爆
- 登出后回迁 `sync`：又一次双向合并，容易损坏数据

**选这个的理由**：同一时刻 vocab 只有一个权威源；`sync` quota 不再是登录
用户的上限；匿名用户完全不动，零回归风险。

---

### D79 — LLM 主模型 Claude Haiku 4.5；单点可切

**决定**：

- MVP 主选 **Claude Haiku 4.5**（翻译质量最高，尤其 EN→CN）
- 后端 LLM 调用做成**单入口 abstraction**，切换模型只改一个 const
- **Prompt caching 默认开**（system prompt 80 tokens cached，成本降到 1/10）
- Prompt 极简：`"Translate the following {src} text to {tgt}. Return only
the translation, no explanation.\n\n{text}"`

**备选考虑**：

- Gemini 2.5 Flash：便宜 ~3x，质量略低
- GPT-4o mini：便宜 ~8x，质量进一步低
- Haiku + 按长度路由：成本差异绝对值太小不值得复杂度

**选这个的理由**：DAU 2k 月成本 ~$2.7，Flash 省下只有 $1.35 / mo，不足
换质量；单点切换保留未来省钱 option value。

---

### D80 — MVP 不做翻译质量反馈

**决定**：shared_cache 的 (source, src_lang, tgt_lang) → translation
**首写即终**，不加 👍👎 / vote / user override。

**备选**：vote 字段（数据模型 +1 维，UI +N 按钮，防刷投票）；用户改译
（个人覆盖 vs 社区覆盖政策复杂）。

**选这个的理由**：MVP 证明核心价值；首写即终最差也是 Haiku 级别质量；
留作 v3.x 增量，schema 不冲突。

---

### D81 — MVP 不做 keep-warm（Railway 常驻无需）

**决定**：不加定时 ping；Railway Hobby Plan 是常驻容器，本来就没有冷启动
问题。唯一的"冷启动"是容器首次启动或 Railway 平台重启后的 ~10 s，发生
频率极低。

**理由**：YAGNI；相比 Serverless 路线（Lambda / Cloud Run）本来就是
Railway 路线的内建优势。

---

## 7. Non-Functional Requirements

### NFR-1 性能

| 场景                          | 目标                                        |
| ----------------------------- | ------------------------------------------- |
| 登录用户 LLM 翻译首字         | < 800 ms                                    |
| 登录用户 LLM 翻译完整响应     | < 2 s                                       |
| 共享库命中返回（hot path）    | **< 80 ms**（Railway 常驻 + Postgres 索引） |
| Google Translate 托底（匿名） | 300–800 ms（现状）                          |
| 扩展端选中 → 显示 loading     | < 50 ms（本地现状）                         |
| 后端容器启动（冷启动）        | ~10 s，仅 Railway 重启时发生                |

### NFR-2 规模

| 时期       | DAU   | 登录 DAU (15%) | 日 LLM 次数 |
| ---------- | ----- | -------------- | ----------- |
| 上线 1 月  | 100   | 15             | ~260        |
| 上线 6 月  | 500   | 75             | ~280        |
| 上线 12 月 | 2,000 | 300            | ~1,125      |
| 上线 24 月 | 5,000 | 750            | ~2,810      |

共享库稳态 85% 命中，冷启 30%。

### NFR-3 安全 / 隐私

- LLM API key 只存 Railway 环境变量；扩展包、client source、git repo
  永远看不到
- JWT secret 同理；日志中间件剥 Authorization header
- `user_vocab` 查询必带 `WHERE user_id = :current_user_id`（FastAPI
  dependency 注入）
- `shared_cache` 全员可读，写只走后端路径
- 全程 SQLAlchemy ORM 或 asyncpg 参数化查询，禁止字符串拼 SQL
- Google access token 只在 `/auth/exchange` 上用，之后不再存
- Privacy policy 更新："登录后划词文本会发给我们的后端 + LLM provider"
- 匿名用户隐私承诺不变：本地数据不离开浏览器（除 Google Translate 一次
  请求）
- 删账号级联删 `user_vocab`（GDPR 合规基线）
- LLM 请求 log 保留 30 天

### NFR-4 可靠性 / 降级

- Railway / 后端整体不可用 → 登录用户降级 Google Translate；侧边栏显式
  提示"AI 服务暂时不可用"
- LLM provider 5xx → 后端 except → 同样降级 Google
- Postgres 不可达 → 服务 503 → 扩展降级 Google
- Rate limit (10/分钟) 超限 → 429 → 客户端提示"太快了，请稍等"
- 匿名用户对后端完全不依赖（γ 模式白送）
- `chrome.storage.local` 损坏（极罕见）→ 下次登录从后端拉回

### NFR-5 运维

- 单 dashboard（Railway）管 后端 / DB / logs / metrics / env vars
- Railway 内置 usage alert at 80% 月 credit → 邮件
- **$20/mo 硬上限**：Railway cap + LLM provider 独立 cap（双保险）
- GitHub Actions CI：pytest + typecheck + ruff lint 过才允许部署
- Railway 自动 rollback：部署失败保留上一版
- Dependabot 自动开依赖更新 PR

### NFR-6 数据保留

| 数据                   | 保留策略                                                    |
| ---------------------- | ----------------------------------------------------------- |
| `shared_cache`         | **永久**（核心资产）                                        |
| `user_vocab`           | 用户删账号 → 级联删                                         |
| LLM 请求 log           | 30 天                                                       |
| `chrome.storage.local` | 登出不删（D76），删账号也不主动清（不信任 client 执行删除） |

---

## 8. Cost Model

### 8.1 参数

| 参数              | 值                                        |
| ----------------- | ----------------------------------------- |
| 人均每日划词      | 25 次                                     |
| 登录转化率        | 15%                                       |
| 共享库稳态命中率  | 85%                                       |
| 冷启期命中率      | 30%（月 1）→ 50%（月 3）→ 85%（月 6）     |
| LLM token（单词） | in 25 / cached sys 80 / out 10            |
| Haiku 价          | $1 / M in · $0.10 / M cached · $5 / M out |

### 8.2 单次 LLM 调用成本

- system prompt cached：`80 × 0.10 / 1M = $0.000008`
- user input：`25 × 1.00 / 1M = $0.000025`
- output：`10 × 5.00 / 1M = $0.00005`
- **单次 ≈ $0.00008**

Gemini Flash 同算 ~$0.00004；GPT-4o mini 同算 ~$0.00001。

### 8.3 稳态月成本（85% 命中）

| 时期  | DAU   | 登录 DAU | 月 LLM 次数 | Haiku    | Flash | 4o-mini |
| ----- | ----- | -------- | ----------- | -------- | ----- | ------- |
| 6 月  | 500   | 75       | ~8,400      | **$0.6** | $0.3  | $0.1    |
| 12 月 | 2,000 | 300      | ~33,700     | **$2.7** | $1.35 | $0.34   |
| 24 月 | 5,000 | 750      | ~84,400     | $6.6     | $3.3  | $0.84   |

### 8.4 冷启期（头 3 月）

| 月  | 登录 DAU | 命中率 | 月 LLM 次数 | Haiku 月成本 |
| --- | -------- | ------ | ----------- | ------------ |
| 1   | 15       | 30%    | ~7,900      | **$0.6**     |
| 2   | 38       | 40%    | ~17,000     | **$1.4**     |
| 3   | 60       | 50%    | ~22,500     | **$1.8**     |

Seed 脚本一次性成本：12k 条目 × $0.00008 = **$0.96**，把第 1 月命中率从
30% 拉到 60%+，实际月 1 成本降到 **~$0.3**。

### 8.5 Railway 配额 vs 用量

Railway Hobby Plan 的计费模型是 **$5 免费 credit / 月 + 按 usage 扣费**：

| 资源             | Hobby 免费额度 | DAU 2k 预估用量 | 临界 DAU                 |
| ---------------- | -------------- | --------------- | ------------------------ |
| 后端 CPU / RAM   | $5 credit 共用 | ~$3/mo          | DAU ~2–3k 时 credit 打平 |
| Railway Postgres | 同上共用 1 GB  | ~30 MB          | **~DAU 5k**（超 1 GB）   |
| Egress           | 100 GB/mo      | ~1 GB           | 远未触发                 |

临界后路径：Hobby → **Railway Pro $20/mo**（容量翻倍 + 优先资源）。

### 8.6 总月成本汇总（Python 路线）

| 阶段                | LLM  | Railway           | 其他 | 总          |
| ------------------- | ---- | ----------------- | ---- | ----------- |
| 冷启月 1（w/ seed） | $0.3 | $0（credit 内）   | —    | **< $1**    |
| 冷启月 3            | $1.8 | $0–2              | —    | **~$2–4**   |
| 稳态 6 月           | $0.6 | $0–3              | —    | **~$1–4**   |
| 稳态 12 月          | $2.7 | $3–8（超 credit） | —    | **~$6–11**  |
| 规模 24 月          | $6.6 | $15–20            | —    | **~$22–27** |
| 规模 DAU 10k        | $14  | $20（Pro 触顶）   | —    | **~$34**    |

### 8.7 关键洞察

1. **LLM 不是主要成本项**。到 DAU 5k 月 LLM ~$6.6；Railway 的机器租金
   ($5 credit 外的超支) 才是数量级主导。
2. **Railway Hobby Plan 头几个月可能 $0**（用量在 $5 免费 credit 内）。
3. **Python 路线无冷启动**：Railway 常驻容器 = 首次请求和第 1000 次请求
   延迟一样（这对 LLM 本身 2s 延迟的对比不显眼，但对共享库命中那条 80ms
   hot path 至关重要 —— 无冷启动意味着 95% 的划词响应迅速）。
4. **$20/mo 硬上限能 cover 到 DAU ~8k**。
5. **Haiku vs Flash / 4o-mini 成本差异绝对值小**，质量差对核心诉求更重要
   → 主选 Haiku。
6. **一年内破产的唯一路径** = rate limit 漏洞被刷。per-user 10/分钟是
   兜底（R11）。
7. **Seed 数据 $1 的 ROI 极高**，把冷启期痛降到几乎无感。
8. **无共享库的反事实**：DAU 2k 月 LLM $18，DAU 5k $45 —— 共享库规模
   经济意义在此。
9. **Python 路线 vs Serverless 路线成本对比**：前期 Python 路线贵 $3–5/mo
   （机器地板价），后期更平滑（Pro Plan $20 vs Serverless 配额阶跃更和缓）；
   总差距在 $5–10/mo 范围，绝对值对个人项目不成压力。

---

## 9. Understanding Lock

本文档所有章节已完整覆盖 brainstorming skill 要求：

- ✅ 当前项目状态评审（§0 raw input；`DESIGN.md` + v2.1.x 文档已读）
- ✅ 决策逐项多选 + 明确理由（D68–D81 共 14 条，含 D-PY1–D-PY6 六条
  Python 路线特有决策）
- ✅ Non-Functional Requirements（§7 六类）
- ✅ Assumptions（A1–A11 显式）
- ✅ Open Questions（OQ1–OQ6 非阻塞）
- ✅ Risks（R10–R15 + R-PY1–R-PY4）
- ✅ Cost Model（§8 含敏感性、路线对比）
- ✅ 显式非目标（§2.5）

**Understanding Lock 准备就绪**。用户已对所有核心决策显式同意（Q1–Qfinal

- Q-P1–Q-P3）；成本模型、后端语言选型、版本号均已敲定。

---

## 10. Handoff to Architect

本文档**不包含**以下内容，留给 architect skill 展开：

**后端架构**

- FastAPI 路由组织（单 app vs 多 router；`/auth` / `/translate` / `/vocab`
  分模块）
- `shared_cache` / `user_vocab` / `user` 完整 DDL（含索引、约束、外键、
  cascade）
- SQLAlchemy model 设计 vs asyncpg 直驱的取舍
- Alembic migration 初始化流程
- JWT secret 生成 + 轮换 runbook
- FastAPI dependency 的 auth middleware 精确实现（过期 / signature /
  user_id 注入）
- Rate limit 的 Postgres 计数器事务细节（`SELECT FOR UPDATE` vs `UPDATE
... RETURNING`）
- LLM provider SDK 调用 + prompt cache 具体实现
- Google token 验证（`google-auth` vs `google-auth-oauthlib`）
- 错误处理 / 日志 / observability（结构化日志 / request ID / trace）
- LLM 请求日志表 schema + 30 天清理 cron

**扩展端**

- Auth state 管理（JWT 过期侦测 / 401 重试 / 重登流程）
- Vocab 双写 / 冲突 / timestamp 的精确协议
- 本地 → 云端合并的事务边界（合并失败回滚 `chrome.storage.local.pre_merge_backup`）
- 登录按钮放哪、合并 modal 的文案 / 层级、错误态视觉
- `DR_STRINGS` 四语扩展（哪些 key、日文 + 法语翻译来源）
- Welcome 屏重做（旗帜 icon 来源、尺寸、键盘 tab 顺序）

**基础设施 / CI/CD**

- Dockerfile（Python 3.12 slim / poetry 或 uv / 启动命令）
- Railway 部署配置（`railway.json` / env vars / build / start）
- GitHub Actions（test gate + deploy + 分 stage 还是 prod 直推）
- Seed 脚本执行流程（CSV 来源 / 并发度 / 去重 / idempotent）

**测试**

- FastAPI 单测（pytest-asyncio + httpx TestClient）
- Postgres 集成测试（pytest-postgresql 或 testcontainers）
- 扩展端 mock 后端的 contract 测试
- E2E 测试策略（Playwright extension？手动？）

**下一步**：运行 architect skill，以本文档作为唯一输入，产出实现计划。

---

## 11. Cross-reference to Existing DESIGN.md

本轮推翻 / 修正 / 超越的历史决策：

| DESIGN.md 决策                                           | v3.0 Python 路线后的状态                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| D7（CN↔EN only）                                         | **推翻** → D73/D74/D-PY7 四语母语一体化（CN/JA/EN/FR）                      |
| D11（无 Supabase / 无后端）                              | **推翻** → D-PY2/D-PY3 Railway + Postgres                                   |
| D12（无 auth）                                           | **推翻** → D72/D-PY4 Google OAuth + 自签 JWT                                |
| D22（默认 zh-CN）                                        | **取代** → D74 Welcome 让用户选                                             |
| R1（Google Translate 非官方端点风险）                    | **继承**；匿名路径仍依赖                                                    |
| R2（500 词 sync quota）                                  | **实质解决**（登录用户走 storage.local + 后端 DB，D78）；匿名用户仍继承     |
| v1.1 candidate "Opt-in Supabase sync"                    | **兑现路径变更**（本路线走 Railway Postgres 而非 Supabase，但产品效果相同） |
| v1.1 candidate "AI tutor tab (Gemini user-supplied key)" | **超越**（v3.0 后端托管 LLM，不再 user-supplied key）                       |

---

_End of v3.0 brainstorm (Python 路线)._
