# ROADMAP.md

## M1 — "It works for one user" -- COMPLETE

Acceptance: a developer with Claude Code + Cursor + Codex + Serena installed runs `omem init`, then in Cursor asks "do you remember when we discussed websockets in Claude Code last month?", and the Cursor agent finds it via `omem recall`.

**Shipped**: 7 PRs merged, 294 tests, 731 assertions, 0 failures across Ubuntu/macOS/Windows.

| Component | Status | PR |
|----|----|----|
| Monorepo scaffold | ✅ done | initial |
| Tier 1 / 2 rule files | ✅ done | initial |
| `packages/adapter-sdk` types | ✅ done | initial |
| `packages/adapters/claude-code` (Cat A) | ✅ done | [#1](https://github.com/pengcheng620/oh-my-memories/pull/1) |
| `packages/adapters/cursor` (Cat A) | ✅ done | [#2](https://github.com/pengcheng620/oh-my-memories/pull/2) |
| `packages/adapters/codex` (Cat A) | ✅ done | [#4](https://github.com/pengcheng620/oh-my-memories/pull/4) |
| `packages/adapters/serena` (Cat B) | ✅ done | [#3](https://github.com/pengcheng620/oh-my-memories/pull/3) |
| `packages/adapters/_shared` (JSONL primitives) | ✅ done | [#5](https://github.com/pengcheng620/oh-my-memories/pull/5) |
| `packages/core/inventory` | ✅ done | [#7](https://github.com/pengcheng620/oh-my-memories/pull/7) |
| `packages/core/federation` (parallel + recency) | ✅ done | [#7](https://github.com/pengcheng620/oh-my-memories/pull/7) |
| `packages/core/config` (load/save/get/set/list) | ✅ done | [#7](https://github.com/pengcheng620/oh-my-memories/pull/7) |
| `packages/cli/commands/{init,scan,recall,doctor,config}` | ✅ done | [#6](https://github.com/pengcheng620/oh-my-memories/pull/6) + [#7](https://github.com/pengcheng620/oh-my-memories/pull/7) |
| `packages/cli/safety/denylist` | ✅ done | [#6](https://github.com/pengcheng620/oh-my-memories/pull/6) |
| `packages/cli/platform/*` | ✅ done | [#6](https://github.com/pengcheng620/oh-my-memories/pull/6) |
| `packages/cli/output/{table,json}` | ✅ done | [#6](https://github.com/pengcheng620/oh-my-memories/pull/6) |
| `skills/<ide>/SKILL.md` x 4 | ✅ done | initial |
| `skills install` command | ✅ done | [#7](https://github.com/pengcheng620/oh-my-memories/pull/7) |
| E2E tests in `tests/e2e/` | ✅ done | [#7](https://github.com/pengcheng620/oh-my-memories/pull/7) |
| CI on Windows + macOS + Linux | ✅ done | all PRs |
| Publish to npm (alpha) | 🔲 not yet | — |

## M0.5 — Distribution (pre-M1.1 gate)

Ship M1 as a usable binary before wrapping it in MCP.

| Component | Status |
|----|----|
| Rename `@oh-my-memories/cli` → `oh-my-memories` (publishable name) | ✅ done |
| `bun build --target=node --format=cjs` bundle for npm | ✅ done |
| Node-friendly `bin/omem.cjs` shim w/ Bun dev fallback | ✅ done |
| `bun build --compile` script for macOS / Linux / Windows | ✅ done |
| `.github/workflows/release.yml` (binaries + npm publish on tag) | ✅ done |
| Tag a release (`v0.1.0-alpha.1`) and trigger the workflow | 🔲 (manual) |
| Verify `npx oh-my-memories recall "<q>"` from a fresh machine | 🔲 (post-publish) |

## M1.1 — MCP server -- COMPLETE

Per `research/G-skill-vs-mcp.md`: deferred from M1 until CLI I/O contract was frozen. Contract is now frozen.

| Component | Status |
|----|----|
| Add `@modelcontextprotocol/sdk` to `packages/mcp/` | ✅ done (`^1.29.0`) |
| `packages/mcp/src/server.ts` (stdio transport) | ✅ done |
| MCP tool: `omem_recall` (wraps `core/federation.recall()`) | ✅ done — namespaced over the spec's `recall_across_sources` for tool-palette clarity |
| MCP tool: `omem_scan` (wraps `core/inventory`) | ✅ done |
| `omem mcp serve` CLI command | ✅ done |
| `omem mcp install --ide=<ide>` (claude-code, cursor, codex) | ✅ done — idempotent merge-only writes |
| Per-IDE config writers (`~/.claude.json`, `~/.cursor/mcp.json`, `~/.codex/config.toml`) | ✅ done |
| `omem mcp uninstall --ide=<ide>` (reverse the above) | ✅ done |
| Tests: tool execution + installer round-trip + in-memory MCP transport contract | ✅ done — 27 new tests, 323 total passing |
| Gemini settings.json writer | 🔲 deferred — added when Gemini CLI is in scope |

## M2 — Migration + Backup + Self-update -- COMPLETE

### M2.A — Migration -- COMPLETE

| Component | Status |
|----|----|
| `IWritableAdapter` interface in `adapter-sdk` | ✅ done |
| Write-side of CC, Cursor, Codex adapters | ✅ done |
| `omem migrate --from <a> --to <b> [--dry-run] [--apply]` | ✅ done |
| Strategies: `skip-on-conflict` (default) / `overwrite` / `newest-wins` | ✅ done |
| `--dry-run` default, `--apply` to execute (spec §9) | ✅ done |
| Migration manifest JSON output (spec §9 shape) | ✅ done — `~/.omem/migrations/<ts>_<id>.json` |
| Conflict handling with per-record summary | ✅ done |
| `--i-approve-dest-writes` for non-interactive `--apply` | ✅ done |

### M2.B — Backup -- COMPLETE

| Component | Status |
|----|----|
| `omem export [--all\|--from=<src>...] --output=<archive.tar.gz>` | ✅ done |
| `omem import <archive>` (restore from archive) | ✅ done — dry-run by default, `--apply` writes |
| Manifest inside archive for provenance | ✅ done — versioned `manifest.json` w/ omem version, platform, sources, files |
| Round-trip tests across adapters | ✅ done |

### M2.C — Self-update -- COMPLETE

| Component | Status |
|----|----|
| `omem upgrade` (npm registry check + install) | ✅ done — 5s timeout, handles offline gracefully |
| `omem upgrade --check` (read-only mode) | ✅ done |

## M3 — Our own engine -- COMPLETE

Promotes omem from "federation hub" to "memory home for tools that lack native memory."

| Component | Status |
|----|----|
| `packages/core/canonical-store.ts` (SQLite + FTS5 via `bun:sqlite`) | ✅ done — switched from `better-sqlite3` after FTS5 verified in `bun:sqlite` |
| `omem remember <text>` writes to L2 store | ✅ done — fingerprint dedup, `--source/--session/--role/--metadata/--timestamp` |
| BM25 retrieval (replaces M1 naive scoring) | ✅ done — FTS5 `bm25()` ranking with `unicode61 remove_diacritics 2` tokenizer |
| Reciprocal Rank Fusion (combines BM25 adapter + canonical) | ✅ done — RRF k=60, dedup-by-fingerprint, canonical wins on tie |
| Schema versioning (M3.1+ bumps don't drop data) | ✅ done — `schema_meta` + migrations under `packages/core/src/migrations/`, throws `OMEM-E33` if DB > binary |
| Bun runtime gate for canonical store | ✅ done — `OMEM-E34-CANONICAL-RUNTIME` surfaces under Node CJS bundle so adapter-only commands keep working while `remember`/canonical-recall point users at Bun or the prebuilt binary |
| Background scan / file-watch incremental indexing | 🔲 deferred — manual `omem remember` is enough for M3 acceptance |
| Optional embedding (`sqlite-vec`); user opts in | 🔲 deferred to M3.1 — gated by user demand |

## M4 — Adapter SDK as public surface ✅

| Component | Status |
|----|-----|
| Stabilize `adapter-sdk` at semver-major 1.0.0 | ✅ |
| `omem adapter list` / `install` / `uninstall` | ✅ |
| Plugin discovery (`~/.omem/node_modules/@omem-adapter/*`) | ✅ |
| Plugin loader: validate, ID-collision guard, sync-scan wrap | ✅ |
| Author guide live at `docs/ADAPTER-SDK.md` | ✅ |
| New error codes OMEM-E40..E44, OMEM-W02 | ✅ |

## M5 — Community adapters + polish -- COMPLETE

First milestone focused on ecosystem growth and production hardening rather than new engine features.

| Component | Status |
|----|----|
| Gemini CLI adapter (Cat A) — `~/.gemini/tmp/<hash>/chats/*.jsonl` | ✅ done |
| basic-memory adapter (Cat B) — `~/basic-memory/**/*.md` | ✅ done |
| OpenCode adapter (Cat A) — `~/.local/share/opencode/` sessions | ✅ done |
| `omem adapter search` — query npm registry for `@omem-adapter/*` packages | ✅ done |
| `omem stats` — show total records, per-source counts, corrupt lines | ✅ done |
| `omem prune` — remove old/duplicate records from canonical store | ✅ done |
| New error code OMEM-E45-SEARCH-FAILED | ✅ done |
| docs/CLI.md updated with stats, prune, adapter search sections | ✅ done |
| Fix pre-existing typecheck errors in test files | ✅ done |
| Adapter realism review (all 7 adapters verified against real formats) | ✅ done |
| Publish `v0.1.0-alpha.4` to npm | 🔲 |

## M6+ — Future bets

- **Semantic search**: optional `sqlite-vec` embedding + RRF fusion with BM25
- **Memory provenance**: "show why" tracing (which source, which session, when)
- **Team / shared memory store**: server mode for team recall
- **Web UI**: browser-based memory explorer
- **Cross-machine sync**: replicate canonical store across devices
- **mem0 / Letta / Zep / Cognee Cat C adapters**: SaaS memory engine integration
- **Memory pruning policies**: configurable retention rules (age, dedup, size limits)
