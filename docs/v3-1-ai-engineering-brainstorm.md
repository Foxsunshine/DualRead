# v3.1 Brainstorm — AI Engineering Layer (c+ 跳槽路线)

> 2026-04-25 起头。v3.0 产品骨架（FastAPI + Postgres + Chrome 扩展 + Google
> OAuth + Anthropic 直调 LLM）当时已完成 brainstorm 与 architecture 落盘
> （`docs/v3-0-brainstorm-python.md`，已在 2026-04-25 docs cleanup 归档；
> 结论合并入 `docs/v3-1-architecture.md`）。本轮在其上叠加一层
> **AI 工程能力**，目的是把项目从"翻译 proxy + 共享缓存"升级
> 为"生产级 LLM agent 系统"，作为用户跳槽 AI 行业的练手项目（c+ 路线：
> AI 全栈主轴 + LangGraph 与 eval 两个尖峰）。
>
> 本文档是 brainstorming skill 全程的产物，到 Understanding Lock + Decision
> Log 为止。**不进入实现细节**，架构 / 代码交给后续 architect 和实现 skill。
>
> **与 v3.0 文档的关系**：v3.0 brainstorm + architecture 是产品骨架真相源；
> 本文档是 AI 工程层的增量。所有 v3.0 决策默认继承不变，本文档**只记录新增
> 与差异**。继承关系见 §11。

---

## 0. Raw input（用户原话，未加工）

1. "在进入开发之前我想确认一些问题，这个项目目前囊括以下哪些技能点？因为
   这是我准备用来跳槽跳到 AI 行业的练手项目"
2. 用户列出 12 个目标技能点：
   - Python + Web 开发
   - FastAPI 后端 + Next.js/React 前端
   - LangChain + LangGraph
   - 用 LangGraph 做多步骤 Agent 编排（翻译→术语查询→风格润色）
   - RAG（构建中日英技术术语库）
   - 向量数据库（pgvector / Chroma）
   - Prompt / Context Engineering（few-shot / 敬语 / 专业术语）
   - Agent 工具调用（词典 API / 术语库 / 风格检查器）
   - Fine-tuning 或 BLEU/COMET 评估 pipeline
   - 云部署（Cloud Run / AWS ECS + Terraform）
   - LLMOps（LangSmith trace + 评估 + token 消耗 / 延迟）
   - 业务价值表达（README 量化指标，如"专业术语翻译准确率从 70% → 92%"）
3. "目前这个项目囊括以下哪些？" + "选 c 是不是最合适的？"

---

## 1. Triage — c+ vs 纯 c vs 纯 a

### 1.1 现状对照表（v3.0 vs 12 个技能点）

| # | 技能点 | v3.0 覆盖度 | 备注 |
|---|---|---|---|
| 1 | Python + Web 开发 | 🟢 完全 | FastAPI / async SQLAlchemy / Alembic / pytest |
| 2 | FastAPI + Next.js/React | 🟡 部分 | FastAPI ✅；前端是 Chrome 扩展（React 19 + Vite），非 Next.js |
| 3 | LangChain + LangGraph | 🔴 0 | 当前直调 Anthropic SDK |
| 4 | LangGraph 多步 Agent | 🔴 0 | 当前流程是 1 步 |
| 5 | RAG | 🔴 0 | `shared_cache` 是精确 key 查询，非语义检索 |
| 6 | 向量数据库 | 🔴 0 | 仅 Postgres B-Tree |
| 7 | Prompt / Context Eng. | 🟡 最低 | 仅 prompt cache，无 few-shot 模板 |
| 8 | Agent 工具调用 | 🔴 0 | 无 tool use |
| 9 | Fine-tuning / Eval | 🔴 0 | 无评估 pipeline |
| 10 | Cloud / Terraform | 🔴 0 | Railway 零配置托管 |
| 11 | LLMOps | 🔴 0 | 纯 SQL 日志 |
| 12 | 业务价值量化 | 🟡 部分 | 有成本模型，无质量指标 |

**v3.0 综合命中：~20%（2.5/12）**。HR 看会判断"会写 FastAPI，但不懂 AI"。

### 1.2 三条候选路线对比

| 路线 | 工作量 | 简历叙事 | 月成本溢价 | 命中率 |
|---|---|---|---|---|
| **a. AI Engineer**（agent / RAG / eval / observability 全栈深做） | 5-6 月 | "生产级 LLM agent 系统" | +$15-20 | ~10/12 |
| **b. ML Engineer**（fine-tuning / 模型评估 / MLOps） | 6+ 月 | "翻译模型评估 + 微调 pipeline" | +$30-50（GPU）| ~7/12 |
| **c. AI 全栈**（c：会用 LLM API 的全栈） | 2-3 月 | "完整的 AI 翻译产品" | +$5-8 | ~5/12 |
| **c+. c 主轴 + a 的两个尖峰** | 3-4 月 | "Chrome 扩展 + LangGraph agent + 量化 eval" | **+$12** | **~10/12** |

### 1.3 Decision: c+ 路线（D-AI1）

c 是 v3.0 现状最契合的下一步，但市场过拥挤（"FastAPI + LangChain RAG 文档"
是 boot camp 标配项目）。c+ 在 c 基础上加 **LangGraph 多步 agent + 量化 eval
pipeline** 两个尖峰，达到："生产级 Chrome 扩展 + 多步翻译 agent + 真实用户
数据 + BLEU & LLM-as-judge eval + RAG **4 语**术语库"的简历叙事。

**目标简历句式**（最终落 README）：

> "Built a production Chrome extension serving 2k+ DAU. Designed a 3-step
> LangGraph translation agent (raw → terminology RAG → style polish) backed
> by pgvector retrieval over a 50k-term 4-language technical glossary
> (EN/ZH/JA/FR).
> Established a dual-layer evaluation pipeline (sacrebleu BLEU + Claude
> Sonnet 4.5 judge with 4-dimension rubric). The agent improved overall
> judge score from 6.8 to 8.4 (out of 10), with a 34% gain in terminology
> dimension."

