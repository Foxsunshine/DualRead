# v3 产品设计 —— 双通路翻译 + AI 精翻

> 写于 2026-04-25，Phase 1 W5 落地后的架构修订。捕捉当下到 Phase 5
> 的稳态产品形态，是后续所有 Phase 2+ 开发的设计 source of truth。
>
> 此文档**取代**早期 brainstorm 中"signed-in 用户翻译都走 backend"
> 的隐含假设 —— 那是 W5 的实施失误，已确认要 revert。

---

## §1 背景与教训

### 1.1 W5 实施失误

Phase 1 W5#5b 把已登录用户的所有 translate 流量切到了 Railway backend。
现实测试：

- v2.x 本地 Google MT 直连：~200ms
- W5#5b 经 backend 中转：1-3s（命中 Railway 冷启动时 10s+）

划词翻译是 DualRead **最高频**的交互（一次会话几十次），任何 1s+
的延迟都是 product-killing 的。

### 1.2 根本误读

W5 设计假设 backend translate 的价值是 shared_cache（跨用户去重
Google MT 调用）。事实：

- 单用户层面，shared_cache 是**纯负担** —— 多一跳网络换一个用户
  自己感觉不到的"成本节省"
- shared_cache 真正有意义的场景是 Phase 2 的 LangGraph agent，
  那里 cache miss 意味着 3 次 Claude 调用（贵 + 慢），cache hit
  才有真实跨用户价值
- Phase 1 用 Google MT 单跳调用包装到 backend，相当于"拿 Phase 2
  的延迟代价换 Phase 1 的体验质量"，两头亏

### 1.3 决策

**双通路模型**。把翻译拆成两个独立产品场景，让用户**永远不等
慢的东西** —— 慢的东西必须是用户**显式选择**的。

---

## §2 双通路模型

| 通路 | 触发 | 速度 | 翻译质量 | 实现 |
|---|---|---|---|---|
| **快译** | 划词 / 选段 / 点击高亮词，**自动** | ~200ms | 字面对译 | 本地 `translate.googleapis.com` 直连，cache 在 `chrome.storage.session` |
| **精译** | 用户**显式**触发（气泡按钮或全局开关 + 划词） | 3-8s | RAG 上下文 + 风格 + 习语 | Backend `/translate-agent`（Phase 2 起，LangGraph 3-node）|

**核心命题**：用户对延迟的容忍度直接和"我主动选择"成正比。
划词后 5s 才出结果是糟糕 UX；点了"AI 精翻"等 5s 是合理 UX。

### 2.1 两条通路的关系

- **快译永远先发**。划词 → Google MT → 200ms 结果 → 渲染。
- **精译可选叠加**。如果触发了精译，**等结果到达后**追加显示在
  快译结果旁/下方。**精译永远不替换快译**，只是 enhance。
- **失败兜底**。精译挂掉 → 静默退化，快译已经在用户面前了。

---

## §3 UX 状态机

### 3.1 Settings 全局 AI 精翻开关

新增 Settings → AI 精翻区块：

```
┌─ AI 精翻 ────────────────────────────────┐
│ ◯  自动 AI 精翻                          │
│    划词时自动叠加 Claude 生成的精翻       │
│    （需登录，每次约 3-5 秒）              │
└─────────────────────────────────────────┘
```

三个状态：

| 全局开关 | 登录态 | 行为 |
|---|---|---|
| OFF（默认） | 已登录 | 划词 = 快译（Google MT），气泡里"✨ AI 精翻"按钮 active |
| OFF（默认） | 未登录 | 划词 = 快译，气泡里"✨ AI 精翻"按钮 disabled，tooltip "登录后解锁" |
| ON | 已登录 | 划词 = 快译先显，**自动**触发精译，精译结果到达后追加渲染 |
| ON | 未登录 | 开关本身灰 disabled，hover 提示"登录后解锁"，行为同 OFF |

