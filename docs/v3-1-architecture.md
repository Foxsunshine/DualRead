# DualRead v3.1 Architecture

> 2026-04-25。本文档是 v3 系列的**完整架构真相源**，合并：
> - `docs/v3-0-brainstorm-python.md` — 产品骨架决策（D68-D81 + D-PY1 ~ D-PY7）
> - `docs/v3-1-ai-engineering-brainstorm.md` — AI 工程层决策（D-AI1 ~ D-AI16）
>
> **2026-04-25 同日修订（一）**：原 3 语（CN/JA/EN）扩为 4 语
> （CN/JA/EN/FR），详见 ADR-A19 + 决策 D-PY7 + D-AI16。
>
> **2026-04-25 同日修订（二）**：仓库公开策略锁定 = **3 repo 拆分**
> （扩展 + web 公开 / backend 私有），详见 ADR-A20 + A21 + A22 + A23。
> 新增 Phase 0（W1 早，半天）= repo 拆分 + 4 层 secret 防御就位。
>
> 本文档**取代** 早期的 `docs/v3-0-architecture.md`（仅讲产品骨架，未含 AI
> 工程层）。读完本文档无需再回查 v3.0 architecture。
>
> **目标读者**：v3.1 的 architect / 实装 skill / 未来回头看演进的自己。
>
> **不含代码**；schema 是 markdown 表格 + pseudo-DDL；prompt 是模板草稿；
> API 是契约描述。
>
> **阅读顺序建议**：§1 上下文 → §2 组件总览 → §3 数据模型 → §4 关键数据流
> → §5 API 契约 → §6 模块布局 → §7 部署 → §8-§10 横切（错误 / 安全 /
> 观测）→ §11 ADR → §12 Roadmap → §13-§16 收尾。

---

## 1. 上下文 / 架构目标

### 1.1 系统边界

v3.1 的系统由五个自治单元组成：

```
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  Chrome 扩展     │    │  DualRead 后端   │    │  外部依赖        │
│  (TS, MV3)       │◄──►│  (FastAPI,       │◄──►│  · Google OAuth  │
│                  │    │   Railway)       │    │  · Anthropic     │
│  content /       │    │                  │    │    (Haiku/Sonnet)│
│  background /    │    │  + Postgres      │    │  · OpenAI        │
│  sidepanel       │    │    (Railway,     │    │    (embeddings)  │
└──────────────────┘    │     pgvector)    │    │  · Google        │
                        │                  │    │    Translate     │
┌──────────────────┐    │  + LangGraph     │    │    (匿名 only)   │
│  Next.js Web     │    │     agent        │    │  · Langfuse      │
│  (Vercel)        │    │                  │    │    Cloud         │
│                  │◄──►│                  │    └──────────────────┘
│  Landing /       │    │                  │           ▲
│  Admin           │    │                  │           │ traces
└──────────────────┘    │                  │───────────┘
        ▲               └──────────────────┘
        │ Cloudflare Access (admin auth)
        │
   面试官 / 用户本人
```

### 1.2 架构目标（按优先级）

继承 v3.0 + 新增 AI 工程目标：

1. **匿名用户路径零退化**：后端 / agent / RAG 全挂时 v2.1.1 行为依旧工作
2. **共享库 = AI 成本护城河**：登录用户翻译先精确命中、再 RAG、最后 LLM
3. **Agent 三步可降级**：单节点失败逐级 fallback，不抛错给用户
4. **每个 LLM 调用可观测**：节点级 trace + token + latency + cache_hit
5. **Eval 数字可信、可溯**：BLEU 自动化 + judge 可重现，不 cherry-pick
6. **简历叙事干净**：每个组件都有可演示 demo（agent trace / eval report /
   admin dashboard）
7. **solo dev 可维护**：单语言栈（Python + TS）+ 三 vendor（Railway /
   Vercel / Langfuse）
8. **模块可拆**：未来 Langfuse Cloud → 自托管 / Railway → Cloud Run / 加
   β 难度评估，全部纯增量

### 1.3 设计原则

- **Start simple, add complexity only when proven necessary**
- 不做：Repository pattern / Clean Architecture / CQRS / 微服务 / 消息队列 /
  Redis（rate limit 用 Postgres）/ WebSocket（pull-based 同步）
- 后端：单体 FastAPI + Transaction Script + 直用 SQLAlchemy ORM
- LangGraph：先做最简线性 chain，避开 conditional edges / cycles
  （β 阶段加分支再说）

---

## 2. 组件总览

### 2.0 Repo 拆分（ADR-A20）

v3.1 由**三个独立 git repo** 组成：

| Repo | 可见性 | 内容 |
|---|---|---|
| `dualread` | **PUBLIC** | Chrome 扩展（`src/`）+ 架构文档（`docs/`）+ README |
| `dualread-web` | **PUBLIC** | Next.js Landing + Admin UI（`web/`） |
| `dualread-backend` | **PRIVATE** | FastAPI + agent + RAG + eval + scripts + alembic（`backend/`） |

理由详见 ADR-A20。下面三小节按 repo 分别描述。

### 2.1 扩展端（v2.1.1 基础上增量）— Repo: dualread (PUBLIC)

```
src/
├── content/
│   ├── index.ts              # + JWT-aware fetch；登录态走后端 agent
│   ├── clickTranslate.ts     # 不变
│   ├── bubble.ts, hoverReducer.ts, toast.ts, highlight.ts  # 不变
│   └── ...
├── background/
│   ├── index.ts              # + auth state 路由；选 backend or Google
│   ├── vocab.ts              # + 登录态下双写 storage.local + 后端
│   └── auth.ts ✚ 新          # chrome.identity + JWT lifecycle
├── sidepanel/
│   ├── screens/
│   │   ├── Welcome.tsx       # 改造：三旗帜母语选择
│   │   ├── Settings.tsx      # + 登录块、母语切换、登出
│   │   └── MergeModal.tsx ✚  # D75 首次登录合并决策
│   ├── hooks/
│   │   └── useAuth.ts ✚      # JWT + Google token lifecycle
│   └── i18n.ts               # DR_STRINGS 扩到 4 语 (zh/ja/en/fr)
└── shared/
    ├── messages.ts           # + AUTH_*, GET_TAB_ID 等
    ├── types.ts              # + native_language, source_lang
    └── api.ts ✚ 新           # 后端 fetch 封装 + JWT 注入 + 401 刷新
```

### 2.2 后端（FastAPI 单体，新加 AI 工程子模块）— Repo: dualread-backend (PRIVATE)

```
backend/
├── app/
│   ├── main.py                  # FastAPI 装配、中间件、路由注册
│   ├── config.py                # pydantic-settings
│   ├── db.py                    # async engine + session factory
│   ├── models/                  # ORM 模型
│   │   ├── user.py
│   │   ├── shared_cache.py      # 含 embedding vector 列
│   │   ├── user_vocab.py        # 含预埋 cefr_level
│   │   ├── llm_request_log.py   # 含预埋 input_word_cefr
│   │   ├── terminology.py       # ✚ Wikidata seed 库
│   │   ├── eval_run.py          # ✚ eval 历史
│   │   └── eval_sample.py       # ✚ eval 数据集与结果
│   ├── schemas/                 # Pydantic I/O DTO
│   │   ├── auth.py, translate.py, vocab.py
│   │   └── admin.py             # ✚ admin dashboard 用
│   ├── routers/
│   │   ├── auth.py              # POST /auth/exchange
│   │   ├── translate.py         # POST /translate（agent 入口）
│   │   ├── vocab.py             # GET/POST/DELETE /vocab + bulk_upsert
│   │   └── admin.py             # ✚ GET /admin/stats, /cache, /eval
│   ├── services/
│   │   ├── google_auth.py
│   │   ├── jwt_service.py
│   │   ├── cache.py             # shared_cache 精确查询
│   │   ├── rate_limit.py        # Postgres 计数器
│   │   ├── translate_fallback.py  # Google Translate 兜底
│   │   └── llm_provider.py      # Anthropic / OpenAI 客户端 wrapper
│   ├── agent/                   # ✚ LangGraph 模块
│   │   ├── graph.py             # 三节点定义 + state
│   │   ├── state.py             # Pydantic state schema（含预埋字段）
│   │   ├── nodes/
│   │   │   ├── translate_node.py
│   │   │   ├── terminology_rag_node.py
│   │   │   └── style_polish_node.py
│   │   └── prompts/             # LangChain PromptTemplate
│   │       ├── translate.py
│   │       ├── style_polish.py
│   │       └── rerank.py        # RAG 命中后 LLM rerank prompt
│   ├── rag/                     # ✚ RAG 模块
│   │   ├── embedding.py         # OpenAI text-embedding-3-small wrapper
│   │   ├── retriever.py         # pgvector cosine search
│   │   └── reranker.py          # 可选：交给 LLM 重排
│   ├── eval/                    # ✚ Eval 模块（可被 scripts/ 复用）
│   │   ├── bleu.py              # sacrebleu wrapper
│   │   ├── judge.py             # Sonnet judge + rubric
│   │   ├── runner.py            # 跑全 pipeline + 写 eval_run/sample
│   │   └── rubric.py            # 4 维度 prompt 模板
│   ├── observability/           # ✚ Langfuse 集成
│   │   ├── langfuse_client.py
│   │   └── pii_scrub.py         # SHA256(google_sub) hash util
│   ├── deps.py                  # current_user, db_session
│   ├── middleware/
│   │   ├── request_logger.py    # 结构化日志 + Authorization 剥除
│   │   ├── rate_limit_ip.py     # IP-level（防 /auth 刷）
│   │   └── langfuse_trace.py    # request_id 注入 + trace 标注
│   └── errors.py
├── alembic/                     # migration
│   ├── env.py
│   └── versions/
│       ├── 0001_initial.py      # user / vocab / cache / log 四表
│       ├── 0002_add_pgvector.py # CREATE EXTENSION + cache.embedding
│       ├── 0003_add_terminology.py
│       ├── 0004_add_eval_tables.py
│       └── 0005_predef_b_hooks.py  # cefr_level 字段
├── scripts/
│   ├── seed_terminology.py      # Wikidata + Wiktionary 一次性灌库
│   ├── audit_terminology.py     # LLM 质量审核 + 去重
│   ├── seed_eval_dataset.py     # 自建 + WMT 数据加载
│   ├── generate_references.py   # Claude Opus 打 reference
│   ├── log_cleanup.py           # 30 天日志清理
│   └── eval_local_run.py        # 本地手动跑 eval
├── tests/
│   ├── unit/                    # services / agent nodes（mock LLM）
│   ├── integration/             # FastAPI + 真 Postgres
│   ├── eval/                    # eval pipeline 自测
│   └── conftest.py
├── pyproject.toml               # uv 推荐
├── Dockerfile
├── railway.json
└── .env.example
```

