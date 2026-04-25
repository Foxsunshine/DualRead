# Bug: Non-Latin selections (JA / ZH / ...) are silently dropped before reaching translate

**Reported**: 2026-04-25 (user 实测发现 "划日语不能翻译成中文")
**Status**: 🔴 **Pending fix** — root cause confirmed, fix not yet implemented
**Severity**: P1 — feature-level outage for any user whose **source language**
is non-Latin script (JA / ZH / KO / AR / ...). Translation simply does not
fire; no error UI, no toast, no log. The user sees nothing happen.
**Affected surfaces**:
  - in-page click-to-translate bubble (content script)
  - in-page drag-to-select bubble (content script)
  - side-panel selection mirror (downstream of `SELECTION_CHANGED`)
  - saved-word auto-highlight (related secondary failure — see S2)

---

## Symptom

> "划动日语并不能翻译成中文"

User flow: Settings → UI Language = `中文`，打开任意含日文的页面，
划选或点击日文（含 kanji / hiragana / katakana 任意组合）。

| 输入 | UI 行为 |
|---|---|
| 划日文 | ❌ 无反应（不出 bubble，侧栏不动，无错误提示）|
| 单击日字 | ❌ 无反应 |
| 划英文 | ✅ 翻译成中文 |
| 划中文（UI 切到 ja） | ❌ 无反应 |
| 划任意非拉丁文字 | ❌ 无反应 |

→ 实际 bug 范围**远超**用户报告：**任意非拉丁源语言都不能翻译**，不只
日语。中文、韩语、阿拉伯语、emoji、希腊字母等全部静默失败。

---

## Reproduction

Pre-conditions:

- Extension loaded (dev unpacked from `dist/` 或上架版本均可)
- Master switch (learning mode) ON
- Settings → UI Language **任意值**（bug 与 UI 语言无关 —— 任何 UI 设置
  下，源语言只要不是拉丁文字就触发）

Steps:

1. 打开 https://ja.wikipedia.org/ 任意条目，或任何含日文的页面
2. 划选一段日文（如「勉強する」）
3. 期望：bubble 出现显示中文翻译；侧栏 Translate tab 同步显示
4. 实测：**完全没反应**。鼠标松开后页面像没有发生任何事

Variant：单击单个 kanji（如点击「勉」）—— 同样无反应。

---

## Root cause

**`src/content/wordBoundary.ts` 的 Latin-only filter** 在选区到达翻译
函数之前就把它丢了。

```ts
// src/content/wordBoundary.ts:24
const LATIN_RE = /\p{Script=Latin}/u;

// src/content/wordBoundary.ts:35-37
function isLatinWord(seg: Intl.SegmentData): boolean {
  return seg.isWordLike === true && LATIN_RE.test(seg.segment);
}

// src/content/wordBoundary.ts:89  (snapOffsetsToWord — drag 路径)
if (!hasLatinWord) return null;

// src/content/wordBoundary.ts:108-115  (wordAtOffset — click 路径)
for (const seg of getSegmenter().segment(text)) {
  if (!isLatinWord(seg)) continue;          // 跳过日语 segment
  ...
}
return null;                                // 找不到拉丁词就 null
```

注释**自我承认**这是 v1 时代刻意的限制：

- `wordBoundary.ts:15-18`：*"this iteration only supports English vocab,
  so we filter segments via `\p{Script=Latin}`. A selection that
  contains no Latin word-like segment returns null — the caller
  interprets that as 'discard, don't translate'."*
- `index.ts:116-117`：*"the snap returns null, the selection is
  non-Latin (CJK / emoji) — we drop it because v1.1 translation only
  targets English vocab."*

### Chain — drag 路径

```
mouseup
  │
  ▼
content/index.ts:onMouseUp (line 98)
  │  rawText = "勉強する", context = "私は毎日勉強する。"
  ▼
extractContextSentence(sel)  → "私は毎日勉強する。"
  │
  ▼
context.toLowerCase().indexOf(rawText.toLowerCase())  → 4  (found)
  │
  ▼
snapOffsetsToWord(context, 4, 9)
  │  Intl.Segmenter("en", "word") 把日文按字符切成 "私" / "は" / "毎日"…
  │  全部 isLatinWord = false（无 \p{Script=Latin}）
  │  hasLatinWord = false
  ▼
return null
  │
  ▼
content/index.ts:128  →  if (snapped === null) return;   // 静默退出
                          ↑ 不发 SELECTION_CHANGED
                          ↑ 不发 TRANSLATE_REQUEST
                          ↑ bubble 不显示
```

### Chain — click 路径

```
click on kanji
  │
  ▼
content/clickTranslate.ts:resolveWordAtPoint (line 250)
  │
  ▼
caretRangeFromPoint(x, y)  → Range pointing at JA text node
  │
  ▼
wordAtOffset(textNode.data, caret.startOffset)
  │  同样的 isLatinWord filter
  ▼
return null
  │
  ▼
clickTranslate.ts:259  →  if (!hit) return null;        // 静默退出
```

