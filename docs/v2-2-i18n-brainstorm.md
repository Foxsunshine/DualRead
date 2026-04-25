# v2.2.0 Brainstorm — i18n 扩 4 语 (CN/JA/EN/FR)

> 2026-04-25 起。从 v3.1 architecture 下放到 v2.x.x 的第一件事；纯
> client-side，不动 eval pipeline / 翻译目标语切换 / Welcome 改造（后两件
> 各自独立 brainstorm）。本文档跟踪 brainstorming skill 的全程产物到
> Understanding Lock + Decision Log + 最终 Design + Implementation notes。
>
> **2026-04-25 修订（multi-agent review 后）**：详见 §9。要点：
> - **P0-7**：Noto Sans JP **改本地 self-host**，不走 Google Fonts CDN
>   （避免 manifest permission delta 触发 CWS human review）
> - **P1-S1**：合 release 决策反转 — v2.2.0 = i18n + Welcome；v2.3
>   target-lang 拆为独立 v2.3.0 release
> - **P1-S2**：§6.8 加 register matrix 检查表

## 1. Context

把扩展全部运行时 UI 字符串从 zh-CN + en 扩到 zh-CN + en + ja + fr 4 语。
v3.1 architecture (ADR-A19) 原计划在 Phase 1-5 整体落 4 语，现拆出 i18n
增量先做 v2.2.0，让 Phase 1 backend 不背 i18n 债，同时为简历叙事"4 语
production-ready"提供立即可演示证据。

**范围内**：
- `src/sidepanel/i18n.ts` — `DR_STRINGS` ~70 key 扩 ja + fr
- `src/content/clickTranslate.ts` — `bubbleStrings` + `toastStrings` 扩 ja + fr
- `src/content/index.ts` — `fabStrings` 扩 ja + fr
- `src/shared/types.ts` — `Lang` 扩 `"ja" | "fr"`
- `src/sidepanel/screens/Settings.tsx` — UI language picker 改 dropdown，4 lang
- `src/sidepanel/index.html` — Google Fonts URL 加 Noto Sans JP
- `src/sidepanel/styles.css` — 字体栈加 Noto Sans JP（SC 之前）
- 首次安装语言自动检测（`chrome.runtime.onInstalled` 或 sidepanel hydrate）
- manual QA smoke checklist（约 40 个 spot check）

**范围外**（独立 brainstorm 或推迟）：
- 翻译目标语切换（Google MT EN→zh-CN 改 EN→ja / EN→fr 等） → **#2 brainstorm**
- Welcome 三旗帜母语选择改造 → **#3 brainstorm**
- `native_language` 概念 → 与 #2 一起讨论
- `_locales/` 商店元数据本地化（CWS 商店页）→ 推迟到 v2.4
- chrome.i18n 路线（已锁 DR_STRINGS）→ 不在范围
- Playwright e2e fixture → 推迟（v1.2 backlog 项）

## 2. Understanding Summary

- **What**：扩展运行时 UI 字符串扩到 4 语；不动 manifest `_locales/`、
  不动翻译目标语、不动 eval pipeline
- **Why**：从 v3.1 下放，让 i18n 不背 Phase 1 backend 进度的债；同时为
  简历叙事"4 语 production-ready"提供立即可演示证据
- **Who for**：JA / FR 母语用户（新增）+ 现 zh-CN / EN 用户（不退化）+
  招聘官（看商品级 i18n 实现）
- **Key constraints**：
  - v2.0.0 还在 CWS review、v2.1.x local 待 ship
  - v2.2 发布要等 v2.0 / v2.1 过审才能上架
  - 改动力求触发 CWS minor-update fast-track 而非 full re-review
- **Explicit non-goals**：见 §1 范围外清单

## 3. Assumptions

1. 用户能审 JA + FR 翻译质量（已自报）
2. `chrome.i18n.getUILanguage()` 在 4 lang 用户浏览器返回与本地化匹配的
   locale tag（fr-* / ja / zh-* / en-* / 其他）
3. 现存 chrome.storage.local 中 `ui_language: "zh-CN"` 的用户存量不需要
   迁移；新 lang code 纯 additive
4. JA 文本主要走丁寧形（ですます调 / 命令形按钮）；FR 走 vouvoiement +
   命令式按钮 — Claude 翻译时按 UI 惯例处理，用户审稿时如有 register
   调整再回流
