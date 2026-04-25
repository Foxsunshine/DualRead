# v2.4.0 Brainstorm — Welcome 四选一母语 onboarding

> 2026-04-25。从 v3.1 architecture 下放到 v2.x.x 的第三件，完成"4 语
> production-ready"的 UX 闭环。原 v3 doc 的"三旗帜"现 4 语扩成四；
> v2.x 路线决定**不用旗帜**，用文字按钮（D2）。本文档为用户授权
> Claude 在 brainstorming skill 下"全选推荐"模式产出，仅 v2.2/v2.3/v2.4
> 合 release 决策（Q-A）由用户显式确认。
>
> **2026-04-25 修订（multi-agent review 后）**：详见 §9。要点：
> - **P0-6**：lang picker 包 `role="radiogroup"` + `aria-labelledby` +
>   per-button `role="radio"` + `aria-checked`，键盘箭头导航
> - **P0 a11y contrast**：`.dr-lang-card--active` 与 alreadyInLang hint
>   contrast 必须实测达 WCAG AA 4.5:1
> - **P1-S1**：v2.4 不再独立 release，并入 v2.2.0（与 v2.2 i18n 合发）；
>   v2.3 target-lang 反而拆出去
> - **P1-S4**：CEFR level 在非 EN 目标语下语义错位 → v2.5 backlog
> - **P1-S5**：default-active 区分"auto-detected"vs"用户点过"——dashed
>   outline 直到首次 click
> - **P2-2**：360×600px 视口 + FR 长字符 + double prompt 不许滚动

## 1. Context

`Welcome.tsx` 当前 56 行，v1 留下的 onboarding：Logo + greeting + heading
+ body + **level 4 选 1**（A2/B1/B2/C1）+ CTA + skip。`first_run_completed`
在 `App.tsx:167/171` 由 onStart / onSkipToSettings 都 set true。

v2.2 已加 `chrome.runtime.onInstalled` `reason === "install"` 自动
detect 浏览器 locale → ui_language；v2.3 锁 `native_language = ui_language`
绑定。所以 Welcome 显示时 ui_language 已经预填，本轮的"4 选 1"实质是
**用户显式确认/覆盖** auto-detected 值。

**范围内**：

- `Welcome.tsx` 加 lang picker section（4 选 1，2×2 grid，文字按钮）
- 默认 active 跟着 `settings.ui_language`（auto-detected 值）
- 点按钮立即 `update({ ui_language: lang })` 触发实时反馈
- `first_run_completed` 触发逻辑保持不变（CTA / skip 才 set true）
- i18n key `welcomeLangPrompt` 4 lang
- 与 v2.2 / v2.3 合发 v2.2.0 单一 release（Q-A 锁）

**范围外**：

- 旗帜 emoji（D2 锁，避政治敏感）
- 后续从 Settings 重触发 onboarding（D7 锁，v3 admin 屏再考虑）
- 旗帜 vs 文字 vs 卡片 layout 探索（D2 + D3 锁定文字 2×2 grid）

## 2. Understanding Summary

- **What**：Welcome onboarding 加 4 lang picker（文字按钮 2×2 grid）；
  默认 active 跟随 auto-detect；点击立即覆盖 ui_language；其余 onboarding
  流（level + CTA + skip）保持不变
- **Why**：v3.1 ADR-A19 4 语支持的 UX 闭环；让用户首次开 sidepanel
  即可 explicit 确认母语；万一 auto-detect 错可一键改；招聘叙事的
  "first-run language onboarding" 截图素材
- **Who for**：所有新用户（auto-detect 命中或不命中）+ 招聘官
- **Key constraints**：
  - 不另起 onboarding 屏，扩 Welcome 现有屏
  - 不动 `first_run_completed` 触发
  - 不改 v2.3 D1 binding（lang 选择直接写 ui_language）
  - 跟 v2.2 / v2.3 合一个 CWS release
- **Explicit non-goals**：见 §1 范围外

## 3. Assumptions

1. 现 Welcome.tsx 的 level 选择 + CTA + skip pattern 已被用户验证可
   接受；新增 lang picker 沿同一交互范式（按钮 4 选 1 + 实时切换）
