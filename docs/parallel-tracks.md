# DualRead 未实现功能并行开发派发计划（v2，已审查修订）

## Context

`docs/feature-status.md` 列出 §1–§8 共 8 个领域的未实现功能。两轮独立审查（并行工程可行性 + 需求完整性）暴露 8 项必修与 5 项风险，本版已全部吸收。

目标：把当前可启动的工作切成互不干扰的并行轨道，使多个 Agent 实例可同时推进。每条轨道有：明确的 owner 文件、对外契约、合并位次、验证方式。

## 现状关键事实（影响轨道边界）

| 事实 | 影响 |
|---|---|
| `_locales/` 目录**不存在**，但 `manifest.json` 已写 `__MSG_extName__` + `default_locale: "en"` | 现存构建隐患；轨道 D 必须从零建 4 个 locale（en、zh_CN、ja、fr），不是只补 ja/fr |
| `public/` 目录**不存在** | 自托管字体资产位置需新建（或纳入 `src/sidepanel/assets/`） |
| `manifest.json` CSP 当前含 `https://fonts.googleapis.com`、`https://fonts.gstatic.com` | 轨道 C 必须改 `manifest.json` 收紧 CSP（owner 文件清单已纳入） |
| `Settings.level: Level` 与 `DEFAULT_SETTINGS.level = "B1"` 仍在 `shared/types.ts` | ARCHITECTURE D18 要求删；归入轨道 C 一并处理（同时清掉 `useSettings` 写出时的 `level` 残留） |
| `src/content/i18n.ts` 已有 `bubbleStrings()`/`fabStrings()`/`translateErrorMessage()` | 轨道 A 的工作是**扩字典到 4 语 + 加 hover/toast key**，不是"抽取" |
| `VocabWord.zh: string` 必填，无 `translation`/`source_lang`/`target_lang`/`schema_version` | 轨道 B 删旧加新，按 §3 五步顺序串行 |
| `Lang = "zh-CN" \| "en"` | 轨道 C 扩为 4 语，配 `isValidLang` 类型守卫 |

---

## 关键约束

1. **§3 五步顺序不可换、单 PR 同发版**（feature-status §3 + D22）。"先发松校验版"被禁止。
2. **§4 是原子包**（D3）：Lang 扩 + 类型守卫 + 所有 UI 字符串 + Settings 下拉必须同次落地，否则 storage 读出 `"ja"`/`"fr"` 会绕过类型系统。
3. **§2 hover 预览 + 删除/toast 必须同 PR**（D2）：共享 `bubble.ts` 状态机。
4. **§6 Welcome 两项必须同 PR**（D5）：CEFR 移除 + 4 语母语选择，避免过渡态。
5. **§7 不得与 §4 合包**（D6）：`_locales/` 改动触发 CWS full re-review 7–21 天。
6. **D17（buffer-stage 内 in-place 升级）+ D23（migration 完成不广播 VOCAB_UPDATED 防风暴）** 是 §3 实现细节，必须在轨道 B 的实施清单中显式列出。

---

## 并行轨道划分

### 轨道 A — Bubble/Content UX（§2 全部 + §4 bubble/FAB/toast 字典 4 语扩张）

**单 agent。**

工作项：
- §2 hover 预览：`bubble.ts` 状态机加 `hoverPreview` 变体；`highlight.ts` 接口扩 `onHighlightHover` 钩子（owner 文件清单必须含）
- §2 气泡内删除按钮 + 撤销 toast：新建 `src/content/toast.ts`；undo 用内存 stash + 重新 `SAVE_WORD`（**不新增 message 类型**，对外契约不变）
- §4 bubble + FAB + toast 字典扩 4 语：在 `src/content/i18n.ts` 把 `bubbleStrings()`/`fabStrings()`/`translateErrorMessage()` 改成 `switch(lang)` 4 分支；新增 toast 用的 key（`undoLabel`、`deletedToast` 等）

**owner 文件**：
- `src/content/bubble.ts`
- `src/content/bubbleStyles.ts`
- `src/content/index.ts`（hover 监听装载、toast 装载）
- `src/content/i18n.ts`（4 语扩张 + toast key）
- `src/content/highlight.ts`（仅扩 `onHighlightHover` 钩子，不动核心 TreeWalker 逻辑）
- `src/content/toast.ts`（新建，Shadow DOM 风格与 bubble 一致）
- 新增 `src/content/bubble.test.ts`（hover 状态切换、token 单调性）

**对外契约**：
- 不改 `shared/messages.ts`：undo 用内存 stash 重新 `SAVE_WORD`
- 字典 4 语扩张依赖 `Lang` 已扩为 4 项 — **必须等轨道 C 合并后再合 A**（详见"合并顺序"）