### 2.3 Next.js Web（新增独立项目）— Repo: dualread-web (PUBLIC)

```
web/
├── app/                         # Next.js 14+ app router
│   ├── (marketing)/
│   │   ├── page.tsx             # / Landing
│   │   ├── about/page.tsx
│   │   └── privacy/page.tsx
│   ├── admin/                   # 受 Cloudflare Access 保护
│   │   ├── layout.tsx
│   │   ├── page.tsx             # /admin 总览
│   │   ├── cache/page.tsx       # /admin/cache 共享库浏览
│   │   ├── eval/page.tsx        # /admin/eval BLEU + judge 趋势
│   │   ├── users/page.tsx       # /admin/users 用户列表
│   │   └── traces/page.tsx      # /admin/traces 嵌 Langfuse iframe
│   └── layout.tsx
├── components/                  # shadcn-ui
├── lib/
│   ├── api.ts                   # 调 FastAPI /admin/*
│   └── auth.ts                  # 验 Cloudflare Access JWT
├── package.json
├── next.config.js
├── tailwind.config.ts
└── vercel.json
```

### 2.4 组件职责矩阵

| 组件 | 负责 | 不负责 |
|---|---|---|
| `content/` | 划词 / 高亮 / 气泡 / hover | 翻译 API 选择（交 background）|
| `background/` | auth 状态、路由翻译请求、vocab 本地持久化 | UI 渲染、划词检测 |
| `sidepanel/` | 登录 UI、母语设置、Vocab 列表、合并 modal | 翻译调用（交 background）|
| `shared/api.ts` | 后端 fetch、JWT 注入、401 刷新 | 业务逻辑 |
| FastAPI `routers/` | HTTP 协议层 | 业务规则 |
| FastAPI `services/` | 业务规则（精确缓存、rate limit、tokens）| HTTP / Pydantic |
| FastAPI `agent/` | LangGraph 编排 + 节点 prompt | 数据库 I/O |
| FastAPI `rag/` | embedding + 向量检索 | LLM 调用本身（agent 调）|
| FastAPI `eval/` | BLEU / judge 计算 | 数据集存储（DB models 负责）|
| FastAPI `observability/` | Langfuse trace + PII scrub | 业务流程 |
| Next.js `app/(marketing)/` | Landing / privacy / about | Admin |
| Next.js `app/admin/` | dashboard / charts / iframe | 直接 query DB（走 FastAPI admin API）|

---

## 3. 数据模型

### 3.1 ER 图

```
   ┌─────────┐       ┌──────────────┐
   │  user   │──1:N──│  user_vocab  │
   │ (PK sub)│       │ (含 cefr 预埋)│
   └─────────┘       └──────────────┘
        │
        │ 1:N
        ▼
   ┌──────────────────┐
   │ llm_request_log  │
   │ (含 input_cefr)  │
   └──────────────────┘

  ┌────────────────────────┐    ┌─────────────────┐
  │   shared_cache         │    │  terminology    │
  │ + embedding vector(1536)│    │ + embedding     │
  │ UNIQUE(text,src,tgt)   │    │ vector(1536)    │
  └────────────────────────┘    │ (Wikidata seed) │
                                └─────────────────┘
              （都通过 RAG retriever 查询）

  ┌─────────────┐       ┌──────────────────┐
  │  eval_run   │──1:N──│   eval_sample    │
  │ (一次跑)    │       │ (300+200 dataset)│
  └─────────────┘       └──────────────────┘
```

### 3.2 表结构

#### `user` （继承 v3.0，**新增** native_language 默认值由 Welcome 写入）

| 列 | 类型 | 约束 |
|---|---|---|
| `sub` | TEXT | **PK** |
| `email` | TEXT | NOT NULL |
| `native_language` | TEXT | NOT NULL CHECK IN ('zh-CN','ja','en','fr') DEFAULT 'en' |
| `tier` | TEXT | NOT NULL DEFAULT 'free' CHECK IN ('free','pro') |
| `llm_calls_in_window` | INT | NOT NULL DEFAULT 0 |
| `window_start_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |
| `last_seen_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

#### `user_vocab` （继承 v3.0 + **预埋** D-AI3）

| 列 | 类型 | 约束 |
|---|---|---|
| `id` | BIGSERIAL | **PK** |
| `user_sub` | TEXT | NOT NULL FK → user(sub) ON DELETE CASCADE |
| `word_key` | TEXT | NOT NULL |
| `source_text` | TEXT | NOT NULL |
| `source_lang` | TEXT | NOT NULL |
| `target_lang` | TEXT | NOT NULL |
| `translation` | TEXT | NOT NULL |
| `context_sentence` | TEXT | NULLABLE |
| `source_url` | TEXT | NULLABLE |
| `note` | TEXT | NOT NULL DEFAULT '' |
| `cefr_level` | TEXT | **NULLABLE**（β 阶段使用，A1/A2/.../C2） |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

**索引**：

- `UNIQUE (user_sub, word_key)`
- `INDEX (user_sub, updated_at DESC)`

#### `shared_cache` （**升级** v3.0：加 `embedding` 列 + HNSW 索引）

| 列 | 类型 | 约束 |
|---|---|---|
| `id` | BIGSERIAL | **PK** |
| `source_text` | TEXT | NOT NULL |
| `source_lang` | TEXT | NOT NULL |
| `target_lang` | TEXT | NOT NULL |
| `translation` | TEXT | NOT NULL |
| `embedding` | vector(1536) | NULLABLE（异步填，新写入即填）|
| `model` | TEXT | NOT NULL（如 `claude-haiku-4-5-agent-v1`）|
| `hit_count` | INT | NOT NULL DEFAULT 0 |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

**索引**：

- `UNIQUE (source_text, source_lang, target_lang)` 精确匹配 hot path
- `HNSW (embedding vector_cosine_ops)` —— 参数 `m=16, ef_construction=64`，
  `ef_search` runtime 设 40
- `INDEX (target_lang)` —— RAG 按目标语过滤

#### `terminology` （✚ 新表 — Wikidata + Wiktionary seed 库）

| 列 | 类型 | 约束 |
|---|---|---|
| `id` | BIGSERIAL | **PK** |
| `source_text` | TEXT | NOT NULL |
| `source_lang` | TEXT | NOT NULL |
| `target_lang` | TEXT | NOT NULL |
| `translation` | TEXT | NOT NULL |
| `embedding` | vector(1536) | NOT NULL |
| `domain` | TEXT | NOT NULL（'IT' / 'general' / 'medical' / ...）|
| `source` | TEXT | NOT NULL（'wikidata' / 'wiktionary' / 'manual'）|
| `quality_score` | REAL | NULLABLE（LLM 审核给出 0-1）|
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

**索引**：

- `UNIQUE (source_text, source_lang, target_lang, source)` 防重复 seed
- `HNSW (embedding vector_cosine_ops)`
- `INDEX (target_lang, domain)`

#### `llm_request_log` （继承 v3.0 + **预埋** input_word_cefr + agent 字段）

| 列 | 类型 | 约束 |
|---|---|---|
| `id` | BIGSERIAL | **PK** |
| `user_sub` | TEXT | FK → user(sub) ON DELETE SET NULL |
| `source_text` | TEXT | NOT NULL |
| `source_lang` | TEXT | NOT NULL |
| `target_lang` | TEXT | NOT NULL |
| `model` | TEXT | NOT NULL |
| `cache_hit` | BOOL | NOT NULL（精确缓存）|
| `rag_hit_count` | INT | NOT NULL DEFAULT 0（RAG 命中条目数）|
| `agent_path` | TEXT | NOT NULL（'cache' / 'agent_full' / 'fallback_google'）|
| `latency_ms` | INT | NOT NULL（端到端）|
| `latency_breakdown` | JSONB | NULLABLE（各 node ms）|
| `error_code` | TEXT | NULLABLE |
| `input_word_cefr` | TEXT | **NULLABLE**（β 阶段使用）|
| `langfuse_trace_id` | TEXT | NULLABLE |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

**索引**：

- `INDEX (created_at)` —— 30 天清理 cron
- `INDEX (user_sub, created_at DESC)` —— admin 按用户查最近请求

#### `eval_run` （✚ 新表 — eval pipeline 一次跑的元数据）

| 列 | 类型 | 约束 |
|---|---|---|
| `id` | BIGSERIAL | **PK** |
| `kind` | TEXT | NOT NULL（'bleu_only' / 'judge_only' / 'full'）|
| `commit_sha` | TEXT | NULLABLE（GitHub Action 跑时填）|
| `agent_version` | TEXT | NOT NULL（agent prompt + 模型组合的 hash）|
| `dataset` | TEXT | NOT NULL（'self_300' / 'wmt_200' / 'combined'）|
| `bleu_score` | REAL | NULLABLE |
| `judge_avg` | JSONB | NULLABLE（4 维度均值 {accuracy, terminology, fluency, context_fit}）|
| `cost_usd` | REAL | NOT NULL DEFAULT 0 |
| `started_at` | TIMESTAMPTZ | NOT NULL |
| `finished_at` | TIMESTAMPTZ | NULLABLE |
| `error` | TEXT | NULLABLE |

