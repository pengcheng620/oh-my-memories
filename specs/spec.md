# oh-my-memories — Master Spec (M1)

> **Status**: Canonical · supersedes the 602-line loci-v2 spec
> **Owner**: lup
> **Date**: 2026-05-15
> **Read also**: [`AGENTS.md`](../AGENTS.md) · [`docs/PRODUCT.md`](../docs/PRODUCT.md) · [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) · [`docs/ROADMAP.md`](../docs/ROADMAP.md)

This file is the single source of truth for **what M1 ships, why, and where the line is drawn**. It does not describe implementation — that lives in package READMEs and `.cursor/rules/*.mdc`. Decisions in this file are backed by verdict docs linked in §12; do not change them without reading those first.

Throughout this doc **MUST / SHOULD / MAY** carry RFC 2119 meaning.

---

## 1. Vision

`oh-my-memories` (CLI: `omem`) is the **management layer** that makes every AI tool's memory visible to every other AI tool. We are not a 13th memory engine; we are the hub that federates the existing twelve. M1 ships the smallest end-to-end slice that proves the wedge: `omem scan` finds memory sources on disk, `omem recall --all "<q>"` returns hits across them, and a thin `SKILL.md` per IDE teaches each agent when to call us. Engine work (our own SQLite + FTS5 store), MCP wrapping, and migration ship later, in that order, and only after M1 has earned the right to exist.

---

## 2. The 3 Categories

Adapter taxonomy is by **integration shape**, not by vendor. M1 implements Cat A and Cat B only.

| Cat | Class | Examples | Integration | M1? |
|----|----|----|----|----|
| **A** | AI IDE with native on-disk memory | Claude Code · Cursor · Codex · Gemini CLI · Copilot · OpenClaw | Streaming reads of `~/.<tool>/...*.jsonl` | ✅ CC + Cursor + Codex |
| **B** | Third-party MCP / file-format memory server | Serena · basic-memory · mem0-as-MCP · Letta-as-MCP | Read project-local `.serena/memories/*.md` (or equivalent) — file system, not protocol, in M1 | ✅ Serena |
| **C** | Third-party SaaS memory engine | mem0 (cloud) · Letta · Zep · Cognee | HTTP API + adapter | ⏸ M4+ on demand |

The interface inheritance is `IBaseAdapter ← IIdeAdapter | IMcpAdapter | ISaasAdapter` (per eng-verdict A1, recommendation B). Federation only consumes `IBaseAdapter` so it can never accidentally hardcode a vendor branch.

---

## 3. M1 Scope

**Ship**: a working CLI that scans 4 sources, recalls across them, and a 4-IDE Skill pack that wires it into agents.

| Surface | Detail |
|----|----|
| Adapters | `claude-code`, `cursor`, `codex` (Cat A) + `serena` (Cat B), all **read-only** |
| CLI commands | `omem init`, `omem scan [--json]`, `omem recall <q> [--all\|--source\|--limit\|--since\|--json]`, `omem doctor`, `omem config get/set`, `omem skills install --ide=<ide>` |
| Skills | One `SKILL.md` per IDE under `skills/{claude-code,cursor,codex,gemini}/` — thin glue that teaches each agent when to invoke `omem` |
| Storage | **None.** Every recall re-scans live; no persistent index in M1 |
| Retrieval | Naive term-match score + recency tiebreak (per eng-verdict A3) — BM25 over per-source FTS5 deferred to M3 |
| Output | Default human table; `--json` emits a stable schema per [`docs/CLI.md`](../docs/CLI.md) |
| Distribution | npm `oh-my-memories` (alpha channel) + `bun build --compile` single binary; works on macOS / Linux / Windows |
| MCP | **Not in M1** — see §8 (M1.1) and decision provenance in `research/G-skill-vs-mcp.md` |

**Not negotiable in M1**: read-only, no embeddings, no MCP, no persistent index, no migration, no daemon.

---

## 4. M1 Acceptance Criteria

The following MUST all hold before M1 is tagged. These mirror the test gap matrix in `specs/eng-review-verdict.md` §3 and the user-facing scenarios in `docs/ROADMAP.md` §M1.

### 4.1 Headline scenario (the wedge)

