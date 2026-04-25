# Chrome Web Store 审查影响分析 — DualRead v3.1

> **状态**：v2.x → v3.1 架构升级（OAuth 登录 + 自家后端 + AI agent + Langfuse +
> 多语言）对 Chrome Web Store 审查的合规面是**质变**。本文档列出变化点与
> v3.1 提交前 checklist。
> 与现有 `cws-review-audit-2026-04-25.md`（v2.x 版本审计）并列。

**审计日期**：2026-04-25
**审计范围**：`docs/v3-1-architecture.md`（§2、§4.2、§5、§9） + v2.x 现存
代码 + Chrome Web Store 政策（permissions / privacy / single purpose）
**审计者**：Claude（架构对照 v2.x R1–R6 + CWS 慢审/拒审高频原因）

---

## 背景

v2.x → v3.1 与 CWS 相关的关键变化：

1. **后端引入** —— FastAPI on Railway，扩展直接 fetch 自家域名
2. **Google OAuth 登录** —— `chrome.identity.getAuthToken` / `launchWebAuthFlow`
3. **用户数据离开本地的范围扩大** —— 划词文本 + 生词本 + email + Google sub
   流向 Anthropic / OpenAI / Langfuse / 自家 Postgres
4. **共享缓存** —— `shared_cache` 全用户共享（A 用户查的词进缓存，B 用户可能命中）
5. **多语言扩展** —— UI 4 语 (CN/JA/EN/FR)、translate 4×4 矩阵

CWS 不会因为"代码实现细节"卡审，几乎只会因为**权限、元数据、隐私披露**
三类问题进慢车道 / 拒审。v3.1 在这三类上**全面扩面**，所以本文档体量
比 v2.x 审计大很多。

---

## 总判断（执行心法 — 风险条目之前必读）

### 1. 架构本身 = 能过

v3.1 **没有**任何设计层面的拒审雷点。所有风险都在**执行层**（隐私政策措辞、
manifest 权限声明、Privacy Practices 问卷、UI 同意点），**不需要改架构**。
对照 CWS 真正会触发"重新设计"的红线：

| 红线 | DualRead v3.1 |
|---|---|
| 远程代码执行（`eval` / 远程 `<script>`） | ❌ 没有 |
| 剪贴板 / cookie 枚举 | ❌ 没有 |
| 高敏类目（crypto wallet / VPN / CAPTCHA solver） | ❌ 没有 |
| 出售用户数据 | ❌ 架构 §9 明确禁止 |
| 用户数据用于无关目的 | ❌ 全数据流目的对齐 |

→ 架构层面**全清**。

### 2. "能过" ≠ "快速过"

v3.1 第一次提交**几乎必入慢车道**（21+ 天起步）。三个慢审信号叠加：

- OAuth 登录
- 用户数据上传到自家后端
- 多语言扩展（4 语）

这是所有同等复杂度扩展的常态，不是 DualRead 设计有问题。**不要**因为
"已审 14 天没消息"就重新提交或催问 —— 会被踢到队尾。

### 3. 通过率 ≈ P0 checklist 完成度（漏一项 = 直接拒）

CWS 不是"综合评分高就过"，而是 **checklist 全过 → 通过；漏一项 → 立刻拒**。
具体到 v3.1，**任何一项漏掉都会触发拒审**：

- **N1** 隐私政策没重写 → 拒（v2.x 文案与实际数据流不符 = "deceptive"）
- **N2** OAuth scope 多加了 `profile` / `drive.file` 等冗余 → 拒
- **N3** Privacy Practices 没勾 PII / Authentication info → 拒
- **N4** 没有 in-product disclosure（登录前同意点） → 拒（违反 2024 update）

→ 提交前 P0 全勾完，过审是大概率；漏一项**确定性**被拒。

### 4. 唯一稍微靠近"设计灰区"的点 — shared_cache

`shared_cache`（架构 §3.2）全用户共享 —— 用户 A 查的文本进缓存，用户
B 查相同文本时命中。CWS **不禁止**，但属于"非典型数据共享模式"，必须
在隐私政策里**明示**：

> 您查询的文本可能被存入跨用户的共享翻译缓存中，使其他用户查询相同
> 文本时直接命中。缓存中**不存储**查询者的身份信息，缓存条目与具体
> 用户**不可关联**。

