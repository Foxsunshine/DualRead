<!-- # CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 这个目录是什么

`~/Desktop/dev/` 是 **DualRead 项目的 workspace 根目录**。**2026-04-28
之后**，这里只有一个 active repo：

```
dev/
├── DualRead/                              # Chrome 扩展（唯一 active repo，PUBLIC）
└── _archived/
    └── DualRead-backend-v3.1/             # v3.1 FastAPI 后端，已废弃，保留 git 历史
```

接到任务时，**默认 `cd DualRead/` 再操作**。除非显式说"看一下存档里
怎么写的"，否则不要动 `_archived/` 下的内容。

## 项目目标 —— 已校正

**2026-04-28 决策修正**：项目从 portfolio 驱动**回归实用性驱动**。

之前的 v3.1 规划（FastAPI 后端 + Postgres + pgvector RAG + LangGraph
3-node agent + Langfuse + BLEU/LLM-judge eval + 3 repo 拆分 + 4 层
secret 防御）**整体废弃**。原因：重新审视后，这些组件对"划词翻译 +
生词本"的核心场景不是必需，更多是在为简历叙事加重量。

新方向：

- **产品边界**：划词翻译 + 生词本，仅此
- **默认停留在 Tier 0**：只有 Chrome 扩展，BYOK（用户自带 API key），
  无后端
- **Tier 1（轻量翻译代理）**：仅当上架 CWS 且 BYOK 劝退太多用户时触发，
  实装用 Cloudflare Workers / Vercel Edge 免费层，**不**用
  Railway + FastAPI + Postgres
- **Tier 2（用户存储）**：仅当 `chrome.storage.sync` 配额真的爆了时触发

详见 `DualRead/docs/v2-x-utility-scope.md`（**当前权威范围文档**）。

如果用户的 prompt 里出现 "RAG / agent / 后端 / eval pipeline / Langfuse /
4 语矩阵" 等 v3.1 概念，先反问：是想恢复 v3.1 方向，还是在新的实用性
范围内重新理解需求？

## 架构 source of truth

- **`DualRead/docs/v2-x-utility-scope.md`** —— 当前权威范围定义
  （边界、Tier 触发条件、已废弃方向清单）
- **`DualRead/CLAUDE.md`** —— 扩展 repo 的工作守则（注释政策、构建
  命令、commit 格式）
- **`DualRead/docs/v3-1-architecture.md`** —— **SUPERSEDED**，仅作
  历史决策记录保留，不再用于指导实装

## Toolchain

- 机器只装了 **Node 20**。直接 `npm run …` 跑——**不要**前缀
  `nvm use 20` 或 `source ~/.nvm/nvm.sh`
- 不再有 Python 后端。如果未来 Tier 1 触发，新栈是 TypeScript on
  Cloudflare Workers / Vercel Edge

## Secret 卫生

简化版（v3.1 的 4 层防御已废弃，只保留真正有用的两层）：

1. `.gitignore` 覆盖 `.env*`、`node_modules/`、`dist/`、构建产物
2. `gitleaks` pre-commit hook（`brew install gitleaks` 已装）

GitHub 端的 Secret Scanning + Push Protection 是顺手开下就有的免费服务，
开了更好但不是项目工程。`env.example` 模板矩阵不再需要——Tier 0 没有
任何服务端 env 要管。

## Memory 位置

`~/.claude/projects/-Users-enari-Desktop-dev-DualRead/memory/`（2026-04-29
统一到 DualRead-scoped slug）。新 session 起来后先读 `MEMORY.md` 索引。

**这意味着：**
- 在 `~/Desktop/dev/DualRead/` 启动 session → 自动读到这套 memory ✅
- 在 `~/Desktop/dev/` 启动 session（workspace 级）→ **读不到 memory**，
  系统派生的 slug 是 `-Users-enari-Desktop-dev/` 而那里现在是空的 ❌
  **解决办法**：尽量在 `DualRead/` 内启动 session；workspace 根级
  cd 主要给跨 repo 操作用，scope reset 后已无跨 repo 工作

旧的 v3.1 / Phase 0-5 相关 memory 已在 2026-04-29 整理时全部删除；当前
8 条 memory 全部 active，零过时标记。

## Skill 使用规则（重要）

**接到任务的第一件事是判断有没有对应的 skill，有就先 `Skill` 工具
调用，再开始干活。** 不要凭手感直接 Edit / Bash 处理本应走 skill 的
请求。

常见的命中关系（不完全列表）：

- 用户问"加 hook / 改 hook / 改 settings.json / 加 permission / 设
  环境变量 / 通知响铃配置 / 让 Claude 自动做 X" → `update-config`
- 用户问"改快捷键 / 重绑 key / chord 绑定" → `keybindings-help`
- 用户问"每周/每天/隔几分钟跑一次 / 定时检查 / 循环跑 X" → `schedule`
  或 `loop`（一次性定时用 `schedule`，循环短间隔用 `loop`）
- 用户问"减少权限弹窗 / 把常用命令加白名单" → `fewer-permission-prompts`
- 用户问"简化这段代码 / 这段太啰嗦" → `simplify`

判断流程：
1. 读用户的请求 → 看 system reminder 里 available-skills 列表 → 有命中
   就 `Skill` 调用
2. 没把握时，宁可问一句"我用 `xxx` skill 处理这个吗？"也别越过 skill
   自己干
3. **`update-config` 是最容易漏的**（任何涉及 `~/.claude/settings.json`
   或项目级 `.claude/settings.json` 的改动都该走它），优先注意 -->