---

## 2. Understanding Summary

### 2.1 做什么

在 v3.0 已锁定的产品骨架之上，**增量**完成下面五件事，构成 v3.1：

1. **LangGraph 三步 agent 替换单次 LLM 调用**（D-AI2）：
   `Node 1 Translate → Node 2 Terminology RAG Lookup → Node 3 Style Polish`
2. **pgvector + 4 语术语 RAG 库**（D-AI4）：
   - Seed = Wikidata + Wiktionary 公开数据（~10w 4 语对齐条目，覆盖
     EN/ZH/JA/FR）
   - 用户 `shared_cache` 持续动态增长（"自维护知识库" 叙事）
3. **BLEU + LLM-as-judge 双层 eval pipeline**（D-AI5 ~ D-AI8）：
   - sacrebleu 跑 500 条 sample，CI 回归
   - Claude Sonnet 4.5 跑 50 条 4 维度 rubric，release 评分
   - 数据集 = 300 自建 IT 术语 + 200 WMT 公开
   - Reference = LLM 初稿 + 10% 人工校对
4. **Langfuse Cloud LLM observability**（D-AI9）：
   - 每个 agent 节点 trace、token、latency
   - 免费层 50k events/月，DAU 3k 内不超
5. **Next.js Landing + Admin Dashboard**（D-AI10 ~ D-AI11）：
   - Landing：产品介绍、Chrome Web Store 跳转
   - Admin：DAU / 共享库 / Eval / Trace 面板
   - 部署 Vercel Hobby（$0）+ Cloudflare Access（admin auth）

### 2.2 为什么

- **市场目标**：c 路线市场拥挤，c+ 在简历上能实质区分（LangGraph + RAG +
  eval 量化数字 = 普通 c 候选人讲不出的故事）
- **现有资产复用**：v3.0 的真实用户、共享库、产品本体不浪费 —— c+ 让这些
  资产**反过来强化简历**（agent 用真用户数据训练 / eval 用真划词数据测）
- **AI Engineer 岗 pay 溢价 20-40%**（vs 普通全栈 5-15%）
- **3 个月时间预算够**（A1）：v3.0 原方案 30-40 天 + AI 增量 25-34 天 ≈
  55-74 天 ≈ 8-11 周；用户接受激进节奏（每周 20+ 小时）

### 2.3 给谁

- **用户本人**（求职目标 = AI Engineer / AI 全栈岗 / AI Product Engineer）
- **现有 DualRead 用户**（产品价值同步提升：agent 译文质量 > 单次 Haiku 译文）
- **未来面试官**（项目 demo 时能现场展示 agent trace + eval 数字 + admin
  dashboard）

### 2.4 关键约束

- **不动 v3.0 已锁决策**：γ 模式、Google OAuth、单体 FastAPI、Railway 部署、
  Postgres、storage 分层、LWW 同步等全部保留
- **3 个月时间预算**（A1）：每周 20+ 小时投入；超期就砍优先级最低的子项
- **LLM provider cap = $50/mo**（Anthropic dashboard）：
  - $20 → $50 升级（D-AI15）
  - 实际预期 $15-25/mo
- **扩展端用户体验不退化**：agent 三步走可能略增延迟（A3，~2.5s vs ~2s），
  接受
- **不引入 fine-tuning / cloud / IaC**（D-AI12）：取舍掉的，聚焦 AI 叙事

### 2.5 显式非目标

- ❌ Fine-tuning（属于 b 路线）
- ❌ ECS / Cloud Run / Terraform / Cloudformation（D-AI12）
- ❌ 用户 web dashboard（Q7 中 β/γ 排除，工程量爆炸 + 与扩展功能重叠）
- ❌ 技术 blog（虽然简历加分，超出 3 月时间预算）
- ❌ A/B 测试系统 / feature flag 服务（YAGNI，eval pipeline 已能比对版本）
- ❌ AI tutor 解释层（仍属 v3.x 增量，超出 c+ 范围）
- ❌ 自定义词库上传（继承 v2.1 backlog）
- ❌ 语音 / 音标（继承 v2.1 backlog）
- ❌ 付费订阅 UI / Stripe（继承 v3.0 非目标）
- ❌ Cross-vendor LLM-as-judge（self-preference 用 Sonnet 判 Haiku 已够；多
  vendor 等 staff-level 岗再做）
- ❌ COMET 评估指标（部署体积 + 边际收益小）
- ❌ Langfuse 自托管（MVP 用 cloud 免费层；DAU 3k 触顶后再切）
- ❌ β 阶段（难度评估）—— 但**预埋钩子**（D-AI3）

---

## 3. Assumptions

- **A1** v3.0 + AI 增量总工作量 55-74 天；3 个月（12-13 周 × 20 小时 ≈
  240-260 小时）能 cover；留 1 周 buffer
- **A2** Wikidata + Wiktionary 子集能在 1-2 天清洗出 ~10w 条 (en + 至少 1
  种 of zh/ja/fr) 多语对齐术语；FR label 覆盖率在 Wikidata 通常高于 zh/ja
  （社区活跃度）
- **A3** Claude Haiku 4.5 三节点 agent 总延迟 < 2.5s，用户感知差异可接受
- **A4** Langfuse Cloud 免费层 50k events/月在 DAU 3k 内不超
- **A5** Vercel Hobby Plan 对个人 Next.js 项目永久免费
- **A6** sacrebleu BLEU 在中日 reference 上能产出**有意义的差异**分数（绝对
  值不高没关系，relative 提升能讲故事即可）