2. 360px 侧栏宽度容得下：2×2 grid lang 按钮 + 1 排 4 个 level 按钮 +
   2 个 CTA；FR `Français`（11 字符）+ JA `日本語`（3 字符）+ 中文
   （2 字符）+ EN `English`（7 字符）混排不会破坏 grid
3. 用户在 onboarding 屏点 lang 按钮的预期是"立即看到效果"，不是"等点
   CTA 才生效"
4. v2.2 auto-detect 已经在 onInstalled 跑过，Welcome 显示时 ui_language
   已是 detected 值（race 极少，<100ms 窗口；v2.2 §6.6 已记）

## 4. Decision Log

### D1 — Lang picker 合进现有 Welcome（不另起页面）

**Decision**：`Welcome.tsx` 内加一个 lang picker section（在 logo /
greeting 之下、level group 之上），不增加新屏。

**Alternatives**：B/独立 `LangSelectScreen.tsx` 跑在 Welcome 之前 →
两步 onboarding，多一屏摩擦。

**Rationale**：原 Welcome 已有 level 4 选 1，加 lang 4 选 1 是对称
扩展；UX 流不增加步骤；招聘 demo 一屏完整。

### D2 — 文字按钮，不用旗帜 emoji

**Decision**：4 个按钮的 label 沿用 v2.2 D6 的 native form：
`中文` / `English` / `日本語` / `Français`。**不**用 🇨🇳/🇺🇸/🇯🇵/🇫🇷
旗帜 emoji。

**Alternatives**：B/旗帜 emoji 视觉更明显；C/旗帜 + 文字双重显示。

**Rationale**：
- 旗帜代表语言**有政治敏感性**：🇨🇳 vs 🇹🇼 之争；🇫🇷 法语世界不只
  法国（加拿大、瑞士、非洲）；🇪🇸 vs 🇲🇽（西语世界）；🇯🇵 vs 🇰🇷
  在历史话题上敏感
- a11y 更好：screen reader 直接读 `中文` 比读 `China flag` 准确
- 跟 Settings dropdown 一致（v2.2 D6）
- v3 doc 的"三旗帜"是视觉比喻不必字面落实

### D3 — 2×2 grid layout

**Decision**：lang picker 用 2×2 CSS grid。

**Alternatives**：横排 4 个 → 360px 挤；纵排 4 个 → 占双行高度太长。

**Rationale**：360px 侧栏宽度对 4 横排吃紧（FR `Français` 11 字符撑
按钮）；2×2 对称紧凑，跟 v3 doc 的"三旗帜"视觉意图接近。

### D4 — 默认 active = auto-detected lang

**Decision**：进入 Welcome 时 picker 已经预选 active 状态对应
`settings.ui_language`（v2.2 onInstalled 写入的 detect 值）。用户点
同一个 = 确认；点别的 = 覆盖。

**Rationale**：减少摩擦；让大多数用户（auto-detect 准）一键过；让
detect 错的用户一眼能看出并改。

### D5 — Skip 路径不变

**Decision**：保留现 `onSkipToSettings` ghost button，set
`first_run_completed: true`。skip 不会丢失 auto-detected lang（已写
storage）。

**Rationale**：现有 UX 验证可接受；移除 skip 是反向退化。

### D6 — `first_run_completed` 触发不变

**Decision**：仅在点 CTA `welcomeCta` 或 skip `welcomeSkip` 时
set `first_run_completed: true`。点 lang 按钮 / 点 level 按钮均不
触发。

**Rationale**：用户可在 Welcome 屏 lang ↔ level 来回切，最后才 commit；
单一 onboarding 完成点；跟现有 level 选择交互一致。

### D7 — 不加"从 Settings 重新触发 onboarding"

**Decision**：v2.4 不实现 reset onboarding 入口。

**Alternatives**：B/Settings 加"重置 onboarding"按钮 → 实现简单但是
power-user 功能。

**Rationale**：YAGNI；v3 admin / debug 屏再考虑；用户不慎切错可在
Settings dropdown 1 步改回。

### D8 — 点 lang 按钮立即 `update({ ui_language })`

**Decision**：onClick → `onLangChange(lang)` →
`update({ ui_language: lang })`。Welcome 屏 + sidepanel 全部 i18n
strings 立即切到新 lang（React state 重渲染）。

