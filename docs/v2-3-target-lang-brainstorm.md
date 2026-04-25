# v2.3.0 Brainstorm — 翻译源语 / 母语切换

> 2026-04-25。从 v3.1 architecture 下放到 v2.x.x 的第二件事，紧接 v2.2
> i18n 之后。当前扩展硬编码 EN→zh-CN；本批次让用户在 4 语任意对中
> 切换翻译方向（共 12 个实际语对）。本文档为用户授权 Claude 自行在
> brainstorming skill 下"全选推荐"模式产出，仅 D3（schema migration）
> 由用户显式确认。
>
> **2026-04-25 修订（multi-agent review 后）**：详见 §8。要点：
> - **P0-1**：`vocab_schema_version` 从 `chrome.storage.local` 移到
>   `chrome.storage.sync`（解决 multi-device migration race）
> - **P0-2**：migration 写入前 per-item 8KB size check（避免单条
>   ctx/note 过长 reject 写）
> - **P0-3**：onInstalled handler 完整 `await` migration（避免 SW eviction）
> - **P0-4**：commit 1 schema 字段为 optional，commit 3 改 required（避免
>   commit 1+2 间 checkout 工作树读 undefined）
> - **P0-5**：legacy `zh` 为空时跳过 migration（避免 empty-string 污染）
> - **P1-S1**：v2.3 拆为独立 v2.3.0 release（不再跟 v2.2.0 合）
> - **P1-S3**：CSV 老备份 import 默认 `target_lang = settings.ui_language`
> - **P1-S6**：same-lang hint 加"翻译 anyway" link 到 v2.5 backlog

## 1. Context

v2.2 已锁 `Lang = "zh-CN" | "en" | "ja" | "fr"` 4 语 UI；本轮把翻译方向
从硬编码 EN→zh-CN 解放为任意 4 语对。约束：

- 不动 backend（v3.1 才有）
- 继续用 Google MT unofficial endpoint（`sl=auto&tl=...`）
- 不破坏 v2.1.x 已 ship 的 click / drag / highlight UX
- 不影响 eval pipeline（Phase 3 才做）

**范围内**：

- `VocabWord` schema 加 `source_lang` / `target_lang` / `translation` 三字段
  + 一次性 migration（`onInstalled reason === "update"`）
- `translate.ts` `target` 参数类型扩到 `Lang`
- sidepanel `useSelection` / bubble `clickTranslate` 把 target 接到
  `settings.ui_language`
- Settings UI 在 ui_language dropdown 下加翻译方向 caption
- 同语对 UX：detectedLang === target 时 bubble 不显译文，显
  "already in your language" hint
- CSV export 加 `source_lang` / `target_lang` 列

**范围外**（独立 brainstorm 或推迟）：

- 独立的 `native_language` storage key（D1 锁：绑定 ui_language）
- source language 手动 picker（D2 锁：永远 sl=auto）
- 高亮引擎 CJK 支持（D4 锁：isHighlightable 已自动过滤）
- 混合语言选区精细处理（D7 锁：trust Google）
- Welcome 三旗帜改造（→ #3 brainstorm）

## 2. Understanding Summary

- **What**：把翻译方向从硬编码 EN→zh-CN 解放为 4 语任意对；VocabWord
  schema 新增 source_lang / target_lang / translation 字段并迁移老数据；
  Settings UI 显式化 target = ui_language 关系
- **Why**：v3.1 ADR-A19 4 语支持的产品层下放；让用户 v2.3 即可读 4 种
  源语任意一种翻译到 4 种母语任意一种；为 v3 vocab schema 提前打地基
- **Who for**：现有 zh-CN 用户（不退化）+ 新增 ja / fr / en native 用户
  + 招聘官（看产品级多语言系统设计）
- **Key constraints**：
  - 继续 Google MT，不引入 LLM 翻译（v3 才做）
  - 老用户 vocab 数据 100% 安全（migration 双写，不删 zh/en）
  - 高亮引擎 zero-touch（v3 再扩）
- **Explicit non-goals**：见 §1 范围外

## 3. Assumptions

1. Google MT 4 语 12 对 paired translation 都稳定支持（en/fr/ja/zh-CN
   两两组合）
2. 老 vocab 数据 100% 是 EN→zh-CN 方向（v2.2 之前唯一可能的方向）；
   migration 默认值 source_lang="en" / target_lang="zh-CN"