- **A7** Cloudflare Access 免费层（10 邮箱白名单）足够 admin auth
- **A8** GCP console 配 OAuth Client 后，扩展 chrome.identity 稳定（继承
  v3.0 A1）
- **A9** 用户对 agent 三步走的延迟略增（~500ms）接受度 OK
- **A10** β 阶段（难度评估 + CEFR）通过预埋的 state 字段 + DB 列在不重构的
  情况下可追加（D-AI3）
- **A11** 用户的真实划词数据（来自 `shared_cache` + `llm_request_log`）数量
  和分布**足够**作为 eval 自建数据集的 base（300 条手挑 + 自动过滤）

---

## 4. Open Questions（非阻塞）

- **OQA-1** Prompt 用 LangChain `PromptTemplate` 还是 Python f-string？倾向
  LangChain template（生态一致 + 简历亮点）
- **OQA-2** RAG retrieval 用什么 distance metric？默认 cosine（pgvector
  默认）；测一次再定
- **OQA-3** 数据集 300 条自建 IT 术语怎么挑？倾向 100 手挑 + 200 从
  `shared_cache` 按 hit_count 降序取
- **OQA-4** Eval 频率：每 PR 跑 BLEU 全量？还是每周 cron？倾向 PR + cron 双轨
- **OQA-5** Langfuse 的 `user_id` 字段填 Google sub 还是 hash 后版本？倾向
  hash（保护 PII）
- **OQA-6** Admin stats 数据从主 Postgres 实时查还是缓存？倾向实时（数据量
  小，~$0 成本）
- **OQA-7** Next.js 路由：app router 还是 pages router？倾向 app router
- **OQA-8** LangGraph 的 state 用 `TypedDict` 还是 Pydantic model？倾向
  Pydantic（与 FastAPI 共用类型）
- **OQA-9** Embedding 模型选 `text-embedding-3-small` 还是 Voyage / 国产模型？
  倾向 OpenAI text-embedding-3-small（便宜 + 中日英效果佳；$0.02/M tokens）
- **OQA-10** RAG 命中阈值（cosine similarity > X 才算命中）？默认 0.7，eval
  时 sweep

---

## 5. Risks

继承 v3.0 R10-R15 + R-PY1-PY4，新增：

- **R-AI1 — LangGraph 状态机学习曲线**。LangGraph 不算难但 conditional
  edges / cycles 有陷阱。**Mitigation**：先做最简 3 节点线性链，避开循环；
  不熟时官方 cookbook 抄一遍。
- **R-AI2 — pgvector query 性能**。10w+ embedding 未配 IVFFlat / HNSW 索引
  时是线性扫描。**Mitigation**：实装强制建 HNSW 索引，pgvector 0.5+ 已支持。
- **R-AI3 — RAG 召回率不可控**。术语库再大，query embedding 和库 embedding
  对齐质量决定一切。**Mitigation**：eval pipeline 加 "RAG hit rate" 指标，
  实时可视。
- **R-AI4 — Sonnet judge 成本爆炸**。某天误把 50 条评分调成 5000 条 = 单次
  ~$42。**Mitigation**：eval 脚本硬编码 max sample = 100；超出 abort。
- **R-AI5 — Wikidata 数据质量风险**。CC0/CC-BY-SA 法律 OK，但部分翻译质量
  差。**Mitigation**：seed 时跑 LLM 质量审核（"这个翻译合理吗？"）过滤
  低分项。
- **R-AI6 — 3 月激进节奏 burn out**。20+ 小时/周对全职打工人非常紧。
  **Mitigation**：留 1 周 buffer；优先级最低的（Phase 5 / OQA-x）可砍。
- **R-AI7 — Langfuse Cloud 数据驻留**。用户划词文本会上传到 Langfuse。
  **Mitigation**：Privacy policy 显式列出；scrub `user_id` 为 hash；DAU 3k
  时切自托管是纯增量。
- **R-AI8 — Eval 数字 cherry-pick 嫌疑**。如果调 prompt 直到分高才停，HR 会
  看穿。**Mitigation**：报告中诚实写"baseline 配置 / N 次迭代 / 最终配置"；
  保留每次迭代的 BLEU 折线图作为佐证。
- **R-AI9 — 简历叙事和实装脱节**。3 个月赶节奏可能某些组件做"半成品"。
  **Mitigation**：每个 Phase 必须有可演示的 demo；过不了 demo 不算完成。
- **R-AI10 — Vercel / Cloudflare Access 免费政策变更**。不可控但概率低。
  **Mitigation**：Landing 静态导出可迁 GitHub Pages / Cloudflare Pages；
  Cloudflare Access 替代 = Vercel 自带 password protect。

---

## 6. Decision Log

继承 v3.0 D68-D81 + D-PY1-D-PY7，新增 D-AI1 到 D-AI16。

### D-AI1 — c+ 路线（c 主轴 + LangGraph + Eval 两尖峰）

**决定**：跳槽路线选 c+，**不**走纯 c / 纯 a / 纯 b。

**备选**：

- **a. AI Engineer 全量**：5-6 月时间，简历叙事最强但超时间预算
- **b. ML Engineer**：要 fine-tuning + GPU，超出现有时间 + 月成本预算
- **c. AI 全栈**：3 月可达，但市场拥挤
- **c+. c 主轴 + a 的尖峰**：3-4 月，简历差异化最强 ✅

**理由**：

- 用户跳槽目标明确，时间预算 3 月
- v3.0 已有产品资产是天然优势，强化它而不是另起项目
- LangGraph + eval 两个尖峰是普通 c 候选人讲不出的故事

**Trade-offs**：放弃 fine-tuning（b 路线）+ IaC（D-AI12 显式去掉）。

---

### D-AI2 — LangGraph α 流程：Translate → TerminologyRAG → StylePolish

**决定**：3 节点线性 chain。