#### `eval_sample` （✚ 新表 — 数据集 + 单条跑结果）

| 列 | 类型 | 约束 |
|---|---|---|
| `id` | BIGSERIAL | **PK** |
| `eval_run_id` | BIGINT | FK → eval_run(id) ON DELETE CASCADE |
| `dataset` | TEXT | NOT NULL |
| `source_text` | TEXT | NOT NULL |
| `source_lang` | TEXT | NOT NULL |
| `target_lang` | TEXT | NOT NULL |
| `reference_translation` | TEXT | NOT NULL |
| `human_verified` | BOOL | NOT NULL DEFAULT false（calibration set 标记）|
| `agent_translation` | TEXT | NULLABLE |
| `bleu` | REAL | NULLABLE |
| `judge_scores` | JSONB | NULLABLE（4 维度 1-10 + reasoning）|
| `judge_pass_a` | JSONB | NULLABLE（顺序 A→B 的打分）|
| `judge_pass_b` | JSONB | NULLABLE（顺序 B→A 的打分）|

**索引**：

- `INDEX (eval_run_id)`
- `INDEX (dataset, source_lang, target_lang)` 数据集查询

### 3.3 Schema 演化策略

- 全部 Alembic migration 管理；`upgrade head` 部署前跑（Railway
  `releaseCommand`）
- 单向前进；不写 `downgrade`，回滚靠 Railway 旧版部署回退
- 加列向后兼容：先后端兼容读 `NULL` 列 → 部署 → 后续 backfill
- 删列两阶段：先后端不读 → 部署 → migration 真正删

### 3.4 数据量估算（24 月预估）

| 表 | 行数 | 大小 |
|---|---|---|
| `user` | 1.5k | < 1 MB |
| `user_vocab` | ~300k | ~60 MB |
| `shared_cache` | 50k | ~30 MB（embedding 24 KB / 行）|
| `terminology` | 100k | ~250 MB（embedding 24 KB / 行）|
| `llm_request_log` (30 天) | 90k | ~30 MB |
| `eval_run` + `eval_sample` | 100 + 100k | ~30 MB |
| **合计** | — | **~400 MB**（仍在 Railway Postgres 1 GB 免费层）|

⚠️ 关键风险：terminology 100k × 1536 维 float32 ≈ 600 MB（pgvector 不压缩）。
**Mitigation**：seed 只灌 IT + general 双 domain；audit 阶段去重将
terminology 控制在 50k 内（实际尺寸 ~125 MB）。

---

## 4. 关键数据流

### 4.1 匿名用户划词（不变 / 与 v2.1.1 一致）

```
content/clickTranslate → SELECTION_CHANGED → background
                                              │
                                              ▼
                           translate.googleapis.com (非官方)
                                              │
                                              ▼
                                     bubble + sidepanel
```

### 4.2 登录用户划词 — 完整 Agent 路径

```
content → background → POST {BACKEND}/translate
                       Authorization: Bearer <jwt>
                       Body: { text, source_lang?, target_lang }
                              │
                              ▼  [Backend /translate handler]
                       deps.current_user(jwt) → User
                              │
                              ▼
                       deps.rate_limit_check(user) → 超限 → 429
                              │
                              ▼
                       services/cache.lookup(text, src, tgt)
                              │
                          ┌───┴───┐
                          │       │
                       HIT       MISS
                          │       │
                          │       ▼
                          │   agent.run(state)  ← LangGraph 入口
                          │       │
                          │       ▼  ┌──────────────────────────┐
                          │       │  │ Node 1: TranslateNode    │
                          │       │  │ Haiku 出 raw_translation │
                          │       │  └──────────────┬───────────┘
                          │       │                 ▼
                          │       │  ┌──────────────────────────┐
                          │       │  │ Node 2: TerminologyRAG   │
                          │       │  │ 1. embed(text)           │
                          │       │  │ 2. retriever.search()    │
                          │       │  │    over (terminology +    │
                          │       │  │          shared_cache)   │
                          │       │  │ 3. (optional) Haiku       │
                          │       │  │    rerank top-5 → top-3  │
                          │       │  │    matched_terms[]       │
                          │       │  └──────────────┬───────────┘
                          │       │                 ▼
                          │       │  ┌──────────────────────────┐
                          │       │  │ Node 3: StylePolish      │
                          │       │  │ Haiku w/ matched_terms   │
                          │       │  │ + raw → final_translation│
                          │       │  └──────────────┬───────────┘
                          │       │                 │
                          │       │           Langfuse trace
                          │       │           (per-node span)
                          │       │                 │
                          │       ▼                 ▼
                          │   INSERT INTO shared_cache (with embedding)
                          │     ON CONFLICT (text,src,tgt) DO NOTHING
                          │   INSERT INTO llm_request_log (agent_full)
                          │       │
                          ▼       │
                     UPDATE shared_cache.hit_count += 1
                     INSERT INTO llm_request_log (cache)
                          │       │
                          └───┬───┘
                              ▼
                     Response 200: {
                       translation,
                       from_cache: bool,
                       matched_terms: [...],
                       model,
                       degraded: false,
                       trace_id
                     }
                              │
                              ▼  [Extension]
                     bubble + sidepanel 渲染
                     background 缓存到 chrome.storage.session
```

### 4.3 RAG 检索内部流程（Node 2 展开）

```
Input: { text, source_lang, target_lang }
   │
   ▼
1. 是否在精确缓存？（已查过；miss 才到此）
   │
   ▼
2. embedding = OpenAI text-embedding-3-small(text)  [~30 tokens, ~$0.0000006]
   │
   ▼
3. SQL:
   SELECT source_text, translation, source, quality_score,
          embedding <=> :query_embedding AS distance
     FROM (
       SELECT * FROM terminology
       WHERE source_lang = :src AND target_lang = :tgt
       UNION ALL
       SELECT id, source_text, source_lang, target_lang, translation,
              embedding, 'cache' as source, NULL, ... 
         FROM shared_cache
       WHERE source_lang = :src AND target_lang = :tgt
     ) t
   ORDER BY embedding <=> :query_embedding
   LIMIT 5;
   │
   ▼
4. 过滤 distance < 0.3（cosine sim > 0.7）= 阈值（OQA-10 默认 0.7）
   │
   ▼
5. 若 ≤ 1 hit：直接 return（不 rerank，省钱）
   若 ≥ 2 hits：Haiku rerank prompt → 选最相关的 top-3
   │
   ▼
6. matched_terms[] 进入 state，给 Node 3
```

**性能 budget**：Step 2 ~50ms / Step 3 ~50ms (HNSW) / Step 5 ~300ms (Haiku) =
**~400ms 总**（无 rerank ~100ms）。

### 4.4 Eval Pipeline 跑的流程

```
[Trigger]
  - 每 PR 自动跑 BLEU only on 200 sample (CI)
  - 每周 cron 跑 BLEU full on 500 sample
  - Release 前手动跑 full (BLEU + judge)
   │
   ▼
[scripts/eval_local_run.py 或 GitHub Action]
   │
   ▼
1. CREATE eval_run(kind, dataset, agent_version, started_at)
   │
   ▼
2. Load eval_sample.dataset = 'combined' (300 + 200)
   │
   ▼
3. For each sample:
     a. agent.run({text, src, tgt}) → agent_translation
     b. INSERT eval_sample.agent_translation
     c. bleu = sacrebleu.corpus_bleu([agent], [[ref]])
     d. UPDATE eval_sample.bleu = bleu
   │
   ▼
4. If kind in ('full', 'judge_only'):
     For 50 random sample subset (max enforced):
       a. judge_pass_a = sonnet_judge(rubric, agent, ref, order=AB)
       b. judge_pass_b = sonnet_judge(rubric, agent, ref, order=BA)
       c. judge_scores = avg(pass_a, pass_b) per dimension
       d. UPDATE eval_sample.judge_pass_*, judge_scores
   │
   ▼
5. UPDATE eval_run:
     bleu_score = corpus_bleu([all], [[refs]])
     judge_avg = avg per dimension over subset
     cost_usd = sum(api_calls)
     finished_at = now()
   │
   ▼
6. Generate markdown report → eval/reports/eval_run_<id>.md
   git commit + push (CI)
```

### 4.5 多设备 vocab 同步（继承 v3.0 D77）

- 拉模型：扩展启动 `GET /vocab?since=last_synced_at` 拉增量
- 写时 push：每次 `SAVE_WORD` / `DELETE_WORD` 直接 POST 后端
- 冲突 LWW：服务端 `ON CONFLICT DO UPDATE WHERE EXCLUDED.updated_at > existing`

### 4.6 母语切换（v3.0 D75）

- 客户端立即生效（DR_STRINGS 切换 + 下次 target_lang 跟随）
- MVP **不**调 `PATCH /user/me`（D75 / ADR-A8）；登录时 user.native_language
  仅作为初始值

### 4.7 登录 / 登出 / 首次合并

继承 v3.0 §4.2 / §4.5 / §4.7 的所有流程。简要：

- 首次登录：弹 MergeModal（合并 / 放弃本地 / 以后再说）
- 合并成功：本地 `chrome.storage.sync` → `local`，云端为权威
- 登出：清 JWT，本地 `local` 数据保留，新词只写本地

---

## 5. API 契约

所有 JSON。除 `/auth/exchange` 和 `/admin/*` 外都需 `Authorization: Bearer <jwt>`。

### 5.1 Auth

#### `POST /auth/exchange`

**Request**:

