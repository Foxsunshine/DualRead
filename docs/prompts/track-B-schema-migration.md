# 轨道 B 派发 prompt — 数据层 schema + migration

> **使用方法**：在 worktree `../DualRead-track-B`（分支 `track/schema-migration`）打开 Claude，把以下整段粘贴为首条消息。

---

你是 DualRead 项目轨道 B 的执行 agent。当前工作目录是 git worktree `../DualRead-track-B`，已切到分支 `track/schema-migration`。完整背景见 `docs/parallel-tracks.md`，本 prompt 是该文档轨道 B 部分的可执行摘要。

## 项目最小背景

DualRead 是 Chrome MV3 扩展（TypeScript + Vite + crxjs），无后端。词汇表存 `chrome.storage.sync`（key 前缀 `v:`），settings 与 schema 元数据存 `chrome.storage.local`，translation cache 存 `chrome.storage.session`。完整架构见 `ARCHITECTURE.md`，特别 §9（service worker discipline）与 §14（schema migration）。

## 你的任务范围

§3 数据层 5 步串行升级（feature-status.md §3），**单 PR 单发版，禁过渡发版**（D22）。当前 `VocabWord` 还在用 `zh: string` + `en?: string` 旧字段，需要升级到 `translation` 单字段 + `source_lang`/`target_lang`/`schema_version` 元数据。

## 五步顺序（不可换）

### Step 1 — 扩 `VocabWord` schema（`src/shared/types.ts`）

```ts
export const CURRENT_SCHEMA_VERSION = 2 as const;

export interface VocabWord {
  word: string;
  word_key: string;
  translation: string;        // 新唯一权威字段
  source_lang?: Lang;          // 历史元数据
  target_lang?: Lang;          // 历史元数据
  ctx?: string;
  source_url?: string;
  note?: string;
  created_at: number;
  updated_at: number;
  schema_version: 2;           // 字面量类型，bump 时强编译失败
}
```

删除旧 `zh`/`en` 字段。`Lang` 当前是 `"zh-CN" | "en"`，**保持现状**（轨道 C 负责扩 4 语；你的 `source_lang?: Lang` 加性兼容）。

### Step 2 — 双轨 migration + `migrationReady` 契约（`background/index.ts`）

- 新建 `src/shared/migration.ts`，导出纯函数 `migrateRecord(record: unknown, settings: Settings): VocabWord | null`（空 `zh` 返回 `null` 表跳过）
- `background/index.ts` 顶层注册 `chrome.runtime.onMessage.addListener`（必须在模块顶层，确保 SW 冷启第一条消息能捕获）
- 模块作用域 `let migrationReady: Promise<void>` 由 `init()` 解析
- `init()` 流程：读 `local["schema_version"]` → 不等于 2 则获取 `local["migration_lock"]`（带 60s 超时自愈）→ `chrome.storage.sync.get(null)` → 对每条 `v:*` 调 `migrateRecord` → 批写回 sync → 写 `local["schema_version"] = 2` → 释放 lock → resolve `migrationReady`
- 写路径 handler（`SAVE_WORD`/`DELETE_WORD`/`CLEAR_DATA`）首行 `await migrationReady`；`TRANSLATE_REQUEST` 是纯透传**不加 await**

### Step 3 — 4 个 P0 护栏

a. `local["schema_version"]` 标记 + `CURRENT_SCHEMA_VERSION` 字面量常量（已在 Step 1）
b. **单条 ≤ `SYNC_VALUE_MAX_BYTES = 7800` 双层校验**：
   - **Ingress**（`src/sidepanel/useVocab.ts` 的 `save`）：估算 JSON 字节数，超限抛用户友好错误
   - **Flush 前**（`src/background/vocab.ts`）：再校验一次，超限先截断 `ctx` 字段，截断后还超则硬拒，把拒因写到 `local["last_sync_error"]`
c. `chrome.runtime.onSuspend` 监听内 await 最后一次 flush（**best-effort，正确性靠 cold-start `init()` 兜底**，不能作为单点依赖）
d. 空 `zh` 跳过：migration 中 `record.zh` 为空字符串或 undefined 时返回 `null`，不伪造默认值

