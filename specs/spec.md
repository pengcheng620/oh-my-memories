# loci v2 — Specification (SDD Phase: Spec)

> **Status**: Draft v0.1
> **Owner**: lup
> **Date**: 2026-05-14
> **SDD Phase**: `spec` (after this: `design.md` → `tasks.md` → `implementation`)
> **Predecessor research**: `D:\Works\Vault\vault\.serena\memories\meta-memory-skills-comparison.md`

---

## 0. 文档约定

- 这是 **Spec 阶段** 文档，回答的是 **"我们要构建什么 / 为什么 / 给谁用 / 必须满足哪些约束"**。
- **不**回答"具体怎么实现"——那是 `design.md` 的工作。
- 涉及的关键技术决策在第 8 节"Open Questions for Design Phase"集中列出，spec 阶段只标记选项与约束，不拍板。
- 用语：
  - **MUST / SHOULD / MAY** = RFC 2119 语义。
  - **L1** = Layer 1 (loci 自身记忆引擎)。
  - **L2** = Layer 2 (记忆联邦层)。

---

## 1. 背景与动机

### 1.1 用户上下文

主用户（lup）的工作模式：

| 维度 | 现状 |
|---|---|
| AI 编辑器 | Claude Code、Codex、OpenCode、Cursor 多客户端并行 |
| 工作仓库 | 跨 20+ repo（Vault、FusionManager、licensing 等） |
| 已装记忆 skill | `loci`、`lessons-learned`、`learn`、`recall`、`compound-docs`、`note`、Serena MCP |
| 已存记忆资产 | `D:\Works\Vault\vault\.serena\memories\*.md`（数十篇手写笔记） |
| 痛点 1 | 每个工具的记忆各成孤岛，跨工具切换时**上下文蒸发** |
| 痛点 2 | 召回粒度差，`grep` 命中过多 / 关键字法找不到语义相近的笔记 |
| 痛点 3 | 没有"统一入口" — 想找"我以前怎么处理过 X 问题"要翻 5 个地方 |
| 痛点 4 | `loci` 当前 CLI（`remember`/`recall`/`sync`）与其 SKILL.md 描述（13 个命令）严重不一致，且写入路径只有 `~/.loci/index.json` 单一 JSON 文件，没有兑现"宫殿"承诺 |

### 1.2 现有 loci 代码诊断（来自子代理深度探索）

| 模块 | 文档承诺 | 实际实现 | 差距 |
|---|---|---|---|
| CLI 命令 | 13 个 (`remember`/`search`/`tidy`/`palace`/`leaf`/`relate`/`sync`/`migrate`/`stats`/`teach`/`forget`/`audit`/`recall`) | 4 个 (`remember`/`recall`/`sync`/`status`) | **9 个未接通** |
| 写入位置 | `palaces/<scope>/<theme>.md` 宫殿+叶子 | `~/.loci/index.json` 单 JSON | **完全不一致** |
| 检索算法 | 加权多信号（关键字/别名/实体/标题） | 基础 substring 匹配 | **未启用现成的 retrieval.ts** |
| 适配器 | 6 个 stub（claude-code/codex/cursor/gemini/openclaw/memory-mcp） | 接口定义齐全但**未注册到 sync 流程** | **架子有，没通电** |
| 中央索引 | `~/.loci/index.json` 包含 frontmatter + embedding 字段 | 写入只填基础字段，无 embedding/无 frontmatter | **schema 充裕，使用贫瘠** |

**结论**：loci 作者预留了完整的双层架构骨架，只是没有完成"接线"。loci v2 不是从零造，而是 **完成 loci 作者未完工的部分 + 注入 recall/lessons-learned/episodic-memory 的精华**。

### 1.3 为什么不直接用现成方案

