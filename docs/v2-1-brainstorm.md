# v2.1.0 Brainstorm

> 2026-04-23 起头。遵循 `brainstorming` skill：先对齐理解，再做设计。
> 2026-04-24 进入实现（§6 全部落地，详见文末 §7 Implementation notes）。

---

## 0. Raw input（用户原话，未加工）

1. **气泡内删除**：浮动窗口加一个删除功能。现在必须到生词本才能删，不方便。
2. **Hover 自动翻译**：对已保存的生词，鼠标悬停自动显示翻译。
   但如果右侧面板当前在「生词本 / 设置」，**不要**自动切回翻译页。
3. **英文字体**：目前选中内容区域里的英文字体好看但「太瘦高」，
   想找一个同类型、稍微"胖一点"的。
4. **非英语也能翻译**：
   用户侧无所谓，但 **系统侧会有什么副作用？**（开放问题）
   一次存储可以存一大段。用户无感但系统是否承受得住？
5. **发音 / 音标**：是否追加？
6. **自定义词库上传**：用户导入自己的词库。

---

## 1. Triage

### 1.1 工作量估算（solo dev，含测试，不含 store review 等待）

| # | 项目 | 估算 | 复杂度 / 风险点 |
|---|---|---|---|
| 1 | 气泡内删除 | 0.5 d | 低。复用 `DELETE_WORD`，气泡多加按钮 + 删除后自毁 + 可选 undo toast。 |
| 2 | Hover 自动翻译 | 1.5–2 d | 中。防抖、进入/离开去抖、和现有 click/drag 路径互斥；"右侧在 Vocab/Settings 时不切 tab"是 D43 的反例，需新规则写 decision log。 |
| 3 | 英文字体换稍胖款 | 0.5 d | 低。选型为主：Inter → Source Sans 3 / IBM Plex Sans / Figtree；打包字体 +几十 KB，不打包为 0。 |
| 4 | 非英语翻译系统副作用（纯调研） | 1 d | 中。验证 storage key 冲突、长度、Google Translate 语言检测、quota、session cache 命中、highlight engine 已被 `isHighlightable` 挡的部分是否够。**无代码变更。** |
| 5 | 发音 + 音标 | 2–4 d | 中高。`speechSynthesis`（≈1 d，0 成本）或 IPA（≈2–3 d，第三方接口不稳 / 或打包本地词典 1–3 MB）。 |
| 6 | 自定义词库上传 | 3–5 d | 高。格式选择、冲突策略、sync quota（8 KB/item、100 KB total）——大词库会爆 sync，可能需要改存储分层。建议单独 brainstorm。 |

合计 ≈ 8.5–13 人日。

### 1.2 分组（2026-04-23 锁定）

- **2.1.0（本轮）**：1 气泡内删除 + 2 Hover 自动翻译 + 3 英文字体换稍胖款
- **Backlog（暂不排期）**：
  - 4 非英语翻译的系统副作用调研
  - 5 发音 / 音标
  - 6 自定义词库上传（需单独 brainstorm，涉及存储分层）

---

## 2. Understanding Summary

- **做什么**：v2.1.0 在 v2.0.1 之上捆绑三个 UX 细化：
  (1) 气泡内删除生词；(2) 悬停已保存生词自动弹气泡预览；
  (3) 把 `--dr-font-serif` 从 Instrument Serif 换成 Fraunces（稍胖，可变字体）。
- **为什么**：降低日常流程摩擦 —— 不必离页删除、扫读即可看到生词意思、
  减少当前衬线过于"瘦高"带来的视觉挤压感。
- **给谁**：已有 DualRead 用户（学英语的中文母语者），且已经积累了一定量
  vocab 的场景收益最大。
- **版本范围约束**：MV3 service worker 易被驱逐（无新变化）；不新增
  chrome.storage 量级；不新增扩展权限；不新增第三方依赖（Fraunces 走已有
  Google Fonts CDN 白名单）。