5. Fraunces serif 字体不主动覆盖 JA 文本（Fraunces 仅 Latin），JA 走
   sans-serif 栈（Inter → Noto Sans JP → Noto Sans SC fallback）；
   sidepanel 中的 serif 标题（logo "D"、welcome heading）在 JA UI 下走
   sans-serif fallback 即可，不强求 serif 一致

## 4. Decision Log

### D1 — 翻译源 = Claude 一次产出，用户自审

**Context**：JA / FR 翻译要么 LLM 产出 + 用户审，要么找 native speaker，
要么 ship machine-translated 后社区迭代。

**Decision**：Claude 一次性产出 JA + FR 全部 ~90 key 翻译，用户自审
（已自报能审 JA + FR）。

**Alternatives**：B/找 native speaker 朋友审 → 等社交成本高；
C/ship machine-translated 等社区反馈 → 早期用户体验差；
D/v2.2 只 JA、v2.3 FR → 拆 release 增加 CWS queue 成本。

**Rationale**：用户自审最小化 turnaround；Claude 翻译质量对 UI 短句够用；
有问题反馈 Claude 重译成本低。

**Risks**：用户在 JA / FR 的细微 register 偏差感知不足；缓解 = 翻译
按 UI 惯例的 polite/imperative 模式做（见 Assumption #4）。

### D2 — `_locales/` 维持 en + zh-CN

**Context**：是否同时把 CWS 商店元数据（extName / extDescription）也
本地化到 ja + fr。

**Decision**：维持 `_locales/{en,zh_CN}/`，**不**加 ja / fr 目录。

**Alternatives**：A/加 ja + fr 两目录 → manifest 资源结构变 → 几乎肯定
触发 CWS full re-review（7-21 天，叠加现有 v2.0 review queue）。

**Rationale**：v2.0 / v2.1 已经在排 CWS queue，再叠 full re-review 极不
划算；招聘叙事"4 语"看的是产品体验（UI 是 4 语），商店列表英文够用；
真有 JA / FR 用户增长信号了，单独做 v2.4 补 `_locales/` 更稳。

### D3 — JA 字体 = Noto Sans JP via Google Fonts

**Context**：当前字体栈 Inter / Fraunces / Noto Sans SC / JetBrains Mono
不含假名（hiragana/katakana），JA UI 假名走系统 fallback 跨平台不一致。

**Decision**：Google Fonts link 加 `Noto Sans JP`（unicode-range 自动切片
~50KB woff2），CSS `font-family` 在 `Noto Sans SC` 之前插入 `Noto Sans JP`。

**Alternatives**：B/信任系统 fallback → Mac/Win/Linux 视觉差异大；
C/`Noto Sans CJK` 一把通吃 → 替换现 Noto Sans SC 触动现有 zh-CN UI 风险高。

**Rationale**：A 加 1 行 URL + 1 个 CSS 字体名即可，零回归风险；C 太重
不在 v2.x.x 范围内（v3 字体栈重构再考虑）。

### D4a — content i18n 结构 = 留原位 + Record<Lang, T>

**Context**：3 个内联函数（`bubbleStrings` / `toastStrings` / `fabStrings`）
分散在 `clickTranslate.ts` + `content/index.ts`，每个 ~7-10 key。

**Decision**：3 函数留原位，内部从三元 `lang === "zh-CN" ? X : Y` 改成
`Record<Lang, T>` 字典 lookup。TS 强制每个 dict 覆盖全 4 lang，漏 key
直接编译错。

**Alternatives**：B/抽到 `src/content/i18n.ts` 集中 → 中度重构；
C/合并到 `src/shared/i18n.ts` 跨 bundle 共用 → 大重构 + Vite tree-shake
风险。

**Rationale**：v2.x.x 范围最小化；content / sidepanel 是两个 bundle，
物理隔离反而是优点；v3 backend 进来时可能整体重构 i18n（pull from server，
agent state-aware），现在抽离会被推翻。

### D4b — Lang 类型 = "zh-CN" | "en" | "ja" | "fr"

**Context**：现 `Lang = "zh-CN" | "en"`。zh 保留 `-CN` 区域 tag，加 ja+fr
要不要统一 BCP-47？