| 现成方案 | 为何不直接用 |
|---|---|
| 仅用 `recall` | 只索引 Claude Code/Codex 对话，**不能主动写入记忆**，且不支持 Cursor/OpenCode |
| 仅用 `lessons-learned` | 项目级 (`docs/lessons/`)，**跨 repo 不共享** |
| 仅用 `episodic-memory` | 只索引 Claude Code 对话，需要 OpenAI embedding（成本+在线依赖） |
| 仅用 Serena MCP | 项目内（`.serena/memories/`），跨项目不共享，无主动召回 |
| 仅用 IDE 自带（Claude Code 的 CLAUDE.md / Cursor rules） | 不是真正"记忆"，是规则；不可结构化检索 |
| `loci` 现状 | CLI 不完整，召回弱，未接通适配器 |

**没有任何单一方案同时满足：跨 IDE + 跨 repo + 主动写入 + 精准召回 + 利用现有数据**。

---

## 2. 愿景与范围

### 2.1 Vision

> **loci v2 是个人 AI 工作流的统一记忆中枢**：
> 任何记忆，无论原生于何处，都可被一致地写入、检索、迁移；
> 任何 AI 客户端，无论自带何种记忆机制，都可通过 loci 看见全部历史。

### 2.2 双层架构定位

```
┌─────────────────────────────────────────────────────────────┐
│                      loci v2 单一入口                         │
└─────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┴───────────────────────┐
        ▼                                               ▼
┌──────────────────────┐                    ┌──────────────────────┐
│  Layer 1: Engine     │                    │  Layer 2: Federation │
│  loci 自己的记忆     │                    │  代理别人的记忆      │
│                      │                    │                      │
│  • 我直接 remember   │                    │  • 我用 get/post     │
│  • 卡片 + 索引       │                    │  • 跨源联合检索      │
│  • 主控 = 我         │                    │  • 主控 = 各个工具   │
└──────────────────────┘                    └──────────────────────┘
```

| 维度 | Layer 1 (Engine) | Layer 2 (Federation) |
|---|---|---|
| 数据所有权 | loci 拥有，存 `~/.loci/` | 各工具拥有，loci 只读/代写 |
| 写入语义 | `loci remember <fact>` 直接写 | `loci post <source> <content>` 写到目标工具 |
| 检索语义 | `loci recall <q>` 在自有记忆里 | `loci search <q>` 跨所有源联合检索 |
| 离线可用 | ✅ 完全离线 | 取决于源（多数本地文件型也离线） |
| 升级路径 | 是 loci 现状 + 强化 | 是 loci 现状适配器框架 + 实现 |
| 用户主动度 | 主动（user-driven） | 被动（system-aggregated） |

### 2.3 In Scope (M1-M4)

- L1 ✅ 修复 `loci remember` 写入到宫殿+叶子（不止 JSON）
- L1 ✅ 修复 `loci recall` 启用现有 retrieval.ts 加权
- L1 ✅ 接通 `palace`/`leaf`/`relate`/`tidy`/`stats`/`forget` 等 CLI 命令
- L1 ✅ 注入 BM25 全文检索（来自 recall 思路）
- L1 ✅ 注入 confidence 字段与 Zettel 风格关联（来自 lessons-learned）
- L1 ✅ 注入语义向量检索（来自 episodic-memory，本地 ONNX）
- L2 ✅ 完成至少 5 个适配器实现：Claude Code / Codex / Cursor / Serena / lessons-learned
- L2 ✅ `loci sources` 适配器管理 CLI
- L2 ✅ `loci get / post / migrate / sync / search` 跨源 API
- L2 ✅ MCP server 暴露（让 Claude Code/Cursor 能直接调用）
- 数据迁移工具：把 `D:\Works\Vault\vault\.serena\memories\*.md` 一键导入

### 2.4 Out of Scope (本期不做)

- ❌ 云端同步（多设备同步） — 本期纯本地
- ❌ 团队共享 / 权限模型 — 本期单用户
- ❌ Web UI / GUI — 本期纯 CLI + MCP
- ❌ 自动总结 / LLM 二次加工 — 本期只做存取检索，不做生成
- ❌ 替代 IDE 自带规则文件（CLAUDE.md/cursorrules） — 这些是"规则"不是"记忆"，loci 只读不写
- ❌ 商业化 / 多租户

