# Agent Skills vs MCP Servers — 调研笔记（oh-my-memories / omem 决策参考）

> 调研日期：2026-05-14。依据公开文档与官方说明整理；不涉及第三方产品源码。

---

## 1. TL;DR

1. **Skill** 本质是「装在磁盘上的说明书 + 可选脚本/资源」，用 `SKILL.md`（YAML 元数据 + Markdown 正文）描述**何时触发、怎么做**；宿主在会话启动时通常只看到轻量的 `name/description`，正文按需加载（渐进式披露）。
2. **MCP** 本质是「JSON-RPC 2.0 上的开放协议」，**Server** 向 **Host** 暴露 *tools / resources / prompts*；模型通过结构化的 tool 调用与外部世界交互，而不是靠阅读长篇说明。
3. 二者都解决「给 Agent 扩能力」，但分层不同：**Skill ≈ 流程与领域知识（软逻辑）**，**MCP ≈ 可程序化的能力与数据通道（硬接口）**；重叠区主要在「教模型去调用某 CLI」vs「把同一能力做成 tool」。
4. **跨 IDE**：MCP 在 Cursor / Codex / Gemini CLI / Copilot CLI 等中有较一致的「连上一个 server」故事；Skill 正在向 **Agent Skills 开放标准**（如 [agentskills.io](https://agentskills.io/)）收敛，但各宿主发现路径（`.cursor/skills`、`~/.codex`、`gh skill` 等）仍有差异。
5. 对 **M1（5× adapter + scan + recall）** 的务实默认：**先 ship 可用的 CLI + 一份薄的 Skill（教 Agent 何时、如何调用 CLI）**；MCP 放到 **M1.1 / M2**，待子命令、输出格式、错误码稳定后再做结构化 tool，避免双端并行拖慢首版。

---

## 2. Skill 定义

### 2.1 起源与主导方

- **主导方**：以 **Anthropic** 的 *Agent Skills* 产品化与文档化为锚点；同时社区在推动 **开放规范**（[agentskills.io](https://agentskills.io/) / `agentskills` GitHub 组织），以便多宿主互操作。
- **出现时间线（文档层面）**：2025 年起 Anthropic 在 Claude API、Claude Code、claude.ai 等表面系统化描述 Skills；2026 年前后 Cursor、OpenAI Codex、GitHub Copilot 等文档明确对齐「同一套 SKILL.md 思路」。

### 2.2 协议与格式

- **载体**：目录 + `SKILL.md`，YAML frontmatter 至少包含 `name`、`description`（Anthropic 对字段规则有详细约束）。
- **内容层级（Anthropic 模型）**：
  - **L1 元数据**：`name` / `description` — 通常总是进入「技能目录」供模型挑选。
  - **L2 指令**：`SKILL.md` 正文 — 在技能被判定相关时再读入上下文。
  - **L3+ 资源**：额外 `.md`、脚本、模板等 — 需要时再读或作为可执行脚本运行（具体取决于宿主环境与权限）。
- **不是** 「一个网络 RPC 协议」；更像是 **可发现、可版本控制的提示工程包**。

### 2.3 加载与触发机制

- **谁加载**：各 **IDE / CLI 宿主**在启动 Agent 时扫描约定目录，把 skills **注册到 Agent 可用列表**；模型根据 `description` 与当前任务做相关性判断，或被用户手动点名。
- **何时触发**：
  - **隐式**：任务描述匹配 `description`（各宿主实现细节不同）。
  - **显式**：用户在聊天中 `/skill-name` 或等价 UI（Cursor：Agent 聊天 `/`；Codex：`/skills`、`$` mention）。
- **安全心智**：Skill = 安装类似「可执行说明 + 脚本」；Anthropic 官方明确需审计来源与捆绑文件。

### 2.4 安装 / 分发方式（常见）

- **仓库内**：`.cursor/skills/`、`.agents/skills/`、`.claude/skills/`、`.github/skills/` 等（因宿主而异）。
- **用户级**：`~/.cursor/skills/`、`~/.agents/skills/`、`~/.copilot/skills/` 等。
- **包分发**：OpenAI **Codex Plugins** 可把多个 skill 与可选 MCP 配置打包；GitHub 侧可用 `gh skill` 发现安装（Copilot 文档）。

### 2.5 谁支持（文档声称 · 非穷举）

| 平台 / 产品 | Skill 支持要点（依公开文档） |
|------------|------------------------------|
| **Claude（Anthropic）** | Claude API / claude.ai / Claude Code；API 上与 code execution、Skills API 等能力耦合（见官方 Overview）。 |
| **Cursor** | 自动从 `.cursor/skills/`、`.agents/skills/`、全局目录及兼容路径加载；可 `disable-model-invocation` 强制仅手动触发。 |
| **OpenAI Codex** | CLI / IDE / App；扫描 `.agents/skills` 多层级路径；可有 `agents/openai.yaml` 元数据。 |
| **GitHub Copilot** | Cloud agent、Copilot CLI、VS Code Agent mode；项目与个人目录约定见 GitHub Docs。 |
| **Gemini CLI** | 文档中心在 **Extensions** 与 **MCP**；技能形态更多通过扩展/命令组合承载（与 Claude/Cursor 的纯 SKILL.md 目录语义不必 1:1 等同）。 |

---

## 3. MCP 定义

### 3.1 起源与主导方

- **主导方**：**Anthropic 发起并开源** Model Context Protocol；规范维护向社区治理演进（2025 报道：捐赠至 Linux Foundation 下 **Agentic AI Foundation**，以便多方共同演进 — 见检索摘要）。
- **动机**：把「模型 ←→ 数据源 / 工具」从 N 家定制集成，收敛成 **可互操作的客户端-服务器协议**。

### 3.2 协议与能力模型

- **传输**：JSON-RPC 2.0；常见传输包括 **STDIO（本地子进程）**、**Streamable HTTP**、**SSE**（各宿主支持度不同）。
- **角色**：**Host**（IDE/CLI）内的 **Client** 连接 **Server**；Server 宣告 **Tools / Resources / Prompts**。
- **Tools**：带 JSON Schema 的参数描述 → 典型 LLM function-calling / tool UI 流。

### 3.3 加载与触发机制

- **谁加载**：用户在宿主中 **配置 MCP Server**（如 Cursor `mcp.json`、Codex `config.toml`、Gemini CLI `settings.json` 等）；Host 启动或按需拉起子进程 / 连接远程 endpoint。
- **何时触发**：
  - 模型在 **可用 tools 列表**中看到 MCP tools，结合用户意图发起 **tool call**；
  - 各宿主还有「自动运行 / 需确认」等权限层。

### 3.4 安装 / 分发方式（常见）

- **本地 command**：`npx -y some-mcp-package`、自有二进制等。
- **远程 URL + OAuth / Bearer**：适合 SaaS 类 MCP。
- **市场索引**：如 [cursor.directory](https://cursor.directory)、[mcp.so](https://mcp.so)、Smithery 等（第三方收录，非协议核心）。

### 3.5 谁支持（文档声称 · 非穷举）

| 平台 / 产品 | MCP 支持要点（依公开文档） |
|------------|---------------------------|
| **Cursor** | 项目/全局 `mcp.json`；Agent 自动感知 MCP tools（文档 *MCP integrations*）。 |
| **OpenAI Codex** | `codex mcp` CLI；`~/.codex/config.toml` 或项目级 scoped 配置；STDIO + Streamable HTTP + OAuth。 |
| **Google Gemini CLI** | `mcpServers` 配置；extensions 可打包 MCP；支持 stdio / SSE / streamable HTTP（Gemini CLI 文档）。 |
| **GitHub Copilot CLI** | 官方 *Adding MCP servers*；`/mcp add` 等工作流。 |
| **其他** | OpenAI、Microsoft、AWS 等生态在多份第三方综述中列为 MCP 采纳方（以各厂商最新文档为准）。 |

---

## 4. 对比表格（12+ 维度）

> **说明**：下表概括「典型实现」；具体以各产品版本文档为准。

| 维度 | Agent Skills | MCP Servers |
|------|--------------|-------------|
| **标准化程度** | **开放文档/约定**（`SKILL.md` + 目录布局）在多宿主间对齐中；Cursor/Codex 明确引用开放标准站点。 | **开放协议 + Schema**（MCP 规范）；传输与能力发现格式更「硬」。 |
| **跨 IDE 兼容性** | **中等偏高**：格式可移植，但 **发现路径、手动/自动触发策略** 仍因宿主而异。 | **高**：不同 IDE 都实现「连同一个 MCP Server」；**差异主要在 transport / 权限 UI**。 |
| **触发方式** | **意图匹配描述** + **用户显式 `/skill`**；可配置仅手动。 | **Tool 选择**（function calling）；由模型与宿主权限策略共同决定。 |
| **安装难度** | **低到中**：拷贝目录或插件；无长期后台进程要求。 | **中**：配置 command/env、排障 stdout、OAuth、网络访问；多一个 **常驻/按需子进程** 心智负担。 |
| **调试便利性** | 读 `SKILL.md` + 看 Agent 日志是否加载正文；脚本问题等同调试 shell。 | 需 **MCP 日志 / JSON-RPC 轨迹 / Server 崩溃重启**；工具参数 schema 错配要查 host 提示。 |
| **生态规模** | 大量示例仓库（Anthropic `skills`、awesome 列表、Copilot `awesome-copilot`）。 | **Registry / 目录站**极丰富；企业集成（GitHub、Sentry、Figma…）多走 MCP。 |
| **性能 / 开销** | 轻量：主要是 **额外 token（按需）** 与偶发脚本执行。 | **进程启动、JSON-RPC、可能的网络 RTT**；tool 频繁调用时更明显。 |
| **Runtime 需求** | 宿主内置 **bash / python / node** 等能力时可直接用脚本；否则纯文本指令。 | Server 可写在 **任意语言**；需满足宿主支持的 transport。 |
| **安装步骤（终端用户）** | 「把 skill 放到某目录」或安装 IDE 插件包。 | 「在设置里 add server」或编辑 `mcp.json` / `config.toml`。 |
| **自动发现** | 宿主扫描固定 **skills 根目录**（+ Cursor 支持嵌套 monorepo 目录取 skill）。 | **不会**全网自动发现；需显式配置 server，或借助 marketplace 生成配置片段。 |
| **沙箱 / 限权** | 依赖 **宿主 Agent 的执行沙箱策略**（例如能否跑 shell、网络）。 | **进程隔离** + Host 侧 **工具 allowlist**（如 Codex `enabled_tools`）+ MCP 2025–2026 安全讨论中的用户同意范式。 |
| **主要扩的能力类型** | **流程、规范、组织知识、操作指南**（+ 轻脚本 glue）。 | **数据库、API、浏览器、Ticketing、文档检索** 等可结构化接口。 |
| **版本管理** | Git 友好；code review 友好。 | Server 自身的 **语义版本** + 客户端兼容；配置里锁定 npx 包版本。 |

---

## 5. 典型用法

### 5.1 Skill 示例（3）

1. **办公文档类（Anthropic 预置技能）**：PowerPoint / Excel / Word / PDF — 典型的「重流程 + 可能调用脚本/运行时」技能包。
2. **团队运维流程（概念示意）**：如 Cursor 文档中的 `deploy-app` skill — `SKILL.md` 描述步骤，`scripts/deploy.sh` 由 Agent 在许可下执行。
3. **通用脚手架（Codex）**：内置 `$skill-creator` — 教用户如何沉淀可复用的 `SKILL.md` 工作流。

### 5.2 MCP 示例（3）

1. **Context7**：`npx -y @upstash/context7-mcp` — **文档检索 / 开发库上下文**（Codex 文档示例）。
2. **GitHub MCP Server**：在 Copilot / Codex 生态中用于 Issue、PR 等超出裸 `git` 的操作。
3. **Playwright / Chrome DevTools MCP**：把浏览器控制暴露为标准 tools，供 Agent 驱车测试页面。

---

## 6. 共生关系

### 6.1 Skill 调用 MCP tool 是否常见？

**是，而且在一线宿主里是「官方组合打法」之一：**

- **Cursor**：文档示例中直接存在嵌套 skill 名如 `using-datadog-mcp` — 典型模式是 *Skill 教 Agent **何时**用哪些 MCP tools、如何组合上下文与后续动作*。
- **OpenAI Codex**：`agents/openai.yaml` 可为 skill 声明 **`dependencies.tools` → `type: mcp`**，把「流程说明」与「必须可用的 MCP server」绑在一起，降低「模型忘了连工具」的概率。

**心智模型**：Skill 解决 **编排与策略**；MCP 解决 **能力与数据**。

### 6.2 MCP 反向调用 Skill？

**不直接。** MCP Server 不知道「Skill」概念；通常是 **Host 同时装载** skills 列表与 MCP tools，**模型**在一回合内自行协同。若需要强制顺序，一般在 **Skill 文本**里写明「先调用某某 MCP tool」。

### 6.3 同一份能力要不要 Skill + MCP「双发」？

- **适合双发的情况**：能力 **既需要** 强结构化多参数交互 / 高频 tool 调用，**又需要** 长流程、降级策略与人类可读 runbook（例如： incident response：MCP 拉取监控 + Skill 规定分级与沟通模板）。
- **不适合过早双发的情况**：首版协议仍在剧烈迭代 → **双端维护成本**（参数、错误语义、版本矩阵）可能高于收益。

**参考现成模式**：OpenAI **Plugins** 可 **bundle skills + MCP** — 说明业内在「分发单元」层已经常把两者打包，而不是二选一。

---

## 7. 对 oh-my-memories（omem）M1 的建议

### 7.1 M1 是否需要 MCP？

**不强制。** M1 的核心是 **「CLI 能力真可用」**（scan / recall / 多 adapter）；Agent 集成路径上，**薄 Skill 足够让 Cursor / Copilot / Codex 类宿主驱动 CLI**。MCP 更适合在 **CLI 标志位、退出码、JSON 输出模式、认证/存储位置** 稳定之后，将 `recall`、`ingest`、`status` 等沉淀为 **稳定 tools**。

### 7.2 只 ship CLI + Skill，Cursor 能自动调到吗？

**可以「自动可选用」——前提是 Skill 出现在 Cursor 的 skills 目录并满足 frontmatter。**  
Cursor 文档写明：启动时发现 skills；Agent 根据上下文决定是否相关；也可用户 `/` 手动点名。并非「魔法全局安装」，仍需用户或项目把 skill 放到 `.cursor/skills/` 等路径，或通过 Remote Rule / 插件分发。

### 7.3 只 ship CLI + MCP，命令行用户够用吗？

**对人类 CLI 用户够用**（他们直接敲 `omem`）。  
**对 Agent**：也够用，但 **首次连接成本** 通常高于 Skill（配置 MCP、排障进程）；且若 MCP 只是薄包装 CLI，初期收益有限。

### 7.4「薄 Skill 包 CLI」vs「薄 MCP 包 CLI」哪个更易用？

| 方案 | 更易用场景 |
|------|-----------|
| **薄 Skill 包 CLI** | 快速教 Agent **何时 recall**、如何组合 adapter 标志；无后台进程；Git 友好；**M1 首推**。 |
| **薄 MCP 包 CLI** | 需要 **结构化 tool 参数**、要与其它 MCP tools 组合、或想要 marketplace「一键 add」曝光时更优；**适合 M2+**。 |

### 7.5 三个明确选项（供拍板）

- **选项 A — M1：`omem` CLI + 官方 Skill（Thin glue）**  
  - **优点**：交付快、维护面窄、对 Git/Review 友好。  
  - **缺点**：各 IDE 的「发现路径」需写清楚；结构化程度弱于 MCP。

- **选项 B — M1：`omem` CLI + 官方 MCP Server（Thin wrapper）**  
  - **优点**：工具列表里一目了然；与其它 MCP 工具组合顺滑。  
  - **缺点**：进程/配置/版本绑定排障成本高；M1 若 CLI 仍在变，容易「双倍 breaking change」。

- **选项 C — M1：CLI + Skill + MCP（内容等价、共享底层库）**  
  - **优点**：覆盖「说明驱动」与「tool 驱动」两派用户；可上目录站营销。  
  - **缺点**：团队节奏风险最大；文档与测试矩阵膨胀。

### 7.6 推荐结论

- **首选：选项 A（M1）** —— 用 Skill 把 **召回/扫描** 的 **触发条件、推荐 flags、失败重试策略** 写清楚；CLI 保证人类与 Agent（经 terminal tool）共用同一实现。  
- **跟进：选项 C 的「轻量 MCP」放在 M1.1/M2** —— 当 JSON 输出、`--json` schema、退出码、配置路径稳定后，再把高频操作暴露为 tools；届时可发 **Codex Plugin 式一体化包**（Skill + MCP）作为加分项，而非阻塞 M1。

---

## 8. References（URL）

- Anthropic — Agent Skills Overview: https://docs.anthropic.com/en/docs/agents-and-tools/agent-skills/overview  
- Anthropic — Extend Claude with skills (Claude Code): https://docs.anthropic.com/en/docs/claude-code/skills  
- Anthropic — Introducing Agent Skills (blog): https://www.anthropic.com/index/skills  
- Anthropic — Equipping agents for the real world with Agent Skills (engineering): https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills  
- Agent Skills open standard: https://agentskills.io/  
- MCP Specification: https://modelcontextprotocol.io/specification/latest  
- Anthropic — Introducing MCP (news): https://www.anthropic.com/news/model-context-protocol  
- Cursor — Agent Skills: https://cursor.com/docs/skills  
- Cursor — MCP integrations: https://cursor.com/help/customization/mcp  
- OpenAI — Codex Agent Skills: https://developers.openai.com/codex/skills  
- OpenAI — Codex MCP: https://developers.openai.com/codex/mcp  
- GitHub Docs — About agent skills (Copilot): https://docs.github.com/en/copilot/concepts/agents/about-agent-skills  
- GitHub Docs — Adding MCP servers for Copilot CLI: https://docs.github.com/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers  
- Gemini CLI — MCP servers: https://google-gemini.github.io/gemini-cli/docs/tools/mcp-server.html  
- Gemini CLI — Extensions: https://google-gemini.github.io/gemini-cli/docs/extensions/  
- Anthropic example skills repo（社区也常引用）: https://github.com/anthropics/skills  
- OpenAI skills examples: https://github.com/openai/skills  

---

## 9. 附录：本页在决策中的用法

若仅记录结论：**M1 先 CLI + Skill；MCP 等 CLI I/O 契约冻结后再做** — 可把本文件当作 **ADR 附件** 或产品 brief 引用链接，无需绑定任何特定业务代码库路径。