**Decision**：`Lang = "zh-CN" | "en" | "ja" | "fr"`（zh 保留 `-CN`，其他
2-letter）。

**Alternatives**：A2/`"zh" | "en" | "ja" | "fr"` 全 2-letter → 改 zh-CN
破坏现有用户 storage；A3/`"zh-CN" | "en-US" | "ja-JP" | "fr-FR"` 全 BCP-47
→ 区域差异目前没需求。

**Rationale**：现有 chrome.storage.local 写过 `ui_language: "zh-CN"` 的
用户向前兼容零成本；区域分支日后真要做（zh-TW / fr-CA）再升 BCP-47。

### D5 — 发布节奏 = JA + FR 同发 v2.2

**Context**：v2.2 一次上 4 lang vs v2.2 (JA) → v2.3 (FR) 拆。

**Decision**：v2.2 = JA + FR 一次到位，1 次 manifest version bump，
1 次 CWS submit。

**Alternatives**：B/JA only v2.2 + FR v2.3 → 2 次 CWS queue 排队成本；
C/FR only v2.2 + JA v2.3 反顺序 → 同 B 缺点。

**Rationale**：CWS review queue 排队成本 > 翻译并行成本；v2.0 / v2.1
已在排队，越少 submission 越省时间；JA 字体只加 1 行 URL，风险约等于 0
不需隔离。

### D6 — Picker UI = `<select>` dropdown + native form labels

**Context**：360 px 侧栏 4 lang option 怎么呈现。

**Decision**：Settings.tsx 把 `dr-lang-toggle` 横向 LangBtn 改成 `<select>`
原生 dropdown，每个 `<option>` 用 native form 标签：`中文` / `English` /
`日本語` / `Français`。每个 `<option>` 加 `lang="…"` 属性增强 a11y。

**Alternatives**：A/4 个 LangBtn 一排 → 360 px 挤；B/2x2 grid → 占双行高度。

**Rationale**：dropdown 1 行高度，跟 Settings 其他控件视觉密度协调；
未来 v3 加 `native_language`（也是 dropdown）模式一致；native form 是
所有主流 app 默认（用户即使误入陌生 UI 能找到自己语言）。

### D7 — 首次安装默认 = chrome.i18n auto-detect

**Context**：现 `DEFAULT_SETTINGS.ui_language = "zh-CN"` 硬编码。

**Decision**：首次安装时（`first_run_completed: false`）读
`chrome.i18n.getUILanguage()` 映射到最近支持 lang —— `fr-*` → `fr` /
`ja` → `ja` / `zh-*` → `zh-CN` / 其他 → `en`。auto-detect 仅跑一次；
用户手动改后永远尊重用户选择。存量用户已有 `ui_language` 不被覆盖。

**Alternatives**：A/保持 `zh-CN` 硬编码 → JA / FR 用户首次见中文 UI 体验差；
C/独立 first-run 语言选择 onboarding → 加摩擦且属于 #3 brainstorm 范围。

**Rationale**：浏览器 locale 大概率准；存量向前兼容；其他 fallback 到
`en` 比 `zh-CN` 礼貌（chrome ext 国际通用 fallback）。

### D8 — QA = manual smoke checklist

**Context**：FR 平均 +20-30%（"Save" → "Enregistrer"），JA 汉字密度高
但假名 + 标点会拉长，UI overflow / 截断风险。

**Decision**：Claude 写一份逐屏 manual smoke checklist（sidepanel 5 tabs ×
4 lang + bubble 3 状态 × 4 lang + toast 2 状态 × 4 lang ≈ 40 个 spot check），
用户照着跑一遍记录截图，溢出 / 截断回流 Claude 重译或缩字。

**Alternatives**：B/被动等用户反馈 → 早期体验差；C/Playwright e2e fixture
→ v1.2 backlog 项，v2.x.x 不带。

**Rationale**：v2.x.x 体量小，逐屏 manual smoke 是合理 baseline；
Playwright 设施跟 i18n 解耦，混进来会膨胀 v2.2 范围。

## 5. NFR（已锁）