不说就被定性为 "undisclosed data sharing"，触发人工复审延长（再 +
1–2 周）。说清楚就是合规的优化设计。

### 5. CWS 条目策略（N5）不影响是否通过

方案 A（同 ID 升 3.0）和方案 B（新建条目）**都能过审**。差别只在：

| 维度 | A 同 ID 升级 | B 新建条目 |
|---|---|---|
| 现有用户体验 | 突然变化（差评风险） | 不影响（v2.x 留作免费版）|
| 维护成本 | 低（一份代码） | 高（v2.x 仍要发安全补丁）|
| 慢审长度 | 长（重大变更审查） | 长（首次审查）|
| 用户基础 | 保留 | 不迁移 |

→ 这是**产品策略决策**，不是过审决策。Claude 倾向 A，但用户拍板。

---

## 🔴 必须做（不做必拒 / 必卡审）

### N1 — 隐私政策必须重写（v2.x 内容现已全错）

**v2.x privacy-policy.html 当前的核心承诺**：

- "no backend / no server"
- "no telemetry / no analytics"
- "selected word is sent only to Google Translate, no other endpoint"

**v3.1 全反了**。登录用户的请求会经过：

| 阶段 | 数据 | 接收方 |
|---|---|---|
| 登录 | Google access_token → 后端换 JWT | 自家 backend |
| 登录后请求 | 划词文本 + 上下文 + JWT | 自家 backend |
| 翻译 | 划词文本 → Haiku 翻译 + RAG embedding + 润色 | Anthropic、OpenAI |
| 缓存 | 文本 + 译文 + embedding | Postgres `shared_cache`（**全用户共享**） |
| 追踪 | trace 含原文 + 译文 + token 数 + 延迟 + user_id_hash | Langfuse Cloud |
| 同步 | 用户生词本（每词、笔记、created_at） | Postgres `user_vocab` |
| 持久 | email + Google sub + native_language + tier | Postgres `user` |

**新隐私政策必须明确披露**：

- 列出每个数据处理者（Anthropic / OpenAI / Langfuse / Railway / 你自己）
  和各自处理的数据范围
- **`shared_cache` 是所有用户共享的** —— 一个用户查的词进缓存，下一个
  查相同词的用户会命中。CWS 的 "data usage" 政策对此特别敏感
- Langfuse trace 含原文 + 译文（架构 §9.5 已自我承认 "privacy policy
  必须明说"）
- email 和 Google sub 在登录后被存储；删账号路径是什么（架构 §9.5 已
  明确：cascade 删 vocab、`llm_request_log.user_sub` 置 NULL、Langfuse
  以 SHA256 hash 存）
- 匿名用户的兜底（仍走 Google Translate 不经自家后端）单列说清楚 ——
  让用户知道"不登录就能保留 v2.x 模式"

**修复方案（P0，我可代写）**：

1. 在新 PR 里完整替换 `privacy-policy.html`
2. 新版本部署到 GitHub Pages（沿用 v2.x R2 已建议的
   `https://foxsunshine.github.io/DualRead/privacy-policy.html`）
3. 对应在 store listing 详细描述里加一段简化版

---

### N2 — manifest 新增权限 + justification

v3.1 扩展端比 v2.1.1 至少多了：

```json
{
  "permissions": [
    "storage",
    "sidePanel",
    "downloads",
    "identity"                    // ✚ v3.1 新加
  ],
  "host_permissions": [
    "https://translate.googleapis.com/*",
    "https://<your-railway-domain>/*"   // ✚ v3.1 新加
  ],
  "oauth2": {                     // ✚ v3.1 新加整块
    "client_id": "...apps.googleusercontent.com",
    "scopes": ["openid", "email"]
  }
}
```

**OAuth scope 严格最小化**：`openid` + `email` 已足够拿 Google sub +
email。**不要**加 `profile`（不需要头像）/ `drive.file`（不用网盘）/
任何看起来无害的 scope —— 审查员会逐个 scope 抠为什么需要。

Dashboard "Permissions justification" 必须**新加两项 + 重写一项**：

- ✚ **`identity`**：用户登录以同步生词本 + 启用 AI 翻译。具体说明用
  `chrome.identity.getAuthToken` / `launchWebAuthFlow`，仅获取
  Google sub 与 email
