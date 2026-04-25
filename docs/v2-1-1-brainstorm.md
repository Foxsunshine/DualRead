# v2.1.1 Brainstorm

> 2026-04-24 起头。v2.1.0 刚上线（气泡内删除 + Undo toast、hover 预览、Fraunces
> 字体）。本文档是 brainstorming skill 走完 Understanding Lock 后的产物：
> Understanding Summary / Assumptions / Open Questions / Risks / Decision Log。
> §6 Design 只写到 6.1 Touch Map 即停，剩余 6.2–6.5 留作实现阶段对照
> （实现者可以直接以本文档为输入，不必回到 brainstorming 环节）。

---

## 0. Raw input（用户原话，未加工）

1. **单词/词组时，去掉标点符号**
2. 气泡里 **原单词变小不加粗，译文变大加粗**
3. **原单词超过三个词就不显示原单词了**
4. **保存按钮太大**，换 icon 或改小
5. 侧边栏关着时，**点击 detail（书本）icon 没反应**；detail 应该开面板，保存和删除**不**触发开面板

---

## 1. Understanding Summary

### 1.1 做什么

v2.1.1 在 v2.1.0 之上做 **气泡 UX 减噪 + 修哑 bug**，五件事：

1. **F1 — 外层标点剥离**：划词结果首尾的标点（`,` `.` `!` `?` `"` `'` `(` `)` 等，含中文全角）一律剥掉，显示和翻译请求都走剥完的文本；中间标点保留，不破坏 `don't` / `state-of-the-art`。
2. **F2 — 气泡视觉层级倒转**：原词小而弱（12 px / 500 / `inkMuted`），译文大而粗（16 px / 600 / `ink`）。骨架不动。
3. **F3 — 长词组时隐原词**：token 数 `> 3` 时隐藏原词行，只保留 close `×` + 译文；≤3 保持 F2 默认布局。
4. **F4 — Save 按钮瘦身**：改成 icon + 11 px label 的迷你按钮，高 22 px；saved 态同步瘦身以免切换跳尺寸。
5. **F5 — Detail 可靠开面板**：把 `sidePanel.open` 的调用点从 background 前移到 content script，利用真实 user-gesture 让 Chrome 接受。保存 / 删除仍然不触发开面板。

### 1.2 为什么

气泡是 v2.1.0 后用户日常最高频的 UI surface。现状三个噪点：原词抢戏、Save 按钮主导视觉、detail 在面板关着时哑火 —— 都在拉低扫读效率。这轮全是减噪 + 修 bug，不加功能面。

### 1.3 给谁

已经养成"划词 → 瞥译文 → 继续读"扫读节奏的进阶用户。F4 没选纯 icon 就是为了保留新用户首次划词时的 Save 可发现性。

### 1.4 关键约束

- **不改 storage schema、不改 message 契约、不加权限**（sidePanel 权限 v1.1 已有）
- 新增 **`minimum_chrome_version: 139`**（F5 依赖 content-side `sidePanel.open`）
- 不动 hover 状态机、不动 FAB、不动 Vocab / Settings 界面
- 不动翻译 API 本体（F1 只是调用前 trim text）

### 1.5 显式非目标

- 发音 / 音标（v2.1 backlog item 5）
- 自定义词库上传（backlog item 6）
- 多设备 / 面板状态同步之类的架构改动
- Save 按钮动效 / skeleton

---

## 2. Assumptions

- **A1** — Chrome 139+ 的 content-side `sidePanel.open` 在真实 user-gesture 下
  稳定；旧版用户升级 Chrome 后自然获得。**需要实测**。
- **A2** — DL-1 的剥离字符集覆盖 95%+ 真实场景；漏网字符（古希腊文、音乐符号
  等）不在目标用户语料中。
- **A3** — "3 词"阈值符合多数用户直觉；划 4 词短语做参考的小众用户仍可通过
  译文 + note 对照。
- **A4** — Save 按钮瘦身后首次划词的新用户仍能 ≤ 2 s 定位（icon + "Save"
  文字的可发现性在业界普遍验证）。**不做可用性测试，基于经验拍板**。
- **A5** — content script 里真实 DOM click 是浏览器认可的 user gesture，
  v2.1.0 的 FAB 调 `chrome.storage.local.set` 全程正常佐证。

---

## 3. Open Questions