### 2.5 不做的反向声明（避免范围爬升）

- loci v2 **不是** 知识图谱（图查询是 graphify 的工作）
- loci v2 **不是** 文档管理系统（不取代 Notion/Logseq/Obsidian）
- loci v2 **不是** RAG 后端（不直接喂给 LLM 做生成，只提供检索）
- loci v2 **不是** 通用搜索引擎（只搜记忆，不搜代码 — 那是 ripgrep/graphify 的事）

---

## 3. Stakeholders & Personas

| Persona | 描述 | 主要交互 |
|---|---|---|
| **lup（首要）** | 多 IDE、多 repo 个人开发者 | 直接用 CLI + 让 AI 助手用 MCP |
| **AI Agent in Claude Code** | 跑在 lup 机器上的 Claude | 通过 MCP 调用 `loci_recall` 等工具 |
| **AI Agent in Cursor** | 跑在 lup 机器上的 Cursor | 同上，跨 IDE 共享 |
| **AI Agent in Codex** | OpenAI Codex CLI | 同上 |
| **未来：协作者** | （out of scope）team 模式 | — |

---

## 4. User Stories（按 Layer 分组）

### 4.1 Layer 1 用户故事

#### US-L1-1：手动记一条事实

> **As** lup
> **I want** 在任意终端输入 `loci remember "Vault server WCF v32 layer 用 ContextBoundObject 而不是纯 WCF"`
> **So that** 这条事实被写到 `~/.loci/palaces/<scope>/server-platform.md` 的对应叶子，并出现在 `~/.loci/index.json`

**接受标准**：
- 能省略 scope，loci 自动推断或问我
- 24 小时内能用语义相近的查询召回（如"v32 服务用了哪个基类？"）
- 能看到这条记忆在哪个 palace 哪个 leaf，方便后续手动编辑

#### US-L1-2：精准召回过去的笔记

> **As** lup
> **I want** `loci recall "Vault 同步引擎里 ItemSyncWorker 怎么处理跨厂商差异"`
> **So that** 我在 1 秒内拿到 top-3 候选笔记，按 (BM25 + 向量 + recency + confidence) 综合排序

**接受标准**：
- 命中要包含 source、score、palace 路径、原文摘要
- 即使我只记得"sync engine"也能命中 ItemSyncWorker 笔记（语义检索）
- 即使笔记里写了"ACC 适配器"我搜"vendor adapter"也命中

#### US-L1-3：导入历史笔记

> **As** lup
> **I want** `loci import --from D:\Works\Vault\vault\.serena\memories --as-palace vault-platform`
> **So that** 这个目录里所有 .md 都被解析、归类、写到 loci 宫殿，并参与后续检索

**接受标准**：
- 不破坏原文件
- 自动从文件名 / H1 推标题，从内容推 keywords
- 重复运行幂等（不重复导入）

#### US-L1-4：维护笔记

> **As** lup
> **I want** `loci forget <id>`、`loci tidy`、`loci audit`
> **So that** 陈旧 / 错误 / 重复的记忆能被清理，宫殿不腐烂

#### US-L1-5：让 AI 自动学习

> **As** lup
> **I want** Claude Code 在它觉得"刚学到值得记住的事"时主动调 MCP 写记忆
> **So that** 不必我每次手动 `remember`

**接受标准**：
- MCP 暴露 `loci_remember(content, scope?, theme?, confidence?)`
- 写入会带 `provenance: {agent: "claude-code", session_id: ..., timestamp: ...}`

### 4.2 Layer 2 用户故事

#### US-L2-1：联合检索

> **As** lup
> **I want** `loci search "PR 评论修复方案"`
> **So that** loci 同时查：自己的记忆 + Claude Code 对话历史 + Codex 会话 + Cursor transcripts + Serena 项目笔记 + lessons-learned

**接受标准**：
- 结果按统一 schema 返回 `{source, score, snippet, full_path, ts}`
- 默认 timeout 2s，超时的源跳过不阻塞
- 支持 `--source claude-code,codex` 限定源
- 支持 `--repo vault` 限定仓库（如适配器支持）