```
Input: { text, source_lang, target_lang, user_native_lang }
   ↓
Node 1: Translate (Haiku) → raw_translation
   ↓
Node 2: TerminologyRAG (pgvector lookup + Haiku rerank) → matched_terms[]
   ↓
Node 3: StylePolish (Haiku, with terms context) → final_translation
   ↓
Output: { final_translation, matched_terms, model, latency_per_node }
```

**备选**：

- β 翻译 + 难度 + 学习建议（更"像 graph"，但 eval 难做，预留 vNext）
- γ 翻译 + 消歧 + 例句（多义词只占 10%，YAGNI）
- δ α + β 混合（4-5 月，超时间预算）

**理由**：

- α 最务实：3 月内可做完，eval 数据最容易拿
- RAG 用法最自然（术语库就是 RAG textbook 案例）
- "翻译质量从 X% 到 Y%" 简历叙事最直接

**Trade-offs**：α 严格说是 chain 不是 graph，LangGraph 价值打折；用 D-AI3
预埋钩子缓解。

---

### D-AI3 — α 阶段预埋 β 钩子

**决定**：在 α 实装时**预留** β 阶段（难度评估 + 学习建议）需要的字段，但
不在 α 阶段使用。

**预埋项**：

- **LangGraph state schema** 加占位字段：`user_cefr_level: str | None`,
  `word_difficulty: str | None`, `simplified_translation: str | None`,
  `advice: str | None`
- **DB schema** 加列：
  - `user_vocab.cefr_level: TEXT NULL`
  - `llm_request_log.input_word_cefr: TEXT NULL`
- 文档明确：state 字段可加不可改，加字段不算 breaking change

**理由**：

- 预埋成本 ≈ 0（多两行 schema）
- 不预埋的迁移成本 ~10-15%（β 上线时要 schema migration + 历史数据无 CEFR
  级别）
- LangGraph state 改字段一改就影响所有 trace，预埋避免 breaking change

---

### D-AI4 — RAG 数据源 = δ 混合（Wikidata 公开 + 用户共享库动态增长）

**决定**：

```
Seed Phase（一次性）:
  - Wikidata 子集（Q-id 多语 label，过滤 EN + ≥1 of (zh, ja, fr) 多语对齐项）
  - Wiktionary 补充（CC BY-SA）
  - 一次性灌库 ~50-70k 条目（含 FR 后规模略涨），embedding by
    text-embedding-3-small

Runtime Phase（持续）:
  - 用户每次 LLM 翻译写入 shared_cache
  - 同一 transaction 计算 embedding 写入 pgvector 列
  - 库随用户量动态增长

Maintenance Phase（v3.x，预埋不实装）:
  - 离线 cron 跑 LLM 质量审核
  - 标记低分条目 / 去重
```

**备选**：

- α Wikidata 单源：早期 tri-语对齐覆盖率低
- β LLM 全生成 seed：循环依赖嫌疑，简历叙事弱
- γ 用户共享库 only：早期数据稀疏

**理由**：

- 简历叙事最强："集成开源数据 + 用户使用动态增长 + LLM 自动质量审核 = 4 语
  技术术语 RAG 系统"
- 即开即用 + 长期增长
- 涵盖数据工程 + RAG + agent 三维度

**Trade-offs**：seed 工作量 4-5 天（vs β 半天）；DB 存储增量 ~150 MB（仍
在 Railway Postgres 1 GB 免费层）。

---

### D-AI5 — Eval 双指标：BLEU + LLM-as-judge

**决定**：

| 指标 | 工具 | 跑频率 | 用途 |
|---|---|---|---|
| BLEU | sacrebleu | 每 PR + 每周 cron | CI 回归，防 regression |
| LLM-as-judge | Claude Sonnet 4.5 | 每次 release 前手动 | 质量主评分；填进简历"X% → Y%" |

**Rubric（4 维度）**：

1. 译文准确性（accuracy）
2. 术语规范性（terminology）
3. 流畅度（fluency）
4. 与上下文契合度（context-fit）

每条 1-10 分。

**备选**：

- α BLEU only：中日翻译 BLEU 不准，"X% → Y%" 数字不可信
- β LLM-as-judge only：缺自动化 anchor，CI 不便宜
- δ + COMET：模型 850 MB 部署负担，边际收益小

**理由**：

- BLEU 做 CI anchor + LLM-as-judge 做主指标 = 互补且业界主流
- Sonnet 4.5 当 judge 评判 Haiku 输出 = stronger tier 缓解 self-preference

---

### D-AI6 — Eval 数据集 = 300 自建 IT + 200 WMT 混合

**决定**：

```
Test Set 1 (Domain): 300 条自建 IT 术语集（仅 zh/ja 语对，详见 D-AI16）
  → 100 手挑 + 200 从 user shared_cache 按 hit_count 取
  → 主指标，简历核心数字来源
  → FR 不进 eval（D-AI16 锁定，作为产品扩展性证据而非量化对象）

Test Set 2 (General): 200 条 WMT-23 / FLORES 抽样
  → 对照组，避免 cherry-pick 嫌疑
  → 简历背书"benchmarked against WMT-23"
```

**备选**：

- α WMT only：通用领域，对 IT 任务弱相关
- β 用户数据 + LLM ref only：reference 来源弱
- γ 自建 only：cherry-pick 嫌疑

**理由**：双数据集让简历叙事可信度最高，工程增量小（+0.5 天读 WMT loader）。

---

### D-AI7 — Reference 来源 = LLM 初稿 + 10% 人工抽检

**决定**：

```
1. Claude Opus 给所有 500 条产 reference (~30 分钟，~$1)
2. 用户抽 50 条人工检查 (10% 抽样，~1 小时)
3. 发现错误 → 修正
4. 把 50 条人工校对版作为 LLM-as-judge 的 calibration set
```

**备选**：

- a 全人工：1 周工作量，solo dev 不现实
- b 全 LLM：循环依赖严重

