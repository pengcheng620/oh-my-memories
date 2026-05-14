# Tool Inventory — loci v2 Market Scan

> **Date**: 2026-05-14
> **Scope**: Cat A = AI IDE/CLI with on-disk transcripts or first-party "memory"; Cat B = third-party memory MCP/SaaS/libraries. **loci v2** itself out of scope.
> **Stars / popularity**: order-of-magnitude from public GitHub + web listings **as of scan**; re-check live counters before prioritization.
> **Deep path evidence (Claude / Codex / Cursor / Serena / recall / OpenCode / Anthropic memory plugin)**: see `A-data-sources.md`, `D-market-scan.md`, `F-unknowns.md` — **not duplicated here**.

---

## TL;DR

- **Cat A** 调研 **19** 个；**流行度 top 5（综合 GitHub/装机量/心智）**: Zed、Cline、Aider、Continue.dev、Claude Code / Cursor（二者并列一线梯队，按你本机数据量 Cursor+Claude+Codex 最实）。
- **Cat B** 调研 **17** 个；**top 5**: mem0、Serena MCP、Letta、Graphiti（Zep 生态）、Cognee。
- **Migration / Inventory 最容易的 3 条路径**（本地、可枚举、格式友好）:
  1. **Codex** `~/.codex/sessions/**/*.jsonl` + 可选 `logs_*.sqlite`（见 `A-data-sources.md` §A.2）
  2. **Cursor** `~/.cursor/projects/*/agent-transcripts/*.jsonl`（见 `A-data-sources.md` §A.3）
  3. **OpenCode** `~/.local/share/opencode/` JSON + SQLite（见 `F-unknowns.md` §F.1）
- **最难 / 短期 ROI 低**: **GitHub Copilot Chat**、**Sourcegraph Cody**（公共仓库已归档/私有化）、**Amazon Q / Tabnine**（厂商存储不透明）、**Memary** / **Motorhead**（维护弱 or 已弃用）。

---

## Cat A — AI IDE / AI Editor 工具

### A.1 Claude Code

| Field | Value |
|-------|-------|
| **Name** | Claude Code |
| **Source** | https://github.com/anthropics/claude-code / https://docs.anthropic.com |
| **Stars / 流行度** | 官方 CLI；生态大（具体 star 数随发布版变动） |
| **Category** | Cat A |
| **Memory location** | `~/.claude/projects/<project-key>/*.jsonl`（会话）；`history.jsonl`；AUTO `memory/` + `MEMORY.md`（见 `D-market-scan.md` §D.3） |
| **Storage format** | JSONL（事件流）；Markdown（AUTO memory） |
| **Has native export?** | 无统一 `export`；文件即数据，可复制目录 |
| **Has MCP server?** | 本体非 MCP；可配合 MCP 宿主 |
| **Adapter difficulty** | **3 / 5**（事件类型多，需过滤 message 行） |
| **Notes** | 与 loci 最相关的硬证据在 `A-data-sources.md` §A.1。 |

### A.2 Cursor

| Field | Value |
|-------|-------|
| **Name** | Cursor |
| **Source** | https://cursor.com / https://docs.cursor.com |
| **Stars / 流行度** | 闭源商业产品；装机量高 |
| **Category** | Cat A |
| **Memory location** | `~/.cursor/projects/*/agent-transcripts/*.jsonl`；Beta "Memories" 可能涉及云（见 `D-market-scan.md` §D.3） |
| **Storage format** | JSONL（transcript）；Memories 侧未知/部分云端 |
| **Has native export?** | Transcript：文件级复制；产品级导出有限 |
| **Has MCP server?** | **支持 MCP 客户端**（IDE 内配置） |
| **Adapter difficulty** | **2 / 5**（transcript schema 相对规整） |
| **Notes** | 实测体量见 `A-data-sources.md` §A.3。 |

### A.3 Codex CLI