- **显式非目标**：发音 / 音标（backlog item 5）；非英语翻译系统调研
  （item 4）；用户自定义词库上传（item 6）。均留档 backlog 不进本轮。

---

## 3. Assumptions

- **A1** — Google Fonts CDN 的可用性与 v2.0.1 相同；Fraunces 作为新增家族
  只是在现有 `<link>` 里加一个 family 参数，不改 CSP。
- **A2** — `DELETE_WORD` 消息已从 Vocab 页调通过，handler 幂等，直接在气泡
  里复用没有副作用。
- **A3** — 用户正常使用下，单屏内同时可见的高亮词不会密集到影响 hover 体验
  （估算 ≤ 20 个）；若将来超过则落入 R6，需要做密度测试。
- **A4** — 用户接受 "silent delete + undo toast"（Gmail / Linear 同款）作为
  删除的默认手感，不需要硬性二次确认。
- **A5** — 当前 bubble 的 target detach 检测能处理 MutationObserver 带来的
  DOM 重排（需在实现阶段实测，不影响本阶段锁定）。

---

## 4. Open Questions

- **OQ1** — Hover 预览是否需要一个 on/off 设置开关？**倾向不加**，保持默认
  "就能用"；如果上架后有用户反馈嫌烦再加。若加则放在 Settings 里
  `learning_mode_enabled` 同组。
- **OQ2** — Undo toast 的锚点位置？**提议** 视口底部居中，和未来可能的其他
  toast 共用一个容器；不跟随气泡位置（否则气泡关了 toast 会"飘"）。
- **OQ3** — 换 Fraunces 后，`<link>` 是否从清单里移除 Instrument Serif？
  **提议** 是，减少一次 CDN 请求；需确认没有地方硬编码 "Instrument Serif"
  字符串（当前看只有 `--dr-font-serif` 一处）。
- **OQ4** — Undo 时间窗？**提议** 5 秒。短于 3 秒人来不及反应；长于 10 秒
  内存里挂着一个 `VocabItem` 太久显多余。

---

## 4.x Risks (new in v2.1.0)

- **R6 — Hover 高亮密度性能**：鼠标快速扫过高亮密集的段落，300ms 定时器
  可能被频繁起/撤。估算无问题，但实现后做一次密集页面手测。

*（R1–R5 继承自 DESIGN.md，不重复。）*

---

## 5. Decision Log

### D59 — Hover 预览复用现有 saved-word 气泡（2026-04-23）

**决定**：不新造 tooltip。Hover 命中已保存生词 → 复用 click/drag 的同一个
`saved-word` 气泡变体（带译文、note、详情 icon、D58 新增的删除 icon）。

**考虑过的替代**：
- 新造轻量 tooltip（单行译文，无按钮）→ 引入第二个 Shadow DOM host，
  交互分层不自然（用户要删得改成 click 才能看到删除）
- 复用气泡但加 hover mode（只渲染译文 / note，隐藏按钮）→ 组件 mode
  状态机复杂度 +1；动画模型需要重做；对目前的使用密度是过度设计

**选这个的理由**：
- UI 语言一致；用户不必学两个形状
- 删除按钮语义统一 —— hover 看到想删直接点，不要求 "先 click 再删"
- 实现成本最低：content script 的 mouseover 路径接上 `bubble.show()` 即可

---

### D60 — Hover 不触碰侧边栏（2026-04-23）

**决定**：hover 路径 **不** 向 background 派发 `SELECTION_CHANGED`，
也不 mirror 到侧边栏 Translate tab。侧边栏上下文完全由用户主动的
click / drag 决定。

**考虑过的替代**：
- Hover 也 mirror，仅在 Vocab/Settings 时不切 tab（D43 的补丁方案）→
  侧边栏被鼠标游走刷屏，"预览"和"操作"界限模糊；多一条状态例外规则