| 维度 | 锁定值 |
|---|---|
| Performance | Noto Sans JP ~50KB woff2 一次性；DR_STRINGS dict +5KB minified；content +1KB |
| Scale | 不变（per-user extension） |
| Security | 无新增攻击面（静态字符串） |
| Reliability | `Record<Lang, T>` 强制全 4 key；漏 key = TS 编译错；运行时 100% hit |
| Maintenance | 新 UI 字符串必须 4 lang 同时落，typecheck 自动护栏 |
| a11y | `<select>` 原生控件 + `<option lang="…">` |
| Versioning | v2.0.0 → v2.2.0；跳过 v2.1.x（local 未发布功能批次，发布时合带） |

## 6. Design

### 6.1 Auto-detect 触发位置（Design D9）

**Decision**：在 `src/background/index.ts` 注册
`chrome.runtime.onInstalled.addListener`，当 `details.reason === "install"`
时跑首次 lang 检测：

```ts
// src/shared/i18nDetect.ts (新文件，pure，可单测)
export function detectInitialLang(uiLang: string): Lang {
  const lower = uiLang.toLowerCase();
  if (lower.startsWith("fr")) return "fr";
  if (lower.startsWith("ja")) return "ja";
  if (lower.startsWith("zh")) return "zh-CN";
  return "en";
}

// src/background/index.ts (增量)
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== "install") return;
  const detected = detectInitialLang(chrome.i18n.getUILanguage());
  void chrome.storage.local.set({
    settings: { ...DEFAULT_SETTINGS, ui_language: detected },
  });
});
```

**Alternatives**：sidepanel hydrate 时跑 → 用户开 sidepanel 之前 content
script 第一次读 settings 仍是 zh-CN 默认，bubble / fab 第一次出现是错语
体验割裂。

**Race tolerance**：onInstalled vs content script 第一次读 settings
理论上并发；实测 onInstalled storage write 通常 <100ms 完成，content
script 首次读 settings 在用户首次划词时（人类延迟 >>100ms），race 概率
近零。如果触发，content script 短暂用 zh-CN 默认，~ms 后 storage
listener 收到更新自动同步。

### 6.2 Live language-switch 行为（Design D10）

**Decision**：用户在 Settings 切 dropdown 时：

| Surface | 行为 | 实现 |
|---|---|---|
| sidepanel | React state 重算自动刷新 | 已有 |
| FAB（所有 tab） | `fab.setStrings(fabStrings(next.ui_language))` | 已有 |
| 当前显示的 bubble / toast | **不联动，保持旧 lang 直到下次 show** | 不做 |

**Rationale**：用户切语言时视线在 Settings 不在 bubble；视野外 stale
无感；toast 最多 5s 自然消失；bubble 下次 show 自然刷新；省 1-1.5 天
工程 + 状态机重构风险。

**Alternative**：实时 swap strings — v3 backend 引入实时 push 时再考虑。

### 6.3 Files affected（impl 触点清单）

| # | 文件 | 改动类型 | diff 估 |
|---|---|---|---|
| 1 | `src/shared/types.ts` | 扩 `Lang` 类型 | +1 |
| 2 | `src/shared/i18nDetect.ts` | **新** pure 映射函数 + 单测 | ~15 / +30 test |
| 3 | `src/sidepanel/i18n.ts` | `STRINGS: Record<Lang, Strings>` 加 ja + fr 两 entry × 70 key | +140 |
| 4 | `src/content/clickTranslate.ts` | bubble + toast 三元改 Record + 扩 ja + fr | +30 / -10 |
| 5 | `src/content/index.ts` | fab 同款 + 扩 ja + fr | +12 / -5 |
| 6 | `src/sidepanel/screens/Settings.tsx` | dr-lang-toggle 横向 LangBtn 改 `<select>` | +12 / -10 |
| 7 | `src/sidepanel/styles.css` | 字体栈加 Noto Sans JP；dropdown 样式 | +8 |
| 8 | `src/sidepanel/index.html` | Google Fonts URL 加 Noto Sans JP | +1 / -1 |
| 9 | `src/background/index.ts` | onInstalled listener | ~10 |
| 10 | `cspell.json` | 审校术语 | +N |
| 11 | `manifest.json` + `package.json` | `2.0.0` → `2.2.0` | +1 / -1 × 2 |

**总估**：~250 行新增、~25 删除、1 新文件、1 新 test。

**不动文件双确认**：`_locales/` / bubble.ts / bubbleStyles.ts / toast.ts /
hoverReducer.ts / hitTest.ts / fab.ts。