3. detectedLang === target_lang 检测足够鉴别"已是母语"场景；区域变体
   走 startsWith 主语种映射跟 detectInitialLang 保持一致
4. 用户 vocab 通常 <500 词；migration 一次性扫不会触发 storage.sync
   1800 ops/hour 限制
5. CSV export 加列对老用户向前兼容（旧导入工具如 Anki 忽略未识别列）

## 4. Decision Log

### D1 — `native_language` 绑定 `ui_language`

**Decision**：translate target = `settings.ui_language`；不加新 storage
key、不加新 picker。

**Alternatives**：B/独立 `native_language` 字段 + 第二个 picker；
C/默认绑定但 Settings 高级折叠选项独立设。

**Rationale**：YAGNI。所有合理用户 case `target = 用户能读懂的母语 = UI lang`；
v3.1 A8 写 "native_language = client-side priority MVP"未规定必须 ≠ ui；
拆分增加用户认知负担；v3 真有"UI=en 但 target=zh"小众反馈再做。

### D2 — source language = auto-detect (`sl=auto`)

**Decision**：永远 `sl=auto`，不加 manual source picker。

**Alternatives**：B/加 source picker（用户强制指定原文语种）；
C/默认 auto + Settings 折叠 manual override。

**Rationale**：Google MT auto-detect 准确率高（语种判别是其核心能力）；
manual picker = scope creep + 真实用户场景极少。

### D3 — VocabWord schema migration（用户显式确认）

**Decision**：

- VocabWord 加 `source_lang: Lang` / `target_lang: Lang` / `translation:
  string` 三字段（新写必填）
- 老字段 `zh` / `en?` 保留 legacy-readable，新 code 优先读
  `translation + source_lang + target_lang`
- 一次性 migration 在 `chrome.runtime.onInstalled` `reason === "update"`
  跑：扫所有 vocab，写默认值 source_lang="en" / target_lang="zh-CN" /
  translation=zh
- 守护：storage 加 `vocab_schema_version: 2` 字段；migration 检查 < 2 才跑

**Alternatives**：B/Punt 到 v3.0 — v2.3 只支持显示翻译切换不动 vocab
schema → 新 vocab 数据语义错乱（ui=fr 时 zh 字段实际是法语）。

**Rationale**：v3 反正要 migration，提前到 v2.3 = 数据始终自洽，v3
backend 可以直接继承；老字段保留 = 老用户 vocab 100% 安全。

### D4 — 高亮引擎不动

**Decision**：`isHighlightable()` 谓词（v2.0.1 已落）已经过滤 CJK / 多
token / >3 词；zh / ja vocab 自动是"存但不高亮"，无 dev 工作。

**Alternatives**：B/扩高亮引擎支持 CJK matcher → 中重重构；
C/分语种 highlight 策略。

**Rationale**：v3 backend agent 时配套 RAG / 段落级 hint 时再考虑 CJK
高亮；v2.x.x 范围最小化。

### D5 — Settings UI 加翻译方向 caption

**Decision**：ui_language dropdown 下加一行小字 caption：

```
翻译方向：自动检测 → {ui_language native form}
```

caption 文字 i18n 4 lang 落到 `DR_STRINGS` 新 key `translateDirectionCaption(lang: Lang)`。

**Alternatives**：B/不加 caption（依赖用户自己理解）；C/独立 picker
（违反 D1）。

**Rationale**：dropdown 单 picker UX 隐式；caption 显式化降低困惑；
~5 行代码 + 4 lang × 1 key 翻译，零风险。

### D6 — 同语对：跳过翻译 + hint

**Decision**：Google MT 返回 `detectedLang === target_lang`（startsWith
匹配）时，bubble 不显示译文，改显示小字 `alreadyInYourLang` i18n key。
sidepanel 同款。

**Alternatives**：B/Google MT 返回什么显什么 → 译文 = 原文重复 UX 差。

**Rationale**：用户读自己母语时 bubble 显示重复内容看着很差；
小字 hint 解释清楚不显译文的原因。

### D7 — 混合语言选区：trust Google

**Decision**：`sl=auto` 让 Google detect 主语种，结果是什么就翻什么。
不做混合语言精细处理。

**Alternatives**：B/分段 detect 后多段译文；C/强制 fallback 到 user 选择
的某个语种。

**Rationale**：极少数 case；v2.x.x 不优化；v3 RAG 时如有需要再做。

### D8 — 12 对 pair 全 trust Google MT

**Decision**：4 lang × 4 - 4 同语对 = 12 实际语对，全 trust Google MT；
429 / network 错误走现有 handler；不加新降级链。

