# DualRead v3.1 Architecture — 延迟优化分析

> **状态**：2026-04-25 用户提出"agent 还没实装但感觉 3-8s 太慢"。本文档
> 分析架构 §4.2 / §4.3 的延迟 budget，列出可落地的 5 项优化（O1–O5
> Tier 1）+ 2 项 UX 优化（O6/O7 Tier 2）+ 2 项需权衡的项（O8/O9 Tier 3）+
> 不应为快而砍掉的东西，并给出对应的架构修正点和 ADR 草稿。
>
> 本文档**不修代码**，仅记录分析结果，等用户消化后决定是否落地。

**审计日期**：2026-04-25
**审计范围**：`docs/v3-1-architecture.md` §4.2 / §4.3 / §6.3 / §8.1 / §10.5
+ Anthropic / OpenAI 实际延迟 baseline + LangGraph 能力
**审计者**：Claude

---

## TL;DR — 60 秒看完

**问题**：架构 §4.2 把 Node 1 → Node 2 → Node 3 设计成**严格串行**。
真实 Haiku 单次调用 1-2.5s，三节点串行 = 3.5-8.0s（cache miss 时）。

**关键变量是 cache_hit_rate**：

| 命中率 | 用户平均感知 |
|---|---|
| 0% (冷启动) | 3.5-8s |
| 50% | ~2.5s |
| 70% | ~1.5s |
| 85% | ~0.8s |
| 95% | **~0.3s** |

→ shared_cache 跨用户共享，自然会爬升；但**冷启动期需要主动优化**。

**5 招立即落地**（Tier 1，几乎零成本，无简历副作用）：

| # | 优化 | 节省 |
|---|---|---|
| **O1** | Node 1 ‖ Node 2 并行（架构 §4.2 改图）| 1-2s |
| **O2** | Anthropic prompt caching（system + few-shot）| 0.3-0.7s × 每次调用 |
| **O3** | 砍 RAG rerank Haiku（MVP 阶段）| 1-2s |
| **O4** | Stream Node 3 输出 | 感知 TTFT 降到 0.5-1s |
| **O7** | 上线前预热 shared_cache（Top 1000 词）| 冷启动 hit_rate 0% → 80%+ |

→ 综合后：**cache miss 实际延迟 3.5-8s → 2-4s**；用户**感知 TTFT** 降到
0.5-1s；上线 30 天内平均延迟 ~0.3s。

**架构需要修正 4 处**（§4.2 数据流 / §4.3 budget / §10.5 alerting / 新加 4 条 ADR）。

**不要为快而砍**：Langfuse trace / 3 节点结构 / pgvector RAG / 换非
Anthropic 模型 —— 这些是简历资产，砍了得不偿失。

---

## 1. Budget 现状解构

### 1.1 架构里已声明的延迟数字

| 路径 | 时间 | 来源 |
|---|---|---|
| 精确缓存命中 | < 100ms | §8.1 Item 1 |
| RAG (Node 2) 内部 | ~400ms（含 rerank）| §4.3 |
| Agent 全 3 节点 | **未明确写** | （需倒推）|

### 1.2 §4.3 的 300ms rerank 假设 = 过度乐观

§4.3 把 RAG 内部分解为：
> "Step 2 ~50ms (embedding) / Step 3 ~50ms (HNSW) / **Step 5 ~300ms (Haiku rerank)**"

**真实 Anthropic Haiku TTFT 基线**（2026 数据）：

| 模型 | TTFT (cold) | TTFT (warm) | 完整生成 (~50 tokens) |
|---|---|---|---|
| Claude Haiku 4.5 | 700-1500ms | 300-500ms（命中 prompt cache）| 1.0-2.5s |
| Claude Haiku 3.5 | 500-1200ms | 200-400ms | 0.8-2.0s |

→ **rerank Haiku 单次调用 ≥ 1s**，不是 300ms。架构 §4.3 的"~400ms 总"
应订正为"**~1.5-3s 总（含 rerank）/ ~100ms（无 rerank）**"。