### 为什么 background/translate.ts 本身没问题

`src/background/translate.ts:85` 用 `sl=auto&tl=${target}` 调用 Google
Translate Web API —— Google 自动检测源语言，对 ja → zh-CN 翻译完全胜任。
但**翻译函数从未被调用**，因为上游过滤器就把请求杀掉了。

---

## 为什么这个 bug 之前没被发现 / Why now

- v1.0–v1.1 ：定位明确是"中国人学英语"，输入只有英文；filter 与定位匹配
- v2.0 ：CWS 上架；定位不变
- v2.2 ：加 4 语 UI（`Lang = "zh-CN" | "en" | "ja" | "fr"`），但**只扩了**：
  - DR_STRINGS 字符串本地化
  - target_lang 选择（用户能选 ja/fr 作为翻译目标）
  - 与之配套的 vocab schema (`source_lang` / `target_lang` 字段)
- v2.2+ **没有扩**：
  - `wordBoundary.ts` 的输入侧识别（仍 Latin-only）
  - `highlightable.ts` 的 highlight 引擎（同样 Latin-only —— 见 S2）
- 用户**今天**才实测到，是因为 v2.x 内部 testing 一直默认场景是"英文页面"。
  4 语 UI 验证了"翻译显示中文/日文/法文"，但没验证"输入是日文/中文"

→ 本质：v2.2+ 的 4 语支持是**半套**，输出端到位、输入端没动。架构
v3.1 §6.3 把 zh↔ja / en↔ja / fr↔* 列为主流方向（`v3-1-architecture.md:840`），
所以输入侧补全是**必经前置**，不是可选项。

---

## Affected sub-systems / 同源附属问题

### S1 — `Intl.Segmenter` locale 写死英语

`wordBoundary.ts:45`:

```ts
cachedSegmenter = new Intl.Segmenter("en", { granularity: "word" });
```

即便修了 LATIN_RE filter，对 JA 文本来说 ICU word segmentation 应该用
`"ja"` locale 才能正确处理 kanji 复合词、连用形、助词边界。否则点击
"勉強"两字一组想翻"study"，可能只选到"勉"或"強"单字。

→ 修 root cause **必须协同处理**这一点：要么按 ui_language 切 segmenter
locale（动态构造，记得保留 memo cache），要么对 CJK 走另一种边界策略
（比如点击直接取最长 isWordLike segment / drag 直接用原选区不 snap）。

### S2 — `shared/highlightable.ts:27` 同样 Latin-only

```ts
if (!/^[\p{Script=Latin}\p{M}'\- ]+$/u.test(trimmed)) return false;
```

即便翻译路径打通，**保存的日语词不会被自动高亮**。注释承认：*"Chinese /
Japanese / Korean and other scripts have no `\b` word boundary semantics
in V8's regex, so we'd never match anyway."*

→ JA / ZH 高亮不能用 `\b` regex，需要新匹配策略（直接 `indexOf` + 上下
文 char check，或换用 ICU segmenter 边界）。

→ **不阻塞翻译修复**，但翻译修好后这会立刻成为下一个用户报告 ——
"保存了日文词，下次访问没高亮"。建议**同一批次**修。

### S3 — `i18nDetect.ts` 折叠 `zh-TW → zh-CN` 触发误判 alreadyInLang

非本 bug 直接相关，但同源（i18nDetect 过度折叠）。`clickTranslate.ts:511-518`：

```ts
if (data?.detectedLang && data.detectedLang !== "auto"
    && sourceLang === click.lang) {
  renderAlreadyInLang(click);
  return;
}
```

zh-TW 用户 target = `zh-CN` 时，Google 返回 `"zh-TW"`，`detectInitialLang`
折叠到 `"zh-CN"`，等于 target → 错误触发"已经是目标语言"分支，用户看
不到简体翻译。**预先存在的 bug**，仅记录。本次修复不必处理。

---

## Pending fix — 修复方向（不在本文档内实现）

修 root cause **至少需要 3 处协同**：

### F1 `src/content/wordBoundary.ts`

- 接受非拉丁 segments（删除或软化 LATIN_RE filter）
- 按 `ui_language` 切换 `Intl.Segmenter` locale（建议 memo by lang）
- 为无空格脚本（CJK / 日韩）设计专门 word 边界策略：
  - **click 路径**：取 caret 所在的最长 isWordLike segment（即便不是
    Latin），不强求拉丁
  - **drag 路径**：非 Latin 选区**不 snap**，直接透传 rawText —— 用户
    手动选什么就翻什么
- 重新审视 `wordAtOffset` / `snapOffsetsToWord` 的返回类型（仍 nullable
  即可，但 null 的语义改成"选区无任何文字"，不再是"无拉丁文字"）