| 字段 | 类型 | 必填 |
|---|---|---|
| `google_access_token` | string | ✓ |

**Response 200**:

```
{
  "jwt": "<HS256 signed>",
  "expires_at": 1713542400,
  "user": { "sub", "email", "native_language", "tier" }
}
```

**Errors**: 400 `invalid_google_token` / 401 `google_token_expired` /
503 `google_unreachable`.

### 5.2 Translate（v3.1 升级 — agent 路径）

#### `POST /translate`

**Request**:

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `text` | string | ✓ | 已 strip outer punctuation；硬上限 1000 字符 |
| `source_lang` | string? | | ISO 639-1，缺省由 LLM 推断 |
| `target_lang` | string | ✓ | 通常 = user.native_language |

**Response 200**:

```
{
  "translation": "...",
  "source_lang": "en",
  "target_lang": "zh-CN",
  "from_cache": true,
  "matched_terms": [
    { "term": "embedding", "translation": "嵌入", "source": "wikidata" }
  ],
  "model": "claude-haiku-4-5-agent-v1",
  "degraded": false,
  "trace_id": "lf-abc123..."
}
```

`degraded: true` 表示后端走了 Google fallback。

**Errors**: 400 `empty_text` / `unsupported_target_lang` /
401 `jwt_expired`, `jwt_invalid` / 429 `rate_limit_exceeded` /
503 `service_unavailable`.

### 5.3 Vocab

#### `GET /vocab?since=<unix_ms>`

**Response 200**:

```
{
  "items": [VocabItem...],
  "tombstones": [],
  "server_time": 1713542400000
}
```

#### `POST /vocab` / `DELETE /vocab/{word_key}` / `POST /vocab/bulk_upsert`

继承 v3.0 §5.3。新增：`POST /vocab` 的请求 body 可包含 `cefr_level`
（**预留** β 阶段；MVP 客户端不传）。

### 5.4 Admin（✚ 新增 — 受 Cloudflare Access 保护）

```
GET  /admin/stats         → DAU/MAU/登录率/今日 LLM 调用
GET  /admin/cache/top     → top hit_count 词条（分页）
GET  /admin/eval/runs     → eval_run 列表（最近 N 次）
GET  /admin/eval/runs/{id}→ 单次 run 详情 + sample 列表
GET  /admin/users         → 分页用户列表
```

Admin API 不要求 JWT（用 Cloudflare Access JWT 替代，由 Cloudflare 在
header `Cf-Access-Jwt-Assertion` 注入）。FastAPI middleware 验证此 JWT 公钥
来自 Cloudflare 的 JWKS endpoint。

### 5.5 错误响应通用形状

```
{ "error": { "code": "stable_string", "message": "human readable" } }
```

扩展端按 `code` 路由 UX；`message` 可变。

---

## 6. 模块布局与依赖方向

### 6.1 后端分层（强约束）

```
       routers/        ← HTTP 边界（Pydantic 校验、序列化）
          │
          ▼
       services/       ← 业务规则 + agent/rag/eval 编排
          │
        ┌─┴─┐
        ▼   ▼
      agent/  rag/    ← AI 工程子模块（services 调）
        │     │
        ▼     ▼
       models/        ← ORM 映射 + 简单约束
          │
          ▼
         db.py        ← engine + session factory
```

**依赖方向硬规则**（违反阻断 PR）：

- `routers/` 不直接碰 `models/`；都走 `services/`
- `services/` 不碰 FastAPI `Request` / `Response` 类型
- `agent/` 节点不直接查 DB；都走 `rag/` 或 `services/`
- `models/` 不依赖 `services/` / `agent/` / `rag/`
- `eval/` 可复用 `agent/` + `rag/`（独立跑评测）
- `scripts/` 可复用所有上层模块

### 6.2 LangGraph State Schema（中版深度）

```python
# Pydantic model in app/agent/state.py（pseudo，落实装时定）

class AgentState(BaseModel):
    # === 输入（不变）===
    text: str                          # stripped input
    source_lang: Optional[str]         # None = LLM 推断
    target_lang: str                   # zh-CN/ja/en

    # === Node 1 输出 ===
    detected_source_lang: Optional[str] = None
    raw_translation: Optional[str] = None

    # === Node 2 输出（RAG）===
    matched_terms: list[MatchedTerm] = []
    rag_hit_count: int = 0

    # === Node 3 输出 ===
    final_translation: Optional[str] = None
    polish_applied: bool = False

    # === 横切元数据 ===
    model: str = "claude-haiku-4-5-agent-v1"
    latency_breakdown: dict[str, int] = {}  # node name → ms
    error_node: Optional[str] = None        # 哪个节点失败了

    # === D-AI3 预埋 β 钩子（α 不读不写）===
    user_cefr_level: Optional[str] = None
    word_difficulty: Optional[str] = None       # "below" / "at" / "above"
    simplified_translation: Optional[str] = None
    advice: Optional[str] = None

class MatchedTerm(BaseModel):
    term: str
    translation: str
    source: str          # 'wikidata' / 'wiktionary' / 'cache' / 'manual'
    distance: float      # cosine distance (lower = more similar)
```

### 6.3 Prompt 模板组织

`app/agent/prompts/` 下三个文件（per node）× 多语言对。

**主要支持的语言对**（4 语 D-PY7 + D-AI16 / A19 后）：

| 类型 | 语言对 | 备注 |
|---|---|---|
| 主流（学习者方向）| en→zh-CN, en→ja, en→fr, zh→ja, ja→zh, zh→en, ja→en | 大多数划词场景 |
| 法语相关 | zh→fr, ja→fr, fr→zh, fr→ja, fr→en | D-PY7 / A19 新增 |
| Fallback | LLM 自动检测 source 时 | source_lang 缺省 |

每对 3 个节点 × 3 个 few-shot 示例 ≈ 9 条 / 对；MVP 优先填主流 7 对 + FR
4 对，其余懒填（首次遇到时由 LLM 即兴 + 人工补 example）。

每个 PromptTemplate 含：

- system 部分（cached）：定义 agent 角色、4 维度风格要求、保留 prompt cache
- user 部分（runtime）：插入 text + source_lang + target_lang + matched_terms
- few-shot：每个语言对 3 条 in/out 示例（IT 领域优先）

具体 prompt 草稿在实装时迭代，**不在本文档定**（OQA-1 留给实装）。

### 6.4 扩展端分层（继承 v3.0）

```
sidepanel UI → hooks (useAuth/useVocab/useTranslate) → shared/api.ts
                                                          │
                                                          ▼
                                                   messages → background/auth.ts
                                                          │
                                                          ▼
                                              chrome.identity / fetch BACKEND
```

`shared/api.ts` 是**唯一**调后端 HTTP 的地方：

- JWT 自动注入
- 401 → in-flight promise 复用 + 单次 refresh + 重试一次
- network error → 上抛让 caller 决定是否降级 Google

---

## 7. 部署拓扑

### 7.1 Railway 项目（主后端 + DB）

```
Railway Project: dualread-prod
├── Service: backend (Python 3.12 Docker)
│   ├── Env vars:
│   │   ├── DATABASE_URL              ← Railway Postgres 自动注入
│   │   ├── JWT_SECRET                ← openssl rand -hex 32
│   │   ├── GOOGLE_OAUTH_CLIENT_ID
│   │   ├── ANTHROPIC_API_KEY
│   │   ├── OPENAI_API_KEY            ← embeddings 用
│   │   ├── LANGFUSE_PUBLIC_KEY
│   │   ├── LANGFUSE_SECRET_KEY
│   │   ├── GOOGLE_TRANSLATE_FALLBACK_URL
│   │   ├── CORS_ORIGINS
│   │   └── LOG_LEVEL=INFO
│   ├── Dockerfile build
│   ├── Start: uvicorn app.main:app --host 0.0.0.0 --port $PORT
│   ├── Release: alembic upgrade head
│   ├── Health: GET /healthz
│   └── Spending cap: $50/mo
└── Plugin: postgres
    ├── Extensions: pgvector
    └── 1 GB free tier
```

### 7.2 Vercel 项目（Next.js Landing + Admin）

```
Vercel Project: dualread-web
├── Repo: web/
├── Framework: Next.js 14 (app router)
├── Env vars:
│   ├── NEXT_PUBLIC_BACKEND_URL       ← Railway backend URL
│   ├── CF_ACCESS_TEAM_DOMAIN         ← *.cloudflareaccess.com
│   └── CF_ACCESS_AUD                 ← Cloudflare Access AUD claim
├── Deployment: Hobby ($0)
└── 自定义域名（可选，~$12/yr）
```

### 7.3 Cloudflare Access

- Application: `<vercel-domain>/admin/*`
- Policy: emails in allowlist (你 + 1-2 面试官 demo)
- 用户访问 → Cloudflare Access 跳认证 → 写 `Cf-Access-Jwt-Assertion` cookie
  → Vercel 拿到这个 header → Next.js middleware 验
- FastAPI `/admin/*` 也验同一个 JWT（middleware/admin_auth.py）

### 7.4 Langfuse Cloud

- SaaS 账号 + project + public/secret key
- LangChain `langfuse_callback_handler` 注释一行
- Free tier 50k events/月

### 7.5 CI/CD

#### Phase 1（MVP 第 1 周）

- 推 main → Railway / Vercel 自动部署
- Eval 手动本地跑

#### Phase 2（成熟期，Week 4+）

**GH Actions 工作流分散在三个 repo**（D-A20 拆分后）：

```
dualread (PUBLIC) /.github/workflows/
├── ext-ci.yml           # PR + push: tsc + vitest

dualread-web (PUBLIC) /.github/workflows/
├── web-ci.yml           # PR + push: next build + tsc

dualread-backend (PRIVATE) /.github/workflows/
├── backend-ci.yml       # PR + push: pytest + ruff + mypy
├── backend-deploy.yml   # main merge → railway up
├── eval-bleu.yml        # PR: 跑 BLEU on 200 sample (~$0)
└── eval-full.yml        # 手动触发（workflow_dispatch）：full eval
```