| Field | Value |
|-------|-------|
| **Name** | OpenAI Codex CLI |
| **Source** | https://github.com/openai/codex / https://developers.openai.com/codex |
| **Stars / 流行度** | 高（OpenAI 官方 CLI） |
| **Category** | Cat A |
| **Memory location** | `~/.codex/sessions/**.jsonl`；`logs_*.sqlite`；`~/.codex/memories/`（官方 memories 特性，见 `D-market-scan.md` §D.3） |
| **Storage format** | JSONL；SQLite；本地 Markdown/片段（memories 目录） |
| **Has native export?** | 无专用 export；目录可打包 |
| **Has MCP server?** | 视版本/路线；非核心卖点 |
| **Adapter difficulty** | **2 / 5** |
| **Notes** | 实测 schema 样本见 `A-data-sources.md` §A.2。 |

### A.4 Gemini CLI (gemini-cli)

| Field | Value |
|-------|-------|
| **Name** | Google Gemini CLI |
| **Source** | https://github.com/google-gemini/gemini-cli |
| **Stars / 流行度** | 高（Google 官方） |
| **Category** | Cat A |
| **Memory location** | `~/.gemini/`（配置、OAuth 等）；会话 `~/.gemini/tmp/<project_hash>/chats/`（随版本可能调整） |
| **Storage format** | JSON/片段文件为主（**需按版本验证**） |
| **Has native export?** | 未见一阶 `export` 命令；可复制数据目录 |
| **Has MCP server?** | CLI 侧支持 MCP 生态（OAuth token 文件勿索引） |
| **Adapter difficulty** | **3 / 5** |
| **Notes** | `GEMINI_CLI_HOME` 可改根目录。 |

### A.5 OpenCode CLI

| Field | Value |
|-------|-------|
| **Name** | OpenCode |
| **Source** | https://github.com/anomalyco/opencode |
| **Stars / 流行度** | 中高（开源 agent CLI） |
| **Category** | Cat A |
| **Memory location** | `~/.local/share/opencode/`（`storage/`, `opencode.db` 等） |
| **Storage format** | JSON 分文件 + **SQLite** |
| **Has native export?** | 无标准 export；DB + JSON 可直接读 |
| **Has MCP server?** | 视集成；非本调研重点 |
| **Adapter difficulty** | **2 / 5** |
| **Notes** | Windows 路径与 `auth.json` 跳过策略见 `F-unknowns.md` §F.1。 |

### A.6 OpenClaw

| Field | Value |
|-------|-------|
| **Name** | OpenClaw |
| **Source** | https://github.com/openclaw/openclaw / https://docs.openclaw.ai |
| **Stars / 流行度** | 2026 讨论度高（**请以 GitHub 实时 star 为准**） |
| **Category** | Cat A（个人 AI 助手运行时） |
| **Memory location** | 多模块本地存储；精确目录需查官方 **Memory / Data** 文档（常见为应用数据目录下，**未在本机核验**） |
| **Storage format** | 混合（JSON/SQLite 可能并存） |
| **Has native export?** | 未知；依赖上游文档 |
| **Has MCP server?** | 有 Canvas/集成能力；是否 MCP 服务形态另查 |
| **Adapter difficulty** | **4 / 5**（先锁定官方数据目录再评） |
| **Notes** | 易与 **OpenCode** 混淆；存储模型不同。 |

### A.7 GitHub Copilot (Chat / IDE)

| Field | Value |
|-------|-------|
| **Name** | GitHub Copilot |
| **Source** | https://github.com/features/copilot |
| **Stars / 流行度** | 商业产品；渗透率极高 |
| **Category** | Cat A |
| **Memory location** | IDE/助手状态在 **VS / VS Code / JetBrains** 内部存储；会话细节多为专有格式 + 云端 |
| **Storage format** | 专有（本地 DB/加密/云同步） |
| **Has native export?** | 无面向第三方的 transcript 导出 API |
| **Has MCP server?** | 非开放 MCP 记忆总线 |
| **Adapter difficulty** | **5 / 5**（默认不做，除非官方导出或逆向稳定路径） |
| **Notes** | "Inventory"可做**粗粒度**（已安装否），细粒度内容不承诺。 |

### A.8 Cline