A developer with Claude Code + Cursor + Codex + Serena installed runs `omem init`. Then in **Cursor**, the agent is asked _"do you remember when we discussed websockets in Claude Code last month?"_, and the Cursor agent (via the `cursor` SKILL) calls `omem recall --all "websockets"` and surfaces the hit from `~/.claude/projects/*.jsonl`. End-to-end, no human re-typing.

### 4.2 Per-command DoD

| Command | Done means |
|----|----|
| `omem init` | Detects every Cat A/B source the user has, writes `~/.omem/config.json`, prompts to install skills for each detected IDE |
| `omem scan` | Lists each adapter with `present? · itemCount · lastModified · denylistedFileCount`; `--json` matches the schema in `docs/CLI.md` and validates against a fixture |
| `omem recall <q>` | Returns ≤ `--limit` hits (default 50), each tagged with `source`, `score`, `timestamp`, `snippet`, `path`; default sort is score desc + timestamp desc; runs on a real `~/.claude` corpus in **< 2 s** for typical (<10 k records) volume |
| `omem doctor` | Prints adapter health, denylisted-file count from last scan, omem version, runtime, source schema versions; exits `0` if all adapters healthy, `5` if any partial |
| `omem config get/set` | Round-trips `~/.omem/config.json`; rejects writes that produce invalid JSON |
| `omem skills install --ide=<ide>` | Installs the matching `skills/<ide>/SKILL.md` to the IDE's skills dir (created if missing) |

### 4.3 JSON output contracts

`omem scan --json` and `omem recall --json` emit stable schemas. Drifting either schema in a non-additive way is a breaking change and requires a major version bump.

```json
// omem scan --json
{
  "ts": "2026-05-15T09:30:00Z",
  "version": "0.1.0",
  "sources": [
    {
      "id": "claude-code",
      "category": "ide",
      "present": true,
      "path": "C:\\Users\\lup\\.claude\\projects",
      "itemCount": 1283,
      "lastModified": "2026-05-14T22:11:00Z",
      "deniedFiles": 0,
      "schemaVersion": "claude-code/2026-05",
      "healthy": true
    }
  ]
}

// omem recall --json (one hit)
{
  "id": "abc123",
  "source": "claude-code",
  "score": 0.87,
  "timestamp": "2026-04-12T15:01:42Z",
  "role": "assistant",
  "snippet": "...websocket reconnection backoff with jitter...",
  "path": "C:\\Users\\lup\\.claude\\projects\\<id>\\<uuid>.jsonl"
}
```

### 4.4 Test coverage gates

- ≥ 80 % unit coverage across `packages/{adapters,core,cli}` (matches `bunfig.toml` threshold)
- 100 % E2E coverage of `init`, `scan`, `recall`, `doctor` (each spawned as `bin/omem` in a real subprocess against fixtures)
- 1 eval scenario: the headline § 4.1 query against captured fixtures must return the expected record in top-3
- Cross-platform CI green on `ubuntu-latest`, `macos-latest`, `windows-latest`
- The JSON schemas in § 4.3 each have a `tests/fixtures/schema/<cmd>.json` reference and a contract test that fails on any unannounced shape change

### 4.5 Distribution gates