**Alternatives**：B/部分对加 Gemini / DeepL 备援 → DESIGN.md R1 的
deferred 工作，不在 v2.3 范围。

**Rationale**：Google MT 全 12 对支持已验证；现有错误处理覆盖。

### D9 — Welcome 三旗帜（#3）写 `ui_language`

**Decision**：Welcome 三旗帜改造（#3 brainstorm 范围）按下旗帜直接 set
`ui_language`，没有独立 `native_language` key。跟 D1 一致。

**Rationale**：单一 source of truth；#3 可以无 schema 风险地改造 UI。

## 5. NFR

| 维度 | 锁定 |
|---|---|
| Performance | translate.ts 调用模式不变；migration 一次性扫存量 vocab，预估 <1s for 1000 词；不新增 font / network |
| Scale | 单用户；vocab 通常 <500 词；migration 不触发 storage.sync 配额 |
| Security | 无新攻击面；仍 Google MT，仍 sl=auto |
| Reliability | migration 幂等（version flag 守护）；失败下次启动重试；最坏情况老数据完整无损（双写不删） |
| Maintenance | 新 VocabWord 必须 3 字段；TS 类型护栏；legacy 字段保留至少 1 个 v3 release |
| Privacy | 不变（仍 Google MT 不上 backend） |
| a11y | bubble "already in your language" hint 用 `aria-label` 标识 |

## 6. Design

### 6.1 Schema migration

`src/shared/types.ts`：

```ts
export interface VocabWord {
  word: string;
  word_key: string;
  source_lang: Lang;        // ✚ 必填
  target_lang: Lang;        // ✚ 必填
  translation: string;      // ✚ 必填
  zh?: string;              // legacy；老数据兼容；新数据可不写
  en?: string;              // legacy；老数据兼容
  ctx?: string;
  source_url?: string;
  note?: string;
  created_at: number;
  updated_at: number;
}

export const VOCAB_SCHEMA_VERSION = 2;
```

`src/background/index.ts` 增量：

```ts
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    /* v2.2 detect lang 路径 */
  }
  if (details.reason === "update") {
    await migrateVocabSchemaIfNeeded();
  }
});
```

`src/background/vocabMigrate.ts`（新）：

```ts
export async function migrateVocabSchemaIfNeeded(): Promise<void> {
  const meta = await chrome.storage.local.get("vocab_schema_version");
  if ((meta.vocab_schema_version ?? 1) >= VOCAB_SCHEMA_VERSION) return;

  const all = await chrome.storage.sync.get(null);
  const updates: Record<string, VocabWord> = {};
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(STORAGE_PREFIX_VOCAB)) continue;
    const v = value as VocabWord;
    if (v.source_lang && v.target_lang && v.translation) continue; // already
    updates[key] = {
      ...v,
      source_lang: "en",
      target_lang: "zh-CN",
      translation: v.zh ?? "",
    };
  }
  if (Object.keys(updates).length > 0) {
    await chrome.storage.sync.set(updates);
  }
  await chrome.storage.local.set({ vocab_schema_version: VOCAB_SCHEMA_VERSION });
}
```

`isMigrated` 检查跑前用，断点续跑安全（重写已迁移条目无副作用）。

### 6.2 Translate flow

`background/translate.ts`：

```ts
async function translateWithGoogle(text: string, target: Lang): Promise<TranslateResult>;
export async function handleTranslate(text: string, target: Lang): Promise<MessageResponse>;
```

cache key 改为 `(text, target)` 当前已经包含 target 语种维度，无 schema 改动。

### 6.3 Sidepanel `useSelection`

```ts
// sidepanel/App.tsx
const selection = useSelection(settings.ui_language);

// sidepanel/useSelection.ts
export function useSelection(target: Lang = "zh-CN") { ... }
```

### 6.4 Bubble `clickTranslate`

```ts
// content/clickTranslate.ts:398 (现 hardcoded `target: "zh-CN"`)
target: getSettings().ui_language,
```

bubble 同语对 hint：bubble.ts 加 `alreadyInLang` 状态种类，bubbleStyles
加 `.dr-bubble__already` 样式（小字 muted color，无翻译框）。

### 6.5 Settings caption

```tsx
<div className="dr-settings__group-title">{S.uiLanguage}</div>
<select className="dr-lang-select" ...>...</select>
<div className="dr-settings__caption">
  {S.translateDirectionCaption(settings.ui_language)}
</div>
```