- ✚ **新 host_permission（自家后端域名）**：发送用户主动查询的词到
  我们的后端进行 AI 翻译与生词本同步
- ⟳ **现有 `<all_urls>` content script justification 要更新**：v2.x 写
  的"selected word sent only to Google Translate"现在是错的，必须改成
  "sent to Google Translate (anonymous mode) or to our backend (signed-in
  mode)"

---

### N3 — Privacy Practices 问卷必须重新勾选

v2.x 只勾了 **Website content**。v3.1 必须新勾：

- ✅ **Personally identifiable information** —— email + Google sub 是 PII
- ✅ **Authentication information** —— OAuth token / JWT
- ✅ **User activity** —— 生词本是用户的 personal note；查询历史进 log
- ✅ **Website content** —— 划词文本（继承）

**Data Usage Certifications** 三个框仍**能**勾，但有底线：

- ☑ "I do not sell or transfer user data to third parties..." —— 仍然
  能勾，前提是把 Anthropic / OpenAI / Langfuse / Railway 视为
  "service providers / processors"，不是"third parties"。这是 CWS 接受
  的口径，但 privacy policy 里要把这个区分写清楚
- ☑ "I do not use or transfer user data for purposes that are unrelated
  to my item's single purpose" —— 仍能勾。但**不能**把 Langfuse trace
  拿去训练你自己的模型，一旦那么做就违反这条
- ☑ "...for creditworthiness or for lending purposes" —— 不变

---

### N4 — 登录前必须有显式同意点（in-product disclosure）

CWS 现行政策（2024 update）要求：用户数据收集**在收集发生前**有清晰
的 in-product disclosure，**不能**只藏在 privacy policy 里。

v3.1 必须满足：

- Welcome / Login 屏上明文写："登录后，您查询的单词与笔记将上传至
  DualRead 服务器进行 AI 翻译与跨设备同步"
- "登录" 按钮旁有 privacy policy 链接（**已部署的 https URL**）
- 匿名模式不变（仍走 Google Translate），登录是用户**主动**选择的升级
- MergeModal（架构 §4.7 D75 首次登录合并）那一步必须明确告知"上传我
  本地的 N 个词到服务器" —— 否则视作 "deceptive data collection"

**修复方案（P0，需要 UI 改动）**：

- `Welcome.tsx` 改造时把同意点放进登录前的步骤
- `MergeModal.tsx` 的 "合并" 按钮文案明确说"上传到云端"
- 测试：截图给审查员看的演示视频里这个屏要清晰可见

---

### N5 — CWS 条目升级策略（用户必须拍板）

v2.x 当前 `2.0.0` 还在 CWS 审查（since 2026-04-22）。v3.1 落地时面临
**用户必须拍板**的选择：

| 方案 | 优点 | 风险 |
|---|---|---|
| **A. 同 ID 升级到 3.0.0** | 现有用户自动收到 v3 + 评分保留 + 用户基础不流失 | 大版本变化必触发"重大变更审查"，慢车道 21+ 天起步；用户对"突然要登录上传数据"反弹（差评风险） |
| **B. 新建 CWS 条目（如 DualRead Cloud / Pro）** | v2.x 留作免费纯本地版；v3 单独定位 | 需要 review 第二个 listing；用户基础不迁移；维护两套代码（v2.x 仍要发安全补丁）|

**Claude 的建议**：方案 **A** + 强制 onboarding 弹窗通知现有用户行为
变化 + 提供"留在纯本地模式（不登录）"的逃生口。这与架构 §4.7 "登出后
新词只写本地" 的兜底自然契合，老用户不点登录就完全等同于 v2.x 体验。

**待决策**：用户在 v3.1 启动前拍板 A or B。

---

### N6 — 版本号跳到 3.0.0

继承 v2.x R5。v3.1 提交时 `manifest.json` + `package.json` 同步到
`"3.0.0"`（或具体发版决定）。**不要**用 `2.x.x` 因为大版本行为变化大
且向后行为不兼容。

---

## 🟡 强烈建议（不做大概率 30+ 天慢审）

### N7 — Single Purpose 表述微调

v2.x 当前："Help Chinese-speaking English learners look up, save, and
review unknown words from any webpage."

**v3.1 建议改为**：

> "Help language learners look up, save, and review words from any
> webpage. Optional cloud sync and AI-enhanced translations for
> signed-in users."