#### US-L2-2：从外部读

> **As** lup
> **I want** `loci get cursor:transcript --id <uuid>` 或 `loci get serena:memory --name <slug>`
> **So that** 我能在 CLI 里取出任何源的原始记忆

#### US-L2-3：往外部写

> **As** lup
> **I want** `loci post serena:memory --name new-finding --content "..."`
> **So that** 写到 `<project>/.serena/memories/new-finding.md`，与 Serena MCP 兼容

**接受标准**：
- 写入位置严格遵守目标工具的约定（不污染其他文件）
- 支持 `--scope project`/`global` 控制位置

#### US-L2-4：迁移记忆

> **As** lup
> **I want** `loci migrate serena --to loci --filter "scope:vault"` 或反过来
> **So that** 一次性把某源的某子集迁移到另一源

**接受标准**：
- 默认 dry-run，要 `--apply` 才真写
- 输出迁移报告：成功/跳过/冲突清单
- 冲突策略：`--on-conflict skip|overwrite|merge|prompt`

#### US-L2-5：增量同步

> **As** lup
> **I want** `loci sync claude-code` 或 `loci sync --all`
> **So that** loci 中央索引里有所有源的最新摘要快照（用于 federated search 加速）

**接受标准**：
- 增量（按文件 mtime / 会话 id 增量）
- 不删除原数据，只读
- 索引可重建（`loci sync --rebuild`）

#### US-L2-6：发现可用源

> **As** lup
> **I want** `loci sources list` / `loci sources detect`
> **So that** 看到机器上装了哪些可用记忆源 + 哪些已注册到 loci

---

## 5. Functional Requirements

### 5.1 Layer 1 (Engine) FR

| ID | Requirement | Priority |
|---|---|---|
| FR-L1-01 | `remember` MUST 写入 `~/.loci/palaces/<scope>/<theme>.md` 的叶子节，并更新 `~/.loci/index.json` | P0 |
| FR-L1-02 | `recall` MUST 使用 `src/core/retrieval.ts` 的加权排序 | P0 |
| FR-L1-03 | 索引 SHOULD 支持 BM25 全文检索（建议 SQLite FTS5 副本） | P1 |
| FR-L1-04 | 记忆 schema MUST 含 `confidence` (0-1)、`tags`、`related[]`、`provenance` 字段 | P1 |
| FR-L1-05 | `recall` SHOULD 支持向量语义检索（默认本地 ONNX BGE-small） | P2 |
| FR-L1-06 | 接通 CLI 命令：`palace`/`leaf`/`relate`/`tidy`/`stats`/`forget`/`audit`/`teach` | P1 |
| FR-L1-07 | `import` MUST 能从外部目录导入 markdown 笔记（用于 Serena 历史迁移） | P0 |
| FR-L1-08 | 现有 `~/.loci/index.json` 数据 MUST 平滑升级，不丢失 | P0 |

### 5.2 Layer 2 (Federation) FR

| ID | Requirement | Priority |
|---|---|---|
| FR-L2-01 | 适配器接口（`MemoryAdapter`）MUST 至少暴露 `list/get/put/delete/search/capabilities` | P0 |
| FR-L2-02 | 适配器注册 MUST 通过 YAML 声明 + 代码挂载，新增适配器不改核心 | P0 |
| FR-L2-03 | M1 必须实现的适配器：`claude-code`、`codex`、`cursor`、`serena`、`lessons-learned`、`loci-self` | P0 |
| FR-L2-04 | M2 应实现：`opencode`、`gemini-cli`、`anthropic-memory`、`compound-docs`、`note` | P1 |
| FR-L2-05 | `loci search` MUST 并发查所有已注册源，单源超时不阻塞 | P0 |
| FR-L2-06 | `loci get/post` MUST 支持 `<source>:<resource-type>` 寻址 | P0 |
| FR-L2-07 | `loci migrate` MUST 默认 dry-run，需显式 `--apply` | P0 |
| FR-L2-08 | `loci sync` MUST 增量；MUST 支持 `--rebuild` 全量 | P1 |
| FR-L2-09 | `loci sources detect` SHOULD 自动扫描已知工具的 well-known 路径 | P1 |
| FR-L2-10 | 适配器读操作 MUST 是只读（不能误改原工具数据），写操作要醒目确认 | P0 |