**选这个的理由**：
- 预览（hover） vs 操作（click）分层干净
- 用户原话"右侧在 Vocab/Settings 不用切回翻译"在本方案下自动满足，
  无需专门例外逻辑
- 消息总线更安静，SPA 场景下少很多无意义派发

---

### D61 — Hover 时序与互斥规则包（2026-04-23）

**决定**：
1. 进入延时 300 ms；离开延时 150 ms；气泡本身视为"安全区"，进入清除关闭计时器
2. 词 A → 相邻词 B：立即切换，**跳过** 300ms 延时
3. Click/drag 气泡打开时，hover 被忽略（click 优先于 hover）
4. Hover 气泡打开时 click 同一个词 → 内部状态 hover → click 升级，
   并按正常 click 流程 mirror 到侧边栏
5. Hover 气泡打开时用户 drag 选文 → 立刻关 hover 气泡，drag 接管
6. FAB OFF 时高亮本来就不渲染，hover 无事可做

**考虑过的替代**：更短延时（< 200ms 体感太急）、对 A→B 保留延时
（扫读卡顿）、click 期间仍响应 hover（两种气泡相互打架）

**选这个的理由**：对齐桌面 UI 惯例 + Chrome `title` tooltip 直觉区间；
避免闪烁、打架、卡顿三种坏体验。

---

### D62 — 把 `--dr-font-serif` 换成 Fraunces（2026-04-23）

**决定**：`--dr-font-serif: "Fraunces", Georgia, serif;`；在 Fraunces
可变轴上设 `font-variation-settings: 'SOFT' 50, 'opsz' 14`；
`<link>` 从 Instrument Serif 换成 Fraunces。值暂硬写在 CSS，不抽 token。

**考虑过的替代**：
- Newsreader（更保守、更文学）→ 可选，但不直指"可调胖瘦"诉求
- Playfair 500（只加粗不换字）→ 高对比病因没解决
- Source Serif 4（更工具感）→ 会改变整体气质
- 抽出 `SERIF_SOFTNESS` token → YAGNI，等真需要第二处调参再抽

**选这个的理由**：
- Fraunces 的 SOFT 轴就是"同家族内可调圆润度"的直接实现，正对用户诉求
- editorial/literary 气质保留，不跑偏整体 side panel 风格
- 可变字体覆盖多 weight，bundle 压力不增
- SOFT=50 / opsz=14 是 mid-ground 起点，后续试出来再微调

---

### D58 — 气泡内删除的手感（2026-04-23）

**决定**：静默立删 + 5 秒 undo toast；删除按钮 = 详情 icon 旁边新增一个
垃圾桶 icon；按下后气泡立刻关闭。

**考虑过的替代**：
- 无 undo 立删 → 点错无救，vocab 页也没 undo，放大悔点成本
- 二次确认（气泡原地变 "确定删除？ ✓ ✗"）→ 多一次点击；和 v2.0.1
  的 icon-only 风格冲突
- native `confirm()` 弹窗 → 视觉刺眼，扩展社区普遍不用
- 删除按钮放气泡右上角 ✕ → 容易和"关闭气泡"混淆
- 删除后气泡停留显示"已删除" → 气泡失去操作意义

**选这个的理由**：
- 与 v2.0.1 刚落地的 icon-only 详情按钮共用同一套视觉语言
- `DELETE_WORD` 消息已存在；undo 只需在内存里暂存被删的 `VocabItem`，
  5s 后丢弃或撤销时重存（不占 storage）
- undo toast 可复用 `savedToast` 的样式底座

---

## 6. Design

### §6.1 Architecture & Touch Map

三项全部在现有骨架内增量，不新增 message type、不动 storage schema、
不改 CSP。

