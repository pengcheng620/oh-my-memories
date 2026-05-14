# Product Formation — oh-my-memories

**Date**: 2026-05-14
**Status**: Decision Brief — 4 个项目级问题待用户拍板

---

## 用户原话 (整理)

### 结构: **3 层 × 2 件事** (替代之前的 Layer 1/2/3 提法)

```
                       事件 1                      事件 2
                  跨工具迁移和调用              我们自己的记忆设计
                ────────────────              ──────────────────
AI 工具         CC, Cursor, Codex,                       (不参与)
                Gemini, OpenClaw, ...
                  ▲ 适配器 (Cat A)
                  │
第三方工具       Serena, mem0, Letta,                    (不参与)
                Zep, basic-memory ...
                  ▲ 适配器 (Cat B/C)

我们自己          loci/oh-my-memories                    引擎 (L2 我们自己)
                  作为 federation/migration              SQLite + FTS5 + sqlite-vec
                  的 hub                                   服务 Cursor/Codex/Gemini
                                                          这种"无原生记忆"的工具
```

### 4 个待决问题

1. **改名 `oh-my-memories`** — 是否确认?
2. **新项目 vs 在 loci 改** — fork 重起 还是 in-place rebrand?
3. **产品形态** — 4 选 1 (Skill / CC Plugin / gstack-style skills 套件 / CLI + skills)
4. (隐含) 项目结构 / 命令族设计

---

## 决策 1 — 项目命名

### 推荐: **`oh-my-memories`** ✓ (你提的)

**理由**:
- 致敬 oh-my-zsh / oh-my-codex (omx) 命名系列, 一眼能记
- 复数 `memories` 体现"管多源"卖点 (vs 单数 `memory` 给人感觉只一处)
- 比"loci v2"更可对外讲 — "I help you manage all your AI memories"
- 短名 `omm` 可作 CLI 别名 (类似 omx, oh-my-zsh 的 `omz`)

