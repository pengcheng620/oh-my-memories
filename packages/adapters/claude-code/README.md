# @oh-my-memories/adapter-claude-code

Claude Code adapter — reads `~/.claude/projects/*/*.jsonl`.

## Storage layout (Claude Code)

```
~/.claude/
├── projects/
│   └── <encoded-cwd>/
│       └── <sessionId>.jsonl       ← one JSON event per line
└── settings.json
```

On Windows: `%USERPROFILE%\.claude\projects\...`

## Event schema (common fields the adapter cares about)

- `id` — event id
- `parentUuid` — chain link
- `timestamp` — ISO 8601
- `type` — `user` / `assistant` / `tool_use` / `tool_result` / `system`
- `message.role` — when present
- `message.content` — string OR array of `{ type, text }`

Other fields are ignored (per `adapter-design.mdc`: tolerate schema drift).