`DR_STRINGS` 新 key:

```ts
translateDirectionCaption: (lang: Lang) => string
// zh-CN: (lang) => `翻译方向：自动检测 → ${nativeLabel(lang)}`
// en:    (lang) => `Direction: auto-detect → ${nativeLabel(lang)}`
// ja:    (lang) => `翻訳方向：自動検出 → ${nativeLabel(lang)}`
// fr:    (lang) => `Direction : détection auto → ${nativeLabel(lang)}`
```

### 6.6 CSV export 列扩展

```
旧 header: word, zh, en, ctx, source_url, note, created_at
新 header: word, translation, source_lang, target_lang, ctx, source_url, note, created_at, zh(legacy), en(legacy)
```

老用户 vocab migration 后，所有行 source_lang/target_lang/translation
都填好；legacy 列保留方便用户对照。

### 6.7 Edge cases

| Edge case | 处理 |
|---|---|
| migration 跑到一半失败 | version flag 守护；下次启动重试 |
| Google MT detectedLang = "auto" 或不在 4 lang 中 | 不做同语对 hint；正常显译文 |
| 用户在 migration 完成前保存新 vocab | 新 vocab 直接写新 schema；migration 跳过已含新字段的条目 |
| 同语对 hint 在区域变体 | startsWith 主语种匹配（zh-TW vs zh-CN 都识别为 zh） |
| 老 export CSV 的备份导入 | 新版本 import 兼容老 schema（zh/en 字段读出，新字段补 default） |

### 6.8 Testing

| 目标 | 类型 | 文件 |
|---|---|---|
| `migrateVocabSchemaIfNeeded` 幂等性 + 默认值 | unit | `background/vocabMigrate.test.ts`（新，~10 case） |
| `translateWithGoogle` target 类型扩 | 现有 test 调整（无新加） | |
| 同语对检测逻辑 | unit | `content/sameLangCheck.test.ts`（新，~6 case） |
| Schema TS 编译护栏 | TS 编译期 | 自动 |

Manual smoke：v2.3 复用 v2.2 §6.8 checklist 的 §C bubble 部分扩展，
增加"切 ui=ja 后划英文页 → bubble 显日译"等 12 对 sample。

## 7. Implementation notes

### 7.1 实装顺序（每步独立 commit）

1. **`shared/types.ts` schema 扩** — VocabWord 加 3 字段；`VOCAB_SCHEMA_VERSION = 2`
2. **`background/vocabMigrate.ts` + 单测** — pure migration logic
3. **`background/index.ts` onInstalled update hook** — 接入 migration
4. **`background/translate.ts` target 类型扩** — `"zh-CN" | "en"` → `Lang`
5. **`shared/messages.ts` TRANSLATE message target 扩**
6. **`sidepanel/useSelection.ts` + `App.tsx` 接入** — target 跟 ui_language
7. **`content/clickTranslate.ts` 接入 + 同语对 hint** — bubble 加 alreadyInLang 状态
8. **`bubble.ts` / `bubbleStyles.ts` "alreadyInLang" 状态** — 小字 hint UI
9. **`sidepanel/screens/Settings.tsx` caption** — translateDirectionCaption
10. **`sidepanel/i18n.ts`** — 加 `alreadyInYourLang` / `translateDirectionCaption` 4 lang × 2 key
11. **CSV export header 扩** — `vocab.tsx` 或 `csv.ts` 改 header + row format
12. **manifest + package.json bump** — `2.2.0` → `2.3.0`

### 7.2 Commit 分组

- **commit 1**: `feat(shared): extend VocabWord schema with source/target lang + translation`
- **commit 2**: `feat(background): add vocab schema migration on extension update`
- **commit 3**: `feat(translate): wire target lang to ui_language across surfaces`
- **commit 4**: `feat(bubble): show "already in your language" for same-lang pairs`
- **commit 5**: `feat(sidepanel): add translation-direction caption + i18n keys`
- **commit 6**: `feat(vocab): include source/target lang in CSV export`
- **commit 7**: `chore(release): bump v2.2.0 → v2.3.0`

### 7.3 发布前置依赖

- v2.0 通过 CWS review
- v2.1.x 通过 CWS review（local commit 待 push 上架）
- v2.2 通过 CWS review（i18n 4 lang）
- v2.3 manual smoke：12 对 sample translate × bubble check + migration 验证

