# Research Summary — loci v2 spec v0.1 → v0.2 changeset

> **Date**: 2026-05-14
> **Inputs**: A (data sources) · B (tech stack) · D (market scan) · F (unknowns)
> **Output**: this file = **diff to apply to `../specs/spec.md`** + status of each Open Question

---

## TL;DR

**Build it.** Four independent angles converge:

1. **No incumbent fits** the exact niche (D.5 verdict: "no bullseye"). Pieces is the closest product, but it's proprietary; mem0/Letta/Zep are libraries, not personal hubs.
2. **Data is friendly**: 334 files, ~67 MB across 4 sources, all JSONL/Markdown. ~530 LoC for the 5 Tier-1 adapters. M3 budget realistic.
3. **Tech stack is uncontroversial**: SQLite FTS5 + sqlite-vec + fastembed (ONNX) + `@modelcontextprotocol/sdk` v1 — all proven by `episodic-memory`/`recall`/Anthropic ecosystem.
4. **Existing loci scaffolding** (already discovered in pre-spec exploration) covers ~50% of architecture. The actual write-to-do is **far smaller** than starting from zero.

**Two material spec changes** (not just polish):
- **Drop** auto-summarization / LLM extraction from M1-M5 (already excluded, but reinforce — D shows it's a saturated and risky angle).
- **Add multilingual embedding requirement** as P0 (lup writes EN+中文; `bge-small-en` insufficient — confirmed by both A.5.3 and B.3).

**One reduce-scope opportunity surfaced**:
- **Drop `recall-db` and `episodic-memory-db` adapters** (F.3, F.4): borrow their patterns/code instead. Reduces Tier-2 by 2 adapters.

**One new opportunity surfaced**:
- D found **Claude Code has its own auto-memory** at `~/.claude/projects/<key>/memory/MEMORY.md` (separate from JSONL transcripts). A only saw the transcripts, not memory. Worth a 1-hour follow-up before M3 — this is a higher-signal source than full transcripts.

---

## Open Questions — updated status

| Q | Spec wording | Status after research | Recommended decision |
|---|---|---|---|
| **Q1** | L1 检索引擎选型 (FTS5 vs Meilisearch vs Tantivy vs MiniSearch vs Orama) | ✅ **Decidable** | **SQLite FTS5 via `better-sqlite3`** (B.1 verdict). |
| **Q2** | 向量后端 (sqlite-vec vs LanceDB vs Chroma vs HNSW) | ✅ **Decidable** | **`sqlite-vec` in same SQLite file as FTS5** (B.2 verdict). LanceDB as fallback only if Windows packaging blocks. |
| **Q3** | 与 loci 上游的关系 (fork / PR / plugin / rename) | 🟡 **Defer to design** | Lean A (Fork short-term) + B (PR long-term). No new evidence. |
| **Q4** | MCP server 部署形态 (embedded vs standalone) | ✅ **Decidable** | **Embedded** (`loci serve mcp` subcommand) using `@modelcontextprotocol/sdk` v1.x stdio (B.5). |
| **Q5** | L2: 中央索引 vs 实时联邦 vs 混合 | 🟡 **Defer to design** | Lean **混合**: cache via incremental sync, `--live` flag for real-time. No new evidence forcing earlier decision. |
| **Q6** | 冲突 / 重复策略 | 🟡 **Defer to design** | Same. |
| **Q7** | 隐私级别 (网络出站默认禁?) | ✅ **Decidable** | **Default no-network** + opt-in `--allow-network` profile for cloud embedders (B.3 + D.5 align). |

**Net**: 4/7 Open Questions can be locked in `design.md` opening; 3/7 (Q3, Q5, Q6) still need design-phase work.

---

## Spec.md — Required Changes (changeset for v0.2)

### Change 1 — §1.1 痛点 / new evidence
Add to "痛点 4" section:
> **Live verification (2026-05-14)**: `~/.loci/` exists (created 2026-05-09) but is **empty** — no v1 data on lup's machine. The `loci remember` CLI was wired but never used. This **simplifies FR-L1-08** (smooth upgrade): no real migration required for lup; "do not break v1 users" remains best-effort for any other future user.

### Change 2 — §2.4 Out of Scope (reinforce)
Add bullet (already implicit, but D market scan shows this is a competitive trap):
> ❌ **No automatic LLM-driven memory extraction / summarization** — products that "auto-summarize everything" (Heyday-style) have struggled to find ROI; loci v2's value prop is **structured reorganization of existing memory**, not generation.

### Change 3 — §6.6 Multilingual (NEW NFR)
Add as a NFR (currently implicit):
> **NFR-Lang-01**: Embedding model MUST handle **English + Chinese** with parity. `bge-small-en` is insufficient. Pair with `bge-small-zh-v1.5` OR use a multilingual model (e.g. `paraphrase-multilingual-MiniLM-L12-v2`, ~120MB, 384 dims) OR `bge-m3` (multilingual, ~600MB, more accurate).

### Change 4 — §7.1 Tier 1 (refinements)

| Adapter | Change |
|---|---|
| `claude-code` | Add: also read `~/.claude/transcripts/*.jsonl` (96 files, 6.9 MB — A.5.5/F.6) as secondary source; dedup by sessionId. **NEW**: also read `~/.claude/projects/<key>/memory/MEMORY.md` if present (D.D.3 found this auto-memory layout). |
| `cursor` | Add: filter junk workspaces — only ~11 of 43 workspace dirs have `agent-transcripts/`; rest are temp/empty. Adapter MUST `existsSync(decodedPath)` (A.5.4). |
| `codex` | Note: `~/.codex/sessions/<year>/<month>/<day>/*.jsonl` is built-in date-partitioned → use as **incremental sync boundary** (A.A.2). |
| `serena` | Note: separate `--ticket=<TICKET-ID>` filter possible (90 files clustered into 28 ticket dirs); ~20 files are `PR-description.md` collisions resolved by parent-dir tagging (A.A.4). |
| `lessons-learned` | No change. |
| `loci-self` | No change. |

### Change 5 — §7.2 Tier 2 (drops + adds)

**REMOVE**:
- ❌ `recall-db` — F.3: borrow CJK trigram tokenizer code instead of dual-indexing.
- ❌ `episodic-memory-db` — F.4: same stack already chosen; use its `db.ts` as reference impl, not as adapter target.

**ADD**:
- ✅ `opencode` — F.1: confirmed at `~/.local/share/opencode/storage/{session,message}/*.json` (per-message JSON files, not JSONL); `opencode.db` SQLite present too.

**RESTRUCTURE**:
- 🔧 Generalize `serena` / `lessons-learned` / `anthropic-memory` / `compound-docs` / `note` into a single **`markdown-dir`** parameterizable adapter (F.2). Each becomes a config preset rather than separate code. Cuts ~300 LoC.

Updated Tier 2 list:
| Adapter | Source path |
|---|---|
| `opencode` | `~/.local/share/opencode/storage/` |
| `gemini-cli` | TBD (not investigated this round) |
| `markdown-dir` (generic) | parameterizable: `serena` / `lessons-learned` / `anthropic-memory` / `compound-docs` / `note` |
| `recall-db` | ~~Removed~~ |
| `episodic-memory-db` | ~~Removed~~ |

### Change 6 — §7.4 Adapter capabilities + write semantics
Refine read/write matrix (from A.A.1-A.4):

| Adapter | Transcripts | Rules file (CLAUDE.md / AGENTS.md / .cursor/rules) | Memory dirs |
|---|---|---|---|
| claude-code | Read | Read + **append-only** (with confirmation) | Read |
| codex | Read | Same | Read |
| cursor | Read | Read + cautious append to `.mdc` | N/A (Cursor Memories beta = cloud-side per D.D.3.1) |
| serena | Read + Write | N/A | Read + Write (matches Serena MCP convention) |
| opencode | Read | N/A | Read |

### Change 7 — §10 Roadmap M1 budget refinement
M1 effort estimate:
- Adapter development (5 Tier-1) ≈ **~3 days** (530 LoC ÷ ~150 LoC/day for adapter code with tests, A.6).
- L1 wiring fixes (CLI ↔ palace ↔ index) ≈ **~2 days**.
- `loci import` for Serena ≈ **~1 day**.

**M1 = ~6 working days** (1 week of focused effort, or 2 calendar weeks of side-project pace). Realistic.

### Change 8 — §10 Roadmap reorder consideration

Current order: M1 (Engine MVP) → M2 (Engine Plus) → M3 (Federation) → M4 (Federation Plus).

**Alternative considered**: M1 (5 read-only adapters + cross-source `loci search`) → M2 (Engine improvements + write).

D.5's pivot warning ("ship a narrow M1 that imports Serena + recall and proves cross-search") + A's evidence that adapters are easy + B's confirmation of stack maturity together suggest **the federation half might actually be the lower-risk M1** — it ships faster proof of value (`loci search` over already-existing data) and doesn't require user behavior change.

**Decision needed in design phase**: stay with current order (Engine-first) or flip to (Federation-first). This research **leans toward flipping**, but it's a strategic call.

### Change 9 — §1.2 (current loci diagnosis) addendum
Add: "verified ~/.loci/ is empty as of 2026-05-14 (created 2026-05-09 but never written to)."

### Change 10 — Appendix B references
Add this research summary as a reference; add the four sub-research files (`research/A-data-sources.md`, etc.).

---

## Decisions to bring up with lup before writing design.md

| # | Topic | Why surface to user |
|---|---|---|
| 1 | **Roadmap order — Engine-first vs Federation-first**? Research evidence (D + A) leans toward Federation-first, but spec currently has Engine-first. Strategic call. | Big effort difference + ships value at different times |
| 2 | **Multilingual embedding model choice**: `bge-small-en + bge-small-zh` (two small models, switch by language detection) vs `bge-m3` (one big multilingual, ~600MB) vs `paraphrase-multilingual-MiniLM-L12-v2` (one medium, ~120MB)? | Disk space, accuracy trade-off |
| 3 | **Anthropic memory-management style** (CLAUDE.md hot-cache + memory/ deep) — adopt as loci's own L1 layout convention? Or keep loci-style "palace + leaf"? | Can converge with growing ecosystem standard |
| 4 | **Drop `recall-db` and `episodic-memory-db` adapters** as Tier 2? (F.3, F.4 recommend dropping — borrow code instead.) | Reduces scope by 2 adapters |
| 5 | **Generalize Serena/lessons-learned/anthropic-memory into one `markdown-dir` adapter** with presets (F.2) — accept this DRY refactor? | Saves ~300 LoC, but changes spec |
| 6 | **Cursor Memories beta** (D.D.3.1) — Cursor stores its native memories in vendor cloud, not local. Cursor adapter can only read transcripts + .cursor/rules. Accept this scope? | Sets expectation: loci can't import Cursor's "Memories" feature, only transcripts |
| 7 | **Q3 (loci upstream relation)** — fork now and PR later, or sit and wait? Was deferred but if we want to start impl, we need a posture. | Affects where code lives |
| 8 | **Investigation of `~/.claude/projects/<key>/memory/MEMORY.md` discovered via D** — should we do an A.5.5 follow-up (~30min) to verify and add to claude-code adapter scope before writing design.md? | New evidence, not in original A scope |

---

## Files produced this research round

| File | Lines | Purpose |
|---|---:|---|
| `research/A-data-sources.md` | ~330 | Live filesystem inspection of 4 IDE/notes sources on lup's machine |
| `research/B-tech-stack.md` | ~180 | FTS / vector / embedding / MCP SDK technology comparison |
| `research/D-market-scan.md` | ~425 | 26 competitors surveyed across 4 sub-categories + honest "should it exist" verdict |
| `research/F-unknowns.md` | ~290 | Six gap-fill investigations: OpenCode location, Anthropic memory plugin, recall/episodic storage, Codex sqlite, etc. |
| `research/SUMMARY.md` | (this file) | Changeset to apply to spec.md + open decisions |

**Total research output**: ~1,200 lines markdown, all cross-linked.

---

## Recommended next step

Two paths:

### Path X (conservative): walk-through with lup
Present the 8 decisions above, get answers, then write `design.md` knowing Q1-Q2-Q4-Q7 are locked + 5 of 8 strategic decisions resolved.

**Time**: ~15-20 minutes of conversation, then ~1-2 hours writing `design.md`.

### Path Y (aggressive): pre-PoC spike
Skip `design.md` for now. Spend ~3-4 hours building a **smoke-test M1 PoC**:
- `loci search "<query>"` against a real-time read of just the 4 Tier-1 adapters (no central index, no writes)
- Pure read-only federation, no L1 changes
- Goal: prove the **federation experience** before committing to the bigger plan

**Why**: D's pivot warning + A's "adapters are easy" suggest the **smoke test is cheaper than the design doc**, and it would generate concrete data to refine spec **and** design.

**My recommendation**: **Path Y first**, then **Path X** with PoC results in hand. The PoC is so cheap and the design decisions become concrete once we see real cross-source results.

But it's lup's call.