**碰撞控制**：
- A 内部分两阶段开发：阶段 1（hover/delete/toast 状态机 + 内存 stash），阶段 2（字典 4 语扩张）。阶段 1 可在 C 合并前先开发，阶段 2 必须在 C 合并后追加
- A 与 §4 原子包同 PR 落地（与 C 一起发版）

---

### 轨道 B — 数据层 schema + migration（§3 五步串行，单 PR 单发版）

**单 agent，串行交付，自成独立发版。**

5 步顺序（feature-status §3）：
1. 扩 `VocabWord`：`shared/types.ts` 加 `source_lang?`、`target_lang?`、`translation`、`schema_version: 2` 字面量；删 `zh`/`en` 语义、统一为 `translation` 字段
2. 双轨 migration：新建 `shared/migration.ts`（纯函数 `migrateRecord`），`background/index.ts` 顶层注册 `chrome.runtime.onMessage.addListener`，模块作用域 `migrationReady` promise 由 `init()` 解析；写路径 handler 首行 `await migrationReady`
3. 4 个 P0 护栏：
   - `local["schema_version"]` 标记 + `CURRENT_SCHEMA_VERSION = 2` 字面量常量
   - 单条 `SYNC_VALUE_MAX_BYTES = 7800` 双层校验：`useVocab.save` ingress（用户友好错误）+ `vocab.ts` flush 前 `ctx` 截断与硬拒（`last_sync_error` 记录拒因）
   - `chrome.runtime.onSuspend` flush（best-effort；**正确性靠 cold-start `init()`**，不作为单点依赖）
   - 空 `zh` 跳过 migration（不伪造默认）
4. 新建 `shared/migration.test.ts`（vitest），覆盖 ARCHITECTURE §14 最小测试矩阵；至少含：旧无 lang 字段、空 `zh` 跳过、SW 中途被杀重入幂等、超 8 KB 截断、超 8 KB 硬拒
5. `sidepanel/exportCsv.ts` 加 `source_lang`/`target_lang` 列

**额外护栏（来自 ARCHITECTURE 决策日志，必须显式落地）**：
- D17 buffer-stage in-place 升级：write_buffer 中 pending 的旧 schema 记录在 flush 前用 `migrateRecord` 升级
- D23 migration 完成**不**广播 `VOCAB_UPDATED`（避免侧栏在用户操作中突然刷新）

**owner 文件**：
- `src/shared/types.ts`（**与 C 共享**：B 改 VocabWord 字段；C 扩 Lang + 删 level — 不同 type，加性 vs 破坏性，按"合并顺序"协调）
- `src/shared/migration.ts`（新建）
- `src/shared/migration.test.ts`（新建）
- `src/background/index.ts`（**与 C 共享**：B 改 init/onMessage 注册时序；C 在 onInstalled 加 navigator.language 探测 — 不同函数体）
- `src/background/vocab.ts`（lock-aware flush + 双层 size cap + buffer in-place 升级）
- `src/sidepanel/useVocab.ts`（ingress size cap）
- `src/sidepanel/exportCsv.ts`（新增列）

---

### 轨道 C — i18n 4 语原子包 + 历史包袱清理（§4 sidepanel 部分 + Level 字段删除）

**单 agent。**

工作项：
- `Lang` union 扩为 `"zh-CN" | "en" | "ja" | "fr"` + `isValidLang(x): x is Lang` 类型守卫（`shared/types.ts`）
- **删除 `Settings.level` 与 `DEFAULT_SETTINGS.level`**（D18），并在 `useSettings` 写出时 lazy-strip 历史 `level` 字段（防止旧 storage 读出污染）
- 侧栏 ~70 个 UI 字符串补 `ja`/`fr`（`sidepanel/i18n.ts`）—— 同时移除 `levelA2/B1/B2/C1` 等 level 相关 key
- Settings 4 语下拉框 + 移除 level UI（`sidepanel/screens/Settings.tsx`）
- Settings `onChange` 写 storage 去重（`sidepanel/state.ts` 的 `useSettings` 或组件层）
- 自托管 Noto Sans JP `@font-face`：放置 woff2 到新建 `public/fonts/`（vite 静态资源），`sidepanel/styles.css` 加 `@font-face`
- **`manifest.json` CSP 收紧**：删除 `https://fonts.googleapis.com` 与 `https://fonts.gstatic.com`，改为 `style-src 'self' 'unsafe-inline'; font-src 'self';`
- 首次安装 `onInstalled` 读 `navigator.language` 写默认 `ui_language`（`background/index.ts` 内 onInstalled 回调，独立函数体与 B 不冲突）