**关键约束**：

- 公开 repo 的 workflow **只用 `pull_request`**，不用 `pull_request_target`
  （后者会把 secret 暴露给 fork PR）
- 公开 repo 的 workflow **不需要 secrets**（CI 只跑 tsc / vitest / next build）
- 所有需要 secret 的 workflow（eval / deploy）都在私有 backend repo 里

### 7.6 Secrets 矩阵（按 repo 归属）

| Secret | 存处 | 谁需要 | 进哪个 repo |
|---|---|---|---|
| `JWT_SECRET` | Railway env | backend | 不进 repo |
| `ANTHROPIC_API_KEY` (prod) | Railway env | backend (agent + eval) | 不进 repo |
| `ANTHROPIC_API_KEY` (eval CI) | dualread-backend GitHub secret | GH Actions | 不进 repo（私有） |
| `OPENAI_API_KEY` | Railway env | backend (embeddings) | 不进 repo |
| `LANGFUSE_PUBLIC_KEY` | Railway env | backend | 不进 repo |
| `LANGFUSE_SECRET_KEY` | Railway env | backend | 不进 repo |
| `GOOGLE_OAUTH_CLIENT_ID` | Railway env + 扩展 manifest | backend + 扩展 | **进 dualread (public)** —— 设计上可见 |
| `RAILWAY_TOKEN` (CI 部署) | dualread-backend GitHub secret | GH Actions | 不进 repo（私有） |
| `VERCEL_TOKEN` (CI 部署) | dualread-web GitHub secret | GH Actions | 不进 repo（公开 repo 的 secret 不会暴露给 fork PR） |
| `CF_ACCESS_AUD` | Vercel env + Railway env | 两端验 JWT | **可公开**（不是 secret，是 ID）|
| `BACKEND_URL` | Vercel env + 扩展 build | 两端调后端 | **可公开**（公开 URL） |

**4 层 secret 防御**（详见 ADR-A21）：

1. `.env*` 全部 gitignore + `env.example` 模板进 repo
2. GitHub Secret Scanning + Push Protection 全开
3. 本地 pre-commit hook (gitleaks) 兜底
4. LLM provider hard cap（Anthropic + OpenAI 各 $50 / $20）= 失守的最后防线

---

## 8. 错误处理 / 降级链路

### 8.1 翻译路径降级优先级（v3.1 升级）

每次登录用户翻译请求，从优到劣：

1. **精确缓存命中** → return（< 100ms）
2. **Agent 完整 3 节点成功** → return + 写缓存
3. **Agent Node 2 (RAG) 失败** → 跳过 RAG，Node 3 直接用 Node 1 输出
4. **Agent Node 3 (Polish) 失败** → return Node 1 raw_translation
5. **Agent Node 1 (Translate) 失败** → fallback Google Translate
6. **后端整体不可达** → 扩展端 fallback Google Translate
7. **Google Translate 也挂** → 扩展端硬错误

前 4 档用户不感知（最多多 ~200ms）；第 5 档客户端收到 `degraded: true`
显示 toast；6/7 档由扩展端 UX 处理。

### 8.2 错误 → UX 映射

| code | 前端行为 |
|---|---|
| `jwt_expired` | refresh JWT，成功重试；失败降级 Google |
| `jwt_invalid` | 清 JWT，提示重登 |
| `rate_limit_exceeded` | Toast，**不**降级（惩罚） |
| `service_unavailable` | 静默降级 Google |
| `invalid_google_token` | 提示"Google 授权已撤销" |
| 网络 error | 静默降级 Google + 下次重试 |

### 8.3 内部重试策略

| 调用 | 策略 |
|---|---|
| Anthropic API | 3 次指数退避 0.5/1.5/4s，总 6s 上限 |
| OpenAI embeddings | 2 次重试 |
| Google fallback | 不重试 |
| Postgres | SQLAlchemy `pool_pre_ping=True` |
| Langfuse upload | 异步，失败不阻塞主流程 |

### 8.4 Agent Node 失败处理矩阵

```
Node 1 fail → state.error_node = "translate"
            → return google_translate(text)（fallback）

Node 2 fail → state.error_node = "rag"
            → state.matched_terms = []
            → 继续走 Node 3（用空 terms）

Node 3 fail → state.error_node = "polish"
            → return state.raw_translation（保持 Node 1 输出）
```

每种失败都通过 Langfuse trace 记录 + `llm_request_log.error_code` 写入。

---

## 9. 安全模型

### 9.1 认证

- **Google access token** 只在 `/auth/exchange` 用一次，后端验完不存
- **JWT HS256 + 7 天过期**；secret 在 env
- `current_user` FastAPI dependency 解析 + DB 查全 user
- Admin 用 Cloudflare Access JWT，不是用户 JWT

### 9.2 授权

- `user_vocab` 查询**必带** `WHERE user_sub = current_user.sub` —— 在
  service 层强制，code review 阻断违规
- `shared_cache` / `terminology` 全员可读；写仅 backend 内部路径
- Admin endpoints 验 Cloudflare Access JWT + email allowlist

### 9.3 输入校验

- Pydantic 全部入参校验
- `text` 1000 字符上限（超出截断 + 400）
- 全程 SQLAlchemy ORM / `text(...).bindparams()`，禁字符串拼 SQL
- CORS 锁 `chrome-extension://<id>` + `https://<vercel-domain>`

### 9.4 Rate Limit 三层

- L1 per-user：Postgres 计数器 10/分钟（继承 v3.0）
- L2 per-IP：内存 dict 30/分钟（防 `/auth` 刷）
- L3 LLM provider hard cap：Anthropic dashboard $50/mo

### 9.5 PII / Privacy（v3.1 强化）

- **Langfuse user_id** = SHA256(google_sub)，**不**传明文 sub / email
- **Langfuse trace text** 含原文 + 译文 → privacy policy 必须明说
- **eval_sample.source_text** 优先用公开数据；自建 IT 集手挑时确保不含
  真实用户的私密内容（手挑流程文档化）
- **删账号** → user_vocab cascade 删；llm_request_log.user_sub 置 NULL；
  Langfuse 中以 hash 存的 user_id 无法反向定位（可接受）

### 9.6 Secrets 管理

继承 v3.0；新增：

- `OPENAI_API_KEY`（embeddings）
- `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY`
- 全部存 Railway env，不进 git
- Request logger middleware 剥 `Authorization` header + `google_access_token`
  body 字段 + 任何含 `key` / `secret` 的字段名

---

## 10. Observability

### 10.1 Langfuse（v3.1 核心）

- LangChain `LangfuseCallbackHandler` 注释 LangGraph 入口
- 每个 agent run 自动 trace，含：
  - root span：`/translate` 整体（含 user_id_hash, source_lang, target_lang,
    cache_hit, error_code）
  - child spans：translate_node / rag_node / style_polish_node
  - 每 span 自动捕获 input / output / token_in / token_out / latency
- 失败 / fallback 在 root span 的 `metadata.degraded` 标记
- trace_id 同时写入 `llm_request_log.langfuse_trace_id`，可双向跳

### 10.2 结构化日志

- FastAPI middleware 给每请求生成 `request_id`
- 日志（JSON）含：`request_id, user_id_hash, route, status, latency_ms,
  langfuse_trace_id`
- Sink：Railway 内置 log viewer（MVP 够）

### 10.3 SQL 监控（互补）

`llm_request_log` 表本身就是 metrics 来源：

```sql
-- 7 天命中率
SELECT date_trunc('day', created_at), 
       AVG(CASE WHEN cache_hit THEN 1 ELSE 0 END) as cache_hit_rate,
       AVG(CASE WHEN agent_path = 'agent_full' THEN 1 ELSE 0 END) as agent_rate
  FROM llm_request_log
 WHERE created_at > NOW() - INTERVAL '7 days'
 GROUP BY 1;

-- top 错误
SELECT error_code, COUNT(*) FROM llm_request_log
 WHERE error_code IS NOT NULL AND created_at > NOW() - INTERVAL '7 days'
 GROUP BY 1 ORDER BY 2 DESC;
```

Admin dashboard 直接渲染这些 query。

### 10.4 健康检查

- `GET /healthz` → 200 `{ ok, db, langfuse, version }`
- Railway liveness probe 用此

### 10.5 Alerting

- Railway dashboard 邮件：80% credit / 部署失败 / 容器反复重启
- Anthropic dashboard 邮件：$40/mo (cap 80%)
- Langfuse Cloud 邮件：80% events 配额
- Vercel 邮件：build failure
- 手动周五看一次：`llm_request_log` 错误率、共享库命中率、agent path 分布

---

## 11. ADRs

继承 v3.0 ADR A1-A8，新增 A9-A18。

### A1: 单体 FastAPI（不分微服务）— 继承

### A2: Transaction Script 风格（不用 Repository）— 继承

### A3: Pydantic schemas 与 ORM models 分离 — 继承

### A4: JWT 最小 payload (sub, tier, exp) — 继承

### A5: Vocab 双写 + write buffer — 继承

### A6: 共享库 seed = 独立脚本手动跑 — 继承（v3.1 扩展到 terminology seed）

### A7: 客户端 ↔ 云端 = pull on init + push on write + LWW — 继承

### A8: native_language = 客户端优先（MVP）— 继承

---

### A9: LangGraph 单图 + 三线性节点（不分多图）

**Context**：Agent 编排可以一个 graph 多种入口，也可以一个简单图。

**Options**:

| Option | Pros | Cons |
|---|---|---|
| A. 单图 3 线性节点 | 简单；trace 干净 | 加 β 时要扩图 |
| B. 多图按场景路由 | 灵活 | 早期过度设计 |