变化点：

- "Chinese-speaking English" → "language learners"（v3.1 是 4 语矩阵）
- 显式提到 "cloud sync" 和 "AI translations" —— 这与 N3 / N4 的披露
  保持一致；不在 single purpose 里提，反而被审查员视为隐瞒

---

### N8 — 提交 demo 视频 / GIF

v3.1 第一次提交几乎必进**最慢车道**：OAuth + 远程数据收集 + 多语言 =
三个慢审信号叠加。给审查员一个 60–90 秒视频展示：

1. **匿名用词流**（不登录 → Google Translate 兜底）
2. **登录流**（OAuth → 同意 modal → 词上传 → 跨设备同步演示）
3. **多语言切换**（zh ↔ ja 验证翻译质量）

把视频链接加到 store listing 详细描述顶部 + GitHub README。这能把人工
复审从"看代码 + 猜功能"改成"看演示 + 抽查代码"，加速明显（v2.x
经验估计能从 21 天压到 10–14 天）。

---

### N9 — 远程代码自查（CSP + innerHTML）

CWS 拒审最高频"代码层"原因是疑似远程代码执行。v3.1 后端会下发：

- `translation` 字符串
- `matched_terms[]` 字符串数组
- `model` / `trace_id` 元数据

**自查清单（v3.1 实装时落地）**：

- [ ] 没有 `eval(response.something)`
- [ ] 没有 `new Function(response.something)`
- [ ] 没有 `element.innerHTML = response.text`（必须 `textContent`，已
      经是 v2.x 的做法，沿袭即可）
- [ ] 没有动态 `<script src="https://your-backend/...">`
- [ ] LangChain prompt 模板**全部留在后端**（架构 §6.3 看起来是这样
      的，实装时再核一次）

CSP 保持 MV3 默认（`script-src 'self'; object-src 'self'`），不需要
改 manifest。

---

### N10 — CORS 配置和扩展 ID

架构 §9.3 写了 CORS 锁 `chrome-extension://<id>` + Vercel domain。
注意：

- 扩展 ID 在 CWS 上架后会变（dev unpacked 是临时 ID，发布后是永久 ID）
- 后端 CORS 允许列表要在 v3.1 提交后**立刻**用真实 ID 更新
- **不要**用 `*` 偷懒过审 —— 审查员会查 OPTIONS 响应，看到
  `Access-Control-Allow-Origin: *` + 收用户数据 = 红旗

---

### N11 — minimum_chrome_version 重新评估

v2.x R4 提出过 `139` 太高的问题（v2.1.1 引入）。v3.1 引入：

- `chrome.identity.launchWebAuthFlow` —— 自 Chrome 92 即可
- 现有 `chrome.sidePanel.open` —— 需要 Chrome 116+
- 其他 v3.1 新 API 暂未发现更高要求

**建议 v3.1 提交时设 `minimum_chrome_version: "120"`**（覆盖 sidePanel
+ identity 同时给 modern Chrome 用户一些缓冲）。如果实装中真的需要
139 的某个 API，再 case-by-case 抬。

---

## 🟢 已经做对的事 / 风险低

记下来避免改动时破坏：

- ✅ **后端在 PRIVATE repo**，prompt 模板和限流策略不公开 —— CWS 不
  关心，但避免了竞争对手研究 prompt（架构 ADR-A20）
- ✅ **API key 在后端，不在扩展** —— 这是硬性要求，做对了。扩展只持
  有 OAuth client_id（公开值，非 secret）
- ✅ **Cloudflare Access 保护的 admin endpoints 在扩展里完全没访问**
  （架构 §2.1 src 树里没 admin 调用）—— 正确
- ✅ **Single Purpose 没有偏离** —— 仍是词汇学习；AI 是手段不是目的，
  CWS 不会以"加了 AI 功能"为由拒审
- ✅ **manifest_version: 3** —— 不变
- ✅ **图标 16 / 48 / 128 齐全** —— 不变（沿袭 v2.x）

---

## 旧审计 R1–R6 在 v3.1 下的状态

