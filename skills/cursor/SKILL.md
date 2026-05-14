---
description: Use when the user asks to recall something they discussed before, find past context across tools (Claude Code, Codex, Serena, ...), or migrate memory between AI tools. Calls the `omem` CLI for federated memory search.
globs: []
alwaysApply: false
---

# oh-my-memories — Cursor skill

> **The reason this skill exists**: Cursor's agent has no idea what was discussed in your Claude Code session last week. This skill teaches it to ask `omem` instead of giving up.

When the user asks to recall past context, find an old solution, or "search my memory across tools", run the `omem` CLI.

## Decision flow

| User intent | Command |
|----|----|
| "remember when we discussed X" / "have I done X before" | `omem recall --all "X" --json` |
| "what did I learn about X recently" | `omem recall --all "X" --since 7d --json` |
| "what memory sources do I have" | `omem scan --json` |
| "move my <toolA> memories to <toolB>" | `omem migrate --from <a> --to <b> --dry-run` |

## Result handling

`omem recall --json` returns hits with `source`, `timestamp`, `score`, `text`, `matchedTerms`. Present the top 3-5 to the user with source label and date. Do not dump raw JSON.

## When NOT to use

- The user is asking a fresh question with no "before" / "remember" / "find my" intent.
- The query is about the current Cursor conversation.
- The query is general knowledge.

## Setup

```bash
npm install -g oh-my-memories
omem init
```

## Why use this over Cursor's @-mentions

`@-mentions` search files in the current workspace. `omem recall` searches **memories from other AI tools** that don't exist as files in this workspace.