- **OQ1** — 尾随 hyphen（`-ish`、`-ly`）要不要作为外层标点剥？**倾向剥**，
  但实装前再确认。
- **OQ2** — 是否接受把 Chrome < 139 的用户挡在 v2.1.1 更新之外？如果不接受，
  F5 需退回到 "inline 提示去点扩展图标" 方案。
- **OQ3** — Save 按钮 label 走 `DR_STRINGS` 还是继续在 `bubbleStrings` 本地字典
  维护？保持本地字典符合 v1.1 D47 的分离策略。

---

## 4. Risks

- **R7 — Chrome 139 门槛**：若 store 统计里 Chrome 138- 占比高，F5 会退化
  成哑火。Mitigation：上架前查 store 版本分布再决定是否保 `minimum_chrome_version`；
  如撤掉，F5 退回"content 先 try open 再 fallback 到 background 广播"。
- **R8 — 标点剥离过激**：`Mr.` / `U.S.` 等缩写首尾剥后变 `Mr` / `U.S`。
  Mitigation：DL-1 明确只剥**首尾一次**，中间的 `.` 不动；可接受 `Mr.` → `Mr`
  这种轻度语义折损（翻译结果依然合理）。
- **R9 — icon+label 按钮宽度膨胀**：中文 "保存" 比 "Save" 宽。Mitigation：
  给 `.dr-bubble__btn` 加 `max-width` + `text-overflow: ellipsis`，或实装后
  靠目测微调；气泡 `min-width` 也有缓冲空间。

---

## 5. Decision Log

### DL-1 — F1 外层标点剥离策略（2026-04-24）

**决定**：只剥**外层**（选中文本首尾）的标点；中间一律保留。剥离后的字符串既用于
bubble 显示，也用于发给翻译 API 的 `text` 和生成 `word_key`。

**剥离字符集（初版）**：
- ASCII：`,` `.` `!` `?` `:` `;` `"` `'` `` ` `` `(` `)` `[` `]` `{` `}` `<` `>` `—` `–` `…` `~` `*` `/` `\`
- ASCII 首尾 hyphen `-`（仅首尾）
- 中文全角：`，` `。` `！` `？` `：` `；` `"` `"` `'` `'` `（` `）` `【` `】` `「` `」` `——` `…`

**考虑过的替代**：
- B 全部剥（破坏 `don't` / `state-of-the-art`）
- C 连成对引号包裹也剥（收益小、边界多）

**选这个的理由**：
- 命中"划到句末把 `.` 带进来"的真实高频场景
- 不破坏合法词内标点
- 翻译请求同步剥后 Google 返回更干净
- `word_key` 跟着变 → 不会把 `reliability,` 和 `reliability` 存成两条

### DL-2 — F2 气泡视觉层级倒转（2026-04-24）

**决定**：译文升主体、原词降辅助。

| 元素 | 当前 | 新 |
|---|---|---|
| 原词 `.dr-bubble__word` | 13 px / 600 / `ink` | **12 px / 500 / `inkMuted`** |
| 译文 `.dr-bubble__translation` | 13 px / 400 / `inkSoft` | **16 px / 600 / `ink`** |

排版（α）：原词 + 右上 close `×` 同排；译文独占一大行在下方。气泡骨架不动。

**选这个的理由**：扫读主目标是译文；12/16 对比恰好倒转主次，不至于让原词难辨；
和 F3 "原词 >3 词时隐藏"可叠加。

### DL-3 — F3 长词组时隐原词行（2026-04-24）

**决定**：当选中文本 `text.trim().split(/\s+/).length > 3` 时隐原词行，close `×`
保留单占一小排右上。≤3 词维持 DL-2 默认布局。

**例**：
- `state-of-the-art` → 1 词，显示
- `machine learning model` → 3 词，**仍显示**
- `the quick brown fox` → 4 词，隐藏

**叠加顺序**：F1 剥 → F3 数 token → F2 套字号。

**视觉形态速写**：
```
≤ 3 词                            > 3 词
┌─────────────────────┐          ┌─────────────────────┐
│ machine learn…  [×] │          │                [×] │
│                     │          │ 快速的棕色狐狸      │
│ 机器学习模型        │          │ 跳过懒狗。          │
│ ──────────          │          │ ──────────          │
│ [+ Save] [📖] [🗑] │          │ [+ Save] [📖] [🗑] │
└─────────────────────┘          └─────────────────────┘
```