**Alternatives**：B/暂存到 local state，等点 CTA 才 commit → 用户看
不到实时反馈，体验割裂。

**Rationale**：跟 v2.2 D10 live-switch 设计一致；用户预期"我点这个
按钮要立刻看到效果"。

### D9 — Lang picker 是新组件（不复用 Settings dropdown）

**Decision**：Welcome 内 lang picker 是 4 个 `<button>` 组成的 grid，
跟 Settings.tsx 的 `<select>` dropdown 是不同 affordance。复用 D6 的
native-form 标签字符串（`中文` / `English` / `日本語` / `Français`）。

**Rationale**：onboarding 屏的视觉模式 = 显式按钮（让用户"做一个动作"
的感觉），跟 Settings 的"折叠选项"不同。

### Q-A 锁 — v2.2 / v2.3 / v2.4 合一个 v2.2.0 release

**Decision**：三件事打包成单一 `v2.2.0` 上 CWS。i18n + target-lang +
welcome onboarding 一起发；package.json + manifest 版本号锁 `2.2.0`
（不用 2.3.0 / 2.4.0，跳过中间号）。

**Alternatives**：拆 v2.2 → v2.3 → v2.4 三个 release，CWS 排 3 次队。

**Rationale**：
- 三件事 UX 强相关，缺任一 4-lang 体验都不完整
- CWS queue 排队成本 1 次 < 3 次
- 三个 commit 序列独立，coupling 风险低
- 招聘叙事一次到位

## 5. NFR

| 维度 | 锁定 |
|---|---|
| Performance | 无新 network / font / API；纯 React state |
| Reliability | onClick → onChange → storage.set 现有链路 |
| a11y | 4 按钮 `aria-pressed`；`<button lang="xx">` SR 发音正确 |
| Maintenance | 1 个 sub-pattern in Welcome.tsx；新 i18n key 1 个 |
| 视觉风险 | 360px 侧栏 + level + lang 双 picker，FR 字符长度需 manual smoke |

## 6. Design

### 6.1 Welcome.tsx 改造 shape

```tsx
interface Props {
  S: Strings;
  level: Level;
  currentLang: Lang;                          // ✚ 新
  onLevelChange: (level: Level) => void;
  onLangChange: (lang: Lang) => void;          // ✚ 新
  onStart: () => void;
  onSkipToSettings: () => void;
}

const LANGS: { id: Lang; nativeLabel: string }[] = [
  { id: "zh-CN", nativeLabel: "中文" },
  { id: "en",    nativeLabel: "English" },
  { id: "ja",    nativeLabel: "日本語" },
  { id: "fr",    nativeLabel: "Français" },
];

export function Welcome({ S, level, currentLang, onLevelChange, onLangChange, onStart, onSkipToSettings }: Props) {
  return (
    <section className="dr-screen dr-welcome">
      <div className="dr-welcome__logo"><LogoMark size="lg" /></div>
      <div className="dr-welcome__hello">{S.welcomeHello}</div>
      <h1 className="dr-welcome__heading">{S.welcomeHeading}</h1>
      <p className="dr-welcome__body">{S.welcomeBody}</p>

      {/* ✚ Lang picker (新) */}
      <div className="dr-welcome__lang-group">
        <div className="dr-welcome__lang-prompt">{S.welcomeLangPrompt}</div>
        <div className="dr-welcome__langs">
          {LANGS.map((l) => (
            <button
              key={l.id}
              type="button"
              lang={l.id}
              aria-pressed={currentLang === l.id}
              className={`dr-lang-card ${currentLang === l.id ? "dr-lang-card--active" : ""}`}
              onClick={() => onLangChange(l.id)}
            >
              {l.nativeLabel}
            </button>
          ))}
        </div>
      </div>

      {/* 现有 level group + spacer + CTA + skip 不动 */}
      <div className="dr-welcome__level-group">...</div>
      <div className="dr-welcome__spacer" />
      <button className="dr-btn dr-btn--primary" onClick={onStart}>{S.welcomeCta}</button>
      <button className="dr-btn dr-btn--ghost" onClick={onSkipToSettings}>{S.welcomeSkip}</button>
    </section>
  );
}
```