- `npm install -g oh-my-memories` works on a clean Windows + macOS box
- `bun build --compile` produces a runnable single binary on all three OS
- `~/.omem/` resolves correctly to `%USERPROFILE%\.omem\` on Windows
- The bootstrap commit's `bun.lock` (text format, Bun 1.2+ default) is committed; `bun.lockb` legacy binary stays gitignored

---

## 5. M1 Scope Boundaries (per-adapter MUSTs)

Each Cat A adapter MUST do exactly the following, no more:

1. Implement `IIdeAdapter` from `@oh-my-memories/adapter-sdk`
2. Resolve its source root via `packages/cli/src/platform/<adapter>.ts` (no inline `~` or backslash hardcoding)
3. Stream JSONL line by line — never read the whole file into memory
4. Yield `MemoryRecord`s with at minimum `{ id, source, role, content, timestamp }`; **ignore unknown `type` fields silently** and log under `--verbose` (eng-verdict A5, schema-drift forward-compat)
5. **Tolerate corrupt JSONL lines**: catch parse errors per line, skip, increment a counter, surface in `omem doctor` (this is one of the three M1 critical gaps — see §7)
6. Honour the safety denylist (§7) before opening any file
7. Have four mandatory tests under `packages/adapters/<name>/tests/`: `detect.test.ts`, `scan.test.ts`, `corrupt.test.ts`, `denylist.test.ts`
8. Have at minimum one fixture set under `tests/fixtures/<adapter>/{valid,corrupt-line,empty}.jsonl` (or markdown for Serena)

Cat B Serena MUST do (1)–(2), (5)–(8) adapted for markdown files; (3)–(4) become "parse one `.md` per record".

Adapters MUST NOT depend on `packages/core` or `packages/cli`. They depend only on `@oh-my-memories/adapter-sdk` and `packages/adapters/_shared`.

---

## 6. M1 Lane Assignment

M1 is parallelizable across **5 lanes** (per eng-verdict §Worktree Parallelization and `TODO.md`). Each lane is a fresh git worktree on a feature branch. Lane A is the only blocker; B–E run in parallel after A merges.

| Lane | Branch | Owns | Depends on |
|----|----|----|----|
| **A** | `feat/m1-claude-code-adapter` | `packages/adapters/claude-code` (full impl + 4 tests + fixtures) | — (blocker) |
| **B** | `feat/m1-cursor-adapter` | `packages/adapters/cursor` (full impl + 4 tests + fixtures) | A merged |
| **C** | `feat/m1-codex-adapter` | `packages/adapters/codex` (full impl + 4 tests + fixtures) | A merged |
| **D** | `feat/m1-serena-adapter` | `packages/adapters/serena` (full impl + 4 tests + fixtures) | A merged |
| **E** | `feat/m1-cli-wiring` | `packages/core/{inventory,federation}` complete · `packages/cli/commands/{init,scan,recall,doctor,config,skills}` · `packages/cli/safety/denylist.ts` · `packages/cli/platform/*.ts` · `packages/cli/output/{table,json}.ts` · `tests/e2e/` · `packages/adapters/_shared/src/jsonl.ts` (the streaming parser used by A/B/C) | A merged |

Lane E owns the shared JSONL streaming parser because every Cat A adapter consumes it; pulling it into Lane A would force a merge dependency.

```text
Lane A (claude-code)  ──merge──▶  ┌─ Lane B (cursor)
                                  ├─ Lane C (codex)
                                  ├─ Lane D (serena)
                                  └─ Lane E (cli + core wiring + _shared/jsonl)
```

Lane B–E land in any order after A merges. Each lane owns a disjoint set of files; cross-lane edits are forbidden. If Lane E needs an adapter change, the lane owner files an issue against the adapter lane rather than editing across boundaries.

---

## 7. M1 Critical Gaps

These three gaps are explicit P0 in `specs/eng-review-verdict.md` §Failure Modes. They MUST land in M1 — not M1.1 — because each is a silent-failure class that erodes trust before users even see the federation feature.

### 7.1 Safety denylist (eng-verdict A7)

A fixed deny-list lives at `packages/cli/src/safety/denylist.ts` and is consulted by every adapter before opening any file:

```text
*.pem · .env* · auth.json · *credentials* · *secret* · *.key · token.json
```

The list is **not user-configurable in M1** (would invite unsafe overrides). Denylisted-file count is surfaced in `omem doctor` and the `omem scan --json` output. M2+ MAY add per-source opt-out if there is real demand.

### 7.2 Corrupt JSONL handling

Per `specs/eng-review-verdict.md` §Failure Modes row 2: a malformed line in `~/.claude/projects/*.jsonl` MUST NOT crash the adapter. Implementation: try-parse per line, skip on error, increment a counter on the adapter instance, surface in both `omem doctor` and `omem scan --json`. Adapter tests MUST include a `corrupt.test.ts` that proves this.

```ts
// packages/adapters/_shared/src/jsonl.ts (shape, not full impl)
export async function* streamJsonl(path: string): AsyncGenerator<JsonlLine> {
  for await (const line of readLines(path)) {
    try {
      yield { ok: true, value: JSON.parse(line) };
    } catch (err) {
      yield { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
```

Each adapter consumes this generator and increments `corruptLineCount` on `ok: false`. The counter MUST be reset per scan, never accumulated across runs.

### 7.3 MCP stdio cleanup (placeholder hardening)

`packages/mcp/` is a deliberate placeholder in M1 (see §8). Even so, the `omem mcp serve` stub MUST register `process.on('exit')` cleanup so a future M1.1 iteration does not inherit a dangling-process bug. Nothing else in `packages/mcp/` is implemented in M1.

---

## 8. M1.1 — Wrap as MCP

Locked by `research/G-skill-vs-mcp.md` recommendation A: **M1 ships CLI + Skill, not MCP.** The reason is double-breaking-change cost — wrapping unstable CLI behaviour in an MCP tool surface forces both contracts to churn together. M1.1 lands ~1 week after M1 once the CLI I/O contract (JSON schemas, exit codes, `~/.omem/config.json` shape) has frozen.

M1.1 deliverables:

- `packages/mcp/src/server.ts` using `@modelcontextprotocol/sdk` over stdio
- Tools: `recall_across_sources(query, sources?, limit?, since?)`, `scan_sources()`. Both call the same `packages/core` library the CLI uses.
- `omem mcp serve` (subcommand on `packages/cli/src/commands/mcp.ts`) — spawns the stdio server
- `omem mcp install --ide=<ide>` config writers:
  - **Cursor**: edit `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global)
  - **Codex**: edit `~/.codex/config.toml` `[mcp_servers.omem]`
  - **Gemini CLI**: edit `~/.gemini/settings.json` `mcpServers.omem`
  - **Claude Code**: equivalent of `claude mcp add omem`
- Update each `skills/<ide>/SKILL.md` to mention the MCP path is now available in addition to the CLI
- **Dogfood**: this repo's `.cursor/mcp.json` MUST point at `omem mcp serve` so editing oh-my-memories uses oh-my-memories.

---

## 9. M2 — Migration

Headline: `omem migrate --from cc --to cursor` (per ceo-verdict §4 — the first migration direction is locked to the user's actual pain).

| Aspect | M2 rule |
|----|----|
| Default mode | `--dry-run` (eng-verdict A2). Apply requires explicit `--apply`. |
| Conflict strategy | `--strategy=skip-on-conflict` (default) · `overwrite` · `prefix-source` (`[from-cc]` prefix) · `merge`. No interactive prompts in the default path. |
| Write contract | A new `IWritableAdapter` extends the read-only base — opt-in per adapter |
| Filters | `--since <duration>` · `--project <path>` · `--session <id>` |
| Rollback | `--apply` writes a manifest at `~/.omem/migrations/<ts>.json`; `omem migrate --rollback <manifest>` reverses (copy/link only — move is one-way) |
| Adjacent | `omem export --all` and `omem import <archive>` ship in the same milestone for offline backup/restore |

Migration manifest shape (M2 contract — frozen at first M2 alpha):

```json
{
  "ts": "2026-06-12T11:30:00Z",
  "from": "claude-code",
  "to": "cursor",
  "strategy": "skip-on-conflict",
  "filters": { "since": "30d" },
  "operations": [
    { "id": "abc123", "op": "copy", "fromPath": "...", "toPath": "...", "applied": true },
    { "id": "def456", "op": "skip", "reason": "conflict", "existing": "..." }
  ]
}
```

---

## 10. M3+ — Our Own Engine (summary)

M3 promotes oh-my-memories from "federation hub" to "memory home for tools that lack one" (Cursor / Codex / Gemini). Scope summary, full detail in `docs/ROADMAP.md`:

- `packages/core/canonical-store.ts` on **SQLite + FTS5 (BM25)** via `better-sqlite3`
- `omem remember <text>` writes to the L2 store
- Optional **`sqlite-vec`** extension for embeddings — user opts in; default off (keeps install friction low and avoids the model-download ceremony)
- **Reciprocal Rank Fusion (RRF)** combines BM25 + vector results across sources — replaces M1's naive scoring in `packages/core/src/federation.ts`
- File-watch / cron-based incremental indexing
- Schema versioning so M3.1+ bumps don't drop user data
- M4: stabilize `@oh-my-memories/adapter-sdk` at semver-major 1.0.0 + `omem adapter list/install` + npm scope discovery (`@omem-adapter/*`)

---

## 11. What is intentionally NOT in M1

Mirrors `AGENTS.md` §9 and the prior-handoff pitfall list. If you find yourself reaching for any of these in an M1 PR, stop and read the linked verdict first.

- ❌ **Vector / embedding / semantic search** — M3+. M1's federation is naive term-match + recency.
- ❌ **MCP server** — M1.1. `packages/mcp/` is a stub that only registers exit cleanup (§7.3).
- ❌ **Writes to memory sources** — M2. M1 is fully read-only. Migration introduces `IWritableAdapter` separately.
- ❌ **TUI / GUI** — indefinitely deferred. CLI + Skill covers humans + agents.
- ❌ **Background daemon / file watcher** — M3+ when the canonical store needs it.
- ❌ **Cross-machine sync / team mode** — M5+ at earliest, only on demand.
- ❌ **Cat C SaaS adapters** (mem0/Letta/Zep cloud APIs) — M4+ on demand.
- ❌ **Plugin SDK as runtime contract for 3rd-party adapters** — M4. The interface is published in M1 but not yet stabilized as a versioned public surface.
- ❌ **User-configurable denylist** — never, in M1's safety baseline. M2+ may revisit.
- ❌ **Bypassing the JSONL streaming contract** — never read whole files into memory; corruption tolerance and large-file safety depend on streaming.
- ❌ **Hardcoded `~/.claude` or `\` paths** — always `os.homedir()` + `node:path.join`. Windows path bugs are the most likely class of CI failure.
- ❌ **Renaming the binary** — `omem` is locked. `omm` is taken on npm; `oh-my-memories` is the package name.

---

## 12. Decision Provenance

This spec is a synthesis. The authoritative reasoning lives in:

| Decision area | File |
|----|----|
| Pivot from Engine-First to Management-First; 3 categories; CC→Cursor migration priority | [`specs/ceo-review-verdict.md`](./ceo-review-verdict.md) |
| 6 architecture decisions (interface inheritance, dry-run default, BM25-only M1, schema-drift tolerance, CLI+MCP timing, denylist); 3 critical gaps; 5-lane parallelization | [`specs/eng-review-verdict.md`](./eng-review-verdict.md) |
| Naming (`oh-my-memories` / `omem`), repo creation, monorepo, language choice (TS + Bun), CLI command set, AGENTS.md tier design | [`specs/product-formation.md`](./product-formation.md) |
| **M1 = CLI + Skill, MCP deferred to M1.1** — wait for CLI I/O contract to freeze | [`research/G-skill-vs-mcp.md`](../research/G-skill-vs-mcp.md) |
| Devex review of CLI surface (commands, flags, errors, install flow) | `specs/devex-review-verdict.md` _(M1, planned — next deliverable after this spec)_ |

When a future change conflicts with anything here, **read the verdict first**, then either justify the change in a new `specs/<topic>-decision.md` or revise the verdict and re-link this spec.

---

## 13. Glossary

Short definitions for terms that appear repeatedly. Full conceptual treatment lives in `docs/PRODUCT.md` and `docs/ARCHITECTURE.md`.

| Term | Definition |
|----|----|
| **Adapter** | A package implementing `IBaseAdapter` that maps one memory source's on-disk (or API) format to canonical `MemoryRecord`s. One subdirectory per adapter under `packages/adapters/`. |
| **Cat A / Cat B / Cat C** | Adapter taxonomy by integration shape: A = AI IDE with native on-disk memory, B = third-party MCP/file-format memory server, C = third-party SaaS engine. M1 ships A + B. |
| **Federation** | Cross-source recall, implemented in `packages/core/src/federation.ts`. M1 federation is naive term-match + recency; M3+ is BM25 + optional vectors fused via RRF. |
| **Inventory** | The output of `omem scan` — a list of detected sources with health and counts, no record content. |
| **L2** | Our own memory engine (M3+). The "Layer 2" naming comes from `docs/PRODUCT.md`'s 3-Layers × 2-Things matrix. M1 has no L2; recall is purely federated. |
| **MemoryRecord** | The canonical shape every adapter yields: `{ id, source, role, content, timestamp, ... }`. Defined in `packages/adapter-sdk`. |
| **RRF** | Reciprocal Rank Fusion — the M3+ algorithm that combines BM25 scores with vector similarity scores across sources without requiring score normalization. |
| **Skill** | A `SKILL.md` file under `skills/<ide>/` that teaches one IDE's agent when and how to invoke `omem`. Skills are the M1 on-ramp; MCP tools are the M1.1 on-ramp. |
| **Source** | A concrete memory location an adapter reads — e.g. `~/.claude/projects` for the `claude-code` adapter. One adapter, one source class, possibly many physical paths. |
| **Wedge** | The cross-tool-recall problem: in Cursor, the agent can't see Claude Code's history. M1 ships the smallest end-to-end fix for this and nothing more. |

---

**End of M1 Spec.**
