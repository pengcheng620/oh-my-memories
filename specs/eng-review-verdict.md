# Eng Review Verdict — loci v2

**Date**: 2026-05-14
**Mode**: SELECTIVE EXPANSION (CEO review verdict)
**Scope under review**: spec.md + ceo-review-verdict.md + research/E-tool-inventory.md

---

## Step 0 — Scope Challenge

### S0.1 已有代码部分解决子问题？

| 子问题 | 已有 | 复用策略 |
|--------|------|---------|
| L2 引擎 (KV/FTS) | 现 `loci` 用平 JSON | M3 升级时 SQLite + FTS5 替换, 保留 CLI surface |
| FTS over IDE JSONL | `recall` (`~/.recall.db`)、`episodic-memory` | **不重建** — 学其抽取规则 + 索引建议; 不嵌入它们的 .db |
| MCP 协议 | `Serena` 是 MCP server 标杆 | M1 第一个 Cat B adapter 直接对它 read-only |
| 适配器接口 | spec 已草拟 | 复用并精化 (见 Issue A1) |

**结论**: M1 不写新引擎,只写 **5 个适配器 + scan + recall --all**。代码量预估 ~600-800 LoC (research B-tech-stack.md 数据)。

### S0.2 最小变更集

| 必须 | 可延后 |
|------|--------|
| Adapter interface (1 个) | Plugin SDK (M4) |
| 5 个 read-only adapters | 写入路径 (M2 起) |
| `loci scan` / `loci recall --all` 命令 | `loci recall` 旧命令兼容 (改成 alias) |
| Inventory JSON 输出 (机器可读) | UI / TUI |
| MCP server stub (1 tool: recall) | full MCP tool surface |

**触发警戒线**: 8 文件 / 2 类。M1 预估文件数 ~10-12 (5 adapters × 1 + interface + scan + recall + index + mcp + types)，**轻微超出 8** — 但每个 adapter 是 ~80 LoC 的纯函数，复杂度低，**不视为 smell**。

### S0.3 Search check

| Pattern | Layer | 决定 |
|---------|-------|------|
| SQLite FTS5 | **L1** | 用 (recall 已验证) |
| sqlite-vec | **L2** | M3 才用 (M1 不需要向量) |
| RRF 跨源融合 | **L1** | M3+ 才需要 (M1 单源粗排即可) |
| BGE-M3 多语 embedding | **L2** | M3+ |
| Adapter pattern | **L1** | 标准 |
| Migration 通用 source→target | **L3 自创** | 接口简单, 但语义 (冲突/去重) 是新东西 |

### S0.4 TODOS — 项目无 TODOS.md, 不适用。

### S0.5 Completeness — M1 是完整版本 (4 个 adapter + scan + recall), 非 shortcut。✓

### S0.6 Distribution check (**新增 finding**)