### 6.4 Dict refactor shape

#### sidepanel/i18n.ts

```ts
const STRINGS: Record<Lang, Strings> = {
  "zh-CN": { appName: "DualRead", ..., wordsCount: (n) => `${n} 个词` },
  "en":    { ..., wordsCount: (n) => `${n} words` },
  "ja":    { ..., wordsCount: (n) => `${n} 単語` },
  "fr":    { ..., wordsCount: (n) => `${n} mots` },
};
```

TS 强制：漏 ja / fr 任何 key 直接编译错。

#### content/clickTranslate.ts — bubbleStrings + toastStrings

三元改 `Record<Lang, T>` 字典 + 函数变薄壳：

```ts
const BUBBLE_STRINGS: Record<Lang, BubbleStrings> = {
  "zh-CN": { save: "保存", saved: "已保存", ... },
  "en":    { save: "Save", saved: "Saved", ... },
  "ja":    { save: "保存", saved: "保存済み", ... },
  "fr":    { save: "Enregistrer", saved: "Enregistré", ... },
};
function bubbleStrings(lang: Lang): BubbleStrings { return BUBBLE_STRINGS[lang]; }
```

`toastStrings` 与 `content/index.ts:fabStrings` 同款。

#### shared/types.ts

```ts
export type Lang = "zh-CN" | "en" | "ja" | "fr";
```

`DEFAULT_SETTINGS.ui_language` 不动，`Settings.ui_language: Lang` 自动扩展。

### 6.5 Settings.tsx dropdown 改造

```tsx
// 改后
<div className="dr-settings__group-title">{S.uiLanguage}</div>
<select
  className="dr-lang-select"
  value={settings.ui_language}
  onChange={(e) => onChange({ ui_language: e.target.value as Lang })}
  aria-label={S.uiLanguage}
>
  <option value="zh-CN" lang="zh-CN">中文</option>
  <option value="en" lang="en">English</option>
  <option value="ja" lang="ja">日本語</option>
  <option value="fr" lang="fr">Français</option>
</select>
```

`<option lang="…">` 让 screen reader 用对应语种发音；CSS `.dr-lang-select`
参照 sidepanel 现有 settings control 风格（border / radius / focus ring）。
`onChange(partial)` 复用现有 prop 链路，父组件已经 plumb 到 `chrome.storage.local.set`。
旧 `LangBtn` / `.dr-lang-toggle` 如果只在这里用就删掉。

### 6.6 Edge cases

| Edge case | 行为 / 容忍度 |
|---|---|
| 首次安装 race（onInstalled storage write 未完成，sidepanel 已开） | 接受，<100ms 窗口；React 收到 storage update 自动 rerender |
| `getUILanguage()` 返回 4 lang 外（de/es/ko/...） | fallback `"en"`，设计就这样 |
| `getUILanguage()` 区域变体（fr-CA / zh-TW / en-GB） | `startsWith` 命中主语种 → 映射 fr / zh-CN / en / ja |
| 升级安装存量用户 | onInstalled `reason === "install"` 不命中 update，不跑 detect，存量保留 |
| storage 中 `ui_language` 被外力篡改成 invalid | 加 runtime guard `isValidLang`，hydrate 时 fallback `"en"` |
| bubble / toast 切语言时正在显示 | D10 锁：维持旧 lang 直到下次 show |
| Google Fonts CDN 不可达 | 字体栈降级 Noto Sans SC → 系统 fallback |
| Welcome screen first-run 用 detected lang | onInstalled 通常先于 sidepanel hydrate；race 时短暂 zh-CN 然后修正 |

#### 唯一新增防御代码

```ts
// src/shared/types.ts (扩 Lang 后增加)
const VALID_LANGS: readonly Lang[] = ["zh-CN", "en", "ja", "fr"];
export function isValidLang(x: unknown): x is Lang {
  return typeof x === "string" && (VALID_LANGS as readonly string[]).includes(x);
}
```

sidepanel hydrate / content settings 读 / 任何 storage 反序列化处加 1 行兜底。

### 6.7 Testing