**Decision**: A。线性 chain；conditional edges 留到 β。

**Rationale**: D-AI2 + R-AI1（学习曲线 mitigation）。

---

### A10: Pydantic state（不用 TypedDict）

**Decision**: `AgentState` 用 Pydantic v2，与 FastAPI Pydantic 共用类型。

**Rationale**: 复用 schema 校验；Langfuse trace 序列化更友好；OQA-8 倾向。

**Trade-offs**: TypedDict 更轻；Pydantic 略微 overhead 但可忽略。

---

### A11: RAG 同表 UNION ALL（terminology + shared_cache）

**Context**：terminology 是 seed，shared_cache 是动态增长。检索时如何
合并。

**Options**:

| Option | Pros | Cons |
|---|---|---|
| A. UNION ALL 同 query | 一次 round-trip；ranker 一致 | SQL 略复杂 |
| B. 两次 query 客户端 merge | 简单 | 两次 RTT |
| C. 物化视图合并 | 查询最快 | 维护成本 |

**Decision**: A。

**Rationale**: 查询一次完成 < 50ms；ranker 一致避免 source 偏好；无需
物化视图维护。

---

### A12: Embedding 模型 = OpenAI text-embedding-3-small（1536 维）

**Decision**: 全栈用 `text-embedding-3-small`；不用 Voyage / Cohere /
开源 BGE。

**Rationale**:

- $0.02/M tokens，对 10w 条 seed 一次性成本 $0.06
- 中日英多语效果在公开 benchmark 上稳定
- OpenAI SDK 在 Python 生态无摩擦
- 1536 维是 pgvector HNSW 推荐区间（< 2000 维）

**Revisit**: 若 RAG 命中率低于 50%，试 Voyage v3 / OpenAI 3-large。

---

### A13: BLEU + LLM-as-judge 双层 eval（不加 COMET）

**Context**：评估指标选择。

**Decision**: BLEU (sacrebleu) 做 CI 回归；Sonnet judge 做 release 评分。
**不**加 COMET。

**Rationale**:

- D-AI5 锁定
- COMET 模型 850 MB 部署负担大；与 LLM-as-judge 相关性高位收敛后边际收益小
- Sonnet 4.5 评 Haiku（stronger tier）可缓解 self-preference

**Trade-offs**: Eval 数字不能直接对标 WMT 学术 leaderboard（COMET 更主流），
但简历叙事够。

---

### A14: 自建 + WMT 双数据集（300+200）

**Decision**:

- Test set 1: 300 自建（100 手挑 + 200 user shared_cache hit_count 排序取）
- Test set 2: 200 WMT-23 / FLORES 抽样

**Rationale**: D-AI6；避免 cherry-pick 嫌疑；简历可双引用。

---

### A15: Reference = LLM 初稿 + 10% 人工抽检 calibration set

**Decision**:

- Claude Opus 给 500 条产 reference
- 50 条人工校对作 LLM-as-judge calibration

**Rationale**: D-AI7。1 小时人工 + 50 条精校 = 简历可信度的最低成本路径。

---

### A16: Langfuse Cloud（免费层）+ PII hash

**Decision**:

- Cloud 免费层
- user_id = SHA256(google_sub)
- DAU 3k+ 触顶后切自托管（纯增量）

**Rationale**: D-AI9；MVP 0 部署成本 + 可扩展性。

---

### A17: Next.js δ：Landing + Admin（不做用户 dashboard）

**Decision**: 范围限于 Landing + Admin；用户 dashboard 不做。

**Rationale**: D-AI10。

- 用户用扩展，web dashboard 与 sidepanel 80% 重叠
- 重做 web auth 链路（Google OAuth web flow）= 工作量爆炸

---

### A18: Cloudflare Access for admin auth

**Decision**: `/admin/*` 用 Cloudflare Access 邮箱白名单 + JWT 验证；
不自实现 admin OAuth。

**Rationale**: D-AI11。

- 0 代码 admin auth
- 同一个 JWT 给 Vercel 和 FastAPI 双端验
- 可 demo 时临时加面试官邮箱

---

### A19: 4 语支持（CN/JA/EN/FR） + Eval 仅覆盖 zh/ja

**Context**: 用户 2026-04-25 反馈原 3 语决定是失误，要扩到 4 语。Eval 数据
集是否同步扩展？

**Decision**:
- **产品全栈 4 语**（agent / RAG / Prompt / DR_STRINGS / Welcome / native_language
  CHECK / Wikidata seed filter 全部覆盖 CN / JA / EN / FR）
- **Eval pipeline 仅覆盖 zh / ja 语对**（FR 不进 BLEU + judge 数据集）

**Options**:

| Option | Pros | Cons |
|---|---|---|
| α. 4 语全量产品 + 仅 zh/ja eval（本决定） | MVP 0 增量 eval；简历诚实声明 | FR 翻译质量"能用但未量化" |
| β. 4 语全量产品 + 4 语 eval | 简历最完整 | +2-3 天 + ~$2 reference 成本；ROI 低 |
| γ. 4 语全量产品 + FR 只跑 BLEU 不跑 judge | 折中 | +1 天；仍部分量化 |

**Rationale**: D-PY7 + D-AI16。

- 简历核心数字针对中文求职者，主要看 zh / ja 翻译
- FR eval 增量收益低（招聘市场看到"4 语支持"已是加分；硬塞 FR 数字反而
  显得"为了凑指标"）
- FR 作为"产品架构可扩展性"证据更有说服力
- 时间预算紧（D-AI13 / 1 周 buffer），节省 2-3 天投到核心叙事

**Trade-offs**:
- FR 翻译质量未量化 → 简历句明示 "FR coverage inherits architecture; eval
  expansion deferred to v3.x"
- 未来加 FR eval 是纯增量改造（数据集表 + judge 调用都已支持任意语对）

**Revisit**: 用户反馈 FR 翻译质量问题 / 简历投到法语区招聘市场时。

**Schema 影响**:
- `user.native_language` CHECK 加 'fr'（一行 migration）
- 其他表的 `source_lang` / `target_lang` 字段本就是无约束 ISO 639-1
  字符串，零改动

**Prompt 影响**:
- few-shot 示例新增 4 条主要 FR 语对：en→fr / zh→fr / ja→fr / fr→zh
- 每对 3 节点 × 3 示例 = 36 个新示例

**Seed 影响**:
- Wikidata 过滤条件从 `EN + ≥1 of (zh, ja)` 扩为 `EN + ≥1 of (zh, ja, fr)`
- 预计 seed 总条目从 ~50k 涨到 ~70k；存储仍在 1 GB 内
- 一次性 embedding 成本 +$0.02

**总工作量**: ~3.5-4.5 天（落在 1 周 buffer 内）

---

### A20: Repo 拆分策略 — 公开扩展 + 公开 web + 私有 backend

**Context**: 仓库公开会放大 secret 泄露 / prompt 被抄袭 / 业务逻辑暴露
等风险。但完全私有又失去简历公开性收益（招聘官能直接看代码 / 架构）。
2026-04-25 用户提出"前端公开 / 后端私有"方案。

**Options**:

| Option | Pros | Cons |
|---|---|---|
| α. 全公开 monorepo | 简历公开性最强；社区效益 | secret 泄露风险高；prompt 被抄；业务策略暴露 |
| β. 全私有 | 安全；不公开 | 简历完全失去公开 demo；社区 0 |
| γ. 公开扩展 + 公开 web + 私有 backend（**本决定**） | 简历公开性 + 安全防御 + prompt 作隐性资产 | 多 repo 维护开销（solo dev 可忽略） |
| δ. 公开扩展 + 私有 web + 私有 backend | 比 γ 多保护一层 admin UI | 失去 web 代码的简历加分点 |

**Decision**: γ — 拆 3 个 repo：

- `dualread` (PUBLIC) = Chrome 扩展 + 架构文档
- `dualread-web` (PUBLIC) = Next.js Landing + Admin UI
- `dualread-backend` (PRIVATE) = FastAPI + agent + RAG + eval + scripts

**Rationale**:

- **扩展本来就要公开**：已发布 Chrome Web Store，用户可反编译，再公开零
  增量泄露
- **Web UI 公开 OK**：含的 `BACKEND_URL` / `CF_ACCESS_AUD` 都是公开 ID
  非 secret；admin **代码**公开 OK（真正保护的是后端 API，靠 Cloudflare
  Access JWT 验证）
- **Backend 私有的关键资产**：
  - Prompt 模板（agent 三节点 + few-shot）= 简历隐性资产，可在面试时作
    "code review during interview" 演示
  - Rate limit 实现细节 = 攻击者不知道 = 攻击成本上升
  - Wikidata seed filter 规则 = 内部数据策略
  - Eval 数据集（含从用户 shared_cache 取的样本）= 隐含 PII 风险
- **简历叙事**: "Production backend kept private; happy to share for code
  review during interview" 让 HR 知道你懂业界实践
- **GitHub 私有 repo 个人 plan 永久免费**，零成本

**Trade-offs**:

- 跨 repo refactor 成本（改 message 协议要同步 3 个 repo）— 用 contract
  testing + 文档化协议缓解（YAGNI for MVP）
- backend 没有公开 PR / star — 你的 c+ 路线本来就不靠开源叙事

**实装时机**: **从第一次 push 就拆分**（Phase 1 Week 1 早）。git history
一旦合并就难分，零成本预防。

**Revisit**: 项目变成商业产品时是否考虑全私有；或者 backend 单独剥离一些
模块开源（如 `seed_terminology.py`）。

---

### A21: 公开仓库的 secret 4 层防御

**Context**: 公开 repo 最常见的灾难是 API key 泄露 → 账单飙升。即使 backend
私有，扩展和 web repo 仍是公开的，仍可能误推 secret。

**Decision**: 强制 4 层防御，独立失效不致命：