**npm namespace 验证结果** (2026-05-14):
- ✅ `oh-my-memories` — **可用** (registry 404)
- ❌ `omm` — 被 2014 年的 [OMM (HTML mapper)](https://github.com/BernhardBezdek/omm) 占了 (14 weekly downloads, 不能用)
- ✅ `omem` — **可用** (registry 404), 推荐作为 CLI binary 短名替代 `omm`

**最终命名建议**:
- npm 包: `oh-my-memories`
- CLI binary 主名: `oh-my-memories` (太长?)
- CLI binary 别名: **`omem`** (推荐, 4 字母, 与 `omm` 无歧义, 可用)
- GitHub: `oh-my-memories/cli` (创建 org 多包结构) 或 `lup/oh-my-memories` (single repo, 个人 owner)

---

## 决策 2 — 新项目 vs 在 loci 上改

| 选项 | 优 | 缺 |
|------|---|---|
| **A: 新项目 `oh-my-memories/`** (clean slate) **(推荐)** | ✅ 名字/架构/哲学全重做, 0 包袱<br>✅ loci 标 deprecated 留作 prior art<br>✅ 跨平台 / monorepo 结构自由设计 | ❌ 老 loci 用户 (若有) 不自动迁移<br>❌ git 历史断 (但可在 README 写 "successor of loci") |
| **B: loci 仓库 in-place rebrand** | ✅ git 历史延续<br>✅ 老 stargazers 跟来 | ❌ 99% breaking change 等于全重写<br>❌ 名字、目录结构、package.json 全改, 不如新建<br>❌ 现 loci.json/sqlite 等格式 deprecated, 难解释 |
| **C: 在 loci 内开 v2/ mono** | ✅ 单仓库管两阶段 | ❌ 仓库名 vs 包名冲突 (loci/v2 → 包叫 oh-my-memories?)<br>❌ 给后人添麻烦 |

**推荐: A — 新项目 `oh-my-memories/`**

**理由**:
- 名字变了 + 范围变了 + 哲学变了 = 实质上新产品
- npm 上反正要发新名 (`oh-my-memories` ≠ `loci`), 不如新仓库一气呵成
- 现 loci (`D:\Works\AI\Skills\loci`) **不删**, README 加一行 "Superseded by [oh-my-memories](...)"
- 老 loci 的 `remember/recall` 思路在新项目里**作为 L2 (我们自己) 的引擎实现部分**直接借鉴

**Action 落地**:
- 新位置: `D:\Works\AI\Skills\oh-my-memories\` (与 loci 平级)
- 现 `D:\Works\AI\Skills\loci-v2\` 的 specs/research/E-tool-inventory 全迁过去
- loci v1 留原地, 加 deprecated note

---

## 决策 3 — 产品形态 (4 选 1)

| 选项 | 描述 | 推荐? |
|------|------|------|
| **(a) 单一 Claude Skill** | `oh-my-memories/SKILL.md` 一个文件, Claude/Cursor 调用 | ❌ 不可行, scan/migrate 需要持久化和外部进程 |
| **(b) Claude Code Plugin** | 走 plugin manifest, 只 CC 用 | ❌ 与 verdict L1 卖点冲突 (要服务 Cursor/Codex/Gemini) |
| **(c) gstack-style skills 套件** | `init / doctor / upgrade / 一堆 skill` 但**仍 Claude 生态** | ⚠️ 限制了 Cursor 用户 |
| **(d) CLI + skills 混合 (类 gstack 完整套件)** **(推荐)** | CLI 是真主体, MCP 是 CLI 子命令, skills 是给各 IDE 的 thin wrapper | ✅ |

### 推荐: **D — CLI + skills + MCP** (类 oh-my-codex 形态)

**关键理由**:
- **CLI 是真主体**: `omm scan`, `omm recall --all`, `omm migrate ...` — 与 IDE 解耦, 在任何终端能用
- **MCP server 是 CLI 子命令** (`omm mcp serve`) — 给 IDE 内 AI 用
- **Skills 是 thin wrapper**: 每个 IDE 一个 SKILL.md (Claude / Cursor / Codex / Gemini), 内容 = 调 CLI 的 prompt template + 一两个示例
- **gstack 套件式工具链**: `doctor / upgrade / init / config / skills install ...` — 用户体验对齐 omx/gstack
- **单一 npm + 单一 binary** + cross-platform (macOS/Linux/Windows)

### 项目结构 (推荐)

```
oh-my-memories/                       # GitHub repo + npm package
├── packages/
│   ├── cli/                          # 主入口, ts → bin/omm
│   │   ├── src/commands/             # init / scan / recall / migrate / doctor / ...
│   │   └── bin/omm                   # entry shebang
│   ├── core/                         # 引擎 (M3 起 SQLite + FTS5 + sqlite-vec)
│   │   ├── src/index.ts
│   │   ├── src/canonical-store.ts
│   │   └── src/retrieval.ts
│   ├── mcp/                          # MCP server (依赖 core), `omm mcp serve` 调它
│   │   └── src/server.ts
│   └── adapters/                     # Cat A/B/C 各自包
│       ├── claude-code/
│       ├── cursor/
│       ├── codex/
│       ├── serena/
│       ├── basic-memory/
│       └── README.md (Plugin SDK 说明)
├── skills/                           # 各 IDE 的 thin wrapper
│   ├── claude-code/SKILL.md          # for Claude Code
│   ├── cursor/SKILL.md               # for Cursor
│   ├── codex/SKILL.md                # for Codex
│   └── gemini/SKILL.md               # for Gemini CLI
├── docs/
│   ├── README.md
│   ├── ARCHITECTURE.md
│   ├── MIGRATION.md                  # CC → Cursor / 各种迁移路径
│   └── ADAPTER-SDK.md                # 第三方写 adapter 的指南 (M4)
├── tests/
├── package.json                      # workspace root, monorepo (pnpm/bun)
├── tsconfig.json
└── LICENSE
```

### CLI 命令族 (M1+M2 起)

> **CLI binary**: `omem` (短名, 推荐) 或 `oh-my-memories` (全名, 二者皆可指向同一 entry)
> **配置/数据目录**: `~/.omem/` (Mac/Linux), `%USERPROFILE%\.omem\` (Windows)

| 命令 | M1/M2/M3+ | 用途 |
|------|----------|------|
| `omem init` | M1 | 首次 setup: 扫机器 + 写 `~/.omem/config.json` + 装 skills |
| `omem scan [--json]` | M1 | List memory sources (Cat A/B 适配器自动发现) |
| `omem recall <query> [--all\|--source=cc]` | M1 | 跨源召回, 默认当前源, `--all` 跨全部 |
| `omem migrate --from <src> --to <tgt> [--dry-run\|--apply] [--strategy=...]` | M2 | 数据迁移 |
| `omem mcp serve` | M1 | 启动 MCP server (stdio), 给 IDE AI 用 |
| `omem mcp install --ide=cursor\|claude\|codex` | M1 | 自动写 IDE MCP 配置 (`.cursor/mcp.json` 等) |
| `omem skills install --ide=cursor\|claude\|codex` | M1 | 自动 link skill 到 IDE |
| `omem doctor` | M1 | 诊断: 路径权限 / 版本 / 依赖 / 哪些 adapter 工作 |
| `omem upgrade` | M2 | 自更新 (npm i -g 包装 + changelog 显示) |
| `omem config get/set <key>` | M1 | 读写 `~/.omem/config.json` |
| `omem remember <text>` | M3 | 主动记忆 (写入 L2 我们自己的引擎) — 服务无原生记忆 IDE |
| `omem export --all` | M2 | 导出全部记忆为单一归档 (备份) |
| `omem import <archive>` | M2 | 导入归档 |

### Skills (thin wrapper) 形态

每个 IDE 一个 SKILL.md, 内容统一模板:

```markdown
---
name: oh-my-memories
description: Recall AI memories across all your tools (CC/Cursor/Codex/Serena/...)
---

When the user asks to recall something they discussed before, search across
all their AI memory sources via `omm recall --all "<query>"`.

Examples:
- 用户问 "我们之前讨论过 X 吗?" → `omm recall --all "X"` → 返回 top 10
- 用户说 "把 CC 的记忆搬到 Cursor" → `omm migrate --from cc --to cursor --dry-run` → 显示报告 → 确认后 `--apply`

Install: `npx oh-my-memories init` (one time)
```

---

## 决策 4 — 项目实现起点

依赖前 3 个决策。如果都按推荐走 (`oh-my-memories` / 新项目 A / 形态 D):

### M1 worktree (调整后)

按 eng-review-verdict 的 5 lane 并行结构, 但前置加 1 个 lane:

```
Lane 0 (单独, 阻塞): monorepo scaffold
  - oh-my-memories/ 仓库初始化
  - pnpm/bun workspace + package.json 骨架
  - tsconfig + lint + test runner (vitest)
  - bin/omm 占位符
  - CI workflow (build + test on push)
  - README + LICENSE

Lane A (Lane 0 后): packages/core 接口 + 2 Cat A adapters (CC, Cursor)
Lane B (A 后并行): packages/adapters/ (codex, serena)
Lane C (A 后并行): packages/cli/commands/scan + safety/denylist
Lane D (A 后并行): packages/cli/commands/recall + 时间合并
Lane E (A 后并行): packages/mcp/ + `omm mcp serve` / `omm mcp install`
Lane F (A 后并行): packages/cli/commands/init + doctor + config
Lane G (E + skills 模板): skills/ 各 IDE thin wrapper + `omm skills install`
```

---

## 用户已确认的决策 (round 2)

- ✅ Q1 名字: `oh-my-memories` (npm), `omem` (CLI)
- ✅ Q2 新项目 (clean repo)
- ✅ Q3 产品形态 D
- ✅ Q5 文档全迁 + 确保新 AI 对话能秒懂
- ✅ Q6 老 loci 不管
- ✅ Q7 doctor/upgrade 按推荐 (M1 init+scan+recall+mcp; M2 doctor+upgrade)
- ✅ Q8 GitHub: `pengcheng620/oh-my-memories`

## 用户提出的新问题 (round 2)

- **Q9 语言**: Python / JS / Rust 三选一 — 之前默认 TS, 用户重新质疑
- **Q10 MCP 是否必须** — 重新质疑 eng-review A4 推荐
- **Q11 完美目录结构 + 规则文件**: 满足代码洁癖, 新 AI 秒懂

---

## Q9 — 语言选型 (TS/Node, Python, Rust)

### 三选一对比矩阵

| 维度 | TS/Node (Bun) | Python | Rust |
|------|--------------|--------|------|
| MCP SDK 成熟度 | ✅ 官方 v1.x 完整 | ✅ 官方 `mcp` 完整 | ⚠️ 社区 `rmcp`, 不官方 |
| 包管理用户体验 | ✅ `npm i -g`, 全平台 | ⚠️ pip/uv, Windows 痛 | ⚠️ `cargo install` 慢 / 二进制下载 |
| CLI 启动延迟 | 100ms (Node), 30ms (Bun) | 200ms+ | **1ms** |
| 跨平台单一 binary | ⚠️ 需 pkg/bun build | ⚠️ PyInstaller 复杂 | ✅ 原生 |
| Adapter 实现速度 | ✅ ~80 LoC/adapter | ✅ ~80 LoC | ⚠️ ~150 LoC |
| Embedding 模型生态 (M3+) | ⚠️ fastembed/transformers.js | ✅ **最强** (BGE-M3) | ⚠️ candle/ONNX |
| 现 loci 借鉴 | ✅ 是 TS | ❌ | ❌ |
| AI 工具生态主流 (CC/Cursor/Codex) | ✅ 都是 TS | ✅ 部分 | ❌ |
| 类型严格度 (你的洁癖) | ⚠️ TS strict 模式可控 | ⚠️ Python type hint 弱 | ✅ **最严** |
| 跨平台路径处理 | ✅ Node fs+path | ✅ pathlib | ✅ std::path |

### 推荐: **TypeScript + Bun runtime** 

**理由排序**:
1. **MCP SDK 官方支持** — 官方 SDK 是 TS/Python 二选一; Rust 是社区
2. **现 loci 思路可直接借鉴** — 不用从 0 重写 retrieval 逻辑
3. **AI 工具用户都装了 Node** (装 CC/Cursor 已附带), `npm i -g omem` 体验最顺
4. **Bun runtime** = Node 兼容 + 内置 SQLite + 启动快 3x + Windows 支持好
5. Adapter 开发速度对 M1 (5 个适配器) 至关重要

**Rust 的诱惑**: 1ms 启动 + 完美类型 + 单 binary。**但**:
- MCP Rust SDK 不官方 = 升级跟不上 Anthropic
- M3 引 embedding 模型时 Rust 生态薄弱
- M1 5 个 adapter 速度差 2x = 2 周变 4 周

**Python 的诱惑**: M3+ embedding 生态最强。**但**:
- Windows 安装 sqlite-vec/fastembed/onnxruntime 痛苦
- pip 全局 CLI 是反模式 (uv 改善但仍非主流)
- 启动延迟 2x Node

**最终建议**: **TypeScript (strict mode) + Bun runtime + 单 binary 备选** (用 `bun build --compile` 打包成 macOS/Linux/Windows 二进制, 顶级用户 `cargo install` 风格也可享)。

---

## Q10 — MCP 是否必须 (重新评估 A4)

### 反思

**之前 A4 推荐**: M1 同时 ship MCP server (1 tool: `recall_across_sources`), +100 LoC

**用户问"是否必须"**, 这是个好质疑. 让我列两面:

| MCP 必须的理由 | MCP 可延后的理由 |
|---------------|----------------|
| IDE 内 AI agent 只能通过 MCP 用 tool, 不能跑 CLI | M1 单 CLI 用户先验证价值是否真存在 |
| L1 卖点 ("管理别人的记忆") 真实形态 = AI 自动用 → 必须 MCP | MCP 配置首次烦 (每个 IDE `mcp.json` 写不同) |
| Cursor/CC 用户实际的 "AI 知道用什么找" 问题, 不靠 MCP 解决不了 | M1.5 (M1 跟一周后) 跟上 MCP 也来得及 |
| MCP server 共享 retrieval core, +100 LoC 不重 | 工程上每多 1 模块, 测试 + DX surface ↑ |

### 推荐: **M1 一起 ship MCP** (维持 A4)

但**接受妥协方案**: 如果用户觉得 M1 太重, MCP 推到 **M1.5** (M1 后立即跟一周)。

**判断关键**: 测试 M1 时, 你自己 (lup) 第一次想"看 omem 行不行" 是从哪开始?
- A. 在 Cursor 里问 "你能召回我之前在 CC 讨论的 X 吗?" → **必须 MCP, M1 必带**
- B. 在终端跑 `omem recall --all "X"` → CLI 即可, MCP 可缓

我赌你的体验是 A (因为你的痛点描述就是 "Cursor 找不到"), 所以 **M1 带 MCP**。

但你自己拍。

---

## Q11 — 完美目录结构 + 规则文件 (满足洁癖)

### 完整目录结构 (推荐)

```
oh-my-memories/                         # GitHub: pengcheng620/oh-my-memories
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                      # build + test on push/PR
│   │   ├── release.yml                 # auto npm publish on tag
│   │   └── codeql.yml                  # security scan
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   ├── feature_request.md
│   │   └── adapter_request.md
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── CODEOWNERS
├── .cursor/
│   ├── rules/
│   │   ├── monorepo.mdc                # 项目结构规则
│   │   ├── adapter-design.mdc          # adapter 写法
│   │   ├── testing.mdc                 # 测试规则
│   │   └── conventions.mdc             # 命名/格式
│   └── mcp.json                        # 自食其用 omem MCP (dogfood)
├── .claude/
│   ├── skills/                         # 项目内 dogfood skills
│   └── settings.local.json
├── .vscode/
│   ├── settings.json
│   └── extensions.json
├── packages/
│   ├── cli/                            # @oh-my-memories/cli (主入口)
│   │   ├── src/
│   │   │   ├── commands/               # 每命令一文件 (N=14, M1+M2)
│   │   │   ├── output/                 # table / json / pretty 输出格式
│   │   │   ├── safety/                 # denylist (auth.json, *.pem, .env*)
│   │   │   ├── platform/               # Windows/macOS/Linux 路径分发
│   │   │   ├── index.ts                # entry, command dispatch
│   │   │   └── types.ts
│   │   ├── tests/
│   │   ├── bin/omem                    # shebang
│   │   ├── package.json
│   │   └── README.md
│   ├── core/                           # @oh-my-memories/core (引擎)
│   │   ├── src/
│   │   │   ├── canonical-store.ts      # SQLite + FTS5 (M3+)
│   │   │   ├── retrieval.ts            # query engine + RRF (M3+)
│   │   │   ├── inventory.ts            # scan logic
│   │   │   ├── federation.ts           # cross-source merge (M1: BM25 + 时间倒序)
│   │   │   └── index.ts
│   │   ├── tests/
│   │   ├── package.json
│   │   └── README.md
│   ├── mcp/                            # @oh-my-memories/mcp
│   │   ├── src/
│   │   │   ├── server.ts               # stdio entry
│   │   │   ├── tools/
│   │   │   │   ├── recall_across_sources.ts  # M1
│   │   │   │   ├── scan_sources.ts           # M1.5
│   │   │   │   └── migrate.ts                # M2
│   │   │   └── install.ts              # 写 IDE mcp.json
│   │   ├── tests/
│   │   ├── package.json
│   │   └── README.md
│   ├── adapters/                       # 多 adapter 子包目录
│   │   ├── claude-code/                # M1
│   │   ├── cursor/                     # M1
│   │   ├── codex/                      # M1
│   │   ├── serena/                     # M1
│   │   ├── basic-memory/               # M2
│   │   ├── gemini-cli/                 # M2
│   │   └── _shared/                    # adapter 共用 utils
│   └── adapter-sdk/                    # @oh-my-memories/adapter-sdk
│       ├── src/                        # IBaseAdapter / IIdeAdapter / IMcpAdapter / ISaasAdapter
│       ├── docs/
│       └── package.json
├── skills/                             # IDE thin wrapper SKILL.md (调 omem CLI)
│   ├── claude-code/
│   │   ├── SKILL.md
│   │   └── examples/
│   ├── cursor/
│   │   ├── SKILL.md
│   │   └── examples/
│   ├── codex/
│   │   ├── SKILL.md
│   │   └── examples/
│   └── gemini/
│       ├── SKILL.md
│       └── examples/
├── docs/                               # 高层文档
│   ├── README.md                       # docs 索引
│   ├── PRODUCT.md                      # !!! 3 层 × 2 件事卖点
│   ├── ARCHITECTURE.md                 # 系统架构 + 数据流图
│   ├── MIGRATION.md                    # 迁移路径详解
│   ├── ADAPTER-SDK.md                  # 第三方 adapter 开发指南
│   ├── ROADMAP.md                      # M1/M2/M3+ 路线
│   └── images/
├── specs/                              # SDD specs (从 loci-v2 迁来)
│   ├── README.md                       # specs 索引
│   ├── spec.md                         # 主 spec (重写)
│   ├── ceo-review-verdict.md
│   ├── eng-review-verdict.md
│   ├── product-formation.md            # 本文件
│   └── devex-review-verdict.md         # M1 实现前补
├── research/                           # 研究记录 (从 loci-v2 迁来)
│   ├── README.md                       # research 索引
│   ├── A-data-sources.md
│   ├── B-tech-stack.md
│   ├── D-market-scan.md
│   ├── E-tool-inventory.md
│   ├── F-unknowns.md
│   └── SUMMARY.md
├── examples/                           # 端到端 demo
│   ├── recall-cc-from-cursor.md
│   ├── migrate-cc-to-cursor.md
│   └── README.md
├── tests/                              # E2E + integration tests
│   ├── e2e/
│   ├── integration/
│   └── fixtures/
├── scripts/                            # build / release / dev scripts
│   ├── publish.ts
│   ├── pretest.ts
│   └── version-bump.ts
├── AGENTS.md                           # !!! 新 AI 第一个看的 (项目总入口)
├── CLAUDE.md                           # !!! Claude Code / Cursor 用
├── GEMINI.md                           # !!! Gemini CLI 用
├── CONTRIBUTING.md                     # 贡献指南
├── CODE_OF_CONDUCT.md
├── CHANGELOG.md
├── LICENSE                             # MIT
├── README.md                           # repo 入口 (人类用)
├── package.json                        # workspace root (Bun)
├── tsconfig.json
├── tsconfig.base.json                  # 各包继承
├── biome.json                          # lint + format (替代 eslint+prettier)
├── bunfig.toml                         # Bun 配置
├── .gitignore
├── .gitattributes
├── .editorconfig
├── .nvmrc                              # Node 版本 (Bun fallback)
├── .npmrc                              # registry / scope
└── VERSION                             # 单一 version source
```

### 规则文件 Tier 设计 (新 AI 秒懂)

**Tier 1 — 顶层入口 (按"新 AI 看的顺序"排序)**:
1. **`AGENTS.md`** — 30 行 elevator pitch + 3 层 × 2 件事 ASCII + 每包一句话职责 + "必读链表"。所有 AI agent 第一个看 (Codex 标准)。
2. **`CLAUDE.md`** — Claude Code / Cursor 项目规则 (gstack 风格): 命令规范 / 代码风格 / 测试要求 / 当前 M1 状态
3. **`GEMINI.md`** — Gemini CLI 项目规则
4. **`README.md`** — 人类用户入口 (Quick start + Demo gif + 链 docs)

**Tier 2 — IDE 规则细节**:
- `.cursor/rules/monorepo.mdc` — 哪个改动该在哪个 packages
- `.cursor/rules/adapter-design.mdc` — 写新 adapter 的模板
- `.cursor/rules/testing.mdc` — 测试要求 (≥80% unit, 100% E2E pipeline, 1 eval scenario)
- `.cursor/rules/conventions.mdc` — 命名 (kebab-case 文件 / camelCase 函数 / PascalCase 类型) + 格式 (biome)

**Tier 3 — 流程文档 (深入用)**:
- `specs/spec.md` — 主 spec (M1 acceptance criteria 写在这)
- `docs/PRODUCT.md` — 产品哲学 (L1/L2/L3 卖点 + 反 mem0 反 Letta 定位)
- `docs/ARCHITECTURE.md` — 数据流图 (ASCII), Adapter 接口设计

### `AGENTS.md` 应有结构 (你强调"新 AI 秒懂")

```markdown
# oh-my-memories — Agent Context

## What is this?
oh-my-memories (CLI: `omem`) is a hub that manages, federates, and migrates
memories across all your AI tools (Claude Code, Cursor, Codex, Gemini, Serena,
mem0, ...). Built because the same context recall that "just works" in CC
fails in Cursor — the AI doesn't know which folder to look in.

## 3 Layers × 2 Things

(ASCII 表 — 上面那个)

## Packages (one-liner per package)

- packages/cli/         — `omem` CLI binary
- packages/core/        — Storage engine (SQLite + FTS5 + sqlite-vec, M3+)
- packages/mcp/         — MCP server (stdio), give IDE AI federated recall
- packages/adapters/    — Cat A/B/C source adapters (one subpackage each)
- packages/adapter-sdk/ — Public interface for 3rd-party adapters

## "Read in order" for new AI sessions

1. AGENTS.md (this file) — 5 min
2. docs/PRODUCT.md — 5 min, 卖点 + 反竞品定位
3. docs/ARCHITECTURE.md — 10 min, 数据流图
4. specs/spec.md — 15 min, M1 acceptance criteria
5. .cursor/rules/*.mdc — 5 min, 写代码风格

## Current Status

- Milestone: **M1** (Inventory + Read-only Federation + MCP server)
- Branch: `main`
- Open milestones: see `docs/ROADMAP.md`

## How to run

- Test: `bun test`
- Build: `bun run build`
- Lint: `bunx biome check`
- Local dev: `bun run packages/cli/bin/omem -- scan`
```

### 项目级 dogfood

把 `oh-my-memories/.cursor/mcp.json` 配上自己 (`omem mcp serve`), 这样 Cursor 在 oh-my-memories repo 里写代码时就用 omem 召回过去讨论 — **自食其用作为最强 e2e 测试**。

---

## 决策汇总 (round 2)

| # | 问题 | 我的推荐 | 待确认 |
|---|------|---------|--------|
| Q9 | 语言 | **TS + Bun (strict mode + 单 binary 备选)** | 用户拍 |
| Q10 | MCP M1 ship 还是 M1.5 ? | **M1 一起 ship** (你的痛点描述要求) | 用户拍 |
| Q11 | 目录结构 | 上面 (满足洁癖) | 用户 review 是否 ok |
| Q12 | AGENTS.md 结构 | 上面模板 | 用户 review |
| Q13 | dogfood (.cursor/mcp.json 配自己) | ✅ 是 | 用户拍 |

---

## 这 4 个决策对前面 verdict 的影响

| 文档 | 影响 | Action |
|------|------|------|
| `ceo-review-verdict.md` | 主线不变 (3 层定位 / Migration 主卖点) | 加一句"产品形态 = CLI + MCP + skills (类 omx)" |
| `eng-review-verdict.md` | A1-A7 决策全部仍有效 | M1 lane 加 Lane 0 (monorepo scaffold) |
| `spec.md` | 主版本号升 v2 → v1 (oh-my-memories 是新产品) | 重写 (按 ceo + eng + product-formation 三个 verdict) |
| `research/E-tool-inventory.md` | 不变 | 迁到新项目 |