**理由**：1 小时人工把关 + LLM 规模化生产 = 性价比最优；calibration set
作为 judge 标定基准，简历加分。

---

### D-AI8 — Judge 模型 = Claude Sonnet 4.5 + 双 pass randomized

**决定**：

- **Judge 模型**：Claude Sonnet 4.5（stronger tier，judge Haiku agent 输出）
- **Position bias 控制**：每样本跑 2 次（顺序 A→B 和 B→A），取平均
- **不做 cross-vendor**（GPT-4 / Gemini 当 judge）

**备选**：

- Haiku judge：self-preference bias 严重
- GPT-4 cross-vendor：bias 控制最佳但成本翻倍 + 多 API key
- Cross-vendor mix（Sonnet + GPT-4 各跑一半）：staff-level 岗再做

**理由**：

- Sonnet 评 Haiku 的 self-preference 在 4 维度 rubric 下不算严重问题
- Cross-vendor 简历价值边际递减，工程复杂度 +1
- $1/mo 成本 vs $0.16/mo 节省不值得

---

### D-AI9 — Observability = Langfuse Cloud（免费层）

**决定**：

- Langfuse Cloud + LangChain SDK 一行注释集成
- 免费 50k events/月
- 每个 LangGraph 节点自动 trace，token、latency 自动捕获
- DAU 3k+ 触顶时切自托管（纯增量改造）

**备选**：

- α LangSmith Cloud：免费 5k/月，DAU 1k+ 即触顶 $39/mo
- γ Langfuse 自托管：$3-5/mo，但 +2-4 小时部署成本
- δ 自建 Postgres dashboard：工程量爆炸 + 简历叙事弱

**理由**：

- 免费层覆盖整个 MVP 阶段（DAU 3k 内）
- Cloud 部署 = 0 时间
- 简历价值已经够（"集成 Langfuse 做 LLM observability"）
- 触顶后切自托管 = 0 重构

**Trade-offs**：用户划词文本驻留 Langfuse 服务器（PII 顾虑），用 hash
`user_id` 缓解；privacy policy 显式列出。

---

### D-AI10 — Next.js δ 范围：Landing + Admin（不做用户 dashboard）

**决定**：

- **Landing page** (`/`)：hero / features / screenshots / Chrome Web Store 跳转
- **Admin** (`/admin/*`)：受 Cloudflare Access 保护
  - `/admin` 总览：DAU / MAU / 登录率 / 每日 LLM 调用
  - `/admin/cache` 共享库浏览：top 命中词、按 (src,tgt) 分布
  - `/admin/eval` Eval 结果：BLEU / judge 分数趋势图
  - `/admin/users` 用户列表
  - `/admin/traces` 嵌 Langfuse iframe + 自家精选指标

**不做**：

- 用户 web dashboard（功能与扩展 sidepanel 重叠 80%；auth 链路重做）
- Blog（超时间预算）

**备选**：

- α Admin only：HR 看简历会问"用户在哪里用？"
- β Admin + 用户 dashboard：auth 重做 + 工作量爆炸
- γ Admin + 用户 + Landing + Blog：3 周以上

**理由**：δ 是工程量 / 简历价值最优解（~7-9 天）。

---

### D-AI11 — Admin Auth = Cloudflare Access

**决定**：用 Cloudflare Access 免费层（10 邮箱白名单）保护 `/admin/*`。

**备选**：

- a 简单 password env var：安全性低
- c Google OAuth admin allowlist：与 chrome.identity flow 不一致，工作量翻倍

**理由**：

- 0 代码（Cloudflare 配置即可）
- 邮箱白名单足够个人项目
- 简历可写"Cloudflare Access for zero-trust admin auth"

---

### D-AI12 — 不做 IaC / Cloud / Terraform（聚焦 AI 叙事）

**决定**：保留 Railway 现状，**不**迁 GCP Cloud Run / AWS ECS，**不**写
Terraform。简历放弃技能点 #10。

**备选**：

- δ Railway prod + GCP Cloud Run staging via Terraform：~4 天工作量
- ε AWS App Runner + Terraform：~5-6 天工作量

**理由**：

- 12 技能点中放弃 1 项换 4-5 天投到 AI 核心叙事
- AI Engineer / 全栈岗 IaC 是 nice-to-have，非 deal-breaker
- 3 月时间预算下，AI 尖峰深度 > 技能广度

**Trade-offs**：12 项命中率从 ~10/12 降到 ~9/12；可接受。

---

### D-AI13 — 时间预算 = 3 个月（激进节奏）

**决定**：

- **总时长**：12-13 周
- **每周投入**：20+ 小时
- **总有效时长**：240-260 小时
- **Buffer**：留 1 周应对意外（生病 / 工作冲突 / 调试卡壳）

**备选**：

- 4-5 月（正常节奏，每周 12-15 小时）
- 6+ 月（保守，市场窗口风险）

**理由**：

- AI 招聘热度变化快（2026 年仍热但波动）
- 用户接受激进节奏
- 3 月足够 cover 所有锁定决策（A1）

---

### D-AI14 — Phase 排序 = X（AI 先 / Web 最后）

**决定**：

```
Phase 1 (Week 1-3): v3.0 原方案 Phase A-G
   → FastAPI / auth / 共享缓存 / 多语言 UI
   → 阶段成果：可用产品上线
   ↓
Phase 2 (Week 4-6): LangGraph 三步 agent + pgvector RAG + Prompt 模板
   → AI 核心叙事先成形
   → 阶段成果：agent demo 可演示
   ↓
Phase 3 (Week 7-8): Eval pipeline + 数据集
   → 拿到简历的"X% → Y%"数字
   → 阶段成果：BLEU + judge report 可贴简历
   ↓
Phase 4 (Week 9): Langfuse 集成 + α/β 钩子预埋
   → LLMOps 关键词到位
   → 阶段成果：trace dashboard 可演示
   ↓
Phase 5 (Week 10-12): Next.js Landing + Admin
   → 最后包装，简历可投
   → 阶段成果：完整产品 portfolio
```