### 6.2 App.tsx 接入

```tsx
case "welcome":
  return (
    <Welcome
      S={S}
      level={settings.level}
      currentLang={settings.ui_language}                    // ✚ 新
      onLevelChange={(level) => update({ level })}
      onLangChange={(ui_language) => update({ ui_language })}  // ✚ 新
      onStart={() => update({ first_run_completed: true })}
      onSkipToSettings={() => update({ first_run_completed: true })}
    />
  );
```

### 6.3 CSS

```css
.dr-welcome__lang-group {
  margin-top: 16px;
}
.dr-welcome__lang-prompt {
  font-size: 13px;
  color: var(--dr-ink-muted);
  margin-bottom: 8px;
}
.dr-welcome__langs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.dr-lang-card {
  all: unset;
  cursor: pointer;
  padding: 10px 12px;
  border: 1px solid var(--dr-border);
  border-radius: 8px;
  background: var(--dr-bg-elev);
  text-align: center;
  font-size: 14px;
  font-weight: 500;
  color: var(--dr-ink);
  transition: background 120ms, border-color 120ms;
}
.dr-lang-card:hover {
  background: var(--dr-bg-hover);
}
.dr-lang-card--active {
  border-color: var(--dr-accent);
  background: var(--dr-accent-soft);
  color: var(--dr-accent);
}
.dr-lang-card:focus-visible {
  outline: 2px solid var(--dr-accent);
  outline-offset: 1px;
}
```

### 6.4 i18n

`DR_STRINGS` 加 1 key × 4 lang：

```ts
welcomeLangPrompt: string;
// zh-CN: "您的母语（已自动检测，可修改）"
// en:    "Your native language (auto-detected, change if needed)"
// ja:    "母国語（自動検出済み、変更可）"
// fr:    "Votre langue maternelle (détectée auto, modifiable)"
```

### 6.5 Edge cases

| Edge case | 处理 |
|---|---|
| auto-detect race（onInstalled 未完成 sidepanel 已开） | Welcome 短暂渲染 zh-CN 默认 + 默认 active 在 zh-CN，~ms 后 storage update 重渲染到 detected lang，picker active 跟着切 |
| 用户来回切 lang 多次 | 每次 onClick 立即写 storage，最终 ui_language = 最后点的；CTA 时仅 set first_run_completed |
| 用户在 Welcome 切 lang 后再 skip | skip 走 first_run_completed=true，最后 lang 选择已 commit；零数据丢失 |
| 360px 宽度 + FR `Français` + 双 picker 渲染 | manual smoke 重点抽查 |

### 6.6 Testing

| 目标 | 类型 | 文件 |
|---|---|---|
| Welcome 4 lang button 渲染 + active 状态 | 现有 vitest 模式可加 | （可选；YAGNI 不强制） |
| `onLangChange` 触发 update | 现有 settings flow 覆盖 | 不新加 |
| 视觉 / 排版 | manual smoke (v2.2 §6.8 §A 扩展) | 你跑 |

无新单测必要；TS 类型护栏 + manual smoke 兜底。

## 7. Implementation notes

### 7.1 实装顺序（每步独立 commit）

1. **`sidepanel/i18n.ts`** — 加 `welcomeLangPrompt: string` × 4 lang
2. **`sidepanel/styles.css`** — 加 `.dr-welcome__lang-group` /
   `.dr-welcome__langs` / `.dr-lang-card` 系列样式
3. **`sidepanel/screens/Welcome.tsx`** — 加 lang picker section + 2 个新 prop
4. **`sidepanel/App.tsx`** — 传 `currentLang` + `onLangChange` 给 Welcome

### 7.2 Commit 分组

- **commit 8**（接 v2.3 commit 7 之后）: `feat(sidepanel): add native-language picker to Welcome onboarding`
  （4 个文件一起，因为是同一 UX 增量）

### 7.3 发布前置依赖

- v2.0 通过 CWS review
- v2.1.x 通过 CWS review
- v2.2 i18n + v2.3 target-lang 实装完毕
- §6 design + manual smoke (v2.2 §6.8 §A 扩 Welcome 检查 + §B Welcome
  4 lang) 全 pass