**owner 文件**：
- `src/shared/types.ts`（Lang 扩 + Level 删 + Settings.level 删 + DEFAULT_SETTINGS.level 删）
- `src/sidepanel/i18n.ts`（4 语字典 + 移除 level keys）
- `src/sidepanel/screens/Settings.tsx`（4 语下拉 + 移除 level UI + onChange 去重）
- `src/sidepanel/state.ts`（useSettings 写出 lazy-strip level）
- `src/sidepanel/screens/Welcome.tsx`（移除 level 绑定，CEFR 网格的彻底拆除归 §6；C 只确保不引用 `Level` 类型即可，避免 TS 编译失败）
- `src/sidepanel/styles.css`（`@font-face` Noto Sans JP）
- `manifest.json`（CSP 收紧）
- `public/fonts/NotoSansJP-Regular.woff2`（新建资产）
- `src/background/index.ts`（onInstalled 内 navigator.language 探测段）

---

### 轨道 D — 商店元数据补齐 4 语（§7，独立发版节奏）

**单 agent，独立发版，禁与轨道 C 合包。**

工作项（注意：4 个 locale 全部需新建，不只 ja/fr）：
- `_locales/en/messages.json`
- `_locales/zh_CN/messages.json`
- `_locales/ja/messages.json`
- `_locales/fr/messages.json`

每个含 `extName` 与 `extDescription`。

**发版门**：
- D 的 zip 包**不含 `src/` 改动**，纯元数据补齐
- D 必须排在 §4（A+C）上线**稳定后**再上传 CWS，吸收 7–21 天 full re-review，避免拖累功能更新

**owner 文件**：
- `_locales/en/messages.json`（新建）
- `_locales/zh_CN/messages.json`（新建）
- `_locales/ja/messages.json`（新建）
- `_locales/fr/messages.json`（新建）
- 视情况校准 `manifest.json` 的 `default_locale`（若 §4 首装语言探测改变默认，default_locale 仍保留 en 作为最终 fallback）

---

### 轨道 E — 长期 backlog（§8，可选，不阻塞任何发版）

E1+E2 同人（共改 `content/fab.ts`），E3 单人。

- **E1 Per-domain FAB 隐藏**：`shared/types.ts` Settings 加 `fab_disabled_origins: string[]`、`content/fab.ts` 读取并隐藏、Settings UI 加管理面板
- **E2 可拖动 FAB 位置**：`content/fab.ts` 加 pointer 事件 + `local["fab_position"]` 持久化
- **E3 Welcome 视口 < 600px 不滚动**：`sidepanel/screens/Welcome.tsx` + `styles.css` 媒体查询调整

**owner 文件**：
- E1+E2：`src/content/fab.ts`、`src/shared/types.ts`（Settings 加字段）、`src/sidepanel/screens/Settings.tsx`（管理面板）
- E3：`src/sidepanel/screens/Welcome.tsx`、`src/sidepanel/styles.css`

**碰撞控制**：E1 与 C 都改 Settings 与 types，建议 E1 排在 C 之后再开工；E3 与所有轨道无碰撞。

---

## 合并顺序（已修订：B 加性 → C 破坏性 + 删 Level → A 跟 C）

`shared/types.ts` 与 `background/index.ts` 是 B、C 共享面。**正确顺序**：

1. **B 先合并**：B 的 `shared/types.ts` 改动是加性的（VocabWord 加新字段、删 zh/en 语义但不动 Settings/Lang）；`background/index.ts` 改 init/onMessage 注册时序，与 C 的 navigator.language 探测在不同函数体
2. **C 后合并**：C 在 B 已合的基础上扩 Lang、删 Level、收 CSP、加字体；rebase 时面对的是 B 已稳定的 types.ts，冲突仅限 import 顺序
3. **A 跟 C 同 PR 或紧随合并**：A 阶段 1（hover/delete/toast）可与 C 并行开发；A 阶段 2（4 语字典扩张）必须 C 合并后追加；A 与 C 共属 §4 原子包，发版同一 release
4. **D 在 §4 上线稳定后**单独走 CWS 上传（吸收 7–21 天审核）
5. **E 任意时机插入**：E1 排在 C 之后；E2/E3 任意

---

## 启动建议（按时间线）

| T | 可同时启动的轨道 | 备注 |
|---|---|---|
| T0 | **B**（开始 §3 五步） + **A 阶段 1**（hover/delete/toast，不动字典）+ **C**（Lang 扩 + Level 删 + CSP 收紧 + 字体 + 首装探测）+ **D**（建 4 个 locale 文件） | 4 agent 并行；D 同时备好但发版排队 |
| T0 + 短延 | **A 阶段 2**（C 合并后追加 4 语字典） | A 与 C 同 PR 合并发版 |
| 待 B + (A+C) 上线 | §5 Direction Settings | 一个新 agent 开工 |
| 待 §5 上线 | §1 alreadyInLang + §6 Welcome 重做 | §1 与 §6 各自一个 agent；§6 两项必须同 PR |
| §4 稳定后 | **D 上传 CWS** | 独立窗口 |
| 任意 | **E1+E2**（C 后） / **E3**（任意） | 不阻塞 |