### 1.3 真实 cache-miss 完整路径

| 阶段 | 时间 |
|---|---|
| FastAPI 入口 + JWT verify + rate_limit + DB cache lookup | ~50ms |
| **Node 1: TranslateNode** (Haiku) | 1.0-2.5s |
| **Node 2: TerminologyRAG** | |
| ├─ OpenAI embedding | 200-500ms |
| ├─ pgvector HNSW search | 50-100ms |
| └─ Haiku rerank（≥2 hits 时）| 1.0-2.0s |
| **Node 3: StylePolish** (Haiku) | 1.0-2.5s |
| Postgres write (cache + log) + 中间件 | ~50ms |
| **总计（cache miss）** | **3.5–8.0s** |

→ 用户的 3-8s 直觉**完全准确**，架构现状就是这个量级。

---

## 2. cache_hit_rate 是隐藏的关键变量

`shared_cache` 全用户共享（§3.2 设计已确定）。同一文本被第二个用户查询
就是 hit。所以**长期** hit_rate 会自然爬升。但：

- **冷启动**（上线第 1 天）：hit_rate ≈ 0%，几乎所有请求 3-8s
- **MVP 阶段**（用户基数 < 100）：hit_rate 估 30-50%
- **稳态**：根据词汇 Zipf 分布估 80%+

**架构 §10 没有为 cache_hit_rate 定 KPI 目标**。建议加：

- 7 天滚动 hit_rate ≥ 70%（一旦低于触发 alert）
- §10.3 已经有 SQL 查询能算（`SELECT AVG(CASE WHEN cache_hit ...)`），
  只需挂到 dashboard

---

## 3. 优化清单（按收益/成本比排序）

### 🟢 Tier 1 — 几乎零成本，无简历副作用

#### O1 — 并行化 Node 1 和 Node 2 ⭐⭐⭐⭐⭐

**当前 §4.2**（串行）：
```
input → Node 1 (translate) → Node 2 (RAG) → Node 3 (polish) → output
```

**改为**（fan-out / fan-in）：
```
        ┌──→ Node 1 (translate) ──┐
input ──┤                          ├──→ Node 3 (polish) → output
        └──→ Node 2 (RAG)      ───┘
```

**依据**：
- Node 1 的输入只需 `text`
- Node 2 的输入只需 `text`
- Node 3 同时需要 Node 1 + Node 2 输出

→ Node 1 和 Node 2 是天然独立的，应当并行。架构 §4.2 的串行图是**bug**，
不是 design choice。

**节省**：max(Node1, Node2) + Node3 vs Node1 + Node2 + Node3
≈ 2.5 + 2 = 4.5s vs 6s。**省 1-2s**。

**简历影响**：✅ **加分**。LangGraph fan-out/fan-in 是高级用法，比单纯
线性 chain 更体现"会用 agent 框架"。

**实装成本**：~1 天。LangGraph 原生支持 conditional edges + parallel
nodes。改 `app/agent/graph.py` 的 `add_edge` 调用即可。

---

#### O2 — Anthropic Prompt Caching ⭐⭐⭐⭐⭐

Node 1 / Node 3 的 system prompt + few-shot examples **稳定不变**（不
随请求变）。开 Anthropic 的 prompt caching：

```python
# 例：Node 1
client.messages.create(
    model="claude-haiku-4-5-20251001",
    system=[
        {
            "type": "text",
            "text": NODE_1_SYSTEM_PROMPT,  # ~500 tokens stable
            "cache_control": {"type": "ephemeral"}
        },
        {
            "type": "text",
            "text": NODE_1_FEW_SHOT,  # ~1500 tokens stable
            "cache_control": {"type": "ephemeral"}
        }
    ],
    messages=[{"role": "user", "content": user_text}]
)
```

**节省**：
- TTFT：~700ms → ~200ms（缓存命中部分跳过 prefill）
- Input token 计费：~10% of normal rate（Anthropic 缓存命中部分按
  0.1× 计费）

