---
name: oh-my-memories
description: Use when the user asks to recall something they discussed before, find past context, look up an old solution across AI tools (Claude Code, Cursor, Codex, Gemini, Serena, ...), or migrate memory between AI tools. Calls the `omem` CLI for federated memory search.
---

# oh-my-memories — Codex skill

When the user asks to recall past context or migrate memory between AI tools, use the `omem` CLI.

## Commands

| Intent | Command |
|----|----|
| Recall across all sources | `omem recall --all "<query>" --json` |
| Recall with time filter | `omem recall --all "<query>" --since 7d --json` |
| Inventory sources | `omem scan --json` |
| Migrate (always dry-run first) | `omem migrate --from <a> --to <b> --dry-run` |

## Output

`omem` always supports `--json`. Use that, parse the result, present top 3-5 hits with source + date labels.

## When NOT to use

- Fresh question, no recall intent
- Query is about the current Codex session

## Setup

```bash
npm install -g oh-my-memories
omem init
omem skills install --ide=codex
```