**L1 — gitignore + env.example 模板**

- 所有 `.env*` 进 `.gitignore`（每个 repo 都要）
- `env.example` 进 repo，仅列 key 名 + 示例 dummy 值（如 `ANTHROPIC_API_KEY=sk-ant-xxxxx`）
- README 明示"复制到 `.env` 填真实值"

**L2 — GitHub Secret Scanning + Push Protection**

- 三个 repo 全开 Settings → Code security and analysis
- Push Protection 在 `git push` 时自动扫并阻断（事前防御）
- 支持 60+ token 格式（含 Anthropic / OpenAI / Google / Stripe 等）
- 完全免费 + 0 配置

**L3 — 本地 pre-commit hook (gitleaks)**

- `gitleaks` Go 编译，0 依赖，install 1 行
- `.pre-commit-config.yaml` 进 repo
- commit 前自动扫，挡在 push 之前
- 即使忘开 L2 也兜底

**L4 — LLM provider hard cap**（终极兜底）

- Anthropic dashboard: monthly **hard limit** $50（D-AI15）
  - 注意：必须是 hard limit / monthly spending limit，**不是** soft limit
  - Soft limit 仅邮件提醒；hard limit 才会真正停服
- OpenAI dashboard: monthly hard limit $20（embeddings 用）
- Anthropic eval CI 用专用 key（与 prod 分开）+ 单独 cap $10
- 即使 L1-L3 全部失守，账单最坏 **$80/月**

**Disaster recovery runbook**（写进 backend repo `docs/runbooks/key-leak.md`）:

1. Anthropic / OpenAI dashboard 立即 revoke 泄露的 key
2. 在 dashboard 创建新 key
3. Railway env 更新 → 部署
4. `git filter-repo` 清掉 commit 历史
5. force-push（与上面 risk 冲突时与 L4 cap 协商，cap 已挡住烧钱）

**Rationale**: 4 层独立失效不致命；L4 是数学保证最坏 $80。

---

### A22: shared_cache / terminology 写入前的 output validation

**Context**: 攻击者用 1 个 JWT 刷奇怪 prompt 让 LLM 输出脏数据 → 写入
共享库 → 污染其他用户。不烧钱但坏体验。

**Decision**: 在 `services/cache.py` 写入前做 3 项 validation：

1. **长度比检查**: `len(translation) <= 3 * len(source_text)` 否则视为
   异常输出
2. **字符集检查**: 不含控制字符（`\x00-\x1f` except `\n\r\t`）；不含
   excessive 重复字符（如 `aaaaaa...`）
3. **语言一致性弱检查**: 输出长度 ≥ 2 字符（避免 LLM 抖动出空）

**失败处理**: log warning + **不写库** + agent 仍返回结果给当前用户
（用户体验不退化；只是不污染共享库）。

**Rationale**:

- 廉价（每次写库前 ~1ms 校验）
- 防大多数 90% 的脏数据攻击
- 复杂的脏数据（语言伪造 / 微妙误译）由后续 audit cron 处理（D-AI4
  Maintenance Phase）

**Trade-offs**: 极少数合法 long translation 会被误挡（如长复合句）→
监控 reject 率，> 1% 时调阈值。

---

### A23: Langfuse trace 的 PII scrub policy

**Context**: LangChain 默认会把 input / output 全量上传到 Langfuse。
原文 + 译文都是用户隐私文本（含浏览痕迹推断）。Langfuse Cloud 数据驻留
他们服务器；公开 repo 中提到 `LANGFUSE_PUBLIC_KEY`（设计上可公开）。
简历 demo 时给面试官看 trace 也有隐私 concern。

**Decision**: 在 `app/observability/pii_scrub.py` 中 override LangChain
的 callback 序列化逻辑：

1. **`user_id`**: SHA256(google_sub) 取前 16 字节 hex（已锁 NFR-3）
2. **`text` 字段截断**: 前 50 字符 + `...` + 后 20 字符（保留诊断价值，
   去除完整内容）
3. **`metadata.session_id`** 不传（避免推断用户行为模式）
4. **每月手动清空**: Langfuse Cloud dashboard → 项目 → "Delete data"

**简历 demo 准备**:

- demo 前 24h 跑一次清空
- demo 时只给面试官看脱敏后的 trace
- 简历 README 明示"All trace text PII-scrubbed before upload"

**Rationale**:

- LangChain 默认行为对生产不安全
- 截断后仍能调试（前 50 字符通常够定位问题）
- 简历叙事可写"PII-aware LLM observability with custom serializer"

**Trade-offs**: trace 全文截断后某些边缘 bug 难定位 → 调试时本地
`LANGFUSE_ENABLED=false` 跑完整 stdout 日志。

**Revisit**: 切到自托管 Langfuse 后（DAU 3k+），数据自有，可放宽截断
长度。

---

## 12. Implementation Roadmap

按 D-AI14 排序（X：AI 先 / Web 最后）。每 phase 末有可演示 demo。

### Phase 0 — Repo 拆分 + Secret 防御就位（Week 1 早，半天）

ADR-A20 + A21 强制：第一次 push 前必须完成。

| 任务 | DoD |
|---|---|
| 建三个 GitHub repo：`dualread` (public) / `dualread-web` (public) / `dualread-backend` (private) | 三个 repo 创建完成 |
| 三 repo 都开 Settings → Code security → Secret scanning + Push protection | 三个开关都绿 |
| 三 repo 都加 `.gitignore` 含 `.env*` | gitignore 提交 |
| 三 repo 都加 `env.example` 模板（仅 key 名 + dummy 值）| 三个 example 提交 |
| 本地 install gitleaks + `.pre-commit-config.yaml` 进各 repo | 本地 commit 触发扫描 |
| Anthropic dashboard：设 hard monthly limit $50 (prod key) + $10 (eval CI key 单独建) | dashboard 截图 |
| OpenAI dashboard：设 hard monthly limit $20 | dashboard 截图 |
| `docs/runbooks/key-leak.md` 写入 dualread-backend | 文档提交 |

**DoD**：第一次往三个 repo push 任意 commit 前，4 层防御全部就位。

### Phase 1 — v3.0 产品骨架（Week 1-3）

继承 v3.0 architecture §12 Phase A-G：

| Week | 内容 | DoD |
|---|---|---|
| W1 早 | Phase A 后端骨架：FastAPI + Postgres + healthz + Alembic 0001 | curl /healthz 200 |
| W1 末 | Phase B Auth：`/auth/exchange` + JWT + 扩展登录 | 登录显示邮箱 |
| W2 早 | Phase C Translate (no agent yet)：单次 Anthropic 调 + 共享缓存（精确）+ rate limit | 第二个用户划同词 cache hit |
| W2 末 | Phase D Vocab 同步：GET / POST / DELETE / bulk_upsert + 合并 modal | 双设备 LWW 验证 |
| W3 | Phase E 多语言 UI + Welcome 改造：DR_STRINGS 4 语 (zh/ja/en/fr) + 4 旗帜选择 + native_language migration；FR 翻译用 LLM 初稿 + 抽检 | 新装走 Welcome；老用户 ui_lang→native_lang；4 语 UI 切换正常 |

**Phase 1 末可投产**（未含 AI 工程层；翻译质量 = 普通 Haiku）。

### Phase 2 — LangGraph + RAG（Week 4-6）

| Week | 内容 |
|---|---|
| W4 | Migration 0002 (pgvector) + 0003 (terminology) + 0005 (β 钩子)；写 `seed_terminology.py`（filter `EN + ≥1 of zh/ja/fr`）；Wikidata + Wiktionary 数据清洗；灌库 ~50-70k 条（含 FR 后规模略涨） |
| W4 末 | `audit_terminology.py` 跑 LLM 质量审核；过滤低分；`terminology` 稳定 |
| W5 | `app/agent/state.py` + `app/agent/graph.py`；3 节点 prompt 草稿（主流 7 对 + FR 4 对 few-shot）；本地 LangGraph 跑通 |
| W5 末 | `/translate` 路由切换到 agent；Langfuse 集成；shared_cache 写入加 embedding |
| W6 | RAG retriever + reranker；前端兼容 `matched_terms`；端到端 demo |

**DoD**：
- 划"reliability"登录用户拿到 agent 译文 + 前端能展示 matched_terms
- Langfuse dashboard 能看到 3 节点 trace
- 关 ANTHROPIC_API_KEY 时，扩展正确收到 `degraded: true`

### Phase 3 — Eval Pipeline（Week 7-8）

| Week | 内容 |
|---|---|
| W7 | Migration 0004 (eval tables)；自建 IT 数据集 100 手挑；`seed_eval_dataset.py` 接 WMT-23 |
| W7 末 | `generate_references.py` 产 500 条 ref；50 条人工抽检 calibration |
| W8 | `app/eval/bleu.py` + `app/eval/judge.py` + `app/eval/runner.py`；本地跑首次 full eval |
| W8 末 | `eval_local_run.py` 输出 markdown report；得到 baseline judge 数字 |

**DoD**：能跑 `python -m scripts.eval_local_run --kind full` → 输出
markdown 报告 + 写 eval_run/eval_sample 表。

### Phase 4 — Observability + 钩子收尾（Week 9）

| 内容 |
|---|
| Langfuse 完整 metadata 配置（user_id_hash / model / cache_hit / agent_path） |
| `llm_request_log.langfuse_trace_id` 双向跳通 |
| README 更新（讲清 LangGraph 三节点 + RAG + eval pipeline 的价值）|
| Privacy policy 4 语更新（Langfuse / Anthropic / Google fallback）|
| **简历可投**（Phase 4 末）|

### Phase 5 — Next.js Web（Week 10-12）

