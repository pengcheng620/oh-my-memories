# oh-my-memories

> **Manage, federate, and migrate AI memories across all your tools.**
> Claude Code, Cursor, Codex, Gemini CLI, Copilot, Serena, mem0 — one CLI, one query, every memory.

[![status: pre-alpha](https://img.shields.io/badge/status-pre--alpha-orange)]()
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
$ omem recall "JWT refresh flow" --json | jq '.hits | length'
16
```

(M1 ships the federation; the JSON contract above is what agents wire against.
The exact response shape lives in [`docs/CLI.md`](./docs/CLI.md), gated by a
contract test so it never drifts from `--help`.)

Then: `omem skills install --ide=cursor` writes a `SKILL.md` that teaches Cursor's agent "when the user asks to recall something, run `omem recall --all`." Now Cursor's agent finds your CC memory, automatically.

## What it does (M1)

1. **Inventory** — scan and list every memory source on your machine
2. **Recall** — federated search across all of them via one CLI call
3. **Skills** — auto-install thin wrappers that teach Claude Code, Cursor, Codex, and Gemini agents to use omem
4. **Adapters for**: Claude Code, Cursor, Codex, Serena MCP

## What it does now (M2 + M3)

5. **Migrate** — move memories between tools (`omem migrate --from cc --to cursor --apply`)
6. **Export / Import** — portable `.tar.gz` backups (`omem export --all --output=backup.tar.gz`)
7. **Upgrade** — self-update from npm (`omem upgrade`)
8. **MCP server** — `omem mcp serve` so IDE agents call us as a tool; `omem mcp install --ide=cursor` wires it in
9. **Canonical store** — `omem remember <text>` writes to a local SQLite+FTS5 engine; `omem recall` fuses BM25 results via Reciprocal Rank Fusion

## What it will do (M4+)

10. **Plugin adapters** — `omem adapter install <name>` installs community adapters from npm (`@omem-adapter/*`)
11. **More adapters** — basic-memory, Gemini CLI, mem0, Letta, Zep, Cognee

See [`docs/ROADMAP.md`](./docs/ROADMAP.md).

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
```

## Why not just use mem0 / Letta / Zep?

Those are **engines** — they store memory. We are a **hub** — we manage memory others have already stored, including theirs. M3 onward we have an engine too (for tools that don't have one), but the wedge is integration, not storage.

Read [`docs/PRODUCT.md`](./docs/PRODUCT.md) for the full thesis.

## Status

**Alpha.** M0.5 → M1 → M1.1 → M2 → M3 complete (455 tests, 0 failures across Ubuntu/macOS/Windows).
`0.1.0-alpha.2` is the current release: federated read (CC/Cursor/Codex/Serena), MCP server,
cross-tool migration + backup, canonical SQLite+FTS5 store with BM25/RRF recall, and `omem remember`.

Install: `npm install --tag alpha oh-my-memories` or `bun add -g oh-my-memories@alpha`.

## Project layout

```
oh-my-memories/
├── packages/cli/         — omem CLI binary
├── packages/core/        — storage + retrieval engine (M3+)
├── packages/mcp/         — MCP server (M1.1)
├── packages/adapter-sdk/ — write your own adapter
├── packages/adapters/    — built-in adapters (CC, Cursor, Codex, Serena)
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