### 5.3 接口/集成 FR

| ID | Requirement | Priority |
|---|---|---|
| FR-IF-01 | MUST 提供 CLI 入口（`loci <subcommand>`） | P0 |
| FR-IF-02 | MUST 提供 MCP server 入口（让 Claude Code/Cursor 直接调） | P0 |
| FR-IF-03 | MCP MUST 暴露 `loci_remember`、`loci_recall`、`loci_search`（联合）三个核心工具 | P0 |
| FR-IF-04 | MCP SHOULD 暴露 `loci_get`、`loci_post`、`loci_sources_list` | P1 |
| FR-IF-05 | MAY 提供 REST API（出于跨进程脚本调用） | P3 |

---

## 6. Non-Functional Requirements

### 6.1 性能

| 指标 | 目标 | 上限 |
|---|---|---|
| `loci remember` 端到端 | < 200ms | 1s |
| `loci recall`（L1，纯 BM25） | < 100ms | 500ms |
| `loci recall`（L1，含向量重排） | < 300ms | 1s |
| `loci search`（L2 联合，5 个源） | < 1s | 2s（超时跳过的源） |
| 索引大小（10k 条记忆） | < 100MB | 500MB |
| 启动冷启动（CLI 第一次调用） | < 500ms | 2s |

### 6.2 可靠性

- L1 写入 MUST 原子（避免半写损坏）
- L2 适配器异常 MUST 不影响其他适配器（隔离）
- 索引损坏 MUST 可由源数据 `--rebuild` 恢复
- 所有写入 MUST 有日志（`~/.loci/log/loci.log`）

### 6.3 可移植性

- MUST 跑在 Windows + macOS + Linux
- MUST 与 Node 18+ 兼容（沿用 loci 现状栈）
- 适配器路径 MUST 可配置（不硬编码 `~/.claude/projects`）

### 6.4 可观测性

- `loci status` MUST 显示：索引条目数、各适配器状态、磁盘占用、最近错误
- `--verbose` SHOULD 输出每个适配器的耗时
- 日志格式：JSONL，方便后续聚合

### 6.5 兼容性

- 现有 `~/.loci/index.json`（loci v1 数据）MUST 无损升级
- 现有 `D:\Works\Vault\vault\.serena\memories\*.md` 通过 `loci import` 导入，原文件不动
- 与 loci 上游（D:\Works\AI\Skills\loci）的关系：fork 或 PR 待 design 阶段决定（见 Open Q5）

### 6.6 安全 / 隐私

- 全部数据本地，无网络出站（可选向量模型加载除外，且本地缓存后离线）
- 不向 LLM API 发送原文（除非用户显式启用 OpenAI embedding 选项）
- 适配器读外部数据 MUST 遵守原工具的文件权限

---

## 7. Adapter Roster（候选清单）

### 7.1 Tier 1 — M1 必须实现（P0）

| 适配器 | 数据源 | 读 | 写 | 备注 |
|---|---|---|---|---|
| `loci-self` | `~/.loci/` (L1 自身) | ✅ | ✅ | 让 L2 联合检索能涵盖 L1 |
| `claude-code` | `~/.claude/projects/*.jsonl`、`~/.claude/CLAUDE.md` | ✅ | ⚠️ 仅追加 CLAUDE.md | 同 episodic-memory 思路 |
| `codex` | `~/.codex/sessions/*.jsonl` | ✅ | ❌ | 同 recall 思路 |
| `cursor` | `~/.cursor/projects/<ws>/agent-transcripts/*.jsonl`、`.cursor/rules/*.mdc` | ✅ | ⚠️ rules 写入 | 新增（recall/episodic 都不支持） |
| `serena` | `<project>/.serena/memories/*.md` | ✅ | ✅ | 你已有大量数据在这里 |
| `lessons-learned` | `<project>/docs/lessons/*.md` + `_index.md` | ✅ | ✅ | shihyuho 风格 |