### 3.2 气泡里的 "✨ AI 精翻" 按钮

气泡布局（划词或点击高亮词后）:

```
┌─ DualRead 气泡 ──────────────────────────┐
│ profound                                 │
│ 深刻的，深奥的                            │  ← 快译，秒出
│                                          │
│ ┌─[✨ AI 精翻]─┐  [+保存]                │  ← 按钮
│ └──────────────┘                         │
└──────────────────────────────────────────┘
```

四个状态：

| 全局开关 | 登录态 | 配额剩余 | 按钮状态 | 行为 |
|---|---|---|---|---|
| OFF | 已登录 | >0 | **active** | 点击 → loading → 精译结果叠加进气泡 |
| OFF | 已登录 | =0 | **disabled，灰** | tooltip "今日 AI 精翻已用完，明天再试" |
| OFF | 未登录 | n/a | **disabled，灰** | tooltip "登录后解锁"，点击 → 提示登录 |
| ON | 已登录 | >0 | **disabled，灰** | tooltip "已开启自动精翻"（精翻已经在异步跑） |
| ON | 已登录 | =0 | **disabled，灰** | 全局开关本身保持 ON，但实际划词不再触发精译；按钮 tooltip "今日已用完" |
| ON | 未登录 | n/a | **disabled，灰** | tooltip "登录后解锁"（开关本身也是灰的） |

按钮在全局开启时灰显是关键 UX 细节 —— 避免用户误以为"按一下能再来一次"或"点了能跳过等待"。

### 3.3 精译结果展示

精译比快译信息更丰富。**气泡内 inline 展开**（不开新弹窗、不跳侧栏）：

```
┌─ DualRead 气泡（AI 精翻完成）─────────────┐
│ profound                                  │
│ 深刻的，深奥的                             │  ← 快译
│ ──────                                    │
│ ✨ AI 精翻                                │
│ 深刻的；用于形容思想或情感的深度，         │  ← 精译主翻译
│ 不是物理意义上的深。                       │
│                                          │
│ 例：a profound sense of loss              │
│   = 一种深切的失落感                      │
│                                          │
│ 同根：profundity (n.)                    │
│                                          │
│ [+保存] (保存时使用 ✨精翻 还是 快译？)   │
└─────────────────────────────────────────┘
```

精译结构（agent 输出 schema）：

```ts
interface AiTranslation {
  primary: string;          // 主翻译（带语境说明）
  example?: {               // 一个示例（可选，agent 决定）
    source: string;         // 原文示例
    target: string;         // 译文示例
  };
  related?: string[];       // 同根 / 相似词（可选）
}
```

**保存到生词本时的字段映射**：

- 默认 `translation` = 精译 `primary`（如果用户跑过精译）；否则
  fallback 快译
- `note` 字段自动 prefill 精译的 example + related（用户可编辑/清空）

### 3.4 流程图

```
            ┌─────────────┐
   划词 →  │ 快译 (本地)  │  ─────────┐
            └─────────────┘            │
                                       ↓
                              气泡渲染快译（200ms）
                                       │
                          ┌────────────┴───────────┐
                  全局开关ON?               全局开关OFF?
                          │                        │
                  自动触发精译       用户点 [✨AI精翻]
                          │                        │
                          ├────────────┬───────────┘
                                       ↓
                              已登录 ✅?
                                       │
                                  YES  ↓  NO → 提示登录
                              POST /translate-agent
                                  (3-5s)
                                       ↓
                              气泡 inline 展开精译
```

---

## §4 UI 详设

### 4.1 Settings AI 精翻区块（新增）

位置：在现有 "Account" + "Sync status" 之间，或 "Highlight style" 之下。
我倾向 **Account 之后** —— "登录" 和 "AI 精翻" 在同一逻辑域。

布局参考 `Toggle` 组件（与 highlightAuto 同款）。

### 4.2 气泡按钮设计