发布顺序方案 A（拆 release）vs B（合 release）—— v2.2 i18n + v2.3 target
lang 强相关，合一个 release 比拆两次 CWS queue 更稳。**推荐 v2.2 +
v2.3 同 release** = `v2.2.0` 直接打包两批改动，跳过中间号；package.json
+ manifest 版本号锁 `2.2.0` 即可。

> ⚠️ 方案选择交回用户：v2.2 / v2.3 实装时再决定是否合 release。

### 7.4 不在范围内的事

- 高亮引擎 CJK 支持
- LLM 翻译降级 / Gemini 备援
- 混合语言选区精细处理
- vocab UI 显示 source_lang flag 图标（polish，可后续单独做）
- Welcome 三旗帜（→ #3）

### 7.5 Risks 与缓解

| Risk | 缓解 |
|---|---|
| Schema migration 失败 / 部分成功 | version flag + 双写 + 老字段保留 |
| Google MT detect 在数字 / emoji 等返回非 4-lang | fallback 到不显 hint，正常翻译 |
| chrome.storage.sync 配额（100KB total，8KB per item） | vocab 一条 ~500 byte，1000 词 = 500KB > 100KB **触发上限**！需要在 D3 之前确认现状用户是否已快满 |
| ⚠️ 上一行的 risk 严重 | 需要在实装前实测：现有用户 chrome.storage.sync 用量；如果接近上限，migration 双写老 + 新字段会**翻倍占用** |

**risk 缓解后续行动**：实装 commit 1 之前，先写一个 storage usage 检查脚本，让用户跑一遍 console 命令看自己 sync 用量是否安全。如果接近上限，调整 migration 策略 = 不双写，直接覆盖老字段。

### 7.6 Done 定义（DoD）

- [ ] §6.8 testing 全 unit pass + manual 12-pair smoke pass
- [ ] migration 在测试 profile（含 100 条 mock vocab）跑一次成功 + 幂等
- [ ] **multi-device migration 在双 profile 测试 chrome.storage.sync
       并发不冲突**（P0-1 验证）
- [ ] **per-item 8KB size check 在 stress test（人造长 ctx）下正确
       skip + warn**（P0-2 验证）
- [ ] storage usage 检查不触发配额 warn
- [ ] `npm run typecheck` + `npm test` + `npm run build` 全绿
- [ ] gitleaks pre-commit pass
- [ ] 7 commit 分组按 §7.2 落
- [ ] **v2.3.0 独立 release（不合 v2.2.0）**manifest version 正确

## 8. Multi-agent review 修订记录（2026-04-25）

multi-agent-brainstorming skill 跑 4 reviewer 角度（Skeptic / Constraint
Guardian / User Advocate / Scope），final disposition = **REVISE**。
用户拍板"全接受 P0 + P1"。本节记录回流到本文档的修订。

### 8.1 P0 修订（必改项）

#### P0-1：multi-device migration race 修复

**问题**：原 §6.1 把 `vocab_schema_version` 存 `chrome.storage.local`
（per-device）。3 台设备 update 触发 = 3 次并发 migration 写同 sync keys，
烧 1800 ops/hour 配额。Skeptic + Constraint 双标 P0。

**修订**：

```ts
// src/background/vocabMigrate.ts (修订)
export async function migrateVocabSchemaIfNeeded(): Promise<void> {
  // 版本号改放 chrome.storage.SYNC 让多设备共享，避免每台设备各自 migrate
  const meta = await chrome.storage.sync.get("vocab_schema_version");
  if ((meta.vocab_schema_version ?? 1) >= VOCAB_SCHEMA_VERSION) return;

  const all = await chrome.storage.sync.get(null);
  const updates: Record<string, VocabWord> = {};
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(STORAGE_PREFIX_VOCAB)) continue;
    const v = value as VocabWord;
    if (v.source_lang && v.target_lang && v.translation) continue; // 已 migrate

    // P0-5 修复：legacy zh 为空时跳过，避免 empty-string 污染
    if (!v.zh || v.zh.trim() === "") continue;

    const candidate: VocabWord = {
      ...v,
      source_lang: "en",
      target_lang: "zh-CN",
      translation: v.zh,
    };

    // P0-2 修复：per-item 8KB size check
    const size = new Blob([JSON.stringify(candidate)]).size;
    if (size > 7800) {  // 留 392 byte 给 chrome 内部 overhead
      console.warn(`[vocabMigrate] skip ${key}: ${size}B > 8KB`);
      continue;
    }
    updates[key] = candidate;
  }
  if (Object.keys(updates).length > 0) {
    await chrome.storage.sync.set(updates);
  }
  // 写完版本号到 sync（多设备共享）
  await chrome.storage.sync.set({ vocab_schema_version: VOCAB_SCHEMA_VERSION });
}
```