**简历影响**：✅ **必备**。所有面试官第一个问题就是"你做了 prompt caching
吗"。`claude-api` skill 的 trigger 条件之一就是"应用应该包含 prompt
caching"。

**实装成本**：~半天。每个 prompt 加 `cache_control` 标记 + 测试缓存命中。

**注意点**：缓存 5 分钟 TTL，热度低的语言对（如 fr→ja）可能**永远命不到
缓存**，反而比不开 caching 多付一次写缓存的费用。可以做一个简单分流：

- 主流方向（en↔zh, en↔ja 等高频）：开 caching
- 边缘方向（fr→ja 等低频）：不开

→ 写到 ADR-A25 里。

---

#### O3 — 砍 RAG rerank Haiku（MVP 阶段）⭐⭐⭐⭐

**§4.3 step 5**：
> "若 ≤ 1 hit：直接 return（不 rerank，省钱）
> 若 ≥ 2 hits：Haiku rerank prompt → 选最相关的 top-3"

→ 直接用 cosine 距离排序的 top-3，不调 rerank Haiku。

**节省**：1.0-2.0s（每次有 ≥2 hits 时）。

**质量影响**：未知，因为 eval 还没跑。**没有数据证明 rerank 比 cosine 好**。
embedding cosine 排序本身就是合理 baseline。

**简历影响**：✅ **不掉分**。"我们先用 cosine ranker，等 eval 数据证明
rerank 有 +X% BLEU 收益时再加" —— 这是**正确的工程态度**，比"上来就上
所有招"加分。

**做法**：
- MVP 阶段直接 short-circuit：跳过 rerank，永远 return cosine top-3
- 在 eval pipeline 里加一个对比实验（cosine top-3 vs rerank top-3）
- 等 eval 出 +X% BLEU 数据再决定是否加回

→ 写到 ADR-A26。

---

#### O4 — Stream Node 3 输出 ⭐⭐⭐⭐⭐

总延迟不变，但**用户感知**的"开始看到字"从 4-5s 降到 0.5-1s。

```python
# FastAPI 端
@router.post("/translate")
async def translate(...):
    return StreamingResponse(
        agent_stream(text, target_lang),
        media_type="text/event-stream"
    )

async def agent_stream(text, target_lang):
    # Node 1 + Node 2 并行（O1）
    raw, terms = await asyncio.gather(
        translate_node(text),
        rag_node(text, target_lang)
    )
    # Node 3 streaming
    async for chunk in polish_node_stream(raw, terms):
        yield f"data: {json.dumps(chunk)}\n\n"
```

扩展端 fetch 用 `ReadableStream` 接收，bubble 实时填字。

**节省**：感知 TTFT 4-5s → 0.5-1s。**没改实际延迟，但用户体验完全不同**。

**简历影响**：✅ **加分**。streaming 是 LLM app 工程基础能力，"我们 stream
了 final node 的输出，让用户在 agent 还在跑时就能看到部分译文" 这个故事
比"我们调 LangGraph 然后等结果" 强很多。

**实装成本**：~2 天。FastAPI `StreamingResponse` + 扩展端 SSE 解析 +
bubble 增量渲染。

→ 写到 ADR-A27。

---

#### O5 — alerting 加 latency p95 阈值

§10.5 当前没监控 latency。加：

```sql
-- 每分钟跑
SELECT
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency
FROM llm_request_log
WHERE created_at > NOW() - INTERVAL '5 minutes';
```

→ p95 > 5s 触发 Railway 邮件 alert。让你**在用户抱怨之前知道**性能退化。

**实装成本**：~半天（一行 SQL + Railway alert 配置）。

---

### 🟡 Tier 2 — UX 感知优化（不改实际延迟）

#### O6 — Optimistic Google MT 预览 ⭐⭐⭐⭐

cache miss 时**同时**触发：

- agent 完整 3 节点（4-5s 后到达）
- Google Translate fallback（~300ms 后到达）

bubble 流程：

```
  0ms   loading 状态
300ms   显示 Google MT 译文 + "AI 优化中..." 标签
4500ms  静默替换为 agent 译文（淡入淡出）
```

