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

## M2 — Migration + Backup + Self-update

### M2.A — Migration

| Component | Status |
|----|----|
| `IWritableAdapter` interface in `adapter-sdk` | 🔲 |
| Write-side of CC, Cursor, Codex adapters | 🔲 |
| `omem migrate --from <a> --to <b> [--dry-run] [--apply]` | 🔲 |
| Strategies: `skip-on-conflict` (default) / `overwrite` / `newest-wins` | 🔲 |
| `--dry-run` default, `--apply` to execute (spec §9) | 🔲 |
| Migration manifest JSON output (spec §9 shape) | 🔲 |
| Conflict handling with per-record summary | 🔲 |

### M2.B — Backup

| Component | Status |
|----|----|
| `omem export --all` (tar.gz archive of all sources) | 🔲 |
| `omem import <archive>` (restore from archive) | 🔲 |
| Manifest inside archive for provenance | 🔲 |

### M2.C — Self-update

| Component | Status |
|----|----|
| `omem upgrade` (npm/binary self-update) | 🔲 |

## M3 — Our own engine

Promotes omem from "federation hub" to "memory home for tools that lack native memory."

| Component | Status |
|----|----|
| `packages/core/canonical-store.ts` (SQLite + FTS5 via `better-sqlite3`) | 🔲 |
| `omem remember <text>` writes to L2 store | 🔲 |
| Background scan / file-watch incremental indexing | 🔲 |
| BM25 retrieval (replaces M1 naive scoring) | 🔲 |
| Optional embedding (`sqlite-vec`); user opts in | 🔲 |
| Reciprocal Rank Fusion (combines BM25 + vector) | 🔲 |
| Schema versioning (M3.1+ bumps don't drop data) | 🔲 |

## M4 — Adapter SDK as public surface

| Component | Status |
|----|----|
| Stabilize `adapter-sdk` at semver-major 1.0.0 | 🔲 |
| `omem adapter list` / `omem adapter install <name>` | 🔲 |
| Plugin discovery (npm scope `@omem-adapter/*`) | 🔲 |
| Author guide live at `docs/ADAPTER-SDK.md` | 🔲 |

## M5+ — Future bets

- Team / shared memory store (server mode)
- Web UI for browsing memories
- Cross-machine sync
- mem0 / Letta / Zep / Cognee Cat C adapters
- Memory provenance / "show why" tracing
- Memory pruning policies