**备选**：

- 排序 Y（Web 先 / AI 后）：Landing 没核心 AI 故事可讲，3 月太晚才能投

**理由**：

- AI 核心（Phase 2-4）先到位，简历可在 Phase 4 末（Week 9）开始投
- Next.js 是包装，Phase 5 任何时间补都行
- 每 phase 完成都有可投价值

---

### D-AI15 — LLM Provider Cap = $20 → $50/mo

**决定**：将 Anthropic dashboard 的 monthly spending cap 从 $20 升到 $50。

**理由**：

- c+ 改造后稳态月成本 ~$20-22；峰值波动 +$10-15
- $50 留余量给 agent 真实跑（不被迫做"30% sampling"妥协）
- 实际预期 $15-25/mo（远低于 cap）
- 这是练手项目，月 $50 = 一杯咖啡

**Trade-offs**：成本风险窗口扩大，但 rate limit per-user 10/分钟兜底；
最坏情况 $50 自动停服。

---

### D-AI16 — 4 语支持但 Eval 仅覆盖 zh/ja（2026-04-25 修订）

**决定**：v3.1 的 agent / RAG / Prompt 模板 / Welcome / DR_STRINGS 全部
扩到 **4 语（CN / JA / EN / FR）**，配合 v3.0 的 D-PY7。但 v3.1 的 BLEU +
LLM-as-judge eval pipeline **仅覆盖 zh / ja 语对**，FR 不进 eval 数据集。

**Why now**：用户 2026-04-25 反馈"想做中日英法 4 语"，原 brainstorm 默认
3 语是早期遗漏。

**为什么 Eval 不扩到 FR**：

- MVP 简历核心数字针对中文求职者，主要看 zh / ja 翻译质量
- FR eval 需要再产 ~100 条 FR ref + 半天人工抽检 + ~$0.5 成本
- 时间 / 收益不划算（+2-3 天 vs 简历 ROI 边际收益小）
- FR 作为"产品已支持的扩展性"证据已足够

**简历叙事调整**：

- 原："tri-lingual translation agent"
- 新："**4-language** translation agent (CN/JA/EN/FR) with quality
  benchmarked on **CN/JA pairs**; FR support inherits the same architecture,
  eval expansion deferred to v3.x"

**改动范围（与 D-PY7 互补）**：

- D-PY7 负责 schema / UI / Welcome
- D-AI16 负责 prompt few-shot 加 FR 相关对（en→fr / zh→fr / ja→fr / fr→zh）
- RAG seed 过滤条件加 FR label
- Eval pipeline 不动

**备选**：

- β. Eval 扩到 4 语，每对 100 条：+2-3 天 + $2，简历完整但 ROI 低
- γ. FR 只跑 BLEU 不跑 judge：+1 天，折中

**选 α（不扩展）的理由**：MVP 时间预算紧，FR 在产品维度足够，简历诚实
声明 "FR coverage inherits architecture" 比强行硬塞数据更可信。

**工作量增量**：~3.5-4.5 天，落在 1 周 buffer 内。

**月成本影响**：embedding 一次性 +$0.02；运行时增量 < $0.5/mo（FR 用户
本就少）。

---

## 7. Non-Functional Requirements

### NFR-1 性能（在 v3.0 NFR 基础上更新）

| 场景 | 目标 | 备注 |
|---|---|---|
| Agent 端到端延迟（cache miss + 3 nodes） | **< 2.5s** | vs v3.0 单次 ~2s |
| 单节点延迟 | < 800ms | Translate / Polish |
| RAG retrieval（pgvector HNSW） | < 50ms | 10w 条 / cosine |
| Cache hit 路径 | < 100ms | 不变 |
| Eval BLEU 跑 500 条 | < 60s | sacrebleu 纯 Python |
| Eval judge 跑 50 条双 pass | < 5min | Sonnet 限速主导 |
| Langfuse trace upload 延迟 | < 100ms 异步 | 不阻塞主流程 |
| Admin dashboard 加载 | < 1s | 数据量小 |

### NFR-2 规模（沿用 v3.0 + AI 增量）

| 时期 | DAU | 登录 DAU | 月 Agent 调用 | 月 Eval 调用 |
|---|---|---|---|---|
| Phase 4 末（M3） | 500 | 75 | ~8.4k | 2 release × 50 = 100 |
| 稳态 12 月 | 2,000 | 300 | ~33.7k | 同上 |
| 规模 24 月 | 5,000 | 750 | ~84.4k | 同上 |

### NFR-3 安全 / 隐私

继承 v3.0 NFR-3，新增：

- **Langfuse PII**：`user_id` 字段填 SHA256(google_sub)；不传明文
- **Privacy policy 更新**："登录后划词文本会发给 Anthropic + Langfuse"
- **Admin auth**：Cloudflare Access 邮箱白名单 = 单一 admin（用户本人）+
  可选 1-2 个面试官 demo 邀请
- **Vercel 部署 secrets**：环境变量管理；不进 repo
- **Eval data**：自建数据集不含真实用户 PII（手挑时确保）

### NFR-4 可靠性 / 降级

继承 v3.0 NFR-4，新增：

- **LangGraph 单节点失败 → fallback 链**：
  - Node 1 失败 → 整体降级到 Google Translate
  - Node 2（RAG）失败 → 跳过 RAG，Node 3 用 Node 1 输出做 polish
  - Node 3 失败 → 返回 Node 1 的 raw_translation
- **pgvector 不可用 → RAG 跳过**：agent 退化为 2 节点（Translate + Polish）
- **Langfuse upload 失败 → 异步 retry，不阻塞**
- **Vercel 挂 → Landing / Admin 不可访问，但产品（扩展 + Railway 后端）
  不受影响**