| Field | Value |
|-------|-------|
| **Name** | Cline (原 Claude Dev) |
| **Source** | https://github.com/cline/cline |
| **Stars / 流行度** | **~6万+** star 量级；VS Marketplace 数百万装机 |
| **Category** | Cat A |
| **Memory location** | VS Code **Extension Host** 全局/工作区存储（`globalStorage` / `workspaceStorage`）— **具体键名需抓包或读扩展源码** |
| **Storage format** | JSON/SQLite（Code 侧），不透明 |
| **Has native export?** | 无用户级 export |
| **Has MCP server?** | 扩展可配置 MCP |
| **Adapter difficulty** | **4 / 5** |
| **Notes** | 生态大，但 **on-disk 合同**不公开。 |

### A.9 Roo Code

| Field | Value |
|-------|-------|
| **Name** | Roo Code |
| **Source** | https://github.com/RooVetGit/Roo-Code |
| **Stars / 流行度** | **~2.3万+** star |
| **Category** | Cat A |
| **Memory location** | 同 Cline：**VS Code 扩展存储** |
| **Storage format** | 不透明 |
| **Has native export?** | 无 |
| **Has MCP server?** | 支持 MCP |
| **Adapter difficulty** | **4 / 5** |
| **Notes** | Fork/社区接力维护；存储路径需单独验证。 |

### A.10 Aider

| Field | Value |
|-------|-------|
| **Name** | Aider |
| **Source** | https://github.com/Aider-AI/aider |
| **Stars / 流行度** | **~4.4万+** |
| **Category** | Cat A |
| **Memory location** | 仓库内/用户目录：`CONVENTIONS.md`、`.aider*`、chat 历史视配置 |
| **Storage format** | Markdown / YAML / 文本 |
| **Has native export?** | 文件即真相；无统一 export |
| **Has MCP server?** | 非核心；以 CLI 为主 |
| **Adapter difficulty** | **2 / 5** |
| **Notes** | "记忆"偏 **规则/约定** 而非大 transcript；见 `D-market-scan.md` §D.3。 |

### A.11 Continue.dev

| Field | Value |
|-------|-------|
| **Name** | Continue |
| **Source** | https://github.com/continuedev/continue |
| **Stars / 流行度** | **~3万+** |
| **Category** | Cat A |
| **Memory location** | 项目/用户 `~/.continue`、`.continue` 配置；对话持久化依赖设置 |
| **Storage format** | JSON/YAML + 可选 MCP 外置记忆 |
| **Has native export?** | 无大一统 export |
| **Has MCP server?** | **推荐通过 MCP** 扩展记忆（见 `D-market-scan.md` §D.3） |
| **Adapter difficulty** | **3 / 5**（碎片配置 + MCP 分流） |
| **Notes** | loci 更适合当以 **MCP 客户端** 接入。 |

### A.12 Windsurf (Codeium)