### DL-4 — F4 Save 按钮瘦身为 icon + 微缩文字（2026-04-24）

**决定**：save / saved 两态都做成 **icon + 小号 label**；保留主色填充以维持
"主 CTA"信号。

**规格（初版）**：
- **Save**：高 22 px；`+ icon (12px)` + `11px label`；`padding 3px 8px`；
  `border-radius 5px`；`accent` 填充 / 白字；label = "Save" / "保存"
- **Saved**：同尺寸；`✓ icon (12px)` + `11px label`；`sageSoft` 背景 / `sage` 字
  / `disabled: true`；label = "Saved" / "已保存"
- detail / delete icon 维持 v2.1.0 28 × 28 触控区；Save 比它们窄一点（带字），
  高度持平

**附带收益**：气泡 `min-width: 180px` 实装后可酌情收到 160 px；由实装者实测决定。

### DL-5 — F5 Detail icon 在 content 侧直接开侧边栏（2026-04-24）

**决定**：把 `chrome.sidePanel.open({ tabId })` 从 background 移到 content
script 的 click handler，利用真实 user gesture。`FOCUS_WORD_IN_VOCAB` 广播 +
`SESSION_KEY_PENDING_FOCUS` 写入保留作兜底。

**执行顺序（detail icon 点击）**：
1. content 同步调 `chrome.sidePanel.open({ tabId })`（在 click 处理栈里）
2. 然后 `sendMessage({ type: 'FOCUS_WORD_IN_VOCAB', word_key })`
3. 面板（新开 or 已开）收到 `FOCUS_WORD` 或读 session key，跳 Vocab tab 并
   focus 该词

**已开分支（α）**：行为不变；对已开面板调 `open` 是 no-op，省一次往返。

**工程小项**（实现阶段定，不影响决策成立）：
- content 怎么拿 `tabId`？三条可行路径：
  1. 首次 message 时 background 从 `sender.tab.id` 回传，content 缓存
  2. 每次 detail 点击前发一次 `GET_TAB_ID` 往返
  3. 用 `windowId` 替代 tabId —— 不通，content 拿不到
- 推荐路径 1（最低开销）

**manifest**：加 `"minimum_chrome_version": "139"`。

**background 侧改动**：`handleFocusWordInVocab` 去掉内部的 `sidePanel.open`；
仅保留 session 写入 + 广播。`SELECTION_CHANGED` 的 ack 需要回传 tabId 供 content
缓存。

**选这个的理由**：真实 user-gesture 链路不断，浏览器稳定接受；兜底路径不拆；
回滚风险低。

---

## 6. Design

### §6.1 Touch Map

五条改动全部增量式落盘；唯一架构位移是 F5 把 `sidePanel.open` 前移到 content。

| 文件 | F1 | F2 | F3 | F4 | F5 |
|---|:---:|:---:|:---:|:---:|:---:|
| `src/shared/punctuation.ts` ✚ | **新文件**：`stripOuterPunctuation(text)` 纯函数 | — | — | — | — |
| `src/shared/punctuation.test.ts` ✚ | **新文件**：覆盖字符集 + 词内保留 + 中文全角 + `Mr.` / `U.S.` | — | — | — | — |
| `src/content/clickTranslate.ts` | `onClick` / `showSelection` 入口套 `stripOuterPunctuation` | — | 计算 token 数传给 bubble | — | detail 的 onClick 里先 `sidePanel.open({tabId})` 再发 `FOCUS_WORD_IN_VOCAB` |
| `src/content/wordBoundary.ts` | `snapOffsetsToWord` 后兜底再剥一次 | — | — | — | — |
| `src/content/bubble.ts` | — | 调整 `.dr-bubble__word` / `__translation` 的 className | 新增 `showWord?: boolean` 到 translated state | save / saved 按钮 DOM 改 icon+label | — |
| `src/content/bubbleStyles.ts` | — | 改字号 / 粗细 / 颜色 | `.dr-bubble__row--no-word` 变体 | `.dr-bubble__btn` 迷你化 + 新 `.dr-bubble__btn-icon` | — |
| `src/content/index.ts` | — | — | — | — | 缓存 tabId（从首次 message 的 ack 里拿） |
| `src/background/index.ts` | — | — | — | — | `SELECTION_CHANGED` ack 带 `tabId`；`handleFocusWordInVocab` 去掉内部 `sidePanel.open` |
| `manifest.json` | — | — | — | — | `"minimum_chrome_version": "139"` |