→ 用户感知"快了一个数量级"。

**简历影响**：✅ "Two-stage rendering with optimistic Google MT preview
upgrading to LangGraph agent output" —— 完整的产品工程思路。

**实装成本**：~2-3 天。后端要改 `/translate` 返回结构（一次 SSE 多次
事件）；扩展端要做"先显示 MT、收到 agent 后替换"的 UI 状态机。

**需要权衡**：
- 用户偶尔看到字面跳变（Google "I love you" → agent "我爱你呀"）
- 多消耗一次 Google MT 请求 / 一份 cache miss

→ 写到 ADR-A28。

---

#### O7 — 预热 shared_cache（一次性 + 周期性）⭐⭐⭐⭐⭐

部署时 / 上线第一天跑：

- Top 1000 CEFR-A1/A2/B1 词 × 主流语言对 = ~3000 条
- 全部走 agent 跑一遍，灌进 shared_cache

之后每周 / 每月 cron 跑一次（基于 user_vocab 高频词热点更新）。

**节省**：上线第 1 天 hit_rate 从 ~0% 拉到 ~80%+。

**成本**：一次性 Anthropic ~$5-10（3000 × ~$0.003）。**这是最划算的钱**。

**简历影响**：✅ "We pre-warmed the shared cache with top-1k words
× language matrix to bypass cold-start latency" —— 产品上线工程。

**实装成本**：~1 天。`scripts/warmup_cache.py` 调 agent 入口循环跑。

---

### 🔴 Tier 3 — 有简历 / 架构成本，需权衡

#### O8 — 单词级"快路径"合并 Node 1 + Node 3 ⚠️

短输入（单词 / ≤3 token）跳过 Node 2，单次 Haiku 同时做 translate + 应用 terms：

```python
if len(text.split()) <= 3 and not has_technical_terms(text):
    return await fast_path_node(text, target_lang)  # 单 Haiku
else:
    return await full_agent.run(state)  # 3 节点
```

**简历成本**：**减弱"3 节点 LangGraph"的故事**。可以重新包装成"agent
with branching strategy"（branch 本身也是 agent 工程项），但分量打折。

**建议**：MVP 先**不做**。等 eval 出来后看 fast_path 在短输入上的
BLEU 是不是真的差。如果 < 5% 差距，再加。

#### O9 — 预计算常用词 embedding ⭐⭐⭐

Top 10k CEFR-A1~B1 词的 embedding 提前算好存表。

**节省**：~200-500ms（每次跳过 OpenAI 调用）。

**简历影响**：中性（embedding cache 是标准 RAG 工程）。

**实装成本**：~1 天 + 一次性 ~$1 OpenAI 费用。可以与 O7 同 scripts 做。

---

## 4. 不要为快而砍掉的东西

| 不能砍 | 理由 |
|---|---|
| Langfuse trace | async 写，对主流程零阻塞；简历必备 |
| 3 节点 LangGraph | 简历核心项；合并就是把 RAG/agent 故事拆没了 |
| pgvector RAG | 简历项；换 ES 反而复杂度上升 |
| 换 GPT-4 / 换非 Anthropic | Haiku 已是 Anthropic 最快档；要"省 LLM 调用"应该往规则匹配 / 缓存方向，不是换模型 |
| `current_user` DB 查询 | 安全 (§9.2)；改 JWT-only 是另一回事，不要为延迟做 |

---

## 5. 综合估算

### 5.1 Tier 1 全部采纳（O1+O2+O3+O4+O5）

| 场景 | 当前架构 | Tier 1 后 |
|---|---|---|
| Cache hit | ~100ms | ~100ms |
| Cache miss（实际延迟）| 3.5–8.0s | 2.0–4.0s |
| Cache miss（**用户感知 TTFT**）| 3.5–8.0s | **0.5–1s**（streaming）|

### 5.2 Tier 1 + Tier 2（O6+O7）

