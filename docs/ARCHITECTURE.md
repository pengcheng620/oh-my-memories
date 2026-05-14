# ARCHITECTURE.md

## Bird's-eye view

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            User / AI Agent                                │
│   Claude Code · Cursor · Codex · Gemini CLI · Copilot · human terminal    │
└─────────────────────────┬──────────────────────────┬─────────────────────┘
                          │ CLI (M1)                  │ MCP tools (M1.1+)
                          ▼                          ▼
                  ┌─────────────────────────────────────┐
                  │         packages/cli (omem)          │
                  │  scan · recall · migrate · skills · │
                  │  init · doctor · config             │
                  └────────────────┬────────────────────┘
                                   │
                                   ▼
                  ┌─────────────────────────────────────┐
                  │       packages/core                  │
                  │  inventory  ·  federation  ·         │
                  │  retrieval  ·  canonical-store (M3+) │
                  └────────────────┬────────────────────┘
                                   │ AnyAdapter[]
                                   ▼
            ┌──────────────────────┴───────────────────────┐
            │                                              │
            ▼                                              ▼
   ┌───────────────────┐                       ┌────────────────────┐
   │ packages/adapters │                       │ packages/           │
   │  /claude-code     │                       │  adapter-sdk        │
   │  /cursor          │ implements           │  IBaseAdapter        │
   │  /codex           │  ─────────────────►  │  IIdeAdapter         │
   │  /serena          │                       │  IMcpAdapter         │
   │  /_shared         │                       │  ISaasAdapter        │
   └────────┬──────────┘                       └────────────────────┘
            │ reads
            ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  Memory sources on disk                                          │
  │  ~/.claude/projects/*.jsonl                                      │
  │  ~/.cursor/projects/*/agent-transcripts/*.jsonl                  │
  │  ~/.codex/sessions/*.jsonl                                       │
  │  <project>/.serena/memories/*.md                                 │
  │  <project>/.cursor/projects/*/agent-transcripts/*.jsonl          │
  └─────────────────────────────────────────────────────────────────┘
```

## Why this shape

### Adapter ← `adapter-sdk` only
Adapters depend only on the SDK (pure types). They don't know about `core`, `cli`, or each other. This means:
- A 3rd-party can implement an adapter without pulling in our retrieval engine.
- We can test an adapter standalone (`bun test packages/adapters/cursor`).
- Replacing one adapter doesn't ripple.

### `core` ← `adapter-sdk` only
Core consumes the SDK contract, not concrete adapters. It receives `AnyAdapter[]` from outside. This means:
- `core` can be tested with mock adapters.
- `core` cannot accidentally hardcode "Claude Code-specific behavior".
- Federation logic is the same regardless of which adapters are loaded.

### `cli` orchestrates
The CLI is the only place that knows `import { ClaudeCodeAdapter } from '@oh-my-memories/adapter-claude-code'`. It assembles the adapter list and passes it to `core`.

### `mcp` mirrors `cli` for IDE agents (M1.1+)
Same pattern: `mcp` knows the adapter list, passes it to `core`. Different transport, same engine.

## Data flow — `omem recall --all "<query>"`

```
1. cli/commands/recall.ts                       parse args
                ↓
2. cli/index.ts loadAdapters()                  enumerate enabled adapters from config
                ↓
3. core.recall(adapters, { query, limit })      federation entry point
                ↓
4. for each adapter in parallel:
     a. adapter.detect()                        skip if not present
     b. for each record in adapter.scan():
          score, push to hits[]
                ↓
5. sort by score desc, then timestamp desc
                ↓
6. cli/output/recall.ts                         table OR json formatter
                ↓
7. stdout
```

**M1 simplification**: every recall re-scans all sources (no persistent index). Acceptable for typical scan size (<10k records, <2s). Replaced by canonical store in M3+.

## Storage decisions

### M1: no persistent store
Read source → emit records → score → return. Stateless. Fast enough for the wedge usecase (someone says "do you remember X" once or twice per session, not a query firehose).

### M1.1: no change (MCP just exposes the same logic)

### M2: still no persistent store
Migration writes to **destination adapters' native format** (write-side of `IWritableAdapter`). We don't introduce our own store yet.

### M3+: SQLite + FTS5 + sqlite-vec
- `~/.omem/index.sqlite` — canonical store of normalized records from all sources
- FTS5 virtual table for BM25
- `sqlite-vec` extension for embeddings (only if user opts in)
- Reciprocal Rank Fusion to combine BM25 + vector results
- Adapters re-scan periodically (cron / file-watch) to keep index fresh
- Recall reads from index; falls back to live scan if index is stale or missing

**Why not M1?** Because M1 needs to prove "federation works" without taking on indexing complexity, embedding model choice, schema migration, vector dim drift, etc. Persistent storage adds 3 weeks of work and zero user value if the federation thesis is wrong.

## Cross-cutting concerns

### Safety: denylist
`packages/cli/src/safety/denylist.ts` is a fixed list (`*.pem`, `.env*`, `auth.json`, `*credentials*`, `*secret*`, `*.key`). Every adapter consults it before opening a file. The denylist is **not user-configurable** in M1 (would invite unsafe overrides); it's the constant baseline. M2+ adds opt-out per source if there's demand.

### Cross-platform
`packages/cli/src/platform/<adapter>.ts` resolves the storage root for each adapter on macOS / Linux / Windows. Centralized so a new platform is one file.

### Observability
`omem doctor` (M1) prints: which adapters are present, denied files count from last scan, schema version of each source, omem version, runtime info. No telemetry leaves the machine.

### Versioning
- npm version = product version (semver)
- Adapter versions move together with the product (one bump = whole monorepo)
- SDK version = breaking-change boundary for 3rd-party adapters (independent semver, lockstep with major omem version)

## What's intentionally missing in M1

- No background daemon / watcher
- No sync between machines
- No web UI
- No team / shared store
- No write to memory sources (read-only)
- No vector / semantic search
- No MCP server (M1.1)
- No plugin SDK for 3rd-party adapters at runtime (M4)

Each is a tax someone might pay later. M1 doesn't pay it.