| 问题 | spec 状态 |
|------|---------|
| npm 发布 | spec.md 提及 (现有 loci 已发) ✓ |
| Global CLI binary | 未明 — 是 `npx loci` 还是 `npm i -g loci`? |
| Windows 兼容 | 未明 — `~/.claude/projects/` 在 Windows 是 `%USERPROFILE%\.claude\projects\` |
| MCP server 安装 | 未明 — `loci mcp install` 命令? Claude/Cursor 配置自动写入? |

**Action**: 写入 spec.md "Distribution" 章节，列上面 4 项。

---

## Section 1 — Architecture Review

### A1 (P0, 9/10) Adapter 接口形状 — 三类共用还是分立？

**Issue**: spec 没明确 Cat A/B/C 是共用一个 `IAdapter` 还是各自接口。Cat A 文件读取 / Cat B MCP 调用 / Cat C HTTP 三种调用模式差很远。

**Options**:
- A) 单一 `IAdapter` + 内部方法分流（简单但 fat interface）
- B) **(推荐)** 三个接口继承同 `IBaseAdapter` (公共字段: `id, name, category, scan, recall`); 各类加自己的方法 (Cat A: `readJsonl`, Cat B: `mcpCall`, Cat C: `httpRequest`)。federation 层只用 `IBaseAdapter` 公共方法，类型安全且可扩展。
- C) Tagged union + discriminator + 巨型 switch (TS 友好但 OOP 不友好)

**Recommendation**: **B**。理由：你强调"必须分清不同工具的定位"，B 在类型层面强制分类。OpenClaw 火了加新 Cat A 实现只需 implement `ICatAAdapter`。

### A2 (P0, 9/10) Migration 冲突策略 — spec 完全没说

**Issue**: `loci migrate --from cc --to cursor` 时，**同 ID / 同时间但不同内容**的记忆怎么办？这是 Migration 命令的成败关键。

**Options**:
- A) 永远 overwrite target (危险, 会丢 cursor 已有数据)
- B) **(推荐)** 默认 dry-run + report; `--apply` 后默认 `skip-on-conflict`; `--strategy=overwrite|merge|prefix-source` 可调
- C) 强制交互式 prompt 每个冲突 (烦)

**Recommendation**: **B**。"先扫不动手"是工业标准 (rsync / git, 都是这种 default)。`--strategy=prefix-source` 会给冲突项加 `[from-cc]` 前缀，最保守的合并方式。

### A3 (P1, 8/10) Federation 排序模型 — M1 不需要 RRF

**Issue**: spec 说 federation 用 RRF (Reciprocal Rank Fusion) 融合多源 score。但 M1 只读 4 源 + 无向量索引，**RRF 是 overkill**。

**Options**:
- A) M1 直接 RRF (per-source BM25 → 融合) — 完整但 implementation 重
- B) **(推荐)** M1 只做 per-source `grep` (FTS5 内建 BM25) + 时间倒序合并 + 标 `source` 字段; M3 引向量后再加 RRF
- C) M1 用 `recall.db` style 全局索引 — 复杂 + 索引同步问题

**Recommendation**: **B**。Boil the lake 在这里翻车: M1 用户从 4 源各搜 top10 → 合 40 条 → 时间倒序，已经够用 (你描述的痛点是"找不到"，不是"排序差")。RRF 留 M3 一起做。

### A4 (P1, 7/10) MCP Server vs CLI 谁先 ship

**Issue**: verdict 说 M1 是 CLI-first。但**真实消费者是 IDE 里的 AI agent**, AI 不会跑 CLI。MCP server 才是 federation 的实际 surface。

**Options**:
- A) M1 只 CLI, MCP 留 M3 (用户自己用)
- B) **(推荐)** M1 同时 ship CLI + 1-tool MCP server (`recall_across_sources`)。CLI 用于人 + AI agent 调试; MCP 用于真实 AI 集成。share 同一 retrieval core，加 MCP 不超 100 LoC。
- C) M1 只 MCP (CLI 留后) — 没 CLI 你自己 demo 都别扭

**Recommendation**: **B**。MCP 在 `@modelcontextprotocol/sdk` v1.x 起 stdio 模板很轻，M1 加 1 个 tool 就能让 Cursor / CC 直接召回别处记忆 — **这才是 verdict L1 卖点的真实形态**。

### A5 (P2, 7/10) Cat A 适配器的 schema drift 风险

**Issue**: Claude Code 的 JSONL `type` 字段在过去 1 年加了多种 (message/tool_use/thinking/...). 适配器硬编码字段名，**spec 升级会打破**。

**Options**:
- A) 强 typing + version 检测 + 升级警告
- B) **(推荐)** 适配器只读 `role/content/timestamp` 三个公共字段, 未识别 `type` 的事件**忽略不报错** (forward-compat); 加 `--debug` flag 打印未识别 type
- C) 完全 schema-less (string match content)

**Recommendation**: **B**。已知 schema drift 在 Claude Code / Codex / Cursor 都发生过 (research A 取证)。容忍未知字段 + debug 时可见 = 对升级 robust。

### A6 (P2, 6/10) Inventory 输出 schema (机器可读)

**Issue**: `loci scan` 输出格式 spec 未定。CLI 给人看 (table) 没问题，但 AI agent 通过 MCP 调用 scan 时需要 JSON。

**Options**:
- A) 只输出 table
- B) **(推荐)** 默认 table; `--json` 输出标准 schema (id/name/category/path/itemCount/sizeBytes/lastModified/healthy)
- C) 默认 JSON, `--pretty` 输出 table

**Recommendation**: **B**。CLI 默认对人友好; AI 显式 `--json`。schema 写到 spec 作为契约。

### A7 (NOT in scope, 但 flag) — 加密/隐私

**Issue**: 你的记忆里可能有 OAuth token / API key (见 research E §A.4 Gemini auth.json)。如果 loci scan 把它们 inventory 出来，安全风险 ↑。

**Recommendation**: **flag 到 NOT in scope**, 但 M1 必须有 **denylist** (硬编码: `auth.json`, `token.json`, `*.pem`, `.env*`) + 文档警示。完整加密留 M4+。

---

## Section 2 — Code Quality Review

**N/A** — 项目尚无代码 (全是 spec)。等 M1 实现后做 `/review` 即可。

唯一 finding:
- **Q1**: 现有 `loci` 在 `D:\Works\AI\Skills\loci\` 还是平 JSON, M3 升级前要 freeze 它 (新功能不加, 只 bug fix), 避免 M1/M2 与现 loci 冲突。

---

## Section 3 — Test Review (M1 PoC)

### M1 测试覆盖 ASCII 图

```
CODE PATHS                                                USER FLOWS
[+] adapters/cat-a-claude-code.ts                         [+] loci scan (机器整体扫描)
  ├── scan() — list ~/.claude/projects/                     ├── [GAP] 全部 4 源都存在 → table 输出
  │   ├── [GAP] 路径不存在 → return empty                  ├── [GAP] 部分源缺失 → 灰色显示
  │   ├── [GAP] 路径存在但空 → return []                    └── [GAP] --json → schema 校验
  │   └── [GAP] 文件多 → 性能 (< 500ms target)
  └── recall(query) — grep JSONL files                    [+] loci recall --all (跨源召回)
      ├── [GAP] 命中 → 标 source=cc                          ├── [GAP] CC 有命中 / Cursor 没 → 仅 CC 结果
      ├── [GAP] 多文件命中 → 时间倒序                       ├── [GAP] 4 源都命中 → 时间倒序合并
      └── [GAP] schema 未知 type → 忽略 (A5)                ├── [GAP] 无命中 → 友好 empty 提示
                                                            └── [GAP] [→E2E] AI agent via MCP recall
