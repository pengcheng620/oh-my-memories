# ARCHITECTURE.md

## Bird's-eye view

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            User / AI Agent                                │
│   Claude Code · Cursor · Codex · Gemini CLI · Copilot · human terminal    │
└─────────────────────────┬──────────────────────────┬─────────────────────┘
                          │ CLI                       │ MCP tools
                          ▼                          ▼
                  ┌─────────────────────────────────────┐
                  │         packages/cli (omem)          │
                  │  scan · recall · migrate · remember │
                  │  adapter · mcp · skills · export ·  │
                  │  import · upgrade · init · doctor   │
                  └────────────────┬────────────────────┘
                                   │
                                   ▼
                  ┌─────────────────────────────────────┐
                  │       packages/core                  │
                  │  inventory · federation (RRF) ·      │
                  │  retrieval · canonical-store         │
                  │  (SQLite + FTS5 + BM25)              │
                  └────────────────┬────────────────────┘
                                   │ AnyAdapter[]
                                   ▼
            ┌──────────────────────┴───────────────────────┐
            │                                              │
            ▼                                              ▼
   ┌───────────────────┐                       ┌────────────────────┐
   │  Built-in adapters │                       │ packages/           │
   │  /claude-code     │                       │  adapter-sdk 1.0.0  │
   │  /cursor          │ implements           │  IBaseAdapter        │
   │  /codex           │  ─────────────────►  │  IIdeAdapter         │
   │  /serena          │                       │  IMcpAdapter         │
   │  /_shared         │                       │  ISaasAdapter        │
   └────────┬──────────┘                       └────────┬───────────┘
            │                                           │
            │ reads                          implements │
            ▼                                           ▼
   ┌────────────────────────┐              ┌────────────────────────┐
   │  Memory sources on disk │              │  Plugin adapters (M4)  │
   │  ~/.claude/projects/    │              │  ~/.omem/node_modules/ │
   │  ~/.cursor/projects/    │              │  @omem-adapter/*       │
   │  ~/.codex/sessions/     │              │  (npm / local install) │
   │  .serena/memories/      │              └────────────────────────┘
   │  ~/.omem/canonical.db   │
   └────────────────────────┘
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

### M3 (shipped): SQLite + FTS5 + BM25 + RRF
- `~/.omem/canonical.db` — canonical store for `omem remember` records
- FTS5 virtual table with `unicode61 remove_diacritics 2` tokenizer for BM25 retrieval
- Reciprocal Rank Fusion (k=60) combines canonical BM25 results with adapter scan results
- Schema versioning via `schema_meta` table + migrations in `packages/core/src/migrations/`
- Cold-start safe: missing `canonical.db` is silently skipped; adapter-only recall works without it
- Requires Bun runtime (or Bun-compiled binary) for `bun:sqlite`; adapter-only commands work under Node

### M3.1+ (future): sqlite-vec
- Optional vector search via `sqlite-vec` extension (user opt-in, gated by demand)
- Would add embedding-based recall alongside BM25, fused via the same RRF pipeline

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

## What's intentionally missing (M5+)

- No background daemon / watcher (manual `omem remember` is the write path)
- No sync between machines
- No web UI
- No team / shared store
- No vector / semantic search (sqlite-vec deferred until demand)

Each is a tax someone might pay later. Current milestones don't pay it.