| 文件 | item 1 删除 | item 2 hover | item 3 字体 |
|---|:---:|:---:|:---:|
| `src/content/bubble.ts` | delete icon + onDelete | hover show/hide 入口 | — |
| `src/content/bubbleStyles.ts` | `.dr-bubble__del` | — | — |
| `src/content/index.ts` | 绑 DELETE_WORD → bubble.close | mouseover/out 状态机 | — |
| `src/content/toast.ts` ✚ | **新文件**：UndoToast，vanilla TS，复用 bubble 的 Shadow host | — | — |
| `src/sidepanel/styles.css` | — | — | `--dr-font-serif` + `font-variation-settings` |
| `src/sidepanel/index.html` | — | — | `<link>` 换 Fraunces |
| `src/sidepanel/i18n.ts` | `deleteTitle` / `undoToastBody` / `undoAction` | — | — |

**数据来源**
- Hover 显示译文 = `VocabWord.zh`（已在 sync storage），本地查 matcher 内存
  Map，**零网络**。
- 删除 = 复用 `DELETE_WORD`；撤销 = 用快照发 `SAVE_WORD`。

**不变更**：`messages.ts` / `manifest.json` / storage schema。

---

### §6.2 Item 1 — 气泡内删除 + Undo Toast

**UndoToast 归属修正**：放 content layer（不是 side panel），和 bubble
共享 Shadow DOM host，绝对定位视口底部居中 —— 确保侧边栏关着也能撤销。

**视觉**
- 14×14 trash-can 线条 SVG、`currentColor`，放详情 icon 右侧
- 28×28 hit area、6px padding、hover soft chip、颜色保持 `accent`
  （silent delete，不红色预警）
- `title` + `aria-label` = "删除 / Delete"

**删除流程**
```
click trash
 ├─ 快照 VocabWord → 内存 lastDeleted
 ├─ dispatch DELETE_WORD { word_key }
 └─ bubble.close() 并行
      ↓
DELETE_WORD ack
 ├─ ok   → toast.show(lastDeleted, 5000)
 │         matcher 订阅 storage change 自动 unwrap <dr-mark>
 └─ nack → 保留气泡 + 内嵌红字 "删除失败"，lastDeleted 丢弃
```

**Undo 流程**
- 点 toast「撤销」→ 发 `SAVE_WORD { item: lastDeleted }`（保留原
  `created_at` / `note`）
- ack ok → toast 淡出 + matcher 重高亮
- ack nack → toast 错误态 + 不自动关闭

**Edge cases**
- 5s 内连删两个词：B 的 toast **替换** A 的（不排队）；A 的删除被默认接受
- 删除后切页/关 tab：`lastDeleted` 随 content script 销毁，撤销窗口
  仅在同 tab 5s 内有效
- Vocab 页正开：行由 storage 订阅自动移除；撤销自动回显

**非目标**：跨 tab undo、键盘 shortcut（Cmd+Z 等）

---

### §6.3 Item 2 — Hover 状态机

**状态**
```
IDLE | PENDING_SHOW(node,t) | SHOWN(node) | PENDING_HIDE(node,t) | CLICK_OWNED
```

**转换表**

| 事件 | 当前态 | 动作 |
|---|---|---|
| `mouseover(mark)` | IDLE | `PENDING_SHOW(mark, 300ms)` |
| `mouseover(markB)` | `PENDING_SHOW(markA)` | 清 timer → `PENDING_SHOW(markB, 300ms)` |
| `mouseover(markB)` | `SHOWN(markA)` | 关气泡 → 跳过延时 → `SHOWN(markB)` |
| `mouseover(markB)` | `PENDING_HIDE(markA)` | 清 timer → `SHOWN(markB)`（气泡内容切 B） |
| `mouseout(mark)` | `PENDING_SHOW(mark)` | 清 timer → IDLE |
| `mouseout(mark)` | `SHOWN(mark)` | `PENDING_HIDE(mark, 150ms)` |
| `mouseover(bubble)` | `PENDING_HIDE` | 清 timer → `SHOWN`（气泡是安全区） |
| `mouseout(bubble)` | `SHOWN` | `PENDING_HIDE(node, 150ms)` |
| `click(mark)` | 任意 hover 态 | 升级 `CLICK_OWNED`，气泡不重开，按 click 路径 mirror 侧边栏 |
| `click bubble dismiss` | `CLICK_OWNED` | → IDLE |
| `dragstart` anywhere | 任意 hover 态 | 关气泡 → IDLE（drag 接管） |
| `detach(node)` (MutationObserver) | 引用 node | 关气泡 → IDLE |
| `mouseover(mark)` | `CLICK_OWNED` | 忽略（click 优先于 hover） |