| 目标 | 类型 | 位置 |
|---|---|---|
| `detectInitialLang(uiLang)` | unit (vitest) | `src/shared/i18nDetect.test.ts`（新） |
| `isValidLang(x)` | unit (vitest) | 同上 |
| `Record<Lang, T>` 全 key 到位 | TS 编译期 | 自动 |
| dropdown onChange 写 storage | 现 settings flow 覆盖 | 不新加 |
| JA/FR 翻译质量 | manual smoke | §6.8 |

`detectInitialLang` 用例 ~16 个（含 fr/fr-FR/fr-CA/FR/ja/ja-JP/zh/zh-CN/zh-TW/en/en-US/en-GB/de/es-ES/ko-KR/空）；`isValidLang` 用例 ~10 个（4 valid + 6 invalid）。

### 6.8 Manual smoke checklist

61 个 spot check，分 6 节：

#### §A — 首次安装 detect 检查（4 项）
4 个 profile（zh-CN / en / ja / fr）各装一次，验证 auto-detect 命中
对应 lang。JA profile 额外验证假名走 Noto Sans JP（非系统 fallback）。

#### §B — Sidepanel 5 tabs × 4 lang（20 项）
Welcome / Translate(empty) / Translate(active) / Vocab / Settings 五个
surface × 4 lang，验文字不溢出 / 字体协调。

#### §C — Bubble & Toast & FAB on real page（24 项）
在 wikipedia.org/en 测：
- bubble loading / translated short / translated long(hide-original) / error
- toast deleted(5s undo) / error
- FAB on/off

7 个状态 × 4 lang ≈ 24 项（部分状态合并）。重点看 FR "Enregistrer" 不
挤 bubble Save 按钮、JA 假名字体到位。

#### §D — 切语言 in-place（4 项）
zh→en→ja→fr→zh 循环切，每次验：sidepanel 立即切；FAB 立即切；
当前 bubble 保持旧 lang（D10 锁），下次 show 才新 lang。

#### §E — 字体 / 排版回归（4 项）
Logo "D"（Fraunces，Latin 只 ASCII 永远 OK）、welcomeHeading（Fraunces，
ja/fr 走 fallback）、bubble translation（Inter / JP fallback）、vocab list
词条（Fraunces，EN 词条永远 Latin）。

#### §F — Edge case 抽查（5 项）
浏览器 lang = zh-TW / de / ja-JP / 升级路径 / storage 篡改 invalid lang。

**通过标准**：§A-§D 必须无溢出 / 无截断 / 字体不"塌" → release；§E §F
小瑕疵记 v2.3 backlog 不阻 release。

## 7. Implementation notes

### 7.1 实装顺序（每步独立 commit）

1. **`shared/types.ts` + `shared/i18nDetect.ts` + 单测** — 类型 + pure 映射 +
   `isValidLang` guard + 26 个 vitest 用例。无任何运行时副作用。
2. **`background/index.ts` onInstalled hook** — 添加 listener，调用
   `detectInitialLang(chrome.i18n.getUILanguage())` + 写 storage。
3. **`sidepanel/i18n.ts` 扩 ja + fr** — Claude 一次性产出 ~70 key × 2
   lang（共 140 entry），用户审。`Record<Lang, Strings>` 强制全 key。
4. **`sidepanel/screens/Settings.tsx` dropdown 改造** — `dr-lang-toggle`
   横向 LangBtn → `<select>` dropdown。删 LangBtn 如果只在这里用。
5. **`sidepanel/index.html` + `styles.css` 字体** — Google Fonts URL 加
   Noto Sans JP，CSS 字体栈在 SC 前插入。
6. **`content/clickTranslate.ts` bubble + toast 扩 ja + fr** — 三元改
   `Record<Lang, T>` 字典 + 扩 ja + fr。
7. **`content/index.ts` fab 扩 ja + fr** — 同款重构。
8. **`manifest.json` + `package.json` 版本 bump** — `2.0.0` → `2.2.0`。

每步 typecheck + test 必须 green 才 commit。

### 7.2 commit 分组

按 CLAUDE.md commit policy"single identifiable concern"：

- **commit 1**: `feat(shared): add Lang i18n detect helper + isValidLang guard`
  （步骤 1 + 2 合并：detect 函数本身就是给 onInstalled 用的）
- **commit 2**: `feat(sidepanel): extend DR_STRINGS to JA + FR`
  （步骤 3 + 4 + 5 合并：sidepanel 4 语 UI 一次到位）