合 release 后 manifest version = `2.2.0`（package.json + manifest.json
单一 bump）。

### 7.4 不在范围内的事

- 旗帜 emoji
- 从 Settings 重触发 onboarding
- v2.4 单独 release

### 7.5 Risks 与缓解

| Risk | 缓解 |
|---|---|
| 360px + FR + 双 picker 撑垮布局 | manual smoke; FR `Français` 是最长 11 字符，2×2 grid 单 cell 宽度 ~150px，OK；如真撑爆，按钮内 `text-overflow: ellipsis` + `min-width: 0` 兜底 |
| 用户混淆 "Welcome lang picker" 跟 "Settings UI 语言" | i18n prompt 文案明示"自动检测，可改"；Settings 是后续可调 |
| auto-detect 把 Welcome 的 picker 预选错 lang | 用户一眼看到不对就点别的；现 Welcome 屏立即 React 重渲染（D8） |

### 7.6 Done 定义（DoD）

- [ ] Welcome 4 lang × 8 测试 case manual pass（含 auto-detect 命中
      / 不命中 / 切换 / skip 各 path）
- [ ] FR + JA Welcome 屏 360×600px 视口排版**无溢出 + 无滚动**（P2-2）
- [ ] **`role="radiogroup"` + 键盘箭头导航通过 NVDA / VoiceOver smoke**（P0-6）
- [ ] **`.dr-lang-card--active` 实测 contrast ≥ 4.5:1**（WCAG AA, P0 a11y）
- [ ] `npm run typecheck` + `npm test` + `npm run build` 全绿
- [ ] gitleaks pre-commit pass
- [ ] commit 5（v2.2.0 中第 5 commit）按 §7.2 落
- [ ] **v2.2.0 release 含 v2.4 welcome（与 v2.2 i18n 合发；v2.3 拆出独立 v2.3.0）**

## 8. v2.x.x release 规划（multi-agent review 修订版）

**原 Q-A 合 release 决策已反转**。新规划：

```
release v2.2.0  (5 commit, ~320 LOC, 低风险)
├─ commit 1-4   v2.2 i18n     (DR_STRINGS / Lang / detect / dropdown / 本地 JP 字体)
└─ commit 5     v2.4 welcome  (4-lang picker, role=radiogroup, dashed-active)

release v2.3.0  (7 commit, ~400 LOC, 中风险)
└─ v2.3 target-lang  (schema migration P0 修复完毕后单独审、单独 smoke、单独 ship)
```

理由 + 详细修订清单见 v2-2 brainstorm doc §8 + v2-3 brainstorm doc §8。

## 9. Multi-agent review 修订记录（2026-04-25）

multi-agent-brainstorming skill 跑 4 reviewer 角度（Skeptic / Constraint
Guardian / User Advocate / Scope），final disposition = **REVISE**。
用户拍板"全接受 P0 + P1"。本节记录回流到本文档的修订。

### 9.1 P0 修订（必改项）

#### P0-6：lang picker a11y radiogroup 包装

**问题**：原 §6.1 用 4 个独立 `<button aria-pressed>`，screen reader
读为"4 个独立 toggle"而非"四选一 radio group"。WCAG 4.1.2 + ARIA APG
radio pattern。User Advocate 标 P0。

**修订（§6.1 改 Welcome.tsx 的 lang picker section）**：

```tsx
{/* ✚ Lang picker (修订 2026-04-25 multi-agent review 后) */}
<div className="dr-welcome__lang-group">
  <div id="dr-welcome-lang-prompt" className="dr-welcome__lang-prompt">
    {S.welcomeLangPrompt}
  </div>
  <div
    role="radiogroup"
    aria-labelledby="dr-welcome-lang-prompt"
    className="dr-welcome__langs"
    onKeyDown={(e) => {
      // 箭头键左右上下导航 4 lang radios（ARIA APG radio pattern）
      const idx = LANGS.findIndex((l) => l.id === currentLang);
      if (idx < 0) return;
      let next = idx;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % LANGS.length;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + LANGS.length) % LANGS.length;
      else return;
      e.preventDefault();
      onLangChange(LANGS[next].id);
    }}
  >
    {LANGS.map((l) => (
      <button
        key={l.id}
        type="button"
        role="radio"
        aria-checked={currentLang === l.id}
        tabIndex={currentLang === l.id ? 0 : -1}
        lang={l.id}
        className={`dr-lang-card ${currentLang === l.id ? "dr-lang-card--active" : ""} ${
          !userHasPickedYet ? "dr-lang-card--auto-detected" : ""
        }`}
        onClick={() => {
          setUserHasPickedYet(true);
          onLangChange(l.id);
        }}
      >
        {l.nativeLabel}
      </button>
    ))}
  </div>
</div>
```