| Week | 内容 |
|---|---|
| W10 | Next.js 项目初始化 + Tailwind/shadcn-ui + Vercel 部署 |
| W10 末 | Landing：hero + features + screenshots + Chrome Web Store 跳转 |
| W11 | Cloudflare Access 配置 + Vercel & FastAPI 双端 JWT 验证 |
| W11 末 | Admin /stats + /cache + /eval；接 FastAPI `/admin/*` |
| W12 | Admin /users + /traces (Langfuse iframe)；端到端 demo；预留 1 周 buffer |

**DoD**：从 Landing 链接进 Chrome Web Store；admin 能看 cache top / eval
分数趋势 / Langfuse trace。

---

## 13. 不做清单（再次强调）

继承 v3.0 §13 + v3.1 brainstorm §2.5：

- ❌ Microservices / service mesh / 消息队列
- ❌ Repository pattern / Clean Architecture / CQRS / Event Sourcing
- ❌ Redis（rate limit 用 Postgres）
- ❌ WebSocket / SSE 实时推送
- ❌ GraphQL
- ❌ Multi-tenancy（一人一 sub）
- ❌ Feature flag 服务
- ❌ Fine-tuning（属 b 路线）
- ❌ COMET / chrF++（D-AI5 锁定）
- ❌ Cross-vendor LLM-as-judge（A13）
- ❌ Langfuse 自托管（DAU 3k+ 后再做）
- ❌ Cloud Run / ECS / Terraform / IaC（D-AI12）
- ❌ 用户 web dashboard（A17）
- ❌ Blog / 内容营销（超 3 月预算）
- ❌ A/B 测试系统（eval pipeline 已能比对版本）
- ❌ AI tutor / 解释层 / 例句生成（v3.x 增量）
- ❌ refresh token 双 token（单 JWT 7 天 + 重登）

---

## 14. 风险与回滚

### 14.1 部署级回滚

- Railway / Vercel 都保留历史部署，dashboard 一键回滚
- Alembic migration 单向；schema 加列向后兼容；删列两阶段
- LangGraph agent 切换：`/translate` 内部走 `agent.run()` 还是 `services.
  legacy_translate()` 由 env var `AGENT_ENABLED` 控制；出问题 1 行回退

### 14.2 数据级

- Railway Postgres Pro 才有自动备份（Hobby 没有）
- MVP 补：`scripts/backup.py` 手动 `pg_dump` 一周一次到本地
- terminology seed 失败：脚本 idempotent (`ON CONFLICT DO NOTHING`)，可
  断点续跑
- eval_run / eval_sample：每次跑都新建，老数据保留作历史对比

### 14.3 Feature 级 Kill Switch

| Switch | 默认 | 失败兜底 |
|---|---|---|
| `settings.ai_enabled` (扩展) | true | 关闭 = 走 Google Translate |
| backend env `AGENT_ENABLED` | true | false = `/translate` 用 v3.0 单次 LLM 路径 |
| backend env `RAG_ENABLED` | true | false = agent Node 2 跳过 |
| backend env `LANGFUSE_ENABLED` | true | false = trace 静默 noop |

每个都能在不重新部署的情况下临时关（Railway env 改 + 容器重启 = 1 分钟）。

### 14.4 Eval 系统风险

- judge 成本失控：`eval/runner.py` 硬编码 `MAX_JUDGE_SAMPLES = 100`
- 数据集污染：自建 IT 集手挑流程 + git 版本管理
- 数字 cherry-pick：每次 `eval_run` 记录 `agent_version`（prompt + model 的
  hash）+ `cost_usd`；`/admin/eval` 显示完整历史

---

## 15. 与现有代码的交互

代码按 ADR-A20 拆分到 3 个 repo：

### 15.1 `dualread` repo (PUBLIC) — Chrome 扩展 + 文档

#### v2.1.1 → v3.1 改动文件

| 现有文件 | 变化 |
|---|---|
| `manifest.json` | + oauth2 / identity / host_permissions(后端 + Vercel 域名) |
| `src/background/index.ts` | + auth 路由；选 backend agent or Google |
| `src/background/vocab.ts` | + write buffer.synced_to_backend 字段 |
| `src/content/clickTranslate.ts` | 不变（仍发消息）|
| `src/sidepanel/screens/Welcome.tsx` | 改为 4 旗帜选 native_language |
| `src/sidepanel/screens/Settings.tsx` | + 登录块 + 母语切换 + 登出 |
| `src/sidepanel/i18n.ts` | DR_STRINGS 扩 4 语（zh/ja/en/fr） |
| `src/shared/messages.ts` | + AUTH_*, GET_TAB_ID |
| `src/shared/types.ts` | + native_language; VocabWord.source/target_lang |
| ✚ `src/shared/api.ts` | 后端 fetch 封装 |
| ✚ `src/background/auth.ts` | JWT lifecycle |
| ✚ `src/sidepanel/screens/MergeModal.tsx` | 首次登录合并 modal |
| ✚ `src/sidepanel/hooks/useAuth.ts` | auth state |

#### 不动的 v2.1.1 代码（承诺）

- `src/content/bubble.ts` / `bubbleStyles.ts` / `hoverReducer.ts` /
  `toast.ts` / `highlight.ts` / `wordBoundary.ts`
- `src/shared/punctuation.ts` / `isHighlightable.ts`
- v2.1.x 所有 test 文件

#### 全新增（除上面 ✚ 项外）

- `docs/` 全部架构文档（v3-0-brainstorm-python.md / v3-1-ai-engineering-brainstorm.md /
  v3-1-architecture.md）
- `.github/workflows/ext-ci.yml`（无 secrets，仅 tsc + vitest）
- `env.example`（扩展 build 时的 `VITE_BACKEND_URL` 等）

### 15.2 `dualread-web` repo (PUBLIC) — Next.js 全新

完整新建，无与 v2.1.1 的代码交互：

```
web/
├── app/
│   ├── (marketing)/page.tsx, about/, privacy/
│   ├── admin/{page,layout,cache,eval,users,traces}.tsx
│   └── layout.tsx
├── components/  (shadcn-ui)
├── lib/api.ts (调 backend /admin/*) + lib/auth.ts (验 CF Access JWT)
├── package.json + next.config.js + tailwind.config.ts + vercel.json
├── env.example
└── .github/workflows/web-ci.yml（无 secrets，仅 next build + tsc）
```

### 15.3 `dualread-backend` repo (PRIVATE) — FastAPI 全新

完整新建，含所有 prompt / agent / RAG / eval 实现：

```
backend/
├── app/  (main / config / db / models / schemas / routers / services
│         / agent / rag / eval / observability / deps / middleware / errors)
├── alembic/  (migration 0001-0005)
├── scripts/  (seed_terminology / audit / seed_eval / generate_references
│             / log_cleanup / eval_local_run / backup / anomaly_check)
├── tests/  (unit / integration / eval / conftest)
├── docs/runbooks/  (key-leak.md, secret-rotation.md)
├── pyproject.toml + Dockerfile + railway.json + env.example
└── .github/workflows/  (backend-ci, backend-deploy, eval-bleu, eval-full)
   ↑ 私有 repo 的 workflow 才能安全持有 ANTHROPIC_API_KEY / RAILWAY_TOKEN
```

---

## 16. Open Architecture Questions

留给实装阶段拍板（不影响本文档承诺）：

- **OQA-1** Prompt template：LangChain `ChatPromptTemplate` vs f-string —
  倾向 LangChain（生态一致 + Langfuse 自动捕获 prompt template id）
- **OQA-2** RAG distance metric：cosine 默认；测后定阈值
- **OQA-3** 自建 300 IT 集挑选规则：100 手挑 + 200 hit_count top
- **OQA-4** Eval 频率：每 PR BLEU 200 + 每周 cron BLEU 500 + 手动 full
- **OQA-5** Langfuse user_id hash 算法：SHA256 + 16 字节 truncate
- **OQA-6** Admin stats 实时查 vs 缓存：实时（数据量小）
- **OQA-7** Next.js 路由：app router（已锁）
- **OQA-8** State schema 类型：Pydantic（A10）
- **OQA-9** Embedding 模型：OpenAI text-embedding-3-small（A12）
- **OQA-10** RAG 命中阈值：cosine 0.7 默认；eval sweep
- **OQA-11** RAG rerank 何时触发：retrieval ≥ 2 hits 时；< 2 直接用
- **OQA-12** terminology audit 用什么模型：Haiku（成本 + 质量平衡）
- **OQA-13** Reference 翻译模型：Claude Opus 4.x（最高质量 ref）
- **OQA-14** Vercel 是否绑自定义域名：MVP 用 *.vercel.app；上线时绑
- **OQA-15** GitHub Actions runner：ubuntu-latest 默认；eval 跑要不要 cache
  Anthropic SDK 安装

---

## 17. 简历叙事的可演示地图

每个组件对应一个 demo 方式（面试时调用）：

| 组件 | Demo |
|---|---|
| LangGraph 三节点 | 打开 Langfuse trace 给一个真实划词的 3 段时序 |
| RAG | admin/cache 找一个 hit_count 高的术语展示 |
| pgvector HNSW | 在 Postgres 里跑 `EXPLAIN ANALYZE` 显示 HNSW 命中 |
| Eval pipeline | 打开 admin/eval 给 BLEU 折线图 + judge 4 维度雷达图 |
| 业务价值数字 | README 头部 "judge score 6.8 → 8.4 / +24% terminology (CN/JA pairs); FR coverage inherits architecture" |
| LangFuse observability | trace 树形 + token / latency / cache_hit 标注 |
| Cloudflare Access | 给面试官临时加邮箱 → demo 完移除 |
| Multi-language UI（4 语）| Welcome 屏一键切换 zh / ja / en / fr；4 语都能划词 → agent 出译文 |
| 4 语 RAG 覆盖 | admin/cache 按 target_lang 过滤 fr 给一条 FR 命中 |

---

*End of v3.1 architecture.*