### NFR-5 运维

继承 v3.0 NFR-5，新增：

- **Langfuse alert**：免费层 80% 时邮件提醒（自动）
- **Anthropic alert**：$40/mo 时邮件提醒（手动配 Anthropic dashboard）
- **Vercel build failure**：GitHub Action 失败邮件
- **Eval pipeline**：每 PR 跑 BLEU；每 release 手动跑 judge

### NFR-6 数据保留

继承 v3.0 NFR-6，新增：

- **Langfuse traces**：cloud 默认保留 30 天（够调试）
- **Eval reports**：永久保留在 git（markdown report + JSON 数据）

---

## 8. Cost Model

### 8.1 一次性成本

| 项 | 成本 |
|---|---|
| RAG seed: Wikidata + Wiktionary embedding (~10w 条 × 30 tokens × $0.02/M) | **~$0.06** |
| RAG seed: 用户 shared_cache embedding (~5w 条) | **~$0.03** |
| RAG quality audit (LLM 审核 10w 条) | **~$1** |
| Eval reference: Claude Opus 给 500 条打 ref (50 tokens out × $25/M) | **~$0.6** |
| **一次性合计** | **~$2** |

### 8.2 稳态月成本（DAU 2k / 登录 300 / 85% cache 命中）

| 项 | 单次 | 频率 | 月成本 |
|---|---|---|---|
| Agent LLM 调用（3 nodes × Haiku）| $0.0004 / 次 | 33,750 次（85% miss = 5,063） | **~$2** |
| RAG embedding（query embedding）| 30 tokens × $0.02/M | 33,750 次 | **~$0.02** |
| Eval BLEU | $0 | 每周 | $0 |
| Eval judge（Sonnet 双 pass × 50 条）| $0.42 / 次 | 2 次/月 | **~$1** |
| Langfuse Cloud | $0 | 33k events | **$0** |
| Vercel Hobby | $0 | — | **$0** |
| Cloudflare Access | $0 | — | **$0** |
| **AI 增量月成本** | | | **~$3** |
| **+ v3.0 base 月成本** | | | $8 |
| **c+ 总月成本（DAU 2k）** | | | **~$11** |

### 8.3 各阶段成本曲线

| 时期 | DAU | v3.0 base | AI 增量 | **总** |
|---|---|---|---|---|
| Phase 4 末 (M3, 500 DAU) | 500 | $1 | $1 | **$2** |
| 稳态 6 月 (1k DAU) | 1k | $4 | $1.5 | **~$6** |
| 稳态 12 月 (2k DAU) | 2k | $8 | $3 | **~$11** |
| 规模 24 月 (5k DAU) | 5k | $32 | $8 | **~$40**（升 Pro $25 后）|
| 规模 DAU 10k | 10k | $40 | $15 | **~$55** |

### 8.4 触发付费阶跃的临界点

- **Anthropic $50 cap**：实际预期触不到（最大 $20 左右）
- **Railway Hobby → Pro**：DAU ~5k 时 Postgres 1GB 触顶 → +$15
- **Langfuse Cloud free → Pro**：DAU ~3k 时 50k events/月触顶 → 切自托管
  ($3-5/mo) 或 cloud Pro ($59/mo)
- **Vercel Hobby → Pro**：商业流量 / 团队成员 → $20/mo（个人项目永远免费）

### 8.5 关键洞察

1. **AI 增量月成本只占总成本 ~30%**（Haiku 极便宜 + Langfuse 免费 + 共享库
   高命中）
2. **$50 cap 撑到 DAU ~5k**，远超 c+ 项目周期需要
3. **一次性成本 ~$2 ≈ 一杯咖啡**
4. **Eval pipeline 月成本 $1**，简历核心叙事的"X% → Y%"数字成本极低
5. **没有共享库的反事实**：3 节点 agent × 33k 调用 × 100% miss = $13.5/mo，
   有共享库后降到 $2 —— **共享库的规模经济在 AI 路线下更显著**

---

## 9. Understanding Lock

本文档已完整覆盖 brainstorming skill 要求：

- ✅ 当前项目状态评审（v3.0 brainstorm + architecture + v2.1.x 文档已读）
- ✅ 决策逐项多选 + 理由（D-AI1 ~ D-AI16，共 16 条）
- ✅ Non-Functional Requirements（§7 六类，继承 + 增量）
- ✅ Assumptions（A1 ~ A11）
- ✅ Open Questions（OQA-1 ~ OQA-10，非阻塞）
- ✅ Risks（R-AI1 ~ R-AI10 + 继承 v3.0）
- ✅ Cost Model（§8 一次性 + 稳态 + 阶段曲线 + 临界点）
- ✅ 显式非目标（§2.5）

**Understanding Lock 完成 2026-04-25**。所有 Q1-Q9 + cap + 时间预算用户均
已显式确认。

---

## 10. Handoff to Architect

本文档**不包含**以下内容，留给后续 architect skill 展开：

### LangGraph Agent 架构

- 3 节点的具体 Pydantic state schema（含 D-AI3 预埋字段）
- Conditional edge 逻辑（短词 vs 长句路由）
- 单节点失败的精确 fallback 链路
- LangChain `PromptTemplate` 还是 f-string（OQA-1）

### RAG 实现细节

- pgvector HNSW 索引参数（`m`, `ef_construction`, `ef_search`）
- 距离 metric 选型（OQA-2，默认 cosine）
- Embedding 模型选型（OQA-9，倾向 `text-embedding-3-small`）
- RAG 命中阈值（OQA-10，默认 0.7）
- 混合检索（embedding + keyword exact match）的合并策略
- Reranking 是否需要（小规模可以先不做）

### Wikidata / Wiktionary Seed 流程