[+] adapters/cat-b-serena.ts
  ├── scan() — list .serena/memories/*.md                 [+] denylist 安全
  └── recall(query) — grep .md content                       └── [GAP] [CRITICAL] 含 auth.json 的目录被跳过

[+] commands/scan.ts                                       LLM integration: [GAP] [→EVAL] 1 个真实场景
[+] commands/recall.ts                                       (CC 历史话题在 Cursor MCP 召回)
[+] mcp/server.ts (1 tool: recall_across_sources)

COVERAGE: 0/14 (0%)  | UNIT: 0/9 | E2E: 0/2 | EVAL: 0/1 | CRITICAL: 1
```

### Test Plan Artifact

```
M1 测试清单 (写到 D:\Works\AI\Skills\loci-v2\tests\PLAN.md)

Unit (9):
  - [P0] cat-a-claude-code.scan: 路径不存在 / 空 / 多文件
  - [P0] cat-a-claude-code.recall: 命中标 source / schema 未知 type 忽略
  - [P0] cat-b-serena.scan + recall (类似)
  - [P1] commands/scan: --json 输出 schema 校验
  - [P1] commands/recall: 时间倒序合并

E2E (2):
  - [P0] full pipeline: scan + recall --all on real ~/.claude + ~/.cursor
  - [P0] MCP tool: recall_across_sources 通过 stdio 被外部调用

Eval (1):
  - [P1] real recall scenario: "你记得我们关于 PDM-51412 的讨论吗" → 召回 .serena/ticket/pdm-51412/ + Cursor transcripts

CRITICAL gaps (1):
  - [REGRESSION-style] denylist 必须在 M1 起就有 - auth.json / *.pem / .env* 不能被 scan
```

### Test 覆盖建议
- M1 必须 ≥ 80% unit, 100% E2E pipeline, 1 eval scenario
- 全部 GAP 加进 spec.md M1 acceptance criteria

---

## Section 4 — Performance Review

| 关注点 | 风险 | 缓解 |
|--------|------|------|
| `scan` 整目录 walk | 大量 transcript 时 > 1s | M1 只 stat (不读 content), 目标 < 500ms |
| `recall --all` grep 4 源 | 4 × ~/.claude 30MB jsonl × 多 project | 默认 limit=10/source, total 40; --limit overridable |
| MCP stdio 启动延迟 | Node.js cold start ~100ms | 接受, M3 探索 daemon |
| FTS5 索引 (M3) | 索引同步成本 | M3 决策, M1 无 |

无 P0/P1 性能 issue。

---

## NOT in Scope (M1+M2)

| 项 | 理由 | 何时考虑 |
|---|------|---------|
| 向量检索 / 语义召回 | M1 BM25 + 时间倒序已够痛点 | M3 |
| Plugin SDK | 没人用就没人贡献 | M4 |
| 远端同步 / 多机协同 | local-first 是哲学 | 永不 (除非用户提) |
| Cat C SaaS adapters (mem0/Letta/Zep) | 用户没在用 | M4+ 按需 |
| 加密 / 完整隐私层 | denylist 已 mitigate 80% | M4 |
| Cline / Roo / Windsurf adapters | VS Code globalStorage 不透明,反逆工程不值 | 用户实际用了再做 |
| GUI / TUI | CLI + MCP 已覆盖人机两端 | 永不 (除非有人提需求) |

---

## What Already Exists (复用)

| 既有 | M1 复用方式 |
|------|------------|
| `loci` 现 CLI (D:\Works\AI\Skills\loci) | M1 起 fork 改名为 `loci-v1-legacy`, 新代码全在 `loci-v2/`; M3 完成后用 v2 替换 |
| `recall` (~/.recall.db) | 不直接复用; 学其 schema (id / source / ts / role / content / json) |
| `episodic-memory` 源 | 学其抽取规则; 不调它的 binary |
| `Serena` MCP | 直接作为 Cat B adapter target (read-only) |
| `@modelcontextprotocol/sdk` | M1 server.ts 用 v1.x stdio template |
| `better-sqlite3 + sqlite-vec` | M3 引擎升级使用 |

---

## Failure Modes (M1)

| Codepath | Failure | Test? | Error handling? | User sees? |
|----------|---------|-------|-----------------|-----------|
| Cat A scan: 目录不存在 | empty array | ❌ | ✓ (return []) | OK (灰色 entry) |
| Cat A recall: JSONL 损坏行 | crash | ❌ | ❌ | ❌ silent crash |
| Cat B Serena: 目录路径错 | empty | ❌ | ✓ | OK |
| MCP server: stdio 中断 | hang | ❌ | ❌ | ❌ silent |
| denylist miss: auth.json 被读 | secret 泄漏到 inventory | ❌ | ❌ | ❌ silent leak |

**CRITICAL gaps** (无 test + 无错误处理 + silent):
1. JSONL 损坏行 → `try-catch per-line + skip + warn` (≤ 5 行代码)
2. MCP stdio 断开 → `process.on('exit')` cleanup
3. **denylist** → P0, M1 必须有

---

## Worktree Parallelization

| Lane | 工作 | 模块 | 依赖 |
|------|------|------|------|
| **A** | Adapter interface + 2 Cat A adapters (CC, Cursor) | `adapters/`, `types/` | — |
| **B** | Cat A Codex adapter + Cat B Serena adapter | `adapters/` | A 完成 interface |
| **C** | scan command + denylist | `commands/`, `safety/` | A |
| **D** | recall --all command + 时间合并 | `commands/`, `core/` | A |
| **E** | MCP server stub (1 tool) | `mcp/` | A + D |

**Execution**:
- Step 1: A 单独 (interface 是阻塞依赖)
- Step 2: B + C + D + E 全部并行 (4 个 worktree, 互不冲突 — `adapters/` 内不同文件名)

**冲突 flag**: B 和 A 都写 `adapters/`, 但 B 等 A merge 后再起 worktree → 无冲突。

---

## Outside Voice — 跳过

理由: 项目还在 spec, codex 评 spec 文本价值低于评代码; 节省 5 分钟。M1 实现后再调 codex review code diff。

---

## Completion Summary

- Step 0 Scope Challenge: **scope 接受 + 1 新增 finding (Distribution)**
- Architecture: **6 issues** (A1-A6 推荐 B 选项 + A7 flag 到 NOT in scope)
- Code Quality: **N/A** (无代码) + Q1 老 loci freeze
- Test: **M1 14 个 path 全是 GAP** (新项目正常); 1 个 CRITICAL (denylist)
- Performance: **0 issues** (M1 量级未触发)
- NOT in scope: 7 项 deferred
- What already exists: 6 项可复用
- Failure modes: 3 critical gaps (JSONL parser / MCP stdio / denylist)
- Outside voice: 跳过 (spec 阶段)
- Parallelization: **5 lanes, 4 并行可能** (A 阻塞, B-E 并行)

---

## Spec.md 待加章节 (Eng review 出口)

| 章节 | 内容 |
|------|------|
| § Adapter Interface | 三类继承设计 (A1) + schema 字段约定 |
| § Migration Strategy | dry-run default + 4 strategy (A2) |
| § Federation M1 | BM25-only, 时间倒序 (A3); RRF 留 M3 |
| § Distribution | npm + Windows path + MCP install (S0.6) |
| § Security | denylist 列表 + auth file 跳过策略 (A7) |
| § M1 Acceptance | 14 个 test path + 3 critical gap 修复 |

---

## Next per gstack 流程

按 verdict 走完 eng review, 下一步:
1. **Outside voice / Skip** ✓ (已说明)
2. **plan-devex-review** — 审 `loci scan` / `loci recall --all` / `loci migrate` 的 CLI 体验和 MCP tool design
3. (可选) **plan-design-review** — 当前无 web UI, **跳过**
4. 改 spec.md (按 ceo + eng verdict 双输出清单)
5. 起 M1 worktree