---

## 验证方式（每条轨道交付前）

**轨道 A**：
- 本地 dev build：选词触发气泡、悬停高亮词触发预览、点击删除按钮显示 undo toast、5 秒内点 undo 恢复、5 秒后 toast 自动消失且 storage 中真删
- 4 语切换下 bubble/FAB/toast 字符串无残留（依赖 C 合并后联调）
- 单测：bubble 状态机 hover→translated 切换、token 单调性、undo stash 时序

**轨道 B**：
- `npm run test` 通过 `migration.test.ts` 全部用例
- 安装 v2.0.x 旧 build 保存若干旧 schema 词汇 → 升级新 build → `chrome.storage.sync` 中 `v:*` 全部含 `translation`/`schema_version: 2`，旧 `zh`/`en` 字段消失
- SW 在 migration 中途 chrome://serviceworker-internals 强制终止：cold-start `init()` 重入幂等，无重复污染
- 超 8 KB 单条提交：`last_sync_error` 记录拒因；`ctx` 自动截断后通过
- 导出 CSV 含 `source_lang`/`target_lang` 新列
- migration 完成后**未触发** `VOCAB_UPDATED` 广播（D23 验证）
- buffer 中旧 schema 记录在 flush 前已升级（D17 验证）

**轨道 C**：
- Settings 切 4 种语言，sidepanel 全部界面字符串切换无残留
- 卸载重装：`navigator.language` = `ja-JP` 时初装默认 `ui_language` = `"ja"`；`fr-FR` 时为 `"fr"`；其他回退 `en`
- DevTools Network 验证字体仅自托管，无外联 CDN；CSP header 不再包含 Google 域
- 连续切换 toggle 不触发重复 `chrome.storage.local.set`（DevTools storage.onChanged 监控）
- 旧 storage 含 `level: "B1"` 字段：useSettings 写出时被 lazy-strip
- TS 编译通过且无 `Level` 残留引用

**轨道 D**：
- CWS 开发者后台上传 zip，dashboard 看到 4 语元数据正确显示
- 不同浏览器语言访问商店页验证 fallback 链路

**轨道 E**：按各子项 acceptance 验证（per-domain 隐藏在指定域生效；FAB 拖动后位置持久化跨刷新；Welcome 在 800×500 视口无滚动条）

---

## 已采纳的审查修订摘要

| 编号 | 审查发现 | 本版处理 |
|---|---|---|
| R1 | `_locales/` 不存在但 manifest 已用 `__MSG_*__` | D 范围扩为新建 4 个 locale；列入"现状关键事实" |
| R2 | manifest CSP 含 Google fonts 域 | C owner 文件清单加入 `manifest.json`，明确收紧 CSP |
| R3 | `Settings.level` 仍在源码 | 归入 C：删 Level 类型、Settings 字段、DEFAULT_SETTINGS、useSettings lazy-strip |
| R4 | `bubbleStrings()` 已存在 | A 描述改为"扩字典到 4 语 + 加 toast key"，非"抽取" |
| R5 | A 在 Lang 还是 2 语时无法写 4 语字典 | A 内部分阶段：阶段 1 不动字典，阶段 2 等 C 合并后追加 |
| R6 | 合并顺序原计划"C 先"反而劣解 | 改为 B 先 → C 后 → A 跟 C 同 PR |
| R7 | D17 buffer 内升级 / D23 migration 不广播 未列入 B | B 实施清单显式列出 |
| R8 | hover 触发器需要 highlight.ts 配合 | A owner 文件加入 `content/highlight.ts`（仅扩接口） |
| R9 | onSuspend 不可作为正确性单点 | B 验证段强调 cold-start 是真正兜底 |
| R10 | D 的发版门未量化 | 明确 D 排在 §4 上线稳定后、zip 不含 src/ |

---

## 关键文件路径速查

- 共享契约：`src/shared/{types,messages,highlightable,migration*}.ts`
- 后台：`src/background/{index,translate,vocab}.ts`
- 内容脚本：`src/content/{index,bubble,bubbleStyles,clickTranslate,wordBoundary,fab,contextSentence,i18n,toast,highlight,content.css}.ts(x)`
- 侧栏：`src/sidepanel/{App,main,state,i18n,exportCsv,useSelection,useVocab,useFocusWord,useSyncStatus,styles}.ts(x)`、`src/sidepanel/screens/*`、`src/sidepanel/components/*`
- 资产：`public/fonts/NotoSansJP-Regular.woff2`（新建）
- 商店：`_locales/{en,zh_CN,ja,fr}/messages.json`（4 个全部新建）
- 配置：`manifest.json`（CSP 收紧）
- 文档：`docs/feature-status.md`、`ARCHITECTURE.md`