- 数据 dump 来源（Wikidata SPARQL endpoint vs JSON dump）
- 多语对齐过滤逻辑（EN + ≥1 of zh/ja/fr 至少二语，还是更严格的三/四语对齐）
- 清洗策略（去重 / 去标点 / 去技术符号）
- LLM 质量审核 prompt 模板
- 失败重试 / checkpoint 机制（10w 条灌库可能要几小时）

### Eval Pipeline

- Test set CSV 格式 schema
- BLEU 计算的 tokenizer 选型（中日要用 `mecab` / `jieba` 还是 `13a` 默认）
- Sonnet judge 的 4 维度 rubric 完整 prompt
- Calibration set 用法（如何对比 LLM judge 与人工评分）
- Eval report 输出格式（markdown / HTML / Slack 通知）
- BLEU 折线图生成（matplotlib / plotly）

### Langfuse 集成

- LangChain `langfuse_callback_handler` 配置
- `user_id` hash 函数选型
- Trace 元数据字段（model / source_lang / target_lang / cache_hit）
- 异常 / fallback 时的 trace 标注

### Next.js Landing + Admin

- 项目目录结构（monorepo 还是独立 repo）
- shadcn-ui / Tailwind 选型
- Admin API 怎么和 FastAPI 后端通信（同 Cloudflare Access JWT 还是独立 token）
- 数据图表库（Recharts / Tremor / Plotly）
- Cloudflare Access JWT 验证逻辑

### CI/CD

- GitHub Actions 工作流（PR / staging / prod）
- Railway 部署触发
- Vercel 部署触发
- Eval pipeline 跑在哪（GitHub Actions runner / Railway cron / 本地手动）

### 测试策略

- LangGraph 节点单元测试（mock LLM）
- Eval pipeline 集成测试
- Next.js E2E 测试（Playwright）
- 扩展端 + 后端 contract 测试

**下一步**：运行 architect skill，以 v3.0 架构文档 + 本文档作为输入，产出
v3.1 实装计划。

---

## 11. Cross-reference to Existing Documents

### 11.1 与 v3.0 文档的关系

| v3.0 决策 | 在 v3.1 中的状态 |
|---|---|
| D68（v3.0 pivot）| 继承不变 |
| D69（AI 替代翻译）| **强化**：从单次 LLM → 3 节点 agent |
| D70（γ 模式）| 继承不变 |
| D71（无额度 + per-user rate limit）| 继承不变 |
| D72（Google OAuth）| 继承不变 |
| D-PY1 ~ D-PY6（Python / Railway / JWT 等）| 继承不变 |
| D73（母语一体化）| 继承不变 |
| D74-D80（Welcome / vocab 同步等）| 继承不变 |
| D79（Haiku 单点 abstraction）| **扩展**：abstraction 内部从 1 调变 3 调；模型不变 |
| D81（不做 keep-warm）| 继承不变 |

### 11.2 v3.1 新增决策（D-AI1 ~ D-AI16）

| ID | 主题 | 状态 |
|---|---|---|
| D-AI1 | c+ 路线 | 锁定 |
| D-AI2 | LangGraph α 三节点 | 锁定 |
| D-AI3 | β 钩子预埋 | 锁定 |
| D-AI4 | RAG δ 混合数据源 | 锁定 |
| D-AI5 | BLEU + Judge 双层 eval | 锁定 |
| D-AI6 | 数据集 300 + 200 混合 | 锁定 |
| D-AI7 | Reference LLM + 抽检 | 锁定 |
| D-AI8 | Sonnet judge + 双 pass | 锁定 |
| D-AI9 | Langfuse Cloud | 锁定 |
| D-AI10 | Next.js Landing + Admin | 锁定 |
| D-AI11 | Cloudflare Access | 锁定 |
| D-AI12 | 不做 IaC | 锁定 |
| D-AI13 | 3 月激进时间预算 | 锁定 |
| D-AI14 | Phase 排序 X | 锁定 |
| D-AI15 | LLM cap → $50 | 锁定 |
| D-AI16 | 4 语支持 + Eval 仅 zh/ja | 锁定（2026-04-25）|

### 11.3 12 技能点最终命中表

| # | 技能点 | v3.0 | v3.1 | 简历叙事点 |
|---|---|---|---|---|
| 1 | Python + Web 开发 | 🟢 | 🟢 | FastAPI / async / SQLAlchemy / Alembic / pytest |
| 2 | FastAPI + Next.js/React | 🟡 | 🟢 | FastAPI 后端 + Chrome 扩展 (React) + Next.js Landing/Admin |
| 3 | LangChain + LangGraph | 🔴 | 🟢 | 3 节点 LangGraph agent |
| 4 | LangGraph 多步编排 | 🔴 | 🟢 | Translate → RAG → Polish 链 |
| 5 | RAG | 🔴 | 🟢 | pgvector + 4 语术语库（EN/ZH/JA/FR） + 用户动态增长 |
| 6 | 向量数据库 | 🔴 | 🟢 | pgvector + HNSW 索引 |
| 7 | Prompt / Context Eng. | 🟡 | 🟢 | LangChain template + few-shot + prompt cache |
| 8 | Agent 工具调用 | 🔴 | 🟡 | RAG retrieval = 浅版 tool use |
| 9 | Eval Pipeline | 🔴 | 🟢 | BLEU + Sonnet judge + 4 维度 rubric + 双 pass |
| 10 | Cloud / Terraform | 🔴 | 🔴 | **D-AI12 取舍掉** |
| 11 | LLMOps | 🔴 | 🟢 | Langfuse Cloud + per-node trace |
| 12 | 业务价值量化 | 🟡 | 🟢 | "judge score 6.8 → 8.4 (+24%)" + cost model |

**v3.1 综合命中：~9.5/12 ≈ 85%**

---

*End of v3.1 brainstorm.*