| 旧风险 | v3.1 处境 |
|---|---|
| **R1** contextMenus 未用 | v3.1 仍未实装 → **必须删** |
| **R2** Privacy Practices 问卷 | **必须重做**（见 N3，问卷项目变了） |
| **R3** `<all_urls>` justification | 仍需，但**文本必须更新**（见 N2 ⟳ 项） |
| **R4** minimum_chrome_version | **重新评估**（见 N11） |
| **R5** version bump | 直接跳 `3.0.0`（见 N6） |
| **R6** 上传 dist 不上源码 | 不变，沿袭流程 |

---

## 决策点 — 待用户拍板

在 v3.1 提交 CWS 前，下面两个问题用户必须先决：

1. **CWS 条目策略**（N5）：方案 A（同 ID 升 3.0）还是 B（新建条目）？
   Claude 倾向 A。
2. **第一次提交是否一次到位 4 语 (zh/ja/en/fr)？还是先 zh + en 上线、
   过审后再加 ja + fr？** —— 减小第一次提交的复杂度可能加速审查；但
   架构 §1.2 把 "4 语" 列为 v3.1 核心目标，分阶段上等于改产品定位。

---

## 提交前 checklist（v3.1 启动后启用）

### P0 — 代码 + 文档层（Claude 可代做）

- [ ] **N1**: `privacy-policy.html` 重写完整版（含 7 个数据处理者列表
      + shared_cache 共享语义 + 删账号路径）
- [ ] **N1**: GitHub Pages 重新部署 privacy policy
- [ ] **N2**: `manifest.json` 加 `"identity"` permission
- [ ] **N2**: `manifest.json` 加 `oauth2` 块（scope 严格 `openid email`）
- [ ] **N2**: `manifest.json` 加新后端 host_permission
- [ ] **N6**: `manifest.json` + `package.json` version → `3.0.0`
- [ ] **R1**: `manifest.json` 删 `"contextMenus"` 权限
- [ ] **R1**: `privacy-policy.html` 删 contextMenus 那条 `<li>`
- [ ] **N4**: `Welcome.tsx` 加同意点
- [ ] **N4**: `MergeModal.tsx` 文案明确"上传到云端"
- [ ] **N9**: 全代码 grep `eval` / `new Function` / `innerHTML` 自查
- [ ] **N10**: 后端 CORS 真实扩展 ID 更新（提交后立刻）
- [ ] **N11**: `minimum_chrome_version` 设为 `"120"`

### P0 — Dashboard 层（仅用户可操作）

- [ ] **N3**: Privacy Practices 重新勾选（PII / Auth info / User
      activity / Website content）
- [ ] **N3**: 重新确认三个 Data Usage Certifications 都能勾
- [ ] **N2**: 5 条 Permissions justification 全部重写
      (storage / sidePanel / downloads / identity / `<all_urls>`)
- [ ] **N2**: 2 条 host_permission justification 写
      (translate.googleapis.com / 自家后端)
- [ ] **N7**: Single Purpose 字段更新成 v3.1 表述
- [ ] **N1**: Privacy Policy URL 仍是公开 https
- [ ] **N5**: 决定 CWS 条目策略（A / B）

### P1

- [ ] **N8**: 60–90 秒 demo 视频上传到 YouTube/etc + 嵌 store listing
- [ ] **N8**: GitHub README 顶部嵌视频链接
- [ ] **R3**: 5 条 justification 文本最终审稿
- [ ] **R6**: 重新提交前走 `npm run build && cd dist && zip -r …`
      流程，确保上传 dist 而非源码
- [ ] `_locales/` 多语言 store listing 草稿（zh/ja/en/fr）—— 可与 v3.1
      并行做，不阻塞首次提交

### P2 — 加分项

- [ ] 数据导出工具（用户自助下载自己全部数据，GDPR 风格）—— 不是
      CWS 强制，但收集 PII 后政策方向是这样；同步实现可加分
- [ ] 删账号自助 UI（架构 §9.5 已有后端逻辑，加前端即可）

---

## 参考

- v2.x CWS 审计：`docs/cws-review-audit-2026-04-25.md`（R1–R6）
- 架构主文档：`docs/v3-1-architecture.md` §2 / §4.2 / §5 / §9
- CWS 政策主页：https://developer.chrome.com/docs/webstore/program-policies
- CWS 用户数据 FAQ：https://developer.chrome.com/docs/webstore/user-data-faq
- OAuth scope 最小化：https://developers.google.com/identity/protocols/oauth2/scopes
- Chrome identity API：https://developer.chrome.com/docs/extensions/reference/api/identity