### 7.2 Tier 2 — M2 应实现（P1）

| 适配器 | 数据源 |
|---|---|
| `opencode` | OpenCode 会话目录（待调研） |
| `gemini-cli` | Gemini CLI 会话 / GEMINI.md |
| `anthropic-memory` | `<project>/CLAUDE.md` + `<project>/memory/` |
| `compound-docs` | `<project>/docs/solutions/<category>/*.md` |
| `note` | `<project>/notepad.md` |
| `recall-db` | `~/.recall.db` (SQLite FTS5)（如果你保留 recall） |
| `episodic-memory-db` | `~/.config/superpowers/conversation-index/db.sqlite`（同上） |

### 7.3 Tier 3 — M3+（P2-P3）

| 适配器 | 数据源 |
|---|---|
| `obsidian` | Obsidian vault |
| `logseq` | Logseq graph |
| `notion` | Notion API（在线） |
| `gstack-learn` | `~/.gstack/projects/*/learnings.jsonl` |

### 7.4 适配器能力声明

每个适配器 MUST 声明 `capabilities`（沿用 loci 现有 `AdapterCapability` schema）：

```yaml
# 示例
name: cursor
read: true
write: false   # transcripts 不能写
search: true   # 支持原生检索
delete: false
incremental_sync: true
scopes: [project, global]
required_paths:
  - "%USERPROFILE%\\.cursor\\projects"
mcp_tool: false
```

---

## 8. Open Questions for Design Phase

需要在 `design.md` 阶段决策的事项（**spec 阶段不下结论**，列出选项与考量即可）：

### Open Q1 — L1 检索引擎选型

| 选项 | 优 | 劣 |
|---|---|---|
| SQLite FTS5（同 recall） | 零依赖、跨平台、CLI 工具成熟 | BM25 之外要自己实现向量 |
| Meilisearch | BM25+typo tolerance 开箱即用 | 多一个进程 |
| Tantivy (Rust binding) | 极快 | 安装复杂 |
| 纯 JSON + 内存索引 | 最简单 | 10k+ 条会慢 |

倾向：**SQLite FTS5**（与现有 recall/episodic-memory 生态一致）。

### Open Q2 — 向量后端

| 选项 | 成本 | 离线 | 质量 |
|---|---|---|---|
| 本地 ONNX BGE-small（同 episodic-memory） | 0 | ✅ | 良 |
| 本地 Ollama embedding | 0 | ✅ | 良-优 |
| OpenAI text-embedding-3-small | $$ | ❌ | 优 |
| sqlite-vec + 本地模型 | 0 | ✅ | 良 |

倾向：**sqlite-vec + 本地 ONNX**（与 L1 检索引擎共用 SQLite）。

### Open Q3 — 与 loci 上游的关系

| 选项 | 优 | 劣 |
|---|---|---|
| **A. Fork** 上游 → loci-v2 | 自由演进 | 偏离上游 |
| **B. PR 回馈** 上游 | 社区共赢 | 节奏慢，需对方 review |
| **C. Plugin** 形式（`loci-extras`） | 上游小核心 + 我加扩展 | 受限于上游接口 |
| **D. 重新命名** 全新工具 | 完全自主 | 失去 loci 生态/品牌 |

倾向：**A 短期 + B 长期**（先 fork 干，能回馈的能力做 PR）。

### Open Q4 — MCP server 部署形态

| 选项 | 说明 |
|---|---|
| 嵌入式（CLI 内含 `loci serve mcp`） | 启动快，单进程 |
| 独立可执行（`loci-mcp-server`） | 与 CLI 解耦，便于受控 |

倾向：**嵌入式**（一个 binary 多角色）。

