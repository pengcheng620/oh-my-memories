# oh-my-memories

> **Manage, federate, and migrate AI memories across all your tools.**
> Claude Code, Cursor, Codex, Gemini CLI, Aider, Copilot Chat, Serena, mem0 — one CLI, one query, every memory.

[![status: beta](https://img.shields.io/badge/status-beta-yellow)]()
[![license: MIT](https://img.shields.io/badge/license-MIT-blue)]()

---

## The problem

You ask Claude Code about a topic. It remembers. Next week you open Cursor, ask the same question — Cursor's agent says "I have no memory of that." But you do. The memory exists. It's just in `~/.claude/projects/*.jsonl`, and Cursor's agent **has no idea that folder exists or which tool to call to read it**.

Multiply by 7 tools. Multiply by 6 months. You have a memory archipelago no agent can navigate.

## The fix

```bash
$ npm install -g oh-my-memories
$ omem init                           # detects every memory source on this machine
$ omem scan --json | jq '.sources[].name'
"claude-code"
"cursor"
"codex"
"serena"
"gemini-cli"
"basic-memory"
"opencode"
"aider"
"copilot-chat"
$ omem recall "JWT refresh flow" --json | jq '.hits | length'
16
```

(M1 ships the federation; the JSON contract above is what agents wire against.
The exact response shape lives in [`docs/CLI.md`](./docs/CLI.md), gated by a
contract test so it never drifts from `--help`.)

Then: `omem skills install --ide=cursor` writes a `SKILL.md` that teaches Cursor's agent "when the user asks to recall something, run `omem recall --all`." Now Cursor's agent finds your CC memory, automatically.

## What it does

1. **Inventory** — scan and list every memory source on your machine
2. **Recall** — federated search across all of them via one CLI call (BM25 + Reciprocal Rank Fusion)
3. **Skills** — auto-install thin wrappers that teach Claude Code, Cursor, Codex, and Gemini agents to use omem
4. **Adapters** — built-in for Claude Code, Cursor, Codex, Serena MCP, Gemini CLI, Basic Memory, OpenCode, Aider, Copilot Chat
5. **Migrate** — move memories between tools (`omem migrate --from cc --to cursor --apply`)
6. **Export / Import** — portable `.tar.gz` backups (`omem export --all --output=backup.tar.gz`)
7. **Upgrade** — self-update from npm (`omem upgrade`)
8. **MCP server** — `omem mcp serve` so IDE agents call us as a tool; `omem mcp install --ide=cursor` wires it in (supports Claude Code, Cursor, Codex, Gemini)
9. **Canonical store** — `omem remember <text>` writes to a local SQLite+FTS5 engine; `omem recall` fuses canonical + adapter results
10. **Plugin ecosystem** — `omem adapter install <name>` installs community adapters from npm (`@omem-adapter/*`); adapter SDK is stable at 1.0.0
11. **Stats** — `omem stats` shows per-source record counts and health at a glance
12. **Prune** — `omem prune --older-than 90d --deduplicate` cleans up the canonical store
13. **Watch** — `omem watch` monitors source files and auto-rescans on change

## What's next (M7+)

- Semantic search (`sqlite-vec` embeddings + RRF)
- Memory provenance / "show why" tracing
- Team / shared memory store (server mode)
- Web UI for browsing memories
- Cross-machine sync
- mem0 / Letta / Zep / Cognee Cat C adapters

See [`docs/ROADMAP.md`](./docs/ROADMAP.md) for the full history and future bets.

## Quick start

```bash
# install
npm install -g oh-my-memories                  # or: bun add -g oh-my-memories

# first-time setup (writes ~/.omem/config.json)
omem init

# see what's on your machine
omem scan

# search across everything
omem recall --all "websocket reconnect"

# wire it into your IDE
omem skills install --ide=cursor               # or claude / codex / gemini

# (M1.1) wire it as an MCP server too
omem mcp install --ide=cursor

# (M2) migrate memories between tools
omem migrate --from=claude-code --to=cursor --dry-run

# (M3) store your own memories
omem remember "always use bun:sqlite for the canonical store"

# (M4) manage adapter plugins
omem adapter list                                # show built-in + installed
omem adapter install @omem-adapter/my-tool       # install from npm
omem adapter uninstall my-tool                   # remove a plugin

# (M5) stats & maintenance
omem stats                                       # per-source record counts
omem prune --older-than 90d --deduplicate        # clean up canonical store
omem adapter search                              # find adapters on npm

# (M6) auto-rescan on source file change
omem watch                                       # foreground watcher (Ctrl-C to stop)
```

## Why not just use mem0 / Letta / Zep?

Those are **engines** — they store memory. We are a **hub** — we manage memory others have already stored, including theirs. M3 onward we have an engine too (for tools that don't have one), but the wedge is integration, not storage.

Read [`docs/PRODUCT.md`](./docs/PRODUCT.md) for the full thesis.

## Status

**Beta.** M0.5 through M6 complete (432 tests pass, 2 known pre-existing failures).
`0.1.0-beta.1` is the current release: 9 built-in adapters (CC/Cursor/Codex/Serena/Gemini CLI/Basic Memory/OpenCode/Aider/Copilot Chat),
MCP server (supports Claude Code, Cursor, Codex, Gemini), cross-tool migration + backup,
canonical SQLite+FTS5 store with BM25/RRF recall, `omem remember`, plugin ecosystem
(`omem adapter install/list/uninstall/search`), `omem stats`, `omem prune`, and `omem watch`.

Install: `npm install -g oh-my-memories@beta` or `bun add -g oh-my-memories@beta`.

## Project layout

```
oh-my-memories/
├── packages/cli/         — omem CLI binary + plugin loader
├── packages/core/        — storage engine (SQLite+FTS5) + retrieval + federation
├── packages/mcp/         — MCP server (omem_recall + omem_scan tools)
├── packages/adapter-sdk/ — adapter interface (1.0.0 stable)
├── packages/adapters/    — built-in adapters (CC, Cursor, Codex, Serena, Gemini CLI, Basic Memory, OpenCode, Aider, Copilot Chat)
├── skills/               — IDE-specific SKILL.md packs
├── docs/                 — humans read this
├── specs/                — design decisions live here
└── research/             — research that informed those decisions
```

For agents (Claude Code, Cursor, Codex, Gemini, Copilot) opening this repo: read [`AGENTS.md`](./AGENTS.md) first.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). Adapter contributions especially welcome — see [`docs/ADAPTER-SDK.md`](./docs/ADAPTER-SDK.md).

## License

MIT. See [`LICENSE`](./LICENSE).

## Acknowledgments

Inspired by [oh-my-zsh](https://github.com/ohmyzsh/ohmyzsh) and [oh-my-codex](https://github.com/ZachJW34/oh-my-codex). The earlier prototype `loci` (also by this author) explored the engine side; **oh-my-memories** is the management-first successor.