**数据流要点**：
- F1 的剥离在 **进入翻译链路前** 就做完，`word_key` 从剥后 text 派生，避免脏 key
  污染存储
- F3 的 token 数在 content 层算好再传给 bubble —— bubble 不做业务逻辑
- F5 下 background 不再拥有"开面板"职责，只做"广播 + session 缓冲"

### §6.2–§6.5 留给实现阶段

以下四节是实现者接手本文档后需要自己展开的，此处只留锚点：

- **§6.2 F1 punctuation 规则落地**：字符集枚举、`snapOffsetsToWord` 配合点、
  和 `isHighlightable` 的交互（剥完后才判是否可高亮）、test case 清单
- **§6.3 F2 + F3 bubble render 分支**：新 className / 新 state 字段 /
  `no-word` 分支的 close `×` 独占一行的布局
- **§6.4 F4 按钮 CSS + SVG**：+ 图标和 ✓ 图标的 SVG（保持和 detail/delete 同一笔
  调 —— 1.4 stroke / 16 viewBox）
- **§6.5 F5 tabId 缓存 + sidePanel.open 调用**：background ack 回传时机、
  content 缓存无效化、Chrome < 139 的 `sidePanel` undefined 兜底

**测试策略**：
- F1 走纯 vitest（punctuation.test.ts + wordBoundary 回归）
- F2 / F3 / F4 没有纯函数可抽，靠手动 smoke：`docs/v2-1-brainstorm.md §6.5`
  的 checklist 扩几条即可
- F5 必须手测：侧边栏关 → 点 detail → 面板开并跳词；侧边栏开 → 点 detail → 行为
  和 v2.1.0 一致；Chrome 138 装扩展 → 不崩

---

## 7. 实装时 checklist（供实现 skill 直接取用）

### 7.1 自动化（vitest）

- [ ] `src/shared/punctuation.test.ts`：
  - 外层 `.` / `,` / `?` / `!` / `:` / `;` / `"` / `'` 剥
  - 中文全角 `，。！？：；""''（）【】「」…——` 剥
  - 词内 apostrophe / hyphen 保留（`don't` → `don't`；`state-of-the-art` 完整）
  - 成对引号外层剥：`"hello"` → `hello`
  - 混合：`"Hello, world!"` → `Hello, world`（中间逗号保留）
  - `Mr.` → `Mr`（R8 文档化的已知行为）
  - 空串 / 全是标点 → 返回空串
- [ ] `wordBoundary.test.ts` 回归：`snapOffsetsToWord` 在剥标点后仍工作

### 7.2 手动 smoke（新加）

F1 标点
- [ ] 划 `"reliability,"` → bubble 显示 `reliability`；保存后 vocab 行也是 `reliability`
- [ ] 划 `don't` → 保留 apostrophe
- [ ] 划 `Mr.` → 显示 `Mr`（已知降级）
- [ ] 划中文全角 `"well-being。"` → 剥外层全角符号

F2 + F3 视觉
- [ ] 单词气泡：原词小灰、译文大粗
- [ ] 3 词气泡：原词仍显示
- [ ] 4+ 词气泡：原词隐藏，close `×` 独占右上

F4 Save 按钮
- [ ] Save 按钮高度和 detail/delete icon 对齐
- [ ] save → saved 切换无尺寸跳动
- [ ] 中英双语下 label 不撑破气泡

F5 detail 开面板
- [ ] 侧边栏**关**：划词 → 点高亮 → bubble 出现 → 点书本 icon → 侧边栏开并跳到该词
- [ ] 侧边栏**开**：同上；侧边栏切换 tab 到 Vocab 并 focus（行为不变）
- [ ] 保存 / 删除仍然**不**开侧边栏
- [ ] Chrome 139+ 验证

### 7.3 文档侧

- [ ] DESIGN.md 新增 D63..D67 对应 DL-1..5
- [ ] `docs/v2-1-1-brainstorm.md`（本文件）在实装完成后加 §8 Implementation notes ✅
- [ ] Store listing changelog：英文 / 中文双语描述五条改动

---

## 8. Implementation notes (2026-04-24)

F1–F5 全部落地，`npm run typecheck` 通过，`npm test` 82 / 82 pass，`npm run build`
干净。

### 8.1 Touch map（实际 vs §6.1 计划）