- **commit 3**: `feat(content): extend bubble/toast/fab strings to JA + FR`
  （步骤 6 + 7）
- **commit 4**: `chore(release): bump v2.0.0 → v2.2.0`
  （步骤 8）

发布前最后一步：跑完 §6.8 manual smoke 全 61 项，记录截图到 git-ignored
`smoke-screens/` 目录（`.gitignore` 已 cover `*.local`，再加 `smoke-screens/`）。

### 7.3 发布前置依赖

v2.2 不能上 CWS 直到：

1. v2.0.0 通过 CWS review（当前卡审，预计 7-21 天）
2. v2.1.x 已发布（local 已 commit 待 push 上架）
3. §6.8 manual smoke 全 61 项 pass

发布顺序方案：
- **A**：等 v2.0 通过 → 立即发 v2.1.x → v2.1.x 通过后再发 v2.2.0（最稳）
- **B**：等 v2.0 通过 → 把 v2.1.x + v2.2 合成一个版本（v2.2.0 = 2.1.x 功能 + i18n + bug fix）一次发（队列最短）

**推荐 B**（合 release）：CWS queue 排队成本 > merge 风险；v2.1.x 和 i18n
功能完全独立，无冲突。但要在 release notes 一次说清两批改动。

### 7.4 不在范围内的事

下面这些**显式不做**，避免 scope creep：

- 翻译目标语切换（→ #2 brainstorm）
- Welcome 三旗帜改造（→ #3 brainstorm）
- `_locales/` 商店元数据本地化（→ v2.4）
- chrome.i18n 路线
- Playwright e2e
- bubble / toast / fab 实时切换语言（v3 backend 时再考虑）
- 繁简中文分支（zh-TW 暂用 zh-CN fallback）
- `cspell.json` 加 JA/FR 单词（VS Code 拼写检查不识别 CJK / accented，
  误报忽略即可，不维护词典）

### 7.5 Risks 与缓解

| Risk | 缓解 |
|---|---|
| Claude 翻译 register 偏（敬語 / 命令 / vouvoiement 不一致） | 用户审稿；Claude 重译 |
| FR 长字符在 bubble Save 按钮溢出 | v2.1 已有 `max-width: 120px` + ellipsis；smoke §C2 重点抽查 |
| Noto Sans JP CDN 不可达 | 字体栈 fallback 到 Noto Sans SC → 系统；§6.6 已记 |
| 用户在 onInstalled 完成前开 sidepanel 看到 zh-CN 闪一下 | <100ms 窗口接受；§6.6 已记 |
| 升级用户被覆盖默认 | onInstalled 仅 `reason === "install"` 触发，update 路径不动 |

### 7.6 Done 定义（DoD）

- [ ] §6.8 manual smoke 全 61 项 pass + §G register matrix（P1-S2 新加）
- [ ] `npm run typecheck` + `npm test` + `npm run build` 全绿
- [ ] gitleaks pre-commit pass（应该 trivial，无 secret 改动）
- [ ] 5 commit 分组按 §7.2 落（v2.2 i18n 4 commits + v2.4 welcome 1 commit）
- [ ] v2.2.0 在本地 dist build 出 manifest version `"2.2.0"`
- [ ] v2.0 + v2.1 上架后，本批 push 到 CWS
- [ ] 上架后 1 周内监控 CWS reviews / GitHub issues 反馈翻译质量

## 8. v2.x.x 系列 release 规划（multi-agent review 修订版）

**原 Q-A 合 release 决策（v2.2 + v2.3 + v2.4 = 单一 v2.2.0）已反转**。
新规划：

```
release v2.2.0  (5 commit, ~320 LOC, 低风险)
├─ v2.2 i18n            (commit 1-4, ~250 LOC)
└─ v2.4 welcome picker  (commit 5,    ~70 LOC)

release v2.3.0  (7 commit, ~400 LOC, 中风险 - schema migration)
└─ v2.3 target-lang     (独立 release，schema migration P0 修复完毕后单独审、
                         单独 smoke、单独 ship)
```

理由（multi-agent P1-S1）：

- v2.3 schema migration 是全套唯一中风险项；不该阻挡 v2.2 i18n + v2.4
  welcome shipping
