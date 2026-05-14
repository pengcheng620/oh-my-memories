# ROADMAP.md

## M1 — "It works for one user" (current)

Acceptance: a developer with Claude Code + Cursor + Codex + Serena installed runs `omem init`, then in Cursor asks "do you remember when we discussed websockets in Claude Code last month?", and the Cursor agent finds it via `omem recall`.

| Component | Owner | Status |
|----|----|----|
| Monorepo scaffold | (this PR) | ✅ done |
| Tier 1 / 2 rule files | (this PR) | ✅ done |
| `packages/adapter-sdk` types | (this PR) | ✅ done |
| `packages/adapters/claude-code` | M1 | 🔲 stub |
| `packages/adapters/cursor` | M1 | 🔲 stub |
| `packages/adapters/codex` | M1 | 🔲 stub |
| `packages/adapters/serena` | M1 | 🔲 stub |
| `packages/core/inventory` | M1 | 🔲 stub |
| `packages/core/federation` | M1 | 🔲 stub |
| `packages/cli/commands/{init, scan, recall, doctor, config}` | M1 | 🔲 stub |
| `packages/cli/safety/denylist` | M1 | 🔲 |
| `packages/cli/platform/*` | M1 | 🔲 |
| `packages/cli/output/{table, json}` | M1 | 🔲 |
| `skills/<ide>/SKILL.md` × 4 | M1 | ✅ done |
| `skills install` command | M1 | 🔲 |
| E2E tests in `tests/e2e/` | M1 | 🔲 |
| CI on Windows + macOS + Linux | M1 | 🔲 |
| Publish to npm (alpha) | M1 | 🔲 |

## M1.1 — MCP server (~1 week after M1)

Per `research/G-skill-vs-mcp.md`: defer until CLI I/O contract is frozen.

| Component | Status |
|----|----|
| `packages/mcp/server.ts` (stdio) | 🔲 |
| `packages/mcp/tools/recall_across_sources` | 🔲 |
| `packages/mcp/tools/scan_sources` | 🔲 |
| `omem mcp serve` CLI command | 🔲 |
| `omem mcp install --ide=<ide>` | 🔲 |
| Per-IDE config writers (`.cursor/mcp.json`, `~/.codex/config.toml`, `~/.gemini/settings.json`) | 🔲 |

## M2 — Migration

| Component | Status |
|----|----|
| `IWritableAdapter` interface in adapter-sdk | 🔲 |
| Write-side of CC, Cursor, Codex adapters | 🔲 |
| `omem migrate --from <a> --to <b>` | 🔲 |
| Strategies: copy / link / move (default copy) | 🔲 |
| `--dry-run` (default) and `--apply` | 🔲 |
| Conflict handling (per-record, with summary) | 🔲 |
| `omem export --all` / `omem import <archive>` | 🔲 |

## M3 — Our own engine

| Component | Status |
|----|----|
| `packages/core/canonical-store.ts` (SQLite + FTS5) | 🔲 |
| Background scan / watch | 🔲 |
| `omem remember <text>` writes to L2 store | 🔲 |
| BM25 retrieval | 🔲 |
| Optional embedding (`sqlite-vec`); user opts in | 🔲 |
| Reciprocal Rank Fusion | 🔲 |

## M4 — Adapter SDK as public surface

| Component | Status |
|----|----|
| Stabilize `adapter-sdk` semver-major | 🔲 |
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