### Open Q5 — 中央索引 vs 实时联邦

| 选项 | 优 | 劣 |
|---|---|---|
| L2 实时查所有源（无中央索引） | 数据一定最新 | 慢，源多了不行 |
| L2 中央索引（增量同步源摘要） | 快，跨源排序统一 | 需维护，可能陈旧 |
| 混合：高频源用索引 + 低频源实时 | 平衡 | 复杂 |

倾向：**混合**（默认查中央索引，可加 `--live` 实时）。

### Open Q6 — 冲突 / 重复策略

- 同一事实在多个源出现（如 Claude Code 对话 + 我手写笔记）—— 联合检索如何去重？
- 候选策略：（a）展示全部 + 显示来源；（b）按内容 hash 去重；（c）加权折叠
- 待 design 阶段定。

### Open Q7 — 隐私级别

- 是否允许 `loci search` 把请求外发？（默认 no）
- 是否允许某些适配器只在 `--allow-network` 时启用？
- 待 design 阶段定。

---

## 9. Risks & Trade-offs

| 风险 | 影响 | 缓解 |
|---|---|---|
| **R1**: loci 上游短期内大改，fork 偏离过大 | 长期合并困难 | 每周 rebase + 把通用能力 PR 回上游 |
| **R2**: 适配器面太广，M1 范围爆炸 | 上线延期 | 严格按 Tier 1 / Tier 2 分期，M1 只 6 个适配器 |
| **R3**: 现有 `~/.loci/index.json` 用户（含我自己）数据迁移失败 | 数据丢失 | 升级前自动 backup + dry-run preview |
| **R4**: 向量索引在大语料下慢 | 召回延迟超标 | 默认 BM25 主路径，向量作为可选重排 |
| **R5**: MCP 工具被 AI 滥写垃圾记忆 | 索引污染 | `loci_remember` 必须带 confidence + tags + 后台 audit |
| **R6**: 不同 IDE 会话格式频繁变化（Cursor/Codex 升级） | 适配器频繁失效 | 适配器写测试 + 错误隔离 + `loci sources health` 检测 |
| **R7**: 用户（lup）研究/使用兴趣转移，loci v2 开发停滞 | 项目烂尾 | M1 范围严格压到 1-2 周可见雏形，每个 milestone 都"可独立用" |

---

## 10. Roadmap（Milestones）

每个 milestone **MUST 自包含、可独立使用**，避免"全做完才能用"的陷阱。

### M1 — Engine MVP（目标：1 周）

**Deliverable**: 能用的强化 L1，已有数据迁入。