- CWS minor-update fast-track 实测 1-2 天，"3 队 vs 1 队"实际差距 < 1 周
- v2.3 独立审让 schema migration 的 6 项 P0 修复（multi-device race /
  per-item 8KB / SW eviction / commit atomicity / empty-string poisoning /
  read paths enumeration）有专注空间
- 万一 v2.0 review 被拒后 hot-fix，v2.2.0 + v2.3.0 各自独立 rebase
- Phase 1 backend 工作可在 v2.2.0 ship 后、v2.3.0 之前穿插（career
  narrative 不被 polish 阻塞）

## 9. Multi-agent review 修订记录（2026-04-25）

multi-agent-brainstorming skill 跑了 Skeptic / Constraint Guardian / User
Advocate / Scope reviewer 4 个独立角度，最终 disposition = **REVISE**。
用户拍板"全接受 P0 + P1"，本节记录回流到本文档的修订。

### 9.1 P0 修订（必改项，已合并到正文）

#### P0-7：Noto Sans JP 不走 Google Fonts CDN（改本地 self-host）

**问题**：v2.0 manifest `host_permissions = ["https://translate.googleapis.com/*"]`。
若加 `fonts.googleapis.com` + `fonts.gstatic.com` 到 CSP / host_permissions =
manifest permission delta = **几乎确定触发 CWS human review**（不是
minor-update fast-track）。Constraint + Scope 双 reviewer 标 P0。

**修订**：

- **§6.3 file #7**：`sidepanel/styles.css` 改为加载本地 woff2 而不是 CDN
  link
- **§6.3 file #8**：`sidepanel/index.html` 不动（删 Google Fonts JP URL
  方案），改在 styles.css 用 `@font-face`：
  ```css
  @font-face {
    font-family: "Noto Sans JP";
    src: url("./fonts/NotoSansJP-subset.woff2") format("woff2");
    font-weight: 400 700;
    font-display: swap;
    unicode-range: U+3040-309F, U+30A0-30FF, U+FF66-FF9F, U+4E00-9FFF;
  }
  ```
- **新增 file**：`src/sidepanel/fonts/NotoSansJP-subset.woff2`（本地 ~50KB
  subset，仅含 hiragana + katakana + JIS 常用 kanji）—— 实装时可用
  `glyphhanger` 或类似工具生成 subset；或临时直接用 Google Fonts 全量 JP
  woff2 一次性下载并 commit（~3MB but only included once）
- **assumption #5 修订**：字体加载是"本地资源 + `font-display: swap`"，
  网络 CDN 不可达 risk 消除，但首次加载 layout shift 略微更明显（接受）

### 9.2 P1 修订（建议改项，已合并）

#### P1-S1：合 release 反转（详见 §8）

#### P1-S2：§6.8 加 register matrix 检查（§G 新节）

manual smoke checklist §6.8 加新节 §G — register consistency matrix：

```
§G — JA / FR register matrix (8 项)

JA：
- 按钮形 (命令形)：Save → 保存、Delete → 削除、Retry → 再試行、Close → 閉じる
- 句子形 (です・ます)：welcomeBody / errorBody / loading / saved-toast → ます/です 结尾
- 对照检查：button label 不应含 ます (例外: "保存しました" toast 必须是 です・ます)

FR：
- 按钮形 (impératif sans subject)：Save → Enregistrer、Delete → Supprimer、
  Retry → Réessayer、Close → Fermer
- 句子形 (vouvoiement présent)：welcomeBody / errorBody → vous + verbe
- 对照检查：button label 不应含 "vous" / 句子形不应缺主语 vous

通过标准：所有 button-form key 是命令形 / 所有 sentence-form key 是 polite form。
混用 = 重译。
```

**实装时**：i18n.ts 新增 4 lang × 70 key 的过程中，把 JA / FR 注释里
显式标 `// JA: 命令形` / `// JA: です・ます`，让 PR review 时一眼看到。

### 9.3 P2 备忘（不阻 implement）

| # | 项 | 处理 |
|---|---|---|
| P2-1 | `Lang` 类型 BCP-47 / ISO 混 → v3 backend 时 4-region migration | 接受为已知债，v3 backend 重构时 ~1 day cost |
| P2-3 | `onInstalled` handler 异常崩溃 → 用户永久 zh-CN | 实装时给 `detectInitialLang` 调用包 try/catch fallback `"en"` |
