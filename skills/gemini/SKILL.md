---
name: oh-my-memories
description: Use when the user asks to recall something they discussed before, find past context across AI tools, or migrate memory between AI tools. Calls the `omem` CLI for federated memory search.
---

# oh-my-memories — Gemini CLI skill

> Gemini CLI's primary extension surface is **MCP servers** and **Extensions**, not skills. This file is intended to be loaded as a system-prompt hint or workflow doc. The actual integration in M1.1 will be the omem MCP server installed via `omem mcp install --ide=gemini`.

When the user asks to recall past context or migrate memory, use the `omem` CLI.

## Commands

| Intent | Command |
|----|----|
| Recall across all sources | `omem recall --all "<query>" --json` |
| Inventory sources | `omem scan --json` |
| Migrate | `omem migrate --from <a> --to <b> --dry-run` then `--apply` |

## Setup

```bash
npm install -g oh-my-memories
omem init
# M1.1+: also install MCP for native integration
omem mcp install --ide=gemini
```