- [ ] 修复 `loci remember` 写入宫殿+叶子+索引（不止 JSON）
- [ ] 修复 `loci recall` 启用 retrieval.ts 加权
- [ ] 接通 `palace`/`leaf`/`stats`/`forget` 4 个常用命令
- [ ] 实现 `loci import` 导入 `D:\Works\Vault\vault\.serena\memories\`
- [ ] 平滑升级现有 `~/.loci/index.json`
- [ ] 基础测试覆盖

**Done = lup 把 Serena 笔记导入 + 用 `loci recall` 能找到，且不破坏现有 loci v1 数据。**

### M2 — Engine Plus（目标：+3-5 天）

**Deliverable**: 检索质量大幅提升。

- [ ] 引入 SQLite FTS5 副本索引
- [ ] schema 扩展 `confidence`/`tags`/`related[]`/`provenance`
- [ ] `loci tidy` / `loci audit` 接通
- [ ] CLI `--verbose` 显示评分细节

**Done = `loci recall` 命中 top-3 主观满意度 ≥ 80%。**

### M3 — Federation Core（目标：+1 周）

**Deliverable**: L2 雏形，5 个适配器 + 联合检索。

- [ ] 完成适配器框架（注册/能力声明/隔离/超时）
- [ ] Tier 1 适配器：`loci-self` / `claude-code` / `codex` / `cursor` / `serena` / `lessons-learned`
- [ ] `loci sources list/detect/health`
- [ ] `loci search`（联合）
- [ ] `loci get`（按 `source:type` 寻址）

**Done = `loci search "X"` 同时返回我手写记忆 + Claude Code 对话 + Cursor transcripts。**

### M4 — Federation Plus（目标：+5 天）

**Deliverable**: 写入与迁移。

- [ ] `loci post`（可写适配器）
- [ ] `loci migrate`（dry-run + apply）
- [ ] `loci sync` 增量
- [ ] MCP server 暴露 3-5 个核心工具
- [ ] 在 Claude Code、Cursor、Codex 三个 IDE 各自验证 MCP 可用

**Done = AI Agent 能在任意 IDE 通过 MCP 主动写记忆 / 查记忆。**

### M5 — Engine Vector & Polish（目标：+1 周）

- [ ] sqlite-vec 集成
- [ ] 本地 ONNX BGE 嵌入
- [ ] 向量 + BM25 混合排序（RRF 或加权）
- [ ] Tier 2 适配器：`opencode`/`gemini-cli`/`anthropic-memory`
- [ ] 文档：用户手册 + 适配器编写指南

### M6+（未来）

- 团队/云同步
- Web UI
- 更多适配器（Obsidian/Logseq/Notion）

---

## 11. Acceptance / Done 总闸

loci v2 v1.0 视为达成需同时满足：

1. ✅ M1-M4 全部 Done = 核心场景全跑通
2. ✅ 我自己的 Serena 笔记全部已导入并可被精准召回
3. ✅ Claude Code、Cursor、Codex 三家 IDE 通过 MCP 调 `loci_recall`/`loci_remember` 全部成功
4. ✅ `loci search "<典型查询>"` 在 1s 内返回 ≥ 5 个跨源结果，相关性主观打分 ≥ 4/5
5. ✅ 数据迁移路径明确：从 loci v2 能 export 回 markdown，避免 lock-in

---

## 12. Approval / Review Checklist

在进入 `design.md` 阶段前，spec 文档应被以下视角审过：

- [ ] **范围合理性**：M1-M4 是否过大？哪个 milestone 可砍？
- [ ] **优先级**：Tier 1 适配器是否选对？OpenCode 真的 P1？
- [ ] **技术约束**：Open Q1-Q7 是否要在此 spec 阶段先拍板某些？
- [ ] **资源约束**：lup 业余时间能投入多少？M1 1 周现实吗？
- [ ] **退出策略**：如果 M1 后兴趣转移，loci v1 → loci v2 的迁移能不能停在中途？
- [ ] **风险**：R1-R7 是否还有遗漏？

---

## Appendix A：术语表

| 术语 | 定义 |
|---|---|
| **Memory Palace / 宫殿** | 顶层主题分类（`palaces/<scope>/`） |
| **Leaf / 叶子** | 单条事实，存为宫殿 markdown 内的 H2 节 |
| **Index** | 中央索引（`~/.loci/index.json` 或 SQLite） |
| **Adapter / 适配器** | 把外部记忆源映射成统一接口的代码模块 |
| **Source / 源** | 一个记忆来源（如 `claude-code`、`serena`） |
| **Federation / 联邦** | L2 跨源访问的聚合层 |
| **Engine / 引擎** | L1 自身的记忆读写检索系统 |

## Appendix B：参考文档

- 比较研究：`D:\Works\Vault\vault\.serena\memories\meta-memory-skills-comparison.md`
- 上游 loci：`D:\Works\AI\Skills\loci\` (尤其 `SKILL.md` + `src/adapters/` + `src/core/retrieval.ts`)
- recall 实现：`D:\Works\AI\Skills\recall\scripts\recall.py`
- episodic-memory 实现：`D:\Works\AI\Skills\episodic-memory\skills\remembering-conversations\src\`
- lessons-learned 实现：`D:\Works\AI\Skills\shihyuho-skills\plugins\lessons-learned\`

---

**End of Spec v0.1.**
**下一步**：阅读后给反馈，调整后我会写 `design.md`（含组件图、数据流、接口签名、文件布局）。