- 复用 `dr-bubble__btn` 系列样式
- 加一个 `dr-bubble__btn--ai` modifier 给特殊视觉（比如柔和高亮，配 ✨ icon）
- disabled 状态：opacity 0.45 + cursor "not-allowed"
- 旁边的 `[保存]` 按钮位置不变 —— 精翻按钮在它**左边**

### 4.3 精译加载态

气泡里 inline 展开一行：

```
┌─ ✨ AI 精翻 (Claude 正在分析…) ───┐
│ ⠋ 加载中                         │
└─────────────────────────────────┘
```

旋转 spinner + 文案。不要进度条 —— 精译耗时不可预测（agent 多节点），
进度条会撒谎。

### 4.4 失败态

```
┌─ ✨ AI 精翻 ──────────────────────┐
│ 暂时无法连接服务，请稍后重试      │
└─────────────────────────────────┘
```

不展开技术细节。只在 console.warn 里打日志。失败也不影响快译已经在显示。

---

## §5 Backend 通路

### 5.1 现有 `/translate`（保留 dormant）

W5 已上线的 `/translate`（Google MT 代理 + shared_cache）**保留**，
但 Phase 1 不再被划词流量调用。

**为什么保留**：
- Phase 2 LangGraph agent 的第一个节点（"快速直译"）会内部调用
  这个端点，让 agent 先有一个 baseline 译文再做后续 RAG 检索
- 已经写好 + 测好 + 部署，删了重写浪费

**Phase 1 的实际唯一调用方**：Phase 2 backend 内部。零外部流量。

### 5.2 新增 `/translate-agent`（Phase 2）

```
POST /translate-agent
Authorization: Bearer <jwt>      ← 必须登录
{
  "text": "profound",
  "target_lang": "zh-CN",
  "context_sentence": "...",      ← 来自 SelectionPayload
  "source_url": "..."             ← 可选，pgvector domain bias
}

Response 200:
{
  "primary": "...",
  "example": {...},
  "related": [...],
  "trace_id": "..."               ← Langfuse trace id，用于调试
}

Response 401: 未登录
Response 429: 用户配额耗尽（按 tier 限）
Response 503: agent 失败（任意节点超时 / 模型 error）
```

### 5.3 Agent 内部结构（Phase 2 W6 详）

```
┌─ Node 1: baseline ──────────┐
│ /translate (内部调用)         │
│ Google MT 快速直译            │
└──────────────┬──────────────┘
               ↓
┌─ Node 2: terminology RAG ───┐
│ pgvector 检索：               │
│   - context_sentence embed   │
│   - source_url domain bias   │
│   - Wikidata seed terms       │
│   - 用户历史 vocab            │
│ → top-K 术语 + 用法           │
└──────────────┬──────────────┘
               ↓
┌─ Node 3: style polish ──────┐
│ Claude prompt:                │
│   "用户母语 = zh-CN"           │
│   "源文本 = profound"          │
│   "上下文 = ..."               │
│   "baseline = 深刻的"          │
│   "RAG hits = [...]"           │
│ → 输出 AiTranslation schema   │
└──────────────┬──────────────┘
               ↓
        Langfuse trace
               ↓
        return to client
```

### 5.4 配额（仅成本控制，非商业化）

v3 **不收费**。登录 = 解锁 AI 精翻，没有 Pro tier、没有订阅、
没有 paywall。Phase 5+ 的"商业化"假设从此文档移除 ——
DualRead 是 portfolio + 个人项目，承担用户增长压力但**不**承担
营收 KPI。

但 Anthropic 仍有 ADR-A21 hard cap $50/mo，所以配额作为**纯成本
保护**存在，不是为了引导用户付费。

**单次精译成本（Sonnet 4.6）**：

| 场景 | tokens | 成本 |
|---|---|---|
| 词级精译 | ~500 in + 200 out | $0.005 |
| 句级精译 | ~1500 in + 500 out | $0.012 |

**配额倒推**（保守地按句级 $0.012 算）：