**译文来源**：`PENDING_SHOW → SHOWN` 时同步查 matcher 内存 Map；
未命中（SPA 竞态）→ 直接 IDLE 不弹。

**事件监听**：`document` 上单一 `mouseover` / `mouseout`，用
`e.target.closest('dr-mark')` 委托。

**Timer 卫生**：`enterTimer` / `exitTimer` 存在状态对象里，迁移先清旧。

**Edge cases**
- SPA rewrites DOM → MutationObserver 派发 `detach` → IDLE
- 滚动：`mouseout` 自然触发 → `PENDING_HIDE`
- `CLICK_OWNED` 期间键盘切 tab 回来再 hover → 继续忽略直到 click dismiss
- Bubble 挡住 mark：时序上 bubble 的 `mouseover` 早于 `PENDING_HIDE`
  失效，无洞

---

### §6.4 Item 3 — 字体替换

**index.html `<link>`**：把 `&family=Instrument+Serif` 段替换为：

```
&family=Fraunces:opsz,wght,SOFT@9..144,400..500,0..100
```

只请求 opsz / wght / SOFT 三轴；不请求 WONK 轴。
覆盖 weight 400（Welcome / Translate word）、500（Vocab 行头）、
700 若 LogoMark 需要可后补（Fraunces 700 在视觉确认后再引）。

**styles.css**
- `--dr-font-serif: "Fraunces", Georgia, serif;`
- 四个 serif 消费点各自加 `font-variation-settings`：

  | 选择器 | 起始 opsz | SOFT |
  |---|---|---|
  | `.dr-logo-mark` | 40 | 50 |
  | `.dr-welcome__heading` | 24 | 50 |
  | `.dr-translate__word` | 22 | 50 |
  | `.dr-vocab-row__word` | 14 | 50 |

  opsz 按字号对齐光学尺寸；SOFT=50 作起点，实装时对浏览器再微调。

**清理**
- 已 grep 确认无 `"Instrument Serif"` 硬编码字符串（仅 `--dr-font-serif` 一处）
- `<link rel="preconnect">` 不动，仍 gstatic.com

**回退**：Fraunces CDN 失败 → Georgia fallback。

---

### §6.5 Testing & Manual Smoke

**自动化（vitest）**
- 抽 `hoverReducer(state, event) → state` 到独立文件（pure function）；
  单测覆盖 §6.3 转换表全 12 条 + timer 清理（mock timer）
- `isHighlightable`（v2.0.1 既有）回归跑一遍

**手动 smoke checklist**

Item 1 删除
- [ ] 气泡点垃圾桶 → 页面高亮消失 + Vocab 行消失 + CSV 导出不含该词
- [ ] 点 undo toast → 页面重高亮 + Vocab 回显 + note / created_at 保留
- [ ] 5s 倒计时结束 → toast 消失 + 不可再撤销
- [ ] 5s 内连删两词 → 第二个 toast 替换第一个
- [ ] 删除后关 tab / 刷新 → 撤销窗口消失（预期）