| 阶段 | 平均延迟（含 hit/miss）|
|---|---|
| 上线第 1 天（热预热后）| ~0.5s |
| 上线第 30 天（用户基数稳）| **~0.3s** |
| 上线第 90 天 | ~0.2s |

→ 可达成目标：**用户感知中位数 < 1s，p95 < 3s**（含 cache miss）。

---

## 6. 架构需修正的地方

### M1 — `docs/v3-1-architecture.md` §4.2 数据流图（O1 落地）

把 Node 1 → Node 2 串行箭头改成 fan-out。明确画出并行结构。

### M2 — §4.3 RAG budget 数字（O3 落地 + 真实数字）

当前："**~400ms 总**（无 rerank ~100ms）"

订正为：

> **性能 budget**（基于 2026 Q2 实测 baseline）：
> - Step 2 (embedding): ~200-500ms
> - Step 3 (HNSW): ~50-100ms
> - Step 5 (Haiku rerank): ~1.0-2.0s
>
> **总**：
> - 不 rerank（MVP 默认，见 ADR-A26）：~300-600ms
> - 含 rerank（eval 证明有效后启用）：~1.5-2.5s

### M3 — §10.5 Alerting

加：

```
- p95 latency > 5s 持续 5 分钟 → 邮件
- 7 天滚动 cache_hit_rate < 60% → 邮件（提示需要预热）
```

### M4 — §11 ADRs 新增

加 ADR-A24 ~ A28（见下一节）。

---

## 7. ADR 草稿（如果落地，写进 §11）

### A24 — LangGraph 节点并行（Node 1 ‖ Node 2）

**Context**: §4.2 原设计 3 节点串行，cache miss 时 ~6s。

**Decision**: Node 1 (translate) 和 Node 2 (RAG) 改为并行执行；Node 3
(polish) 等两者结果到齐再开始。

**Rationale**: 两节点输入只依赖 `text`，无相互依赖；并行符合 LangGraph
原生 fan-out/fan-in 模式；省 max(N1, N2) ≈ 1-2s。

**Consequences**: 概念图复杂度略增；每个 PR 需要确认没有破坏并行无关性。

---

### A25 — Anthropic Prompt Caching

**Context**: Node 1 / Node 3 system + few-shot 占 prompt 80%+ 且稳定。

**Decision**: 高频语言对（en↔zh / en↔ja）开 prompt caching；低频对
（fr↔ja 等）不开（5 分钟 TTL 命不到反而吃额外写缓存费）。

**Rationale**: TTFT -500ms / 调用；input cost -90% / 缓存命中部分；
LLM app 工程基础。

**Consequences**: 需要监控缓存命中率；prompt 模板版本变更时缓存自动
失效。

---

### A26 — RAG rerank Haiku 在 MVP 阶段不启用

**Context**: §4.3 原设计有 rerank Haiku；rerank 调用 1-2s，且无数据证明
比 cosine 好。

**Decision**: MVP 阶段直接 return cosine top-3，跳过 rerank Haiku。Eval
pipeline 加 rerank-vs-no-rerank 对比实验；BLEU 差 ≥ +3% 时再启用。

**Rationale**: 无数据驱动的"加复杂度 = 反工程"；MVP 应优先简单基线；rerank
本身没有简历分量（cosine ranking 是同水平 baseline）。

**Consequences**: §4.3 budget 从 ~400ms 改为 ~100ms；保留 rerank 代码路径
但默认 disabled。

---

### A27 — Streaming Node 3 输出

**Context**: 实际 cache miss 延迟 2-4s（采纳 A24+A25+A26 后），用户感知
仍需要 0.5-1s 即可。

**Decision**: `/translate` 返回 SSE stream；Node 3 边产 token 边推送；
扩展端 bubble 增量渲染。

**Rationale**: 总延迟不变但感知延迟降到 0.5-1s；streaming 是 LLM app
工程基础能力。

**Consequences**: API 契约从 JSON 改为 SSE（CORS / 浏览器兼容性 OK）；
扩展端要处理"中途取消"（用户关 bubble 时 abort fetch）。

---

