# CEO Review Verdict — loci v2

**Date**: 2026-05-14
**Reviewer mode**: SELECTIVE EXPANSION (推断自 Q1+Q2 反转 spec 默认顺序 + Q3 明确首发路径)
**Status**: 主方向重排 — spec.md 需大改

---

## 1. Premise Confirmed (Q1)

记忆碎片化是真痛点，但**痛感来源不是"没记忆"，而是**：

> 同一件事在 CC 里能召回，在 Cursor 里 AI **不知道用什么工具找 / 不知道东西在哪里**；
> 时间一长，记忆分散在 CC / Cursor / Serena / CLAUDE.md / 各 MCP 里，**召回失败**。

**含义**: 解决方案的核心动词 ≠ "记得更好"，而是 **"管理 + 迁移 + 跨源召回别人已有的记忆"**。

---

## 2. Product Positioning Reversal (Q1, 关键反转)

### spec 原本的隐含优先级 (Engine-First)
```
M1 引擎 → M2 适配器 → M3 联邦检索 → M4 迁移
```

### 修订后的优先级 (Management-First)
```
Layer 1 (主卖点 / 差异化) — 管理别人的记忆
  ├─ Inventory  : 扫描机器, 告诉用户 "你的记忆在哪"
  ├─ Migration  : 任意源 → 任意目标 (如 CC → Cursor)
  └─ Federation : 跨源召回 (在 Cursor 里调出 CC 历史)

Layer 2 — loci 自身的记忆引擎
  └─ 服务 Cursor / Gemini / Codex / OpenClaw 等"自身无记忆"的 IDE
     当用户工具没有原生记忆时, loci 接管成为默认存储

Layer 3 — 第三方 MCP / SaaS 记忆 (扩展)
  └─ mem0 / Letta / Zep / etc.
     通过适配器纳入 federation, 让 "一处召回万物" 成立
```

**Layer 1 是对外能讲的故事**, Layer 2 是 fallback, Layer 3 是逐步扩展。

---

## 3. Adapter Taxonomy (Q2, 关键修正)

**用户原话**: "一定要分清不同工具的定位 — Cursor 是 AI IDE, Serena 是 MCP, 完全不是一类。"

### 三类适配器 (架构层面分类, 不是按工具数)

| Cat | 类别 | 代表工具 | 接入方式 | M1 是否首发 |
|-----|------|---------|---------|---|
| **A** | **AI IDE 自带记忆** | Claude Code, Cursor, Codex, OpenClaw, Gemini, Copilot... | 文件系统读取 (~/.claude/, ~/.cursor/...) | ✅ CC + Cursor + Codex |
| **B** | **MCP 记忆服务器** | Serena (memories/*.md), 其他 mcp-memory 类 | MCP 协议调用 / 文件读取 | ✅ Serena |
| **C** | **第三方 SaaS / Enhanced MCP** | mem0, Letta, Zep, Mem0... | API + Adapter | ⏸ 留给 M3+ |

### 架构要求 (用户强调)
1. **必须可扩展**: "后面 OpenClaw 火了, 我们能快速加上去"
2. **类别隔离**: 不要把 Cursor 和 Serena 当一类东西处理 — UI / 文档 / metadata 都要按类别区分

---

## 4. Migration First Path (Q3)

**首发迁移方向 = CC → Cursor** (用户当前实际场景)

含义:
- M2 默认 ship 这一条 migration command
- 其他方向 (CC → OpenClaw, Cursor → Serena, ...) 延后
- 可扩展: 通过 `--from` `--to` 抽象, 后面加新方向只是配置

---

## 5. Revised Roadmap (取代 spec.md M1-M4)

```
M1 (1-2 周) — Inventory + 只读 Federation [Layer 1 启动]
  ├─ `loci scan`           : 发现机器上所有记忆源 (Cat A + Cat B)
  ├─ `loci recall --all`   : 跨 4 源召回 (CC + Cursor + Codex + Serena)
  └─ 适配器骨架 + Cat A/B 类别区分
  ✅ Demo: "我帮你管别人的记忆" — 可对外讲

M2 (1-2 周) — Migration 首发 [Layer 1 完成]
  ├─ `loci migrate --from cc --to cursor`  (默认主路径)
  ├─ 抽象 Migration interface (供后续扩展)
  └─ 数据冲突 / 去重 / dry-run 策略
  ✅ Demo: "我能把你的记忆从一处搬到另一处"

M3 (1-2 周) — loci 自身引擎升级 [Layer 2]
  ├─ SQLite + FTS5 + sqlite-vec (替换现有平 JSON)
  ├─ remember/recall 体验对齐 (服务 Cursor/Codex/Gemini)
  └─ 默认成为 "无记忆 IDE" 的 fallback
  ✅ 服务 Layer 2 用户

M4+ (滚动) — Layer 3 扩展
  ├─ 第一个第三方适配器 (mem0 优先?)
  ├─ Plugin / Adapter SDK (社区贡献)
  └─ 新 IDE (OpenClaw 等火起来时快速接)
```

**关键**: M1 不再建引擎, 而是 inventory + 只读. 这与 SUMMARY.md 中 Path X (Federation-First) 的判断一致, **并补上 Migration 这个原 spec 漏掉的核心动词**.

---

## 6. Mode = SELECTIVE EXPANSION (Q4 推断)

理由:
- Q1 选 A → 全盘接受 spec 顺序反转 (重大重排, 不是细修, 排除 HOLD)
- Q2 要 "3 层完整 + 可扩展架构" → 范围比原 spec 还**广** (排除 REDUCTION)
- Q3 选 CC↔Cursor → 明确范围, 不是无边界 dream big (排除全 EXPANSION)

→ **SELECTIVE EXPANSION**: 守住 spec baseline (引擎/向量/MCP server 都保留), cherry-pick 加入 Migration / Inventory / 三类适配器分类法。

---

## 7. Spec.md 待改清单 (CEO review 出口)

| Spec 段落 | 修改 |
|---------|------|
| § Vision | 加 "管理别人的记忆" 主线; Layer 1/2/3 分层 |
| § Functional Requirements | 加 Inventory + Migration 命令族; 现有 federation 留下 |
| § Adapter Roster | 改成 Cat A/B/C 分类表, 标注 M1/M2/M3+ |
| § Roadmap | 用上面 § 5 替换 |
| § Open Questions | 关掉 "是否要 Migration" (是), 加 "Migration 数据冲突策略" |
| § Non-Functional Requirements | 加 "类别可扩展性" (新类别 ≤ 1 天接入) |

---

## 8. Next Steps Per gstack 流程

CEO review **方向已定**, 按 gstack 标准链应进入:

1. **`plan-eng-review`** (锁架构) — Adapter 类别隔离的接口设计 / Migration 冲突策略 / FTS5+vec 选型再确认
2. **`plan-devex-review`** (DX 审计) — `loci scan` / `loci migrate` 命令行体验 / 错误信息 / TTHW
3. **(可选) `plan-design-review`** — 如果有 web UI 的话, 当前是 CLI+MCP 不需要
4. **改 spec.md** (按 § 7 清单) — 然后进入实现 M1

或者用户可以选择: 跳过 eng-review 直接改 spec → 直接开 M1 worktree.