Item 2 hover
- [ ] 鼠标停 300ms → 气泡弹
- [ ] 移开 150ms → 气泡关；150ms 内移入气泡 → 保留
- [ ] 相邻两高亮词快速切换 → 气泡无延时跟随
- [ ] hover 气泡打开时点击同词 → 不闪烁、升级 click 态并 mirror 侧边栏
- [ ] hover 气泡打开时 drag 选文 → 立刻关气泡、drag 接管
- [ ] FAB OFF → hover 完全不触发
- [ ] SPA（YouTube / X / Gmail）target detach → 气泡自毁

Item 3 字体
- [ ] Welcome / Translate word / Vocab 行头 / LogoMark 四处 Fraunces 生效
- [ ] 断网启动 side panel → fallback Georgia 不崩
- [ ] zh-CN + en 两语言下目视对比

跨切面
- [ ] 浅色 + 深色主题视觉一致
- [ ] v2.0.1 storage 数据直接升级无丢失

范围：macOS Chrome stable 为主；Windows 视觉抽查一次。

---

## 7. Implementation notes (2026-04-24)

§6 三项全部落地，没有超出 brainstorm 范围的改动。

### 7.1 Touch map（与 §6.1 对齐）

- `src/content/bubble.ts` / `bubbleStyles.ts` — 新增 `onDelete` + `.dr-bubble__del`
- `src/content/toast.ts` ✚ — 新文件，UndoToast（Shadow DOM、viewport 底部居中）
- `src/content/hoverReducer.ts` ✚ — 纯 reducer，§6.3 转换表全量
- `src/content/hoverReducer.test.ts` ✚ — 31 条单测覆盖全表 + timer 卫生 + 几条
  集成场景（scan、out-and-back、click→dismiss→new hover）
- `src/content/clickTranslate.ts` — 抽 `paintSavedBubble(anchor, saved, owned)`
  让 `showSaved` 和新的 `showHover` 共用同一套渲染；加 `onClickBubbleClose`
  回调到 hover 机器
- `src/content/index.ts` — 接 toast；把 `readVocabKeys()` 升级成
  `readVocab() → { keys, map }`；装 `createHoverDriver`（reducer + timers
  + 文档委托 + MutationObserver detach）
- `src/sidepanel/index.html` / `styles.css` — Fraunces 换入、`--dr-font-serif`
  改写、四处 `font-variation-settings`（opsz + SOFT=50）

### 7.2 与 assumptions / OQ 的一致性

- **A1** 成立：Google Fonts CDN 请求只是改 family 参数，CSP 不动
- **A2** 成立：`DELETE_WORD` handler 复用，写缓冲会在 save 到达时自动撤销
  pending delete（`background/vocab.ts` saveWord 里）
- **OQ1** 保持默认"不加开关"
- **OQ2** toast 固定视口底部居中（bubble 关了 toast 不飘）
- **OQ3** `<link>` 已移除 Instrument Serif（只剩 `--dr-font-serif` 一处消费）
- **OQ4** undo 窗口 = 5000 ms（`DEFAULT_DURATION_MS` in toast.ts）

### 7.3 附带的小行为补丁

- `handleHighlightClick` 现在在进入 click 流之前先 `dispatchHover({ type: 'click_mark' })`，
  让 hover 机器准确进入 CLICK_OWNED，避免 pending exit timer 把刚开的气泡关掉
- `createClickTranslator` 的三条 click 路径（loading / error / translated）
  都在 `onClose` 里调用 `onClickBubbleClose?.()`，统一通知 hover 机器退出 CLICK_OWNED
- hover 机器在 `isEnabled()` 变 false 时自动清理 timers 并回到 IDLE
  （§6.3 没显式规定，但避免 "FAB off 后残留 300ms enter timer" 的 corner case）

### 7.4 未做

- 手测 smoke checklist（§6.5）尚未跑 —— 等用户在 UI 里验收
- 未给 bubble 的 "delete icon" 在 click-flow error 态下做什么（仍然不渲染，
  因为只有 saved 态才带 `onDelete`，与 §6.2 一致）