### Step 4 — vitest 覆盖（`src/shared/migration.test.ts`，新建）

最少覆盖 8 类 case（参考 ARCHITECTURE.md §14）：
- 旧 schema 含 `zh` + `en` → 升级后 `translation = zh`，删 `zh`/`en`，加 `schema_version: 2`
- 旧 schema 含 `zh` 无 `en` → `translation = zh`
- 旧 schema **空 `zh`** → 返回 `null`（跳过）
- 已是 v2 schema → 幂等返回原值（不重复升级）
- SW 中途被杀（模拟：migration 跑到一半抛错）→ cold-start 重入幂等
- 单条超 7800 字节 → 截断 `ctx` 后通过
- 单条截断 `ctx` 后仍超 → 硬拒并记录 `last_sync_error`
- migration 完成**未触发** `VOCAB_UPDATED`（D23：避免侧栏在用户操作中突然刷新）

### Step 5 — CSV 导出新列（`src/sidepanel/exportCsv.ts`）

CSV header 加 `source_lang`、`target_lang`，行数据按新字段输出（旧记录 migration 后这两列为空）。

## 额外护栏（来自 ARCHITECTURE 决策日志，必须显式落地）

- **D17 buffer-stage in-place 升级**：`background/vocab.ts` 的 write_buffer 在 flush 前，对 pending 记录调 `migrateRecord` 升级（处理 migration 启动前已 enqueue 的旧记录）
- **D23 migration 完成不广播 `VOCAB_UPDATED`**：避免侧栏在用户操作中突然刷新

## owner 文件（你只能改这些）

- `src/shared/types.ts` — 改 `VocabWord` 字段；**不要改** `Lang`/`Settings`（轨道 C 拥有）
- `src/shared/migration.ts` — **新建**
- `src/shared/migration.test.ts` — **新建**
- `src/background/index.ts` — 改 init/onMessage 注册时序、加 `migrationReady`；**不要改** onInstalled 内 navigator.language 检测段（轨道 C 拥有）
- `src/background/vocab.ts` — lock-aware flush + 双层 size cap + buffer in-place 升级
- `src/sidepanel/useVocab.ts` — ingress size cap
- `src/sidepanel/exportCsv.ts` — CSV 新列

## 边界（不要碰）

- `Lang` union、`Settings` 任何字段、`DEFAULT_SETTINGS` — 轨道 C
- `manifest.json` — 轨道 C
- `src/content/` 全部 — 轨道 A
- `_locales/` — 轨道 D

## 对外契约

- 你的 PR **先于** 轨道 C 合并（你是加性，C 是破坏性）
- 你的 5 步必须在**单 PR 内**完成；不接受拆分发版（D22）

## 验证方式（每次提交前自检）

- `npm test` 通过 `migration.test.ts` 全部 8 类 case
- `npx tsc --noEmit` 无错误
- 手动验证：
  - 安装 v2.0.x 旧 build → 保存若干旧 schema 词汇 → 替换为新 build → 重启 Chrome → DevTools 检查 `chrome.storage.sync` 全部 `v:*` 含 `translation` 与 `schema_version: 2`，无 `zh`/`en`
  - chrome://serviceworker-internals 强杀 SW → 触发任意操作冷启 → migration 重入无重复污染
  - 构造一条超 7800 字节的词 → ingress 弹错；服务端构造超限 → `last_sync_error` 有拒因记录
  - 导出 CSV 含 `source_lang`/`target_lang` 两列
  - DevTools storage.onChanged 监控：migration 完成期间**无** `VOCAB_UPDATED` 广播

## 完成定义

5 步全部 acceptance 通过、单测齐全、手工冒烟无回归 → 开 PR `[Track B] Schema migration v2 (§3)`，标 ready for review。完成后向我汇报实际触碰的文件清单、测试矩阵覆盖率、SW 冷启耗时（应 ≤ 5 秒）、需要 reviewer 重点关注的设计取舍。