| 文件 | 说明 |
|---|---|
| `src/shared/punctuation.ts` ✚ | `stripOuterPunctuation` 纯函数；ASCII + CJK 全角 + 多字符序列（`——` / `...`）三层字符集 |
| `src/shared/punctuation.test.ts` ✚ | 22 条覆盖：外层剥、内层保留、CJK、边界（空串 / 全标点 / 幂等 / R8 `Mr.` / `U.S.`） |
| `src/content/clickTranslate.ts` | `onClick` / `showSelection` 两个入口各调一次 `stripOuterPunctuation`；detail 的 `onClick` 首行调 `openSidePanelFromGesture?.()`（DL-5）；`ClickTranslatorDeps` 加 `openSidePanelFromGesture` 可选回调 |
| `src/content/index.ts` | 在 mouseup 路径也调一次 strip（bubble + SELECTION_CHANGED 用统一 text）；`cachedTabId` + `openSidePanelFromGesture` 实现；init 发 `GET_TAB_ID` 拉取 |
| `src/content/bubble.ts` | `renderHeader(word, close, handler, showWord)`；新 `shouldShowWord()`；save/saved 按钮改 `innerHTML` 拼 SVG + `<span class="dr-bubble__btn-label">`；`escapeForText` 辅助函数 |
| `src/content/bubbleStyles.ts` | `.dr-bubble__word` 12/500/inkMuted；`.dr-bubble__translation` 16/600/ink；`.dr-bubble__row--no-word` 右对齐；`.dr-bubble__btn` 22 px mini；`.dr-bubble__btn--saved` sage 变体；`.dr-bubble__btn-icon/-label` 内部布局 |
| `src/shared/messages.ts` | 加 `GET_TAB_ID` message type |
| `src/background/index.ts` | 路由 `GET_TAB_ID` 直接回 `sender.tab?.id`；`handleFocusWordInVocab` 去掉内部 `sidePanel.open` 和 tabId 参数 |
| `manifest.json` | 加 `"minimum_chrome_version": "139"` |

### 8.2 与 DL 的一致性

- **DL-1**：字符集即 §6.1 + brainstorm §7.1 清单；`Mr.` → `Mr`、`U.S.` → `U.S` 在测试里显式断言为 R8 预期
- **DL-2**：`.dr-bubble__word` 12 px / 500 / `inkMuted`、`.dr-bubble__translation` 16 px / 600 / `ink` —— 与决策表完全一致
- **DL-3**：`text.trim().split(/\s+/).filter(Boolean).length > 3` 才隐；loading / error 状态不应用阈值，永远显示原词（避免"翻译失败气泡里空空"的尴尬）
- **DL-4**：Save 22 px mini、accent 填充；Saved 同尺寸、sageSoft 填充；`max-width: 120px` + `ellipsis` 防中文"保存"撑宽（R9）
- **DL-5**：`sidePanel.open` 从 background 挪到 content；tabId 用独立 `GET_TAB_ID` 拉取（brainstorm §6.1 推荐路径 1 的变体，用独立 message 比劫持 SELECTION_CHANGED 的 ack 干净）；`handleFocusWordInVocab` 退化为"写 session + 广播 FOCUS_WORD"

### 8.3 附带小决定（未在 DL 里显式列出）

- **loading / error 状态不参与 F3 阈值**：否则翻译 4 词短语时加载中看到一个空气泡只有个 "×"，用户会以为挂了
- **`escapeForText` 对静态字符串是过度防御**：但 innerHTML 写入路径上一个 HTML-encode 是廉价的未来保险，不引入外部依赖
- **tabId 拉取是 fire-and-forget**：首次握手 <50 ms，用户点 detail 前必然已到；即便慢，fallback 到 FOCUS_WORD_IN_VOCAB 广播仍工作
- **old `[disabled]` + new `.dr-bubble__btn--saved` 双选择器**：迁移期保留 `[disabled]` CSS 以防未来别处也加了 disabled 态

### 8.4 未做 / 留给后续

- F1 的 OQ1（词尾 hyphen `-ish` / `-ly` 要不要剥）—— 当前 `-` 在外层剥离集里，所以 `-ish` **会**被剥成 `ish`；如果用户觉得不对，改动只要从 `ASCII_OUTER` 里移除 `-` 一行
- 手动 smoke（§7.2）—— 需要你本地 reload 扩展后验证
- Store listing changelog（§7.3 最后一项）—— 等发版前补