### F2 `src/content/index.ts:124-131` & `src/content/clickTranslate.ts:258-259`

- null-handling 改为：F1 修好后这些 null 路径只在"真的没有任何可译文本"
  时触发（空选区 / 纯标点 / 纯空格），此时仍然 silent return 是合理的
- 不需要新增 fallback 透传逻辑 —— 让 wordBoundary 一处决定即可

### F3 `src/shared/highlightable.ts`

- 删除 `\p{Script=Latin}` 限制
- 重写 highlight 匹配策略以支持 CJK：
  - 选项 a：用 ICU segmenter 在每个候选高亮位置验证是否对齐到 word 边界
  - 选项 b：CJK 简化为 `indexOf` + 前后字符是非词字符的 sanity check
  - 选项 c：Shadow DOM 内逐字符比对（对 highlight 性能友好，但代码复杂）
- 选项 a 与 F1 一致性最高，建议优先

### F4 — 测试

- `wordBoundary.test.ts` 新增 JA / ZH 用例（目前全是英文）
  - 单击日字（kanji / hiragana / katakana 各一）
  - 划日字短语
  - 划中文短语
  - 划混合（日文 + 西文 + 数字）
- `highlightable.test.ts` 新增 CJK 用例
- 新增 e2e fixture（`tests/e2e/ja-page-fixture.html`）覆盖完整 click →
  bubble → 翻译 → 保存 → 重访高亮的回归

### F5 — 文档同步

- `README.md` 第 3 行的"for Chinese speakers learning English"过时（与
  v2.2+ 4 语 UI 已经不一致；本 bug 修后更不一致）→ 改成更通用表述
- `store-listing.md` 第 113 行 "UI: Simplified Chinese (default), English"
  过时（实际有 4 个）→ 改成 4 个全列；114 行 "Target: English-to-Chinese
  reading support" → 改成"任意 ↔ 任意"
- 这两条与本 bug 修复**强相关**：修了再改文档；不修先别动文档（v2.0.0
  仍在 CWS review，文档过时反而不会触发"功能与描述不符"二次审查）

---

## 风险点 / 修复前必读

### R1 — 老用户 vocab 库里可能混了"误存"非拉丁词

理论上 v2.2+ 用户**不可能**通过正常路径保存非拉丁词（因为划/点都失败）。
但导入路径（CSV 导入、未来 v3 vocab 同步）可能绕过 wordBoundary。修复
后这些词会突然开始高亮，用户感知是"新功能"或"奇怪的高亮"。

→ Migration 时检查 user_vocab 里非拉丁条目数；若 > 0，加 changelog 一条
解释。

### R2 — 修复进入 v2.x 还是 v3.1？

两个选项：

| 时机 | 优点 | 缺点 |
|---|---|---|
| **v2.x 补丁版（如 2.4.0）** | 现网用户立刻得到修复；不与 v3.1 大改混淆 | 与 v2.0.0 仍在 CWS review 冲突，得等 v2.0.0 出审才能提交 |
| **直接进 v3.1 Phase 1 前置** | 自然衔接 v3.1 的 4 语主流方向；测试可与后端 agent 一起跑 e2e | 老用户要等 ~3 个月才修；现网在 v3.1 上线前一直带这个 bug |

**待用户决策**：建议 v2.x 补丁版（理由：bug severity P1，等 3 个月不
合理；且修复本身不依赖任何 v3 设施；同时它给 v3.1 输入侧打下基础，到
v3.1 时 wordBoundary 已 ready）。

### R3 — 与 CWS 审查的关系

**当前不动 manifest 不动 host_permissions**，纯 src 改动 + 测试 + docs
更新，CWS 风险面**几乎为零**。F5 改动的 README / store-listing 是
人类可读 metadata，不进 zip 包，CWS 不读取。

唯一注意：F5 改 store-listing 描述时，必须等 v2.0.0 出审之后再动
GitHub Pages（与 cws-review-v3.1-impact.md 里 N1 privacy-policy 搁置
同样的逻辑）。

---

## Cross-references

- v3.1 主流语言对依赖：`docs/v3-1-architecture.md:836-841`（zh↔ja /
  en↔ja / fr↔* 都在主流方向）
- v3.1 的 input_word_cefr 预埋字段：`docs/v3-1-architecture.md` user_vocab
  表 ——`cefr_level` 仅对英文有意义，本 bug 修复时要确认 JA/ZH/FR 词
  的 cefr_level 留 NULL（schema 已 NULLABLE，无需改 migration）
- 同源 bug：`bug-2026-04-24-whitespace-click-first-word.md`（同一文件
  `wordBoundary.ts`，但是 click 落点 bug，与本 bug 互不影响）
- CWS 影响分析：`docs/cws-review-v3.1-impact.md` —— 本 bug 不影响其
  N1–N11 任何一条；F5 文档同步与 N7（Single Purpose 表述）方向一致