- $50/mo cap → 4166 句级精译 / 月
- 30 次/天/用户 × 30 天 = 900 次/月/用户
- → 单用户上限给 30 次/天，可承载 ~5 个活跃用户跑满

实际配额：**全部已登录用户均享 30 次/天**。

**未来的弹性**（不是承诺）：

- 实际活跃用户少 → 提配额，让单用户用得更尽兴
- 活跃用户增长 → 收紧配额，**不**靠付费墙解决
- 真的撑不住 → 关 AI 精翻，降回快译-only 模式 —— 服务不收费、
  也不承担"必须永远可用"的承诺

**配额计数**：backend `llm_request_log` 表（Phase 1 已建）按 user_id +
created_at 范围统计。Rate-limit middleware 复用，配额超 → 429。

UI 提示：用户当天用完后，气泡里 "✨ AI 精翻" 按钮变 disabled +
tooltip "今日 AI 精翻已用完（每天 30 次），明天再试"。**不**写
"升级 Pro 解锁更多" —— 那不是这个产品的故事。

---

## §6 数据流

### 6.1 翻译数据生命周期

```
划词 → 快译 (Google MT, 本地) ───┐
                                  ↓
                          chrome.storage.session
                          (translation cache)
                                  ↓
              [可选] 精译 (backend agent) ──┐
                                            ↓
                         气泡 / 侧栏 同时渲染
                                            ↓
                          用户保存到生词本
                                            ↓
                          chrome.storage.sync (本地)
                                  +
                          backend /vocab/bulk-upsert (best-effort)
                                            ↓
                          backend Postgres + (Phase 3) pgvector
```

### 6.2 RAG 数据来源（Phase 3 W7+）

backend pgvector 表存储：

1. Wikidata 术语 seed（一次性 import，~10K 高频术语 × 4 lang）
2. shared_cache 累积的高频翻译对（hit_count > N 才入 RAG）
3. 当前用户自己的 vocab 历史（personalize 风格）
4. 当前页面 domain 关联的过往翻译（domain bias）

agent Node 2 检索时混合权重，最终 prompt 里塞 top-3 到 top-5 项。

---

## §7 Phase 路线对照（修订）

| Phase | 状态 | 用户感知 | 后端工作 |
|---|---|---|---|
| **Phase 1 W1-W5（已完成）** | ✅ | 登录 + 生词云同步（无感）+ 快译保持 v2.x 速度 | FastAPI + auth + vocab + translate (dormant) + rate limit |
| **Phase 1 W5.5 修订**（本文档驱动） | 🔧 待办 | 划词翻译速度回到 v2.x | revert W5#5b: handleTranslate 永远走本地 |
| **Phase 2 W6** | ⏸ | （UI 加 ✨ AI 精翻按钮 + Settings 开关，灰显未登录态）| LangGraph agent 骨架 + Anthropic 接入 |
| **Phase 2 W7** | ⏸ | AI 精翻可用（已登录用户体验） | agent 三节点 wired，含 baseline + style polish |
| **Phase 3 W8-9** | ⏸ | AI 精翻质量上一档（RAG 检索） | pgvector + Wikidata seed + RAG node |
| **Phase 3 W10** | ⏸ | （无感）| BLEU + Sonnet judge eval pipeline |
| **Phase 3 W11** | ⏸ | （无感）| Langfuse trace 接入 |
| **Phase 4 W12** | ⏸ | （无感）| GitHub Actions CI/CD |
| **Phase 5+** | ⏸ | 落地页 + 跨设备 vocab merge（**不收费**） | Next.js + Cloudflare Access |

---

## §8 即时行动清单（Phase 1 W5.5 修订）

按本文档 §1.3 的决策：

1. [ ] **revert W5#5b**：`src/background/translate.ts` 中 handleTranslate
       的 backend-first 分支，删除。`requestTranslate()` 工具函数留在
       `src/shared/api.ts` 备用。