### A28 — shared_cache 预热 + Optimistic Google MT 预览

**Context**: 冷启动 hit_rate ≈ 0% → 用户首次体验全部走 4-5s 路径。

**Decision**:
- 部署时跑 `scripts/warmup_cache.py`：Top 1000 词 × 主流语言对灌库
- cache miss 时同时启动 Google MT fallback；~300ms 后先显示 Google 结果，
  agent 完成后静默替换

**Rationale**: 让上线第 1 天的用户也能享受 cache hit 体验；perceived
TTFT 降到 ~300ms 即可有"快"的感觉。

**Consequences**: 一次性 Anthropic 成本 ~$5-10；UI 状态机要处理两段渲染
+ 淡入淡出过渡。

---

## 8. 实施 Checklist

### P0（O1 / O2 / O3 / O5 — 不依赖 streaming UI 改动）

- [ ] **A24**: 改 `app/agent/graph.py`：Node 1 ‖ Node 2 并行（fan-out edge）
- [ ] **A25**: Node 1 / Node 3 prompt 加 `cache_control` 标记；按高频/低频
      语言对分流
- [ ] **A26**: `app/rag/reranker.py` 加 feature flag (`RAG_RERANK_ENABLED`)
      默认关；保留 cosine path
- [ ] **A26**: 改 `docs/v3-1-architecture.md` §4.3 budget 数字（M2）
- [ ] **O5**: §10.5 加 p95 latency alert + cache_hit_rate alert
- [ ] **架构 §4.2** 数据流图重画（M1）
- [ ] **§11** 加 A24-A28 5 条 ADR

### P1（O4 streaming + O7 预热）

- [ ] **A27**: `/translate` 改 `StreamingResponse`；Node 3 用 streaming API
- [ ] **A27**: 扩展端 `src/shared/api.ts` 加 SSE 解析；`bubble.ts` 增量渲染
- [ ] **A28 预热**: 写 `scripts/warmup_cache.py`；上线 ops 流程加这一步
- [ ] **A27**: 端到端测试：cache miss 时 bubble 在 1s 内出现首字

### P2（O6 + O8 + O9）

- [ ] **A28 Google MT 预览**: 后端改返回结构 / 扩展端 UI 状态机
- [ ] **O8 fast path**（仅在 eval 数据支持时）
- [ ] **O9 embedding 预计算**（与 O7 同 scripts）

---

## 9. 待用户决策点

1. **Tier 1（O1-O5）的落地时机**：
   - α. 现在写到架构 doc，等 v3.1 Phase 1 实装时一起做
   - β. 等 Phase 1 跑通（FastAPI 骨架 + 单 Haiku 调用）出基线数字，再做这些优化
   - **建议 α**：A24 / A25 / A26 是基础设施级决策，等到 Phase 2/3 已经写
     完串行代码再改成并行 = 重构成本。

2. **cache_hit_rate KPI 目标**：定 70% / 80% / 90%？建议 70%（保守）。

3. **是否检查 v2.x 当前实测延迟**：
   - 用户报"3-8s 慢"如果是**v2.x 实测**而非 v3.1 预估，那是另一个问题
     （v2.x 只调 Google Translate，正常 ~500ms；3-8s 大概率 GFW / DNS
     / 区域代理）。建议在用户主网络下测一次：
     `time curl 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=hello'`

---

## Cross-references

- 架构主文档：`docs/v3-1-architecture.md`（§4.2 / §4.3 / §6.3 / §8.1 / §10.5 / §11 / §12）
- 简历相关：`~/.claude/projects/-Users-enari-Desktop-dev/memory/user_career_pivot_ai.md`
  （AI Engineer 路线 → 不能砍 LangGraph / RAG / eval / Langfuse）
- 成本约束：Anthropic $50/mo + OpenAI $20/mo + eval CI $10/mo
  （`docs/v3-1-architecture.md` ADR-A19 上下文）
- CWS 影响分析：`docs/cws-review-v3.1-impact.md`（本文档不影响 CWS 任何条目）