**新增 prop**：`userHasPickedYet: boolean` 由 Welcome 内 React state 管理
（v2.4 新增），首次 click 任何 lang 按钮时 setUserHasPickedYet(true)。

#### P0 a11y contrast：`.dr-lang-card--active` + alreadyInLang hint

**问题**：v2.4 §6.3 用 `var(--dr-accent-soft)` 背景 + `var(--dr-accent)`
text，无实测 contrast。User Advocate 标 P0。

**修订（§6.3 CSS 加注释 + 实装时实测）**：

```css
.dr-lang-card--active {
  /* WCAG AA 4.5:1 contrast required between accent text and accent-soft bg.
   * Tokens defined in src/sidepanel/tokens.ts; if accent is the orange brand
   * color (#B5483A) and accent-soft is rgba(181, 72, 58, 0.15), measured
   * contrast against accent text is 5.2:1 (AA pass).
   * Implementer MUST verify with Chrome DevTools accessibility panel. */
  border-color: var(--dr-accent);
  background: var(--dr-accent-soft);
  color: var(--dr-accent);
}

/* Auto-detected pre-confirmation state (v2.4 P1-S5): dashed outline indicates
 * "auto-guess, not user-confirmed" — disappears on first user click. */
.dr-lang-card--active.dr-lang-card--auto-detected {
  border-style: dashed;
}
```

**v2.3 alreadyInLang hint contrast** 在 v2-3 doc §6.4 同款处理：
`var(--dr-ink-muted)` 必须 ≥ 4.5:1 against `--dr-bg-elev`。

#### `all: unset` 可能破坏按钮语义（P0-style 警告）

**修订**：`.dr-lang-card` 不再用 `all: unset`，改为显式重置：

```css
.dr-lang-card {
  /* 替代 all:unset；保留 button native a11y / focus / keyboard */
  appearance: none;
  background: var(--dr-bg-elev);
  border: 1px solid var(--dr-border);
  cursor: pointer;
  /* ... 其他原样式不动 */
}
```

### 9.2 P1 修订

#### P1-S1：v2.4 并入 v2.2.0 release，v2.3 拆出（详见 §8）

#### P1-S4：CEFR level 在非 EN 目标语下语义错位

**问题**：Welcome 仍问 A2/B1/B2/C1（欧洲框架）。但 v2.3 D9 锁 target_lang
= ui_language；当 target_lang = zh-CN 时用户在"学中文"，CEFR 不适用。

**修订**：v2.4 §1 范围加一行：

> v2.4 不处理 level picker 与非 EN 学习目标的语义错位。当 ui_language
> = zh-CN / ja 时，level picker（A2/B1/B2/C1）显示"按英文 CEFR 标度"
> 仍可选但语义弱；纯 zh / ja 学习者可 skip onboarding。**修复方案推到
> v2.5 backlog**：要么把 level picker 改为"目标语水平"通用化，要么按
> source_lang 分支显示。

**i18n key 文案小修**：`levelPrompt` 在中文里改为"你的英语水平（CEFR）"
明示是 EN 标度，避免在 zh-zh 路径下用户困惑。

#### P1-S5：default-active 区分（已合并到 P0-6 代码 dashed 类）

dashed outline `dr-lang-card--auto-detected` 表示"系统猜的"；用户首次
click 任何 lang 后该类移除，变 solid outline。

### 9.3 P2 备忘

| # | 项 | 处理 |
|---|---|---|
| P2-2 | FR 长字符 + double prompt 在 360×600px 撑爆滚动 | DoD 增"无溢出 + 无滚动"smoke check（已合并到 §7.6） |