2. [ ] **保留 backend `/translate` 端点**：dormant，零修改。
3. [ ] **保留 W5#4 vocab 云同步**：与本设计完全兼容，不动。
4. [ ] **不部署任何 UI 变化**：Settings 开关 + 气泡按钮属于 Phase 2 W6
       的 UI commit；Phase 1 收尾不引入。
5. [ ] **更新 `docs/feature-status.md`**：W5#5b 标记为 reverted，引用
       本文档解释。

---

## §9 决策日志

| 决策 | 备选 | 选定理由 |
|---|---|---|
| 双通路：快译永远本地 + 精译显式触发 | 单通路全 backend / 单通路全本地 | 高频低延迟 vs 低频高质量两个产品场景，命中率高 |
| 精译入口：Settings 全局 + 气泡单次（全局开时气泡 disabled） | 仅全局 / 仅气泡 / Settings + 侧栏按钮 | 全局开关给"长期模式选择"，气泡按钮给"这一次试试看"，互补 |
| 未登录显示 AI 精翻按钮（disabled） | 不显示 | pull factor —— 未登录用户看到功能存在再决定登录 |
| 保留 backend `/translate` dormant | 删除 | Phase 2 agent 第一节点会内部调用，写好的代码留着零成本 |
| AI 精翻结果显示位置：气泡 inline 展开 | 侧栏面板 / 独立浮层 | 已经在用户视线里，无 context-switch；侧栏同步更新由 Translate tab 接收 |
| **不引入付费墙** | Free + Pro 分级 / 一次性买断 | DualRead 是 portfolio 项目，没有营收 KPI。"登录 = 解锁"足够引导用户接入 backend；引入付费会增加 Stripe 接入 + Pro 订阅状态 + UI 分级的工程复杂度，性价比低 |
| 配额：所有登录用户均享 30 次/天 | Free / Pro 分级 / 不限 | 按 Anthropic $50/mo cap 倒推 ~4000 句级精译/月；30 次/天/用户可承载 ~5 个高活跃用户跑满。配额纯为成本保护，不是付费引导 |
| 配额耗尽 UI：tooltip "明天再试" | "升级 Pro 解锁更多" / 不提示 | 跟"不付费墙"决策一致，不导流向假想的付费层 |
| 精译保存到生词本：`translation` = primary，`note` prefill example/related | translation = JSON 整体 / 只存 primary 弃后续 | `note` 是现有字段，零 schema 改动；用户可编辑 prefilled 内容 |
| 多语言：精译 prompt 使用用户 `native_language` | 总是中文输出 | 4 lang i18n 已就位，prompt 也跟随 |

---

## §10 待决项 / 后续 brainstorm

- **气泡精译展开后是否影响位置 / 大小动画？** v1.1 的气泡定位假设
  内容固定高度，精译加载完会撑大 → 可能挡住下一行内容。需要在
  Phase 2 W6 UI commit 时处理（建议：气泡定位策略升级为 "撑高时
  向上反溢出"）。

- **精译 cache 在客户端存多久？** 当前快译用 session cache（重启即失效）。
  精译 cost 高，要不要 storage.local 持久化？建议：用同一个 session
  cache，但 key 加 prefix `ai:` 区分 —— 重启 chrome 重新发起也只是花
  20 次/天配额的一次，可接受。

- **用户什么时候触发"重新精译"？** 同一 (text, target) 的精译有缓存，
  用户可能想"再生一次试试"。Phase 2 W6 加一个气泡按钮 "🔄 重新生成"
  vs. 直接接受单次结果？倾向后者（Phase 1 简单，避免连锁配额消耗）。

- **侧栏 Translate tab 的精译位置？** 气泡 inline 是核心；侧栏要不要
  也展示精译？Phase 2 W6 决定。倾向气泡 = 精简版，侧栏 = 完整版（含
  例句、同根词、风格说明），双面板互补。
