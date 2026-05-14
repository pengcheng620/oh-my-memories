---
name: oh-my-memories
description: Use when the user asks to recall something they discussed before, find past context, look up an old solution, "search my memory", or migrate memory between AI tools. Calls the `omem` CLI to federate search across Claude Code, Cursor, Codex, Gemini, Serena, and other memory sources.
---

# oh-my-memories — Claude Code skill

When the user asks to **recall something they discussed before** (in this tool or another), or to **migrate memory** between tools, use the `omem` CLI.

## Decision flow

```
User says ...                                    →  Run ...
"do you remember when we discussed X"            →  omem recall --all "X" --json
"have I worked on X before"                      →  omem recall --all "X" --json
"what did I learn about X last week"             →  omem recall --all "X" --since 7d --json
"check my memory for X"                          →  omem recall --all "X" --json
"move my CC memories to Cursor"                  →  omem migrate --from claude-code --to cursor --dry-run
"what memory tools do I have installed"          →  omem scan --json
```

## How to interpret results

`omem recall --json` returns:

```json
{
  "ok": true,
  "hits": [
    {
      "source": "claude-code",
      "sessionId": "abc-123",
      "timestamp": "2026-04-12T10:30:00Z",
      "score": 12,
      "text": "...",
      "matchedTerms": ["websocket", "reconnect"]
    }
  ],
  "stats": { "sourcesQueried": 4, "totalHits": 12, "durationMs": 240 }
}
```

Present the top 3-5 to the user with source labels (e.g. "from your Claude Code session 6 weeks ago"). Don't dump the raw JSON.

## When NOT to use this skill

- The user is asking a fresh question with no "remember" / "before" / "find my notes" intent → do not call omem.
- The query is about the current session → look at the current conversation, not omem.
- The user is asking about general knowledge → answer directly.

## Setup (if missing)

If `omem` is not installed, tell the user:

```bash
npm install -g oh-my-memories
omem init
```

## Examples

**User**: "我之前在 Cursor 里搞那个 JWT 刷新 token 的方案，能找到吗？"
**You**: Run `omem recall --all "JWT refresh token" --json`. Show top hits, label each with source + date.

**User**: "I'm switching from Claude Code to Cursor. Can you bring my memory over?"
**You**: Run `omem migrate --from claude-code --to cursor --dry-run` first. Show the user what would change. Only run with `--apply` after explicit confirmation.