#### P0-3：onInstalled handler 完整 await（避免 SW eviction）

```ts
// src/background/index.ts
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    /* v2.2 detect lang 路径 */
  }
  if (details.reason === "update") {
    // 必须 await，否则 SW idle 30s 终结时 migration 半截被砍
    await migrateVocabSchemaIfNeeded();
  }
});
```

MV3 SW 在 listener 返回 promise 期间会保持 alive；async listener 整个
被 await = SW 安全。

#### P0-4：commit 1 字段 optional，commit 3 改 required

**问题**：原 §7.1 commit 1 加必填 schema 字段，commit 2 才加 migration。
任何 git checkout 在 commit 1+2 间 = 现存用户工作树读 `undefined` →
React 崩。

**修订（§7.1 改）**：

```ts
// commit 1: schema 加 optional 字段（先）
export interface VocabWord {
  word: string;
  word_key: string;
  source_lang?: Lang;        // ✚ 先 optional
  target_lang?: Lang;        // ✚ 先 optional
  translation?: string;      // ✚ 先 optional
  zh: string;                // legacy 仍必填
  en?: string;
  /* ... */
}

// commit 2: migration 写入新字段（既存数据落地）

// commit 3+: 所有 read site 改用 (v.translation ?? v.zh)；保持 schema
//           optional —— 不在 v2.x.x 阶段把字段改 required，留给 v3.0
//           backend 一起 commitments
```

**新决策**：v2.x.x 阶段 schema 字段保持 optional 永远 fallback 兼容；
只在 v3.0 backend 设计时考虑 required。这样老 schema 数据 100% 兼容。

#### P0-5：empty-string translation 污染（已合并到 P0-1 代码中）

```ts
if (!v.zh || v.zh.trim() === "") continue;
```

跳过空 entry，新字段不写；前端读时 `(v.translation ?? v.zh ?? "")` 兜底。

### 8.2 P1 修订（建议改项）

#### P1-S1：v2.3 拆为独立 v2.3.0 release（不再合 v2.2.0）

详见 v2-2 brainstorm doc §8。

新规划：

```
release v2.2.0  (5 commit, ~320 LOC, 低风险)
└─ v2.2 i18n + v2.4 welcome

release v2.3.0  (7 commit, ~400 LOC, 中风险)
└─ 本文档全部内容
```

v2.3.0 在 v2.2.0 ship 后单独审 / 单独 smoke / 单独 ship。Phase 1 backend
工作可在 v2.2.0 ship 后、v2.3.0 之前穿插，让 career narrative 不被 polish
工作阻塞。

#### P1-S3：CSV import 老备份 target_lang 默认

**问题**：v2.3 §6.7 没明确老 CSV 没 target_lang 列时怎么默认。硬编
`"zh-CN"` 对 ui=ja/fr 用户语义错。

**修订**：CSV import 处的逻辑改为：

```ts
// 老 CSV 行无 target_lang 列 → 默认 = current settings.ui_language
const importTargetLang = row.target_lang ?? settings.ui_language;
const importSourceLang = row.source_lang ?? "en"; // 假定老数据 source 是 en
```

用户当前 ui_language 已经是 v2.2 detect 后的母语，import 用它做默认
target = 跟用户当前阅读习惯对齐。

#### P1-S6：same-lang hint 加 "翻译 anyway" link

**问题**：v2.3 D6 用户读自己母语时直接拒绝译。但古文 / 文言 / 方言 →
现代化对译是 valid 用例。

**修订**：bubble alreadyInLang 状态 UI 增加小 link：

```tsx
<div className="dr-bubble__already">
  <span>{S.alreadyInYourLang}</span>
  <button className="dr-bubble__force-translate" onClick={onForceTranslate}>
    {S.translateAnyway}
  </button>
</div>
```

实装：v2.3 不做（v2.5 backlog），仅 doc 里加这条占位 + i18n key 预留。
点 link 触发 force-translate 路径绕过 same-lang check（detectedLang
仍传给 Google 但不显 hint）。

### 8.3 P2 备忘

| # | 项 | 处理 |
|---|---|---|
| P2-4 | detectedLang strict mode（zh-TW false positive） | v2.5 backlog |