| Field | Value |
|-------|-------|
| **Name** | Windsurf |
| **Source** | https://docs.codeium.com/windsurf / https://windsurf.com |
| **Stars / 流行度** | 商业编辑器;装机增长快 |
| **Category** | Cat A |
| **Memory location** | `%USERPROFILE%\.codeium\windsurf\`（MCP 配置等）；`AppData\Roaming\Windsurf`；**chat transcript 精确路径未在公开文档统一列出** |
| **Storage format** | JSON 配置 + 可能的本地 DB |
| **Has native export?** | 无公开 transcript 导出 |
| **Has MCP server?** | **支持 MCP** |
| **Adapter difficulty** | **4 / 5** |
| **Notes** | Inventory 可先做"目录存在性 + 配置文件"，全量内容需本机探测。 |

### A.13 Zed

| Field | Value |
|-------|-------|
| **Name** | Zed |
| **Source** | https://github.com/zed-industries/zed / https://zed.dev |
| **Stars / 流行度** | **~7.8万+**（编辑器本体） |
| **Category** | Cat A |
| **Memory location** | 平台相关应用数据目录（macOS/Linux/Win）；AI 会话具体子路径需查版本文档 |
| **Storage format** | 很可能 JSON/SQLite 混合 |
| **Has native export?** | 无面向第三方的标准 export |
| **Has MCP server?** | AI 集成活跃；MCP/ACP 能力演进中 |
| **Adapter difficulty** | **4 / 5** |
| **Notes** | 多模型/agent（Claude/Codex/OpenCode）桥接带来"多种 transcript 形状"风险。 |

### A.14 Sourcegraph Cody

| Field | Value |
|-------|-------|
| **Name** | Cody |
| **Source** | https://sourcegraph.com/docs/cody（产品）；GitHub `sourcegraph/cody-public-snapshot` **已归档** |
| **Stars / 流行度** | 公共快照 **~3.8k**（只降不升）；商业产品主战线私有 |
| **Category** | Cat A |
| **Memory location** | IDE 插件存储 + Sourcegraph 后端；**本地无稳定开放丛** |
| **Storage format** | 专有 |
| **Has native export?** | 无 |
| **Has MCP server?** | 非开放记忆 MCP |
| **Adapter difficulty** | **5 / 5** |
| **Notes** | 适合列入"生态认知"，不适合 M1 adapter。 |

### A.15 Tabnine

| Field | Value |
|-------|-------|
| **Name** | Tabnine |
| **Source** | https://github.com/codota/TabNine（引擎/历史仓库）/ 现以商业产品为主 |
| **Stars / 流行度** | 老牌补全；chat/记忆非主叙事 |
| **Category** | Cat A |
| **Memory location** | IDE 缓存 + 云服务；本地路径不_documented 为 transcript |
| **Storage format** | 专有 |
| **Has native export?** | 无 |
| **Has MCP server?** | 否（记忆 MCP 场景不适用） |
| **Adapter difficulty** | **5 / 5** |
| **Notes** | 对 loci "transcript federation" 价值低。 |

### A.16 Amazon Q Developer

| Field | Value |
|-------|-------|
| **Name** | Amazon Q Developer |
| **Source** | AWS 文档 / JetBrains & VS Code 插件 |
| **Stars / 流行度** | 企业向；开源星标不适用 |
| **Category** | Cat A |
| **Memory location** | AWS 账户侧 + IDE 插件本地状态 |
| **Storage format** | 专有 / 云 |
| **Has native export?** | 无通用本地 export |
| **Has MCP server?** | 否 |
| **Adapter difficulty** | **5 / 5** |
| **Notes** | 合规与账号边界优先于个人本地 inventory。 |

### A.17 JetBrains AI Assistant / Junie

| Field | Value |
|-------|-------|
| **Name** | JetBrains AI |
| **Source** | https://www.jetbrains.com/ai / Junie 产品线 |
| **Stars / 流行度** | IDE 绑定；商业 |
| **Category** | Cat A |
| **Memory location** | `~/.config/JetBrains` / Windows `AppData\JetBrains` 下插件与缓存 |
| **Storage format** | 专有 |
| **Has native export?** | 无开放 transcript 总线 |
| **Has MCP server?** | 生态以 IDE 为主 |
| **Adapter difficulty** | **4–5 / 5** |
| **Notes** | 与 Copilot/Q 同属"闭源 IDE 记忆" bucket。 |

### A.18 Google Antigravity / Gemini Code Assist (IDE)

| Field | Value |
|-------|-------|
| **Name** | Gemini Code Assist / "Antigravity" IDE 叙事（Google） |
| **Source** | Google 官方开发者文档 / IDE 插件市场 |
| **Stars / 流行度** | 产品在快速迭代；星标不表征 |
| **Category** | Cat A |
| **Memory location** | IDE 插件存储 + Google 账户云 |
| **Storage format** | 专有 |
| **Has native export?** | 受限 |
| **Has MCP server?** | 不假设 |
| **Adapter difficulty** | **4–5 / 5** |
| **Notes** | 与 **Gemini CLI**（A.4）区分：CLI 有本地 `~/.gemini/tmp/...` 抓手。 |

### A.19 Codeium VS Code 扩展（非 Windsurf）

| Field | Value |
|-------|-------|
| **Name** | Codeium for VS Code |
| **Source** | https://codeium.com |
| **Stars / 流行度** | 扩展装机大 |
| **Category** | Cat A |
| **Memory location** | VS Code `globalStorage` 等 |
| **Storage format** | 专有 |
| **Has native export?** | 无 |
| **Has MCP server?** | Windsurf 线更强调 MCP；VS Code 扩展侧重补全+chat |
| **Adapter difficulty** | **4 / 5** |
| **Notes** | 与 A.12 **Windsurf** 同公司不同载体；adapter 可能部分复用"Codeium 目录"假设。 |

---

## Cat B — 第三方记忆 MCP / SaaS / Library

### B.1 Serena MCP

| Field | Value |
|-------|-------|
| **Name** | Serena |
| **Source** | https://github.com/oraios/serena |
| **Stars / 流行度** | **~2.2万–2.4万** 量级 |
| **Category** | Cat B |
| **Memory location** | 用户/项目 `.serena/`（如 `memories/`、`ticket/`）；可调 |
| **Storage format** | **Markdown** 为主 |
| **Has native export?** | 目录即导出 |
| **Has MCP server?** | **是（核心）** |
| **Adapter difficulty** | **2 / 5** |
| **Notes** | 本机样本量见 `A-data-sources.md` §Serena。 |

### B.2 mem0

| Field | Value |
|-------|-------|
| **Name** | Mem0 |
| **Source** | https://github.com/mem0ai/mem0 |
| **Stars / 流行度** | **~5.5万+** |
| **Category** | Cat B |
| **Memory location** | 自托管：DB/向量库由部署决定；SaaS：**远端 API** |
| **Storage format** | JSON/API；底层可 PG/SQLite/Qdrant 等 |
| **Has native export?** | SDK 拉取；无单一 `~/mem0` 标准路径 |
| **Has MCP server?** | **有社区/官方 MCP 路线**（以仓库 README 为准） |
| **Adapter difficulty** | **3 / 5**（API+向量 vs 纯文件） |
| **Notes** | 定位与 loci 关系见 `D-market-scan.md` §D.1。 |

### B.3 Letta

| Field | Value |
|-------|-------|
| **Name** | Letta (ex-MemGPT) |
| **Source** | https://github.com/letta-ai/letta |
| **Stars / 流行度** | **~2万+** |
| **Category** | Cat B |
| **Memory location** | Letta Server 数据目录（Docker/本地服务） |
| **Storage format** | 服务内 schema（块/档案）；非 IDE JSONL |
| **Has native export?** | 备份/DB 导出视部署 |
| **Has MCP server?** | 以平台能力为准（快速演进） |
| **Adapter difficulty** | **4 / 5** |
| **Notes** | 互补项：`D-market-scan.md` §D.1。 |

### B.4 Zep

| Field | Value |
|-------|-------|
| **Name** | Zep |
| **Source** | https://github.com/getzep/zep |
| **Stars / 流行度** | **~4–5k**（平台 repo；另有 Cloud） |
| **Category** | Cat B |
| **Memory location** | 自建服务 DB + **Zep Cloud** |
| **Storage format** | API + 内部图/关系存储 |
| **Has native export?** | 运营/备份导向 |
| **Has MCP server?** | 可能有桥接；**非文件型第一公民** |
| **Adapter difficulty** | **4 / 5** |
| **Notes** | 与 Graphiti 生态咬合；见 `D-market-scan.md`。 |

### B.5 Graphiti

| Field | Value |
|-------|-------|
| **Name** | Graphiti |
| **Source** | https://github.com/getzep/graphiti |
| **Stars / 流行度** | **极高**（公开 counter 常见 **6万+** 说法，实时验证） |
| **Category** | Cat B |
| **Memory location** | 服务化部署；**非 `~/xxx.jsonl`** |
| **Storage format** | 图 + 向量 + 时序 |
| **Has native export?** | 通过库 API |
| **Has MCP server?** | 非默认目标；需自建桥 |
| **Adapter difficulty** | **4 / 5** |
| **Notes** | **与 loci「非知识图谱产品」策略张力**见 `D-market-scan.md`。 |

### B.6 Cognee

| Field | Value |
|-------|-------|
| **Name** | Cognee |
| **Source** | https://github.com/topoteretes/cognee |
| **Stars / 流行度** | **~1万+** |
| **Category** | Cat B |
| **Memory location** | 本地 SQLite/向量可选；pipeline 决定 |
| **Storage format** | 多模态 ingest → 图/向量 |
| **Has native export?** | 库级 API |
| **Has MCP server?** | 生态中可能出现集成；**非标准 IDE 路径** |
| **Adapter difficulty** | **4 / 5** |
| **Notes** | "别做成 Cognee-lite" — `D-market-scan.md`。 |

### B.7 Memary

| Field | Value |
|-------|-------|
| **Name** | Memary |
| **Source** | https://github.com/kingjulio8238/Memary |
| **Stars / 流行度** | **~2.6k** |
| **Category** | Cat B |
| **Memory location** | 运行目录/配置决定；**无通用 ~/.memary** 合同 |
| **Storage format** | Python/Notebook 管线 + 内部存储 |
| **Has native export?** | 无标准 CLI export |
| **Has MCP server?** | 否 |
| **Adapter difficulty** | **4 / 5** |
| **Notes** | 与 Mem0/Letta 比 **生态引力弱**；M3+ 观望。 |

### B.8 Motorhead (Metal)

| Field | Value |
|-------|-------|
| **Name** | Motorhead |
| **Source** | https://github.com/getmetal/motorhead |
| **Stars / 流行度** | 中低；**维护/弃用信号**（见 LangChain 文档 "deprecated" 描述） |
| **Category** | Cat B |
| **Memory location** | 自建或 `api.getmetal.io` |
| **Storage format** | HTTP JSON API |
| **Has native export?** | API GET |
| **Has MCP server?** | 否 |
| **Adapter difficulty** | **3 / 5**（概念简单） / **价值低** |
| **Notes** | **不建议新接**；历史兼容或研究 LangChain 记忆演化用。 |

### B.9 Anthropic `memory-management` plugin

| Field | Value |
|-------|-------|
| **Name** | memory-management (knowledge-work-plugins) |
| **Source** | https://github.com/anthropics/knowledge-work-plugins（`productivity/skills/memory-management/`） |
| **Stars / 流行度** | 插件合集 **~1.1万**（2026-05 `F-unknowns.md`） |
| **Category** | Cat B |
| **Memory location** | 项目 `memory/**/*.md` + 根 `CLAUDE.md` 热缓存 |
| **Storage format** | **Markdown** |
| **Has native export?** | 即文件夹 |
| **Has MCP server?** | Skill 形态；**非独立 MCP 二进制** |
| **Adapter difficulty** | **2 / 5** |
| **Notes** | 建议 **generic markdown-dir adapter** 参数化 — `F-unknowns.md` §F.2。 |

### B.10 Anthropic `mcp-memory` (官方示例)

| Field | Value |
|-------|-------|
| **Name** | mcp-memory (tutorial/sample) |
| **Source** | Anthropic MCP 教程 / `modelcontextprotocol/servers` 生态中的 memory 示例（以当前仓库为准） |
| **Stars / 流行度** | 示例性质 |
| **Category** | Cat B |
| **Memory location** | 示例实现定（常见内存/KV） |
| **Storage format** | JSON/SQLite（实现相关） |
| **Has native export?** | 无 |
| **Has MCP server?** | **是（教学）** |
| **Adapter difficulty** | **2 / 5** |
| **Notes** | 价值：**协议与工具形状参考**，非生产记忆源。 |

### B.11 basic-memory MCP

| Field | Value |
|-------|-------|
| **Name** | basic-memory |
| **Source** | https://github.com/basicmachines-co/basic-memory |
| **Stars / 流行度** | 中游（请查实时） |
| **Category** | Cat B |
| **Memory location** | 用户可控 **Markdown 工作区**（local-first） |
| **Storage format** | Markdown + 元数据 |
| **Has native export?** | 目录即真相 |
| **Has MCP server?** | **是（核心）** |
| **Adapter difficulty** | **2 / 5** |
| **Notes** | 与 loci L1 Markdown 哲学一致； federate 时可直接当 **一等公民数据源**。 |

### B.12 recall (arjunkmrm)

| Field | Value |
|-------|-------|
| **Name** | recall |
| **Source** | https://github.com/arjunkmrm/recall |
| **Stars / 流行度** | 中小（实用工具型） |
| **Category** | Cat B |
| **Memory location** | **`~/.recall.db`**（FTS5）；源文件仍指向 **Claude/Codex 目录** |
| **Storage format** | **SQLite FTS5** |
| **Has native export?** | `.db` 文件可复制 |
| **Has MCP server?** | 否（CLI 搜索） |
| **Adapter difficulty** | **1 / 5**（作为**派生索引**；**不等价于**主编译式 adapter） |
| **Notes** | 详见 `F-unknowns.md` §F.3。 |

### B.13 episodic-memory (obra)

| Field | Value |
|-------|-------|
| **Name** | episodic-memory |
| **Source** | https://github.com/obra/episodic-memory（**请以仓库为准**） |
| **Stars / 流行度** | 实用向中小仓库 |
| **Category** | Cat B |
| **Memory location** | 依赖实现对 **Claude/Codex** 等 **JSONL** 的再索引 |
| **Storage format** | 索引文件（实现相关） |
| **Has native export?** | 依赖实现 |
| **Has MCP server?** | 否 |
| **Adapter difficulty** | **2 / 5**（**逻辑重用**价值 > 直接索引） |
| **Notes** | 与 `recall` 同族的 **"IDE JSONL → FTS"** 先例。 |

### B.14 MemGPT / MemoryBank (Legacy lines)

| Field | Value |
|-------|-------|
| **Name** | MemGPT / MemoryBank forks |
| **Source** | 多条 GitHub 线；主干能力已迁移至 **Letta** |
| **Stars / 流行度** | 碎片化 |
| **Category** | Cat B |
| **Memory location** | 因 fork 而异 |
| **Storage format** | 混合 |
| **Has native export?** | 无统一 |
| **Has MCP server?** | 罕见 |
| **Adapter difficulty** | **4 / 5** |
| **Notes** | 调研价值：**历史与论文思想**；工程优先级低 — `D-market-scan.md`。 |

### B.15 LangGraph checkpointers / LangChain memory stores

| Field | Value |
|-------|-------|
| **Name** | LangGraph saver / memory store |
| **Source** | https://github.com/langchain-ai/langgraph |
| **Stars / 流行度** | 生态级 |
| **Category** | Cat B |
| **Memory location** | SQLite/Postgres/Redis 等 **可插拔** |
| **Storage format** | 框架内部序列化 |
| **Has native export?** | DB 备份级 |
| **Has MCP server?** | 否（库） |
| **Adapter difficulty** | **3 / 5**（清晰但非 IDE） |
| **Notes** | **steal patterns**（命名空间、thread_id）— `D-market-scan.md` §D.1。 |

### B.16 Supermemory / 其他 "AI second brain" SaaS

| Field | Value |
|-------|-------|
| **Name** | Supermemory (代表一类 SaaS) |
| **Source** | https://supermemory.ai（及 GitHub 组织，若有） |
| **Stars / 流行度** | 产品驱动 |
| **Category** | Cat B |
| **Memory location** | 100% 云账户 |
| **Storage format** | HTTP JSON |
| **Has native export?** | 依赖产品政策 |
| **Has MCP server?** | 部分产品提供 MCP — **以官网为准** |
| **Adapter difficulty** | **3 / 5**（OAuth + API） |
| **Notes** | 对个人 **privacy-local** 愿景常冲突；放 M3+。 |

### B.17 Memory-graph startups (Zep/Graphiti 以外的 KG SaaS)

| Field | Value |
|-------|-------|
| **Name** | 多家"temporal KG / agent memory API" |
| **Source** | 行业杂项（非单仓） |
| **Stars / 流行度** | N/A |
| **Category** | Cat B |
| **Memory location** | 云端 |
| **Storage format** | API |
| **Has native export?** | 不一致 |
| **Has MCP server?** | 偶发 |
| **Adapter difficulty** | **3–4 / 5** |
| **Notes** | loci **不做云总承包**；仅当用户明确要求接 API 时评估。 |

---

## 适配器优先级建议

**启发式**：`优先级 ∝ 流行度 × (1/AdapterDifficulty)`，并叠加 **"本地路径确定性"**（loci 主线）。

| Tier | 接入对象 | 理由 |
|------|-----------|------|
| **M1 必接（5）** | **Cursor transcripts**、**Codex sessions+sqlite**、**Claude Code projects JSONL**、**Serena `.serena`**、**OpenCode 本地 store** | 路径清晰、用户量大、格式已部分取证（`A-data-sources.md`, `F-unknowns.md`）。 |
| **M2 必接（5）** | **Gemini CLI** `~/.gemini/tmp/...`、**Aider** 规则文件、**basic-memory** / **Anthropic markdown memory**（`markdown-dir` 一把梭）、**Continue**（MCP 引导 + 配置文件可选源）、**mem0**（API/self-host，用于 **federated recall 的远端 leg**） | 提升覆盖面；难度中等。 |
| **M3+ 按需** | **Cline/Roo**（扩展存储）、**Windsurf**、**Zed**、**Copilot/Q/Tabnine/Cody**（闭源）、**Letta/Zep/Graphiti/Cognee**（服务化记忆）、**Supermemory 等 SaaS** | 需要额外取证或合同不清；或偏离 local-first。 |

---

## 共性观察

- **标准化程度**：**无业界统一 "Agent Memory FS Layout"**；实际是 **厂商目录 + JSONL/SQLite/Markdown** 各行其是。
- **Migration 常见痛点**：(1) **云侧索引**（Cursor Memories、Copilot）；(2) **OAuth/密钥文件**（Gemini/OpenCode `auth.json`）；(3) **事件模式演进**（Claude JSONL 多 `type`）；(4) **VS Code `globalStorage` 不透明**（Cline/Roo）。
- **Export 现状**：**几乎都没有**用户友好的 `memory export --format=`；loci 的机会是 **只读适配 + 可选归一化**，而非期待上游。
- **MCP 角色**：Cat A 里是 **消费者**；Cat B 里是 **提供者** —— loci 可对 **markdown MCP 源**做双向，对 **IDE JSONL** 坚持只读。

---

## 与 A / D / F 的交叉索引（避免重复）

| 主题 | 参见 |
|------|------|
| Claude / Codex / Cursor / Serena 体量与样本 | `A-data-sources.md` |
| OpenCode Windows 路径、Graph、JSON 布局 | `F-unknowns.md` §F.1 |
| Anthropic `memory-management` 两层结构 | `F-unknowns.md` §F.2 |
| `recall` 的 `~/.recall.db` 与源目录 | `F-unknowns.md` §F.3 |
| mem0/Letta/Zep/Graphiti/Cognee 战略关系 | `D-market-scan.md` §D.1 |
| Continue / Aider / Copilot 类对比 | `D-market-scan.md` §D.3 |

---

## 本次扫描对 spec / verdict 的修正建议（简短）

1. **Stars 数字**：网络摘要波动大（尤其 **OpenClaw**、**Graphiti**）；`D-market-scan.md` 已提醒 **order-of-magnitude** ——建议在 spec 中写 **"以 adapter ticket 触发日的 GitHub counter 为准"**，避免写死常数。
2. **Gemini CLI**：应在 Tier 表中单列 **`~/.gemini/tmp/<hash>/chats/`**（见 Google 官方 session-management 文档），与 **Gemini Code Assist IDE**（A.18）区分。
3. **Cline vs Roo**：marketplace 热度接近，但 **存储路径同等不透明** — verdict：**同一"VS Code globalStorage"攻关议题** 合并，不要开两条重复 OKR。
4. **recall / episodic-memory**：更适合作为 **prior art** 与 **FTS 验证器**，不宜在架构图里与 **primary adapters** 并列，以免暗示"再建一层索引 DB" scope creep（`F-unknowns.md` 已有方向）。

---

**END**
